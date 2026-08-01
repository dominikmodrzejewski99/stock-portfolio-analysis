import Decimal from "decimal.js";
import type { APIRoute } from "astro";
import { isOwner } from "@/lib/auth";
import { convertMoney } from "@/lib/portfolio/fx";
import { NbpClient } from "@/lib/portfolio/nbp-client";
import { YahooPriceClient } from "@/lib/portfolio/yahoo-client";
import { createClient } from "@/lib/supabase";
import type { PortfolioCurrency } from "@/lib/xtb/types";

function previousDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export const GET: APIRoute = async (context) => {
  if (!isOwner(context.locals.user)) return Response.json({ error: "Brak dostępu." }, { status: 403 });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "Baza danych nie jest skonfigurowana." }, { status: 503 });

  const { data: latest, error: importError } = await supabase
    .from("portfolio_imports")
    .select("id,base_currency,valuation_date,total_value")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (importError) return Response.json({ error: "Nie udało się odczytać ostatniego importu." }, { status: 500 });
  if (!latest) return Response.json({ available: false });
  const latestImport = latest;

  const { data: positions, error: positionsError } = await supabase
    .from("portfolio_open_positions")
    .select("ticker,category,volume,report_value,account_currency")
    .eq("import_id", latestImport.id);
  if (positionsError) return Response.json({ error: "Nie udało się odczytać pozycji." }, { status: 500 });
  if (positions.length === 0) {
    return Response.json({
      available: false,
      requiresImport: true,
      valuationDate: String(latestImport.valuation_date),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const priceClient = new YahooPriceClient();
  const tickers = [...new Set(positions.map((position) => String(position.ticker)))];
  const fetched = await Promise.allSettled(
    tickers.map((ticker) => priceClient.getDaily(ticker, previousDate(10), today)),
  );
  const prices = new Map<string, { currency: string; latest: { date: string; close: Decimal } }>();
  for (const result of fetched) {
    if (result.status !== "fulfilled") continue;
    const latestPrice = result.value.prices.at(-1);
    if (latestPrice) prices.set(result.value.ticker, { currency: result.value.currency, latest: latestPrice });
  }
  const unavailableTickers: string[] = [];
  const nbp = new NbpClient();
  const baseCurrency = latestImport.base_currency as PortfolioCurrency;
  let delta = new Decimal(0);
  let marketDate = today;
  for (const position of positions) {
    if (String(position.category).trim().toUpperCase() === "CFD") continue;
    const ticker = String(position.ticker);
    const price = prices.get(ticker);
    if (!price || !["PLN", "EUR", "USD"].includes(price.currency)) {
      unavailableTickers.push(ticker);
      continue;
    }
    if (price.latest.date < marketDate) marketDate = price.latest.date;
    const liveValue = price.latest.close.times(new Decimal(String(position.volume)));
    const liveConverted = await convertMoney(
      liveValue,
      price.currency as PortfolioCurrency,
      baseCurrency,
      price.latest.date,
      nbp,
    );
    const reportConverted = await convertMoney(
      new Decimal(String(position.report_value)),
      position.account_currency as PortfolioCurrency,
      baseCurrency,
      String(latestImport.valuation_date),
      nbp,
    );
    delta = delta.plus(liveConverted.amount.minus(reportConverted.amount));
  }
  const totalValue = new Decimal(String(latestImport.total_value)).plus(delta);
  return Response.json({
    available: true,
    baseCurrency,
    totalValue: totalValue.toString(),
    changeSinceImport: delta.toString(),
    reportValue: String(latestImport.total_value),
    reportDate: String(latestImport.valuation_date),
    marketDate,
    unavailableTickers: [...new Set(unavailableTickers)],
    cfdFrozen: positions.some((position) => String(position.category).trim().toUpperCase() === "CFD"),
  });
};
