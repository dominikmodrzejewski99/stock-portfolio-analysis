import Decimal from "decimal.js";
import type { ParsedXtbPortfolio, PortfolioCurrency, XtbPositionLot } from "@/lib/xtb/types";
import type { PortfolioCalculation } from "./calculate";
import { NbpRangeClient } from "./nbp-range-client";
import { YahooPriceClient, type PriceSeries } from "./yahoo-client";

export interface HistoryPoint {
  date: string;
  totalValue: Decimal;
  netInvestedCapital: Decimal;
  totalProfit: Decimal;
  benchmarkValue: Decimal | null;
  msciWorldValue: Decimal | null;
}

export interface HistoryResult {
  points: HistoryPoint[];
  unavailableTickers: string[];
}

function dateOf(value: string): string {
  return value.slice(0, 10);
}
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function latestPrice(series: PriceSeries, date: string): Decimal | null {
  let result: Decimal | null = null;
  for (const price of series.prices) {
    if (price.date > date) break;
    result = price.close;
  }
  return result;
}

function active(lot: XtbPositionLot, date: string): boolean {
  return dateOf(lot.openAt) <= date && (!lot.closeAt || date < dateOf(lot.closeAt));
}

export async function reconstructHistory(
  portfolio: ParsedXtbPortfolio,
  calculation: PortfolioCalculation,
  prices = new YahooPriceClient(),
  nbp = new NbpRangeClient(),
): Promise<HistoryResult> {
  const operations = portfolio.accounts.flatMap((account) =>
    account.cashOperations.map((operation) => ({ ...operation, currency: account.currency })),
  );
  const lots = portfolio.accounts.flatMap((account) =>
    account.positionLots.map((lot) => ({ ...lot, accountCurrency: account.currency })),
  );
  const earliest = [
    ...operations.map((item) => dateOf(item.occurredAt)),
    ...lots.map((item) => dateOf(item.openAt)),
  ].sort()[0];
  if (!earliest) return { points: [], unavailableTickers: [] };
  const tickers = [...new Set(lots.map((lot) => lot.ticker))];
  const settled = await Promise.allSettled(
    tickers.map((ticker) => prices.getDaily(ticker, earliest, calculation.valuationDate)),
  );
  const benchmarkResult = await prices.getDaily("^SP500TR", earliest, calculation.valuationDate).catch(() => null);
  const msciWorldResult = await prices.getDaily("IWDA.L", earliest, calculation.valuationDate).catch(() => null);
  const series = new Map<string, PriceSeries>();
  const unavailableTickers: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") series.set(tickers[index], result.value);
    else unavailableTickers.push(tickers[index]);
  });
  const currencies = new Set<PortfolioCurrency>([calculation.baseCurrency]);
  for (const operation of operations) currencies.add(operation.currency);
  for (const item of series.values()) {
    if (item.currency === "PLN" || item.currency === "EUR" || item.currency === "USD") currencies.add(item.currency);
  }
  const fx = new Map<PortfolioCurrency, Map<string, Decimal>>();
  await Promise.all(
    [...currencies].map(async (currency) =>
      fx.set(currency, await nbp.getRates(currency, addDays(earliest, -10), calculation.valuationDate)),
    ),
  );
  const rate = (currency: PortfolioCurrency, date: string): Decimal => {
    if (currency === "PLN") return new Decimal(1);
    const found = fx.get(currency)?.get(date);
    if (!found) throw new Error(`Brak kursu ${currency} dla ${date}.`);
    return found;
  };
  const convert = (amount: Decimal, currency: PortfolioCurrency, date: string) =>
    amount.times(rate(currency, date)).dividedBy(rate(calculation.baseCurrency, date));

  const points: HistoryPoint[] = [];
  let cash = new Decimal(0);
  let netCapital = new Decimal(0);
  for (let date = earliest; date <= calculation.valuationDate; date = addDays(date, 1)) {
    for (const operation of operations.filter((item) => dateOf(item.occurredAt) === date)) {
      cash = cash.plus(convert(operation.amount, operation.currency, date));
      if (operation.type === "Deposit")
        netCapital = netCapital.plus(convert(operation.amount.abs(), operation.currency, date));
      if (operation.type === "Withdrawal")
        netCapital = netCapital.minus(convert(operation.amount.abs(), operation.currency, date));
    }
    let instruments = new Decimal(0);
    for (const lot of lots.filter((item) => active(item, date))) {
      const priceSeries = series.get(lot.ticker);
      const hasSupportedSeries = priceSeries && ["PLN", "EUR", "USD"].includes(priceSeries.currency);
      const marketClose = hasSupportedSeries ? latestPrice(priceSeries, date) : null;
      // A missing external quote must not turn a purchase into an artificial loss.
      // Cost basis is the conservative fallback and remains explicitly disclosed in diagnostics.
      const close = marketClose ?? lot.openPrice;
      const currency = hasSupportedSeries ? (priceSeries.currency as PortfolioCurrency) : lot.accountCurrency;
      if (lot.category.trim().toUpperCase() === "CFD") {
        const direction = lot.type.trim().toLowerCase().includes("sell") ? -1 : 1;
        instruments = instruments.plus(
          convert(close.minus(lot.openPrice).times(lot.volume).times(direction), currency, date),
        );
      } else {
        instruments = instruments.plus(convert(close.times(lot.volume), currency, date));
      }
    }
    const totalValue = cash.plus(instruments);
    points.push({
      date,
      totalValue,
      netInvestedCapital: netCapital,
      totalProfit: totalValue.minus(netCapital),
      benchmarkValue: benchmarkResult ? latestPrice(benchmarkResult, date) : null,
      msciWorldValue: msciWorldResult ? latestPrice(msciWorldResult, date) : null,
    });
  }
  const final = points.at(-1);
  if (final) {
    final.totalValue = calculation.totalValue;
    final.netInvestedCapital = calculation.netInvestedCapital;
    final.totalProfit = calculation.totalProfit;
  }
  return { points, unavailableTickers };
}
