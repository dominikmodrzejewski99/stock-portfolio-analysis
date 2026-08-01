import type { APIRoute } from "astro";
import { isOwner } from "@/lib/auth";
import { calculatePortfolio } from "@/lib/portfolio/calculate";
import { sha256Hex } from "@/lib/portfolio/fingerprint";
import { NbpClient } from "@/lib/portfolio/nbp-client";
import { reconstructHistory } from "@/lib/portfolio/history";
import { saveOpenPositions, savePortfolioHistory, savePortfolioImport } from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase";
import { SUPPORTED_CURRENCIES } from "@/lib/xtb/constants";
import { XtbImportError } from "@/lib/xtb/errors";
import { parseXtbPortfolio } from "@/lib/xtb/parser";
import type { PortfolioCurrency } from "@/lib/xtb/types";

export const POST: APIRoute = async (context) => {
  if (!isOwner(context.locals.user)) {
    return Response.json({ error: "Brak dostępu." }, { status: 403 });
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "Baza danych nie jest skonfigurowana." }, { status: 503 });

  try {
    const form = await context.request.formData();
    const file = form.get("file");
    const requestedCurrency = form.get("baseCurrency");
    if (!(file instanceof File)) return Response.json({ error: "Wybierz raport ZIP lub XLSX." }, { status: 400 });
    if (
      typeof requestedCurrency !== "string" ||
      !SUPPORTED_CURRENCIES.includes(requestedCurrency as PortfolioCurrency)
    ) {
      return Response.json({ error: "Nieobsługiwana waluta bazowa." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const portfolio = parseXtbPortfolio(bytes, file.name);
    const calculation = await calculatePortfolio(portfolio, requestedCurrency as PortfolioCurrency, new NbpClient());
    const fingerprint = await sha256Hex(bytes);
    const importId = await savePortfolioImport(supabase, fingerprint, portfolio, calculation);
    await saveOpenPositions(supabase, importId, context.locals.user.id, portfolio);
    const history = await reconstructHistory(portfolio, calculation);
    await savePortfolioHistory(supabase, importId, context.locals.user.id, calculation.baseCurrency, history.points);

    return Response.json({
      importId,
      baseCurrency: calculation.baseCurrency,
      valuationDate: calculation.valuationDate,
      securitiesValue: calculation.securitiesValue.toString(),
      cashValue: calculation.cashValue.toString(),
      ikeCashValue: calculation.ikeCashValue.toString(),
      plansCashValue: calculation.plansCashValue.toString(),
      marginValue: calculation.marginValue.toString(),
      totalValue: calculation.totalValue.toString(),
      depositedCapital: calculation.depositedCapital.toString(),
      withdrawnCapital: calculation.withdrawnCapital.toString(),
      netInvestedCapital: calculation.netInvestedCapital.toString(),
      totalProfit: calculation.totalProfit.toString(),
      simpleReturn: calculation.simpleReturn?.toString() ?? null,
      xirr: calculation.xirr?.toString() ?? null,
      diagnostics: calculation.diagnostics,
      history: {
        pointsCount: history.points.length,
        unavailableTickers: history.unavailableTickers,
      },
      accounts: portfolio.accounts.map((account) => ({
        currency: account.currency,
        products: account.snapshots.map((snapshot) => ({
          name: snapshot.product,
          currency: snapshot.currency,
          securitiesValue: snapshot.securitiesValue.toString(),
          cashValue: snapshot.reconstructedCash.plus(snapshot.cfdProfit).minus(snapshot.marginValue).toString(),
          marginValue: snapshot.marginValue.toString(),
          profitValue: snapshot.profitValue.toString(),
        })),
      })),
      externalCashFlows: calculation.cashFlows.map((flow) => ({
        date: flow.date,
        amount: flow.amount.toString(),
      })),
    });
  } catch (error) {
    if (error instanceof XtbImportError) {
      return Response.json({ error: error.message, code: error.code, location: error.location }, { status: 422 });
    }
    const errorId = crypto.randomUUID();
    console.error("Portfolio import failed", {
      errorId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const debug = import.meta.env.DEV && error instanceof Error ? error.message : undefined;
    return Response.json({ error: `Nie udało się przetworzyć raportu. Kod błędu: ${errorId}`, debug }, { status: 500 });
  }
};
