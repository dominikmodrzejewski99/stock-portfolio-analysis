import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioResult } from "../PortfolioResult";
import type { PortfolioImportResult } from "../types";

const result: PortfolioImportResult = {
  importId: "import-1",
  baseCurrency: "PLN",
  valuationDate: "2026-08-01",
  securitiesValue: "22211.58",
  cashValue: "71.20",
  marginValue: "0",
  totalValue: "22282.78",
  xirr: "0.1234",
  diagnostics: [],
  accounts: [
    {
      currency: "PLN",
      products: [{ name: "IKE", currency: "PLN", securitiesValue: "22211.58", cashValue: "71.20", marginValue: "0" }],
    },
  ],
  externalCashFlows: [{ date: "2025-01-01", amount: "-10000" }],
};

describe("PortfolioResult", () => {
  it("renders the portfolio total, rate of return and product split", () => {
    const html = renderToStaticMarkup(<PortfolioResult result={result} />);

    expect(html).toContain("22 282,78");
    expect(html).toContain("12,34");
    expect(html).toContain("IKE");
    expect(html).toContain("Rachunek PLN");
  });

  it("shows a blocked result when diagnostics are present", () => {
    const html = renderToStaticMarkup(
      <PortfolioResult
        result={{ ...result, xirr: null, diagnostics: [{ code: "UNKNOWN_OPERATION", message: "Nieznana operacja" }] }}
      />,
    );

    expect(html).toContain("Nie można obliczyć");
    expect(html).toContain("Nieznana operacja");
  });
});
