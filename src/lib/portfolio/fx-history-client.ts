import Decimal from "decimal.js";
import type { PortfolioCurrency } from "@/lib/xtb/types";
import { YahooPriceClient } from "./yahoo-client";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export interface FxHistoryProvider {
  getRates(currency: PortfolioCurrency, from: string, to: string): Promise<Map<string, Decimal>>;
}

/** Fetches a whole FX history in one request per currency to stay within Worker subrequest limits. */
export class YahooFxHistoryClient implements FxHistoryProvider {
  constructor(private readonly prices = new YahooPriceClient()) {}

  async getRates(currency: PortfolioCurrency, from: string, to: string): Promise<Map<string, Decimal>> {
    if (currency === "PLN") {
      const rates = new Map<string, Decimal>();
      for (let date = from; date <= to; date = addDays(date, 1)) rates.set(date, new Decimal(1));
      return rates;
    }

    const series = await this.prices.getDaily(`${currency}PLN=X`, from, to);
    const quoted = new Map(series.prices.map((price) => [price.date, price.close]));
    if (series.prices.length === 0) throw new Error(`Brak historii kursu ${currency}/PLN.`);
    const first = series.prices[0].close;

    const rates = new Map<string, Decimal>();
    let last = first;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      last = quoted.get(date) ?? last;
      rates.set(date, last);
    }
    return rates;
  }
}
