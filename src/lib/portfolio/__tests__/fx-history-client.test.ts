import Decimal from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import { YahooFxHistoryClient } from "../fx-history-client";
import type { YahooPriceClient } from "../yahoo-client";

describe("YahooFxHistoryClient", () => {
  it("loads a long range with one price request and fills non-trading days", async () => {
    const getDaily = vi.fn().mockResolvedValue({
      ticker: "EURPLN=X",
      providerSymbol: "EURPLN=X",
      currency: "PLN",
      prices: [
        { date: "2025-01-03", close: new Decimal("4.20") },
        { date: "2025-01-06", close: new Decimal("4.22") },
      ],
    });
    const client = new YahooFxHistoryClient({ getDaily } as unknown as YahooPriceClient);

    const rates = await client.getRates("EUR", "2025-01-03", "2025-01-06");

    expect(getDaily).toHaveBeenCalledOnce();
    expect(getDaily).toHaveBeenCalledWith("EURPLN=X", "2025-01-03", "2025-01-06");
    expect(rates.get("2025-01-04")?.toString()).toBe("4.2");
    expect(rates.get("2025-01-06")?.toString()).toBe("4.22");
  });
});
