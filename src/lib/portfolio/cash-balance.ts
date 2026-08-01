import Decimal from "decimal.js";
import type { XtbCashOperation } from "@/lib/xtb/types";

export function calculateCashBalance(operations: XtbCashOperation[]): Decimal {
  return operations.reduce((sum, operation) => sum.plus(operation.amount), new Decimal(0));
}
