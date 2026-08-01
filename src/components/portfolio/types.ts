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
}

export interface PortfolioImportResult {
  importId: string;
  baseCurrency: BaseCurrency;
  valuationDate: string;
  securitiesValue: string;
  cashValue: string;
  marginValue: string;
  totalValue: string;
  xirr: string | null;
  diagnostics: ImportDiagnostic[];
  accounts: { currency: BaseCurrency; products: PortfolioProductResult[] }[];
  externalCashFlows: { date: string; amount: string }[];
}
