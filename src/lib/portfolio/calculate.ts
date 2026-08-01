import Decimal from "decimal.js";
import type { ParsedXtbPortfolio, PortfolioCurrency } from "@/lib/xtb/types";
import { classifyOperation } from "./classify";
import { convertMoney } from "./fx";
import { pairTransfers } from "./transfers";
import type { FxProvider, FxQuote, MoneyCashFlow, PortfolioDiagnostic, TransferPair } from "./types";
import { calculateXirr, XirrError } from "./xirr";

export interface PortfolioCalculation {
  baseCurrency: PortfolioCurrency;
  valuationDate: string;
  securitiesValue: Decimal;
  cashValue: Decimal;
  ikeCashValue: Decimal;
  plansCashValue: Decimal;
  marginValue: Decimal;
  totalValue: Decimal;
  xirr: Decimal | null;
  cashFlows: MoneyCashFlow[];
  transferPairs: TransferPair[];
  fxQuotes: FxQuote[];
  diagnostics: PortfolioDiagnostic[];
}

function deduplicateQuotes(quotes: FxQuote[]): FxQuote[] {
  return [...new Map(quotes.map((quote) => [`${quote.currency}:${quote.requestedDate}`, quote])).values()];
}

export async function calculatePortfolio(
  portfolio: ParsedXtbPortfolio,
  baseCurrency: PortfolioCurrency,
  provider: FxProvider,
): Promise<PortfolioCalculation> {
  const diagnostics: PortfolioDiagnostic[] = [];
  const classified = portfolio.accounts.flatMap((account) =>
    account.cashOperations.map((operation) => classifyOperation(operation, account.currency)),
  );
  for (const item of classified.filter((operation) => operation.classification === "unknown")) {
    diagnostics.push({
      code: "UNKNOWN_OPERATION",
      message: `Nieobsługiwany typ operacji: ${item.operation.type}.`,
      operationId: item.operation.operationId,
    });
  }
  for (const account of portfolio.accounts.filter((item) => !item.isFullHistory)) {
    diagnostics.push({
      code: "INCOMPLETE_HISTORY",
      message: `Raport ${account.sourceName} nie obejmuje pełnej historii rachunku.`,
    });
  }

  const transferResult = await pairTransfers(classified, provider);
  for (const item of transferResult.unmatched) {
    diagnostics.push({
      code: "UNMATCHED_TRANSFER",
      message: "Nie znaleziono drugiej strony transferu.",
      operationId: item.operation.operationId,
    });
  }
  for (const item of transferResult.ambiguous) {
    diagnostics.push({
      code: "AMBIGUOUS_TRANSFER",
      message: "Transfer ma więcej niż jedno możliwe dopasowanie.",
      operationId: item.operation.operationId,
    });
  }

  const quoteAudit: FxQuote[] = [];
  const flowByDate = new Map<string, MoneyCashFlow>();
  for (const item of classified.filter((operation) => operation.classification === "external")) {
    const date = item.operation.occurredAt.slice(0, 10);
    const signedAmount = item.operation.amount.abs().times(item.cashFlowSign);
    const converted = await convertMoney(signedAmount, item.currency, baseCurrency, date, provider);
    quoteAudit.push(...converted.quotes);
    const existing = flowByDate.get(date);
    flowByDate.set(date, {
      date,
      amount: (existing?.amount ?? new Decimal(0)).plus(converted.amount),
      sourceOperationIds: [...(existing?.sourceOperationIds ?? []), item.operation.operationId],
    });
  }

  let securitiesValue = new Decimal(0);
  let cashValue = new Decimal(0);
  let ikeCashValue = new Decimal(0);
  let plansCashValue = new Decimal(0);
  let marginValue = new Decimal(0);
  let valuationDate = "";
  for (const account of portfolio.accounts) {
    for (const snapshot of account.snapshots) {
      const date = snapshot.valuationAt.slice(0, 10);
      if (date > valuationDate) valuationDate = date;
      const securities = await convertMoney(snapshot.securitiesValue, snapshot.currency, baseCurrency, date, provider);
      const freeFunds = await convertMoney(
        snapshot.reconstructedCash.plus(snapshot.cfdProfit).minus(snapshot.marginValue),
        snapshot.currency,
        baseCurrency,
        date,
        provider,
      );
      const margin = await convertMoney(snapshot.marginValue, snapshot.currency, baseCurrency, date, provider);
      securitiesValue = securitiesValue.plus(securities.amount);
      if (snapshot.product === "My Trades") cashValue = cashValue.plus(freeFunds.amount);
      else if (snapshot.product === "IKE") ikeCashValue = ikeCashValue.plus(freeFunds.amount);
      else plansCashValue = plansCashValue.plus(freeFunds.amount);
      marginValue = marginValue.plus(margin.amount);
      quoteAudit.push(...securities.quotes, ...freeFunds.quotes, ...margin.quotes);
    }
  }
  const totalValue = securitiesValue.plus(cashValue).plus(ikeCashValue).plus(plansCashValue).plus(marginValue);
  const endingFlow: MoneyCashFlow = { date: valuationDate, amount: totalValue, sourceOperationIds: [] };
  const cashFlows = [...flowByDate.values(), endingFlow].sort((left, right) => left.date.localeCompare(right.date));

  let xirr: Decimal | null = null;
  if (diagnostics.length === 0) {
    try {
      xirr = calculateXirr(cashFlows);
    } catch (error) {
      if (!(error instanceof XirrError)) throw error;
      diagnostics.push({ code: "XIRR_UNAVAILABLE", message: error.message });
    }
  }

  return {
    baseCurrency,
    valuationDate,
    securitiesValue,
    cashValue,
    ikeCashValue,
    plansCashValue,
    marginValue,
    totalValue,
    xirr,
    cashFlows,
    transferPairs: transferResult.pairs,
    fxQuotes: deduplicateQuotes(quoteAudit),
    diagnostics,
  };
}
