import { describe, expect, it } from "vitest";
import { calculatePeriodPerformance } from "../PortfolioHistoryChart";

describe("calculatePeriodPerformance", () => {
  it("excludes deposits from profit and includes net cash flows in working capital", () => {
    const result = calculatePeriodPerformance([
      {
        date: "2026-01-01",
        totalValue: 100,
        netInvestedCapital: 100,
        totalProfit: 0,
        benchmarkValue: 1000,
        msciWorldValue: 100,
        nasdaq100Value: 100,
        emergingMarketsValue: 100,
        semiconductorValue: 100,
      },
      {
        date: "2026-01-02",
        totalValue: 110,
        netInvestedCapital: 100,
        totalProfit: 10,
        benchmarkValue: 1010,
        msciWorldValue: 101,
        nasdaq100Value: 101,
        emergingMarketsValue: 101,
        semiconductorValue: 101,
      },
      {
        date: "2026-01-03",
        totalValue: 165,
        netInvestedCapital: 150,
        totalProfit: 15,
        benchmarkValue: 1020,
        msciWorldValue: 102,
        nasdaq100Value: 102,
        emergingMarketsValue: 102,
        semiconductorValue: 102,
      },
    ]);

    expect(result.at(-1)?.periodProfit).toBe(15);
    expect(result.at(-1)?.periodReturn).toBeCloseTo(10, 8);
  });

  it("does not keep withdrawn capital in the return denominator", () => {
    const result = calculatePeriodPerformance([
      {
        date: "2026-01-01",
        totalValue: 100,
        netInvestedCapital: 100,
        totalProfit: 0,
        benchmarkValue: null,
        msciWorldValue: null,
        nasdaq100Value: null,
        emergingMarketsValue: null,
        semiconductorValue: null,
      },
      {
        date: "2026-01-02",
        totalValue: 107,
        netInvestedCapital: 97,
        totalProfit: 10,
        benchmarkValue: null,
        msciWorldValue: null,
        nasdaq100Value: null,
        emergingMarketsValue: null,
        semiconductorValue: null,
      },
    ]);

    expect(result.at(-1)?.periodProfit).toBe(10);
    expect(result.at(-1)?.periodReturn).toBeCloseTo((10 / 97) * 100, 8);
  });

  it("starts every selected range at zero", () => {
    const result = calculatePeriodPerformance([
      {
        date: "2026-06-01",
        totalValue: 120,
        netInvestedCapital: 100,
        totalProfit: 20,
        benchmarkValue: null,
        msciWorldValue: null,
        nasdaq100Value: null,
        emergingMarketsValue: null,
        semiconductorValue: null,
      },
      {
        date: "2026-06-02",
        totalValue: 114,
        netInvestedCapital: 100,
        totalProfit: 14,
        benchmarkValue: null,
        msciWorldValue: null,
        nasdaq100Value: null,
        emergingMarketsValue: null,
        semiconductorValue: null,
      },
    ]);

    expect(result[0].periodReturn).toBe(0);
    expect(result.at(-1)?.periodReturn).toBeCloseTo(-5, 8);
  });
});
