import type Decimal from "decimal.js";
import type { PortfolioCurrency, XtbCashOperation } from "@/lib/xtb/types";

export type OperationClassification = "external" | "internal" | "transfer" | "unknown";

export interface ClassifiedOperation {
  operation: XtbCashOperation;
  currency: PortfolioCurrency;
  classification: OperationClassification;
  cashFlowSign: -1 | 0 | 1;
}

export interface FxQuote {
  currency: PortfolioCurrency;
  rateToPln: Decimal;
  requestedDate: string;
  effectiveDate: string;
  tableNo: string;
  source: "NBP_A" | "IDENTITY";
}

export interface FxProvider {
  getRate(currency: PortfolioCurrency, date: string): Promise<FxQuote>;
}

export interface MoneyCashFlow {
  date: string;
  amount: Decimal;
  sourceOperationIds: string[];
}

export interface TransferPair {
  outgoing: ClassifiedOperation;
  incoming: ClassifiedOperation;
  differencePln: Decimal;
}

export interface PortfolioDiagnostic {
  code: "UNKNOWN_OPERATION" | "UNMATCHED_TRANSFER" | "AMBIGUOUS_TRANSFER" | "INCOMPLETE_HISTORY" | "XIRR_UNAVAILABLE";
  message: string;
  operationId?: string;
}
