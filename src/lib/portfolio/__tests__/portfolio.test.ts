import Decimal from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioCurrency, XtbCashOperation } from "@/lib/xtb/types";
import { classifyOperation } from "../classify";
import { convertMoney } from "../fx";
import { NbpClient } from "../nbp-client";
import { pairTransfers } from "../transfers";
import type { FxProvider, FxQuote, MoneyCashFlow } from "../types";
import { calculateXirr, XirrError } from "../xirr";
import { calculateCapitalResult } from "../calculate";
import { selectHistoryTickers } from "../history";
import type { XtbPositionLot } from "@/lib/xtb/types";

function operation(overrides: Partial<XtbCashOperation>): XtbCashOperation {
  return {
    accountNumber: "1",
    type: "Deposit",
    instrument: null,
    ticker: null,
    category: null,
    occurredAt: "2025-01-01T12:00:00.000Z",
    amount: new Decimal(100),
    operationId: "1",
    comment: null,
    product: "My Trades",
    positionId: null,
    sourceRow: 6,
    ...overrides,
  };
}

class StubFx implements FxProvider {
  constructor(private readonly rates: Record<PortfolioCurrency, string>) {}
  getRate(currency: PortfolioCurrency, date: string): Promise<FxQuote> {
    return Promise.resolve({
      currency,
      rateToPln: new Decimal(this.rates[currency]),
      requestedDate: date.slice(0, 10),
      effectiveDate: date.slice(0, 10),
      tableNo: "test",
      source: currency === "PLN" ? "IDENTITY" : "NBP_A",
    });
  }
}

describe("operation classification", () => {
  it("keeps only owner deposits and withdrawals as external cash flows", () => {
    expect(classifyOperation(operation({ type: "Deposit" }), "PLN").cashFlowSign).toBe(-1);
    expect(classifyOperation(operation({ type: "Withdrawal" }), "PLN").cashFlowSign).toBe(1);
    expect(classifyOperation(operation({ type: "Dividend" }), "PLN").classification).toBe("internal");
    expect(classifyOperation(operation({ type: "IKE deposit" }), "PLN").classification).toBe("transfer");
    expect(classifyOperation(operation({ type: "Unexpected" }), "PLN").classification).toBe("unknown");
  });
});

