import Decimal from "decimal.js";
import type { MoneyCashFlow } from "./types";

export class XirrError extends Error {}

function npv(rate: number, flows: MoneyCashFlow[]): number {
  const start = Date.parse(flows[0].date);
  return flows.reduce((sum, flow) => {
    const years = (Date.parse(flow.date) - start) / 86_400_000 / 365;
    return sum + flow.amount.toNumber() / (1 + rate) ** years;
  }, 0);
}

function bisect(flows: MoneyCashFlow[], low: number, high: number): number {
  let lowValue = npv(low, flows);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle, flows);
    if (Math.abs(middleValue) < 1e-8) return middle;
    if (Math.sign(lowValue) === Math.sign(middleValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

export function calculateXirr(input: MoneyCashFlow[]): Decimal {
  const flows = [...input].sort((left, right) => left.date.localeCompare(right.date));
  if (
    flows.length < 2 ||
    !flows.some((flow) => flow.amount.isNegative()) ||
    !flows.some((flow) => flow.amount.isPositive())
  ) {
    throw new XirrError("XIRR wymaga co najmniej jednego przepływu ujemnego i dodatniego.");
  }

  const scanRates = [-0.9999, -0.99, -0.9, -0.75, -0.5, -0.25, 0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 100, 1000];
  const brackets: [number, number][] = [];
  for (let index = 0; index < scanRates.length - 1; index += 1) {
    const low = scanRates[index];
    const high = scanRates[index + 1];
    const lowValue = npv(low, flows);
    const highValue = npv(high, flows);
    if (Number.isFinite(lowValue) && Number.isFinite(highValue) && Math.sign(lowValue) !== Math.sign(highValue)) {
      brackets.push([low, high]);
    }
  }
  if (brackets.length === 0) throw new XirrError("Nie znaleziono rozwiązania XIRR.");
  if (brackets.length > 1) throw new XirrError("XIRR ma więcej niż jedno rozwiązanie.");

  const result = bisect(flows, brackets[0][0], brackets[0][1]);
  if (!Number.isFinite(result) || result <= -1) throw new XirrError("Rozwiązanie XIRR jest poza dozwolonym zakresem.");
  return new Decimal(result);
}
