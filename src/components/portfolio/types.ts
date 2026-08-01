export type BaseCurrency = "PLN" | "EUR" | "USD";

export interface ImportDiagnostic {
  code: string;
  message: string;
  operationId?: string;
}

export interface PortfolioProductResult {
  name: string;
  currency: BaseCurrency;
  securitiesValue: string;
  cashValue: string;
  marginValue: string;
  profitValue: string;
}

export interface PortfolioImportResult {
  importId: string;
  baseCurrency: BaseCurrency;
  valuationDate: string;
  securitiesValue: string;
  cashValue: string;
  ikeCashValue: string;
  plansCashValue: string;
  marginValue: string;
  totalValue: string;
  depositedCapital: string;
  withdrawnCapital: string;
  netInvestedCapital: string;
  totalProfit: string;
  simpleReturn: string | null;
  xirr: string | null;
  diagnostics: ImportDiagnostic[];
  history: { pointsCount: number; unavailableTickers: string[] };
  accounts: { currency: BaseCurrency; products: PortfolioProductResult[] }[];
  externalCashFlows: { date: string; amount: string }[];
}