describe("FX", () => {
  it("converts cross currencies through PLN", async () => {
    const result = await convertMoney(
      new Decimal(100),
      "EUR",
      "USD",
      "2025-01-02",
      new StubFx({ PLN: "1", EUR: "4.2", USD: "4" }),
    );
    expect(result.amount.toFixed(2)).toBe("105.00");
    expect(result.quotes).toHaveLength(2);
  });

  it("uses the last earlier NBP table on a weekend", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      if (url.includes("2025-01-05") || url.includes("2025-01-04"))
        return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            table: "A",
            code: "EUR",
            rates: [{ no: "001/A/NBP/2025", effectiveDate: "2025-01-03", mid: 4.2 }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    const quote = await new NbpClient(fetcher).getRate("EUR", "2025-01-05");
    expect(quote.effectiveDate).toBe("2025-01-03");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("transfer pairing", () => {
  it("pairs opposite operations across currencies", async () => {
    const outgoing = classifyOperation(
      operation({ type: "Transfer", amount: new Decimal(-420), operationId: "out" }),
      "PLN",
    );
    const incoming = classifyOperation(
      operation({ type: "Transfer", amount: new Decimal(100), operationId: "in" }),
      "EUR",
    );
    const result = await pairTransfers([outgoing, incoming], new StubFx({ PLN: "1", EUR: "4.2", USD: "4" }));
    expect(result.pairs).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
  });

  it("does not guess when two incoming operations match", async () => {
    const outgoing = classifyOperation(
      operation({ type: "Transfer", amount: new Decimal(-420), operationId: "out" }),
      "PLN",
    );
    const incoming1 = classifyOperation(
      operation({ type: "Transfer", amount: new Decimal(100), operationId: "in-1" }),
      "EUR",
    );
    const incoming2 = classifyOperation(
      operation({ type: "Transfer", amount: new Decimal(100), operationId: "in-2" }),
      "EUR",
    );
    const result = await pairTransfers(
      [outgoing, incoming1, incoming2],
      new StubFx({ PLN: "1", EUR: "4.2", USD: "4" }),
    );
    expect(result.pairs).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
  });

  it("uses an exact shared comment before amount heuristics", async () => {
    const outgoing1 = classifyOperation(
      operation({
        type: "Subaccount transfer",
        amount: new Decimal(-8250),
        operationId: "out-1",
        comment: "transfer A",
      }),
      "PLN",
    );
    const outgoing2 = classifyOperation(
      operation({
        type: "Subaccount transfer",
        amount: new Decimal("-8252.96"),
        operationId: "out-2",
        comment: "transfer B",
      }),
      "PLN",
    );
    const incoming1 = classifyOperation(
      operation({ type: "Subaccount transfer", amount: new Decimal(8250), operationId: "in-1", comment: "transfer A" }),
      "PLN",
    );
    const incoming2 = classifyOperation(
      operation({
        type: "Subaccount transfer",
        amount: new Decimal("8252.96"),
        operationId: "in-2",
        comment: "transfer B",
      }),
      "PLN",
    );
    const result = await pairTransfers(
      [outgoing1, outgoing2, incoming1, incoming2],
      new StubFx({ PLN: "1", EUR: "4.2", USD: "4" }),
    );
    expect(result.pairs).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
  });
});

describe("XIRR", () => {
  it("matches a one-year reference return", () => {
    const flows: MoneyCashFlow[] = [
      { date: "2024-01-01", amount: new Decimal(-1000), sourceOperationIds: ["a"] },
      { date: "2024-12-31", amount: new Decimal(1100), sourceOperationIds: [] },
    ];
    expect(calculateXirr(flows).toNumber()).toBeCloseTo(0.1, 8);
  });

  it("rejects inputs without both signs", () => {
    expect(() => calculateXirr([{ date: "2025-01-01", amount: new Decimal(100), sourceOperationIds: [] }])).toThrow(
      XirrError,
    );
  });

  it("rejects multiple roots", () => {
    const flows: MoneyCashFlow[] = [
      { date: "2023-01-01", amount: new Decimal(-100), sourceOperationIds: [] },
      { date: "2024-01-01", amount: new Decimal(230), sourceOperationIds: [] },
      { date: "2025-01-01", amount: new Decimal(-132), sourceOperationIds: [] },
    ];
    expect(() => calculateXirr(flows)).toThrow("więcej niż jedno");
  });
});

describe("capital result", () => {
  it("shows net invested capital, total profit and simple return", () => {
    const result = calculateCapitalResult(new Decimal(1200), new Decimal(200), new Decimal(1250));

    expect(result.netInvestedCapital.toFixed(2)).toBe("1000.00");
    expect(result.totalProfit.toFixed(2)).toBe("250.00");
    expect(result.simpleReturn?.toFixed(4)).toBe("0.2500");
  });
});

describe("history ticker budget", () => {
  it("prioritizes the instruments with the largest cost exposure", () => {
    const lot = (ticker: string, volume: number, openPrice: number): XtbPositionLot => ({
      accountNumber: "1",
      product: "My Trades",
      instrument: ticker,
      ticker,
      category: "STC",
      type: "BUY",
      volume: new Decimal(volume),
      openPrice: new Decimal(openPrice),
      openAt: "2025-01-01T00:00:00.000Z",
      closePrice: null,
      closeAt: null,
      positionId: ticker,
      sourceRow: 1,
    });

    expect(selectHistoryTickers([lot("SMALL", 1, 10), lot("BIG", 3, 100), lot("MEDIUM", 2, 50)], 2)).toEqual([
      "BIG",
      "MEDIUM",
    ]);
  });
});
