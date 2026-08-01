import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImportPortfolioForm from "../ImportPortfolioForm";

describe("ImportPortfolioForm", () => {
  it("renders the XTB file input and recommended PLN currency", () => {
    const html = renderToStaticMarkup(<ImportPortfolioForm />);

    expect(html).toContain('accept=".zip,.xlsx');
    expect(html).toContain("Wybierz raport XTB");
    expect(html).toContain('<option value="PLN" selected="">');
    expect(html).toContain("Importuj i oblicz");
  });
});
