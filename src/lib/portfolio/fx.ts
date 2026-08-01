import Decimal from "decimal.js";
import type { PortfolioCurrency } from "@/lib/xtb/types";
import type { FxProvider, FxQuote } from "./types";

export async function convertMoney(
  amount: Decimal,
  from: PortfolioCurrency,
  to: PortfolioCurrency,
  date: string,
  provider: FxProvider,
): Promise<{ amount: Decimal; quotes: FxQuote[] }> {
  if (from === to) return { amount, quotes: [] };
  const fromQuote = await provider.getRate(from, date);
  const amountPln = amount.times(fromQuote.rateToPln);
  if (to === "PLN") return { amount: amountPln, quotes: [fromQuote] };
  const toQuote = await provider.getRate(to, date);
  return { amount: amountPln.div(toQuote.rateToPln), quotes: [fromQuote, toQuote] };
}

export function identityQuote(date: string): FxQuote {
  return {
    currency: "PLN",
    rateToPln: new Decimal(1),
    requestedDate: date,
    effectiveDate: date,
    tableNo: "PLN",
    source: "IDENTITY",
  };
}
