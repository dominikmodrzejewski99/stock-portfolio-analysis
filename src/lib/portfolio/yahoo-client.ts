import Decimal from "decimal.js";

export interface DailyPrice {
  date: string;
  close: Decimal;
}

export interface PriceSeries {
  ticker: string;
  providerSymbol: string;
  currency: string;
  prices: DailyPrice[];
}

const SYMBOL_OVERRIDES: Record<string, string> = {
  "AMZN.DE": "AMZ.DE",
  "LTAM.NL": "LTAM.AS",
  "DAXEX.DE": "EXS1.DE",
};

export function yahooSymbol(ticker: string): string {
  if (SYMBOL_OVERRIDES[ticker]) return SYMBOL_OVERRIDES[ticker];
  if (ticker.endsWith(".PL")) return `${ticker.slice(0, -3)}.WA`;
  if (ticker.endsWith(".UK")) return `${ticker.slice(0, -3)}.L`;
  if (ticker.endsWith(".US")) return ticker.slice(0, -3);
  return ticker;
}

interface YahooResponse {
  chart?: {
    result?: {
      meta?: { currency?: string };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
      events?: { splits?: Record<string, unknown> };
    }[];
    error?: { description?: string } | null;
  };
}

export class YahooPriceClient {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  async getDaily(ticker: string, from: string, to: string): Promise<PriceSeries> {
    const symbol = yahooSymbol(ticker);
    const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
    const period2 = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) + 86_400;
    const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("period1", String(period1));
    url.searchParams.set("period2", String(period2));
    url.searchParams.set("interval", "1d");
    url.searchParams.set("events", "splits");
    const response = await this.fetcher(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`Brak notowań dla ${ticker} (${response.status}).`);
    const payload = await response.json<YahooResponse>();
    const result = payload.chart?.result?.[0];
    if (!result) throw new Error(payload.chart?.error?.description ?? `Brak notowań dla ${ticker}.`);
    if (Object.keys(result.events?.splits ?? {}).length > 0) {
      throw new Error(`${ticker}: historia obejmuje split, którego raport nie pozwala bezpiecznie rozliczyć.`);
    }
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const prices = timestamps.flatMap((timestamp, index) => {
      const close = closes[index];
      return close == null
        ? []
        : [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close: new Decimal(close) }];
    });
    if (!result.meta?.currency || prices.length === 0) throw new Error(`Niepełne notowania dla ${ticker}.`);
    return { ticker, providerSymbol: symbol, currency: result.meta.currency.toUpperCase(), prices };
  }
}
