import { describe, expect, it } from "vitest";
import { parsePolishCpi } from "../inflation";

describe("parsePolishCpi", () => {
  it("compounds valid monthly CPI changes and ignores unavailable data", () => {
    const result = parsePolishCpi(`Nazwa;Jednostka;Sposób prezentacji;Rok;Miesiąc;Wartość
CPI;Polska;Poprzedni miesiąc = 100;2026;1;101,0
CPI;Polska;Grudzień poprzedniego roku = 100;2026;1;101,0
CPI;Polska;Poprzedni miesiąc = 100;2026;2;100,5
CPI;Polska;Poprzedni miesiąc = 100;2026;3;`);

    expect(result).toEqual([
      { month: "2026-01", index: 101 },
      { month: "2026-02", index: 101.505 },
    ]);
  });
});
