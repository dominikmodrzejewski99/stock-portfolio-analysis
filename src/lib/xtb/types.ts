import type Decimal from "decimal.js";
import type { SUPPORTED_CURRENCIES } from "./constants";

export type PortfolioCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface XtbCashOperation {
  accountNumber: string;
  type: string;
  instrument: string | null;
  ticker: string | null;
  category: string | null;
  occurredAt: string;
  amount: Decimal;
  operationId: string;
  comment: string | null;
  product: string;
  positionId: string | null;
  sourceRow: number;
}

export interface XtbOpenPosition {
  accountNumber: string;
  product: string;
  instrument: string;
  ticker: string | null;
  category: string | null;
  volume: Decimal;
  value: Decimal;
  openPrice: Decimal | null;
  netProfitPercent: Decimal | null;
  netProfit: Decimal | null;
  margin: Decimal | null;
  positionId: string | null;
  sourceRow: number;
}

export interface XtbProductSnapshot {
  accountNumber: string;
  product: string;
  currency: PortfolioCurrency;
  securitiesValue: Decimal;
  reconstructedCash: Decimal;
  cfdProfit: Decimal;
  marginValue: Decimal;
  profitValue: Decimal;
  valuationAt: string;
}

export interface XtbAccountReport {
  sourceName: string;
  accountNumber: string;
  currency: PortfolioCurrency;
  reportFrom: string;
  reportTo: string;
  isFullHistory: boolean;
  cashOperations: XtbCashOperation[];
  openPositions: XtbOpenPosition[];
  snapshots: XtbProductSnapshot[];
  closedPositionsCount: number;
}

export interface ParsedXtbPortfolio {
  accounts: XtbAccountReport[];
}
