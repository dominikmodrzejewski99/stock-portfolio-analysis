import Decimal from "decimal.js";
import type { PortfolioCurrency } from "@/lib/xtb/types";
import { identityQuote } from "./fx";
import type { FxProvider, FxQuote } from "./types";

interface NbpResponse {
  table: string;
  code: string;
  rates: { no: string; effectiveDate: string; mid: number }[];
}

function previousUtcDate(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export class NbpClient implements FxProvider {
  private readonly cache = new Map<string, FxQuote>();
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async getRate(currency: PortfolioCurrency, date: string): Promise<FxQuote> {
    const requestedDate = date.slice(0, 10);
    if (currency === "PLN") return identityQuote(requestedDate);
    const cacheKey = `${currency}:${requestedDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    for (let offset = 0; offset <= 10; offset += 1) {
      const effectiveDate = previousUtcDate(requestedDate, offset);
      const response = await this.fetcher(
        `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${effectiveDate}/?format=json`,
        { headers: { Accept: "application/json" } },
      );
      if (response.status === 404) continue;
      if (!response.ok) throw new Error("Nie udało się pobrać kursu NBP.");
      const payload = await response.json<NbpResponse>();
      const rate = payload.rates[0];
      const quote: FxQuote = {
        currency,
        rateToPln: new Decimal(rate.mid),
        requestedDate,
        effectiveDate: rate.effectiveDate,
        tableNo: rate.no,
        source: "NBP_A",
      };
      this.cache.set(cacheKey, quote);
      return quote;
    }
    throw new Error("Brak wcześniejszego kursu NBP dla wskazanej daty.");
  }
}
