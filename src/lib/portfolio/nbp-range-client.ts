import Decimal from "decimal.js";
import type { PortfolioCurrency } from "@/lib/xtb/types";

interface NbpRangeResponse {
  rates: { effectiveDate: string; mid: number }[];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export class NbpRangeClient {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  async getRates(currency: PortfolioCurrency, from: string, to: string): Promise<Map<string, Decimal>> {
    if (currency === "PLN") return new Map([[from, new Decimal(1)]]);
    const quoted = new Map<string, Decimal>();
    for (let start = from; start <= to; start = addDays(start, 93)) {
      const end = addDays(start, 92) < to ? addDays(start, 92) : to;
      const response = await this.fetcher(
        `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${start}/${end}/?format=json`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`Nie udało się pobrać historii kursu ${currency} z NBP.`);
      const payload = await response.json<NbpRangeResponse>();
      for (const rate of payload.rates) quoted.set(rate.effectiveDate, new Decimal(rate.mid));
    }
    const filled = new Map<string, Decimal>();
    let last: Decimal | undefined;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      last = quoted.get(date) ?? last;
      if (last) filled.set(date, last);
    }
    return filled;
  }
}
