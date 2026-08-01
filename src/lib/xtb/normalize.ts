import Decimal from "decimal.js";
import { XtbImportError } from "./errors";

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function excelSerialToIso(value: string, location?: { file?: string; sheet?: string; row?: number }): string {
  const serial = Number(value);
  if (!Number.isFinite(serial)) {
    throw new XtbImportError("INVALID_CELL", "Nieprawidłowa data w raporcie XTB.", location);
  }

  const date = new Date(EXCEL_EPOCH_UTC + Math.round(serial * 86_400_000));
  if (Number.isNaN(date.getTime())) {
    throw new XtbImportError("INVALID_CELL", "Nieprawidłowa data w raporcie XTB.", location);
  }
  return date.toISOString();
}

export function parseMoney(value: string, location?: { file?: string; sheet?: string; row?: number }): Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new XtbImportError("INVALID_CELL", "Nieprawidłowa kwota w raporcie XTB.", location);
  }
}

export function optionalDecimal(value: string | undefined): Decimal | null {
  if (!value) return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(trimmed)) return trimmed.replace(/\.0+$/, "");
  return new Decimal(trimmed).toFixed(0);
}
