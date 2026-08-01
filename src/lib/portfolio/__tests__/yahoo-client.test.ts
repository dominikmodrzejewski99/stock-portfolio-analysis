import { describe, expect, it } from "vitest";
import { yahooSymbol } from "../yahoo-client";

describe("yahooSymbol", () => {
  it("maps XTB exchange suffixes and renamed listings", () => {
    expect(yahooSymbol("CDR.PL")).toBe("CDR.WA");
    expect(yahooSymbol("LTAM.NL")).toBe("LTAM.AS");
    expect(yahooSymbol("DAXEX.DE")).toBe("EXS1.DE");
    expect(yahooSymbol("AMZN.DE")).toBe("AMZ.DE");
  });
});
