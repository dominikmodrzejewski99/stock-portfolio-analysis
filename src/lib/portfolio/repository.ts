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
  }));
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client.from("portfolio_history_points").upsert(rows.slice(index, index + 500), {
      onConflict: "owner_id,date,base_currency",
    });
    if (error) throw new Error(`Nie udało się zapisać historii portfela: ${error.message}`);
  }
}
