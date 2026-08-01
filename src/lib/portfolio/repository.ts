import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedXtbPortfolio } from "@/lib/xtb/types";
import { classifyOperation } from "./classify";
import type { PortfolioCalculation } from "./calculate";
import type { HistoryPoint } from "./history";
import { sha256Hex } from "./fingerprint";

export async function savePortfolioImport(
  client: SupabaseClient,
  fingerprint: string,
  portfolio: ParsedXtbPortfolio,
  calculation: PortfolioCalculation,
): Promise<string> {
  const accounts = await Promise.all(
    portfolio.accounts.map(async (account) => ({
      fingerprint: await sha256Hex(account.accountNumber),
      currency: account.currency,
      reportFrom: account.reportFrom,
      reportTo: account.reportTo,
      operations: account.cashOperations.map((operation) => ({
        key: operation.operationId,
        type: operation.type,
        occurredAt: operation.occurredAt,
        amount: operation.amount.toString(),
        product: operation.product,
        classification: classifyOperation(operation, account.currency).classification,
      })),
      snapshots: account.snapshots.map((snapshot) => ({
        product: snapshot.product,
        currency: snapshot.currency,
        valuationAt: snapshot.valuationAt,
        securitiesValue: snapshot.securitiesValue.toString(),
        cashValue: snapshot.reconstructedCash.toString(),
      })),
    })),
  );
  const payload = {
    fingerprint,
    baseCurrency: calculation.baseCurrency,
    valuationDate: calculation.valuationDate,
    securitiesValue: calculation.securitiesValue.toString(),
    cashValue: calculation.cashValue.toString(),
    totalValue: calculation.totalValue.toString(),
    xirr: calculation.xirr?.toString() ?? "",
    diagnostics: calculation.diagnostics,
    fxQuotes: calculation.fxQuotes.map((quote) => ({
      currency: quote.currency,
      rateToPln: quote.rateToPln.toString(),
      requestedDate: quote.requestedDate,
      effectiveDate: quote.effectiveDate,
      tableNo: quote.tableNo,
      source: quote.source,
    })),
    accounts,
  };

  // Supabase returns `any` until generated Database types are introduced with the first schema.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await client.rpc("save_portfolio_import", { payload });
  if (error) {
    const databaseError = error as { message?: unknown; code?: unknown };
    const detail = typeof databaseError.message === "string" ? databaseError.message : "unknown database error";
    throw new Error(`Nie udało się zapisać importu portfela: ${detail}`);
  }
  if (typeof data !== "string") throw new Error("Baza nie zwróciła identyfikatora importu.");

  const { error: updateError } = await client
    .from("portfolio_imports")
    .update({
      deposited_capital: calculation.depositedCapital.toString(),
      withdrawn_capital: calculation.withdrawnCapital.toString(),
      net_invested_capital: calculation.netInvestedCapital.toString(),
      total_profit: calculation.totalProfit.toString(),
      simple_return: calculation.simpleReturn?.toString() ?? null,
    })
    .eq("id", data);
  if (updateError) throw new Error(`Nie udało się zapisać punktu historii: ${updateError.message}`);
  return data;
}

export async function savePortfolioHistory(
  client: SupabaseClient,
  importId: string,
  ownerId: string,
  baseCurrency: string,
  points: HistoryPoint[],
): Promise<void> {
  const rows = points.map((point) => ({
    owner_id: ownerId,
    import_id: importId,
    date: point.date,
    base_currency: baseCurrency,
    total_value: point.totalValue.toString(),
    net_invested_capital: point.netInvestedCapital.toString(),
    total_profit: point.totalProfit.toString(),
    benchmark_value: point.benchmarkValue?.toString() ?? null,
    msci_world_value: point.msciWorldValue?.toString() ?? null,
    nasdaq_100_value: point.nasdaq100Value?.toString() ?? null,
    emerging_markets_value: point.emergingMarketsValue?.toString() ?? null,
    semiconductor_value: point.semiconductorValue?.toString() ?? null,
  }));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client.from("portfolio_history_points").upsert(rows.slice(index, index + 500), {
      onConflict: "owner_id,date,base_currency",
    });
    if (error) throw new Error(`Nie udało się zapisać historii portfela: ${error.message}`);
  }
}

export async function saveOpenPositions(
  client: SupabaseClient,
  importId: string,
  ownerId: string,
  portfolio: ParsedXtbPortfolio,
): Promise<void> {
  const rows = portfolio.accounts
    .flatMap((account) =>
      account.openPositions.map((position) => ({
        owner_id: ownerId,
        import_id: importId,
        account_currency: account.currency,
        product: position.product,
        ticker: position.ticker,
        instrument: position.instrument,
        category: position.category,
        volume: position.volume.toString(),
        report_value: position.value.toString(),
      })),
    )
    .filter((position) => position.ticker !== null);
  const { error: deleteError } = await client.from("portfolio_open_positions").delete().eq("import_id", importId);
  if (deleteError) throw new Error(`Nie udało się odświeżyć pozycji: ${deleteError.message}`);
  if (rows.length === 0) return;
  const { error } = await client.from("portfolio_open_positions").insert(rows);
  if (error) throw new Error(`Nie udało się zapisać otwartych pozycji: ${error.message}`);
}
