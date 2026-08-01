import { unzipSync } from "fflate";
import { MAX_UNCOMPRESSED_BYTES, MAX_UPLOAD_BYTES, MAX_WORKBOOKS } from "./constants";
import { XtbImportError } from "./errors";

export interface WorkbookEntry {
  name: string;
  bytes: Uint8Array;
}

const XLSX_CONTENT_TYPES = "[Content_Types].xml";

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isSafePath(path: string): boolean {
  return !path.startsWith("/") && !path.startsWith("\\") && !path.split(/[\\/]/).includes("..");
}

function looksLikeXlsx(bytes: Uint8Array): boolean {
  if (!isZip(bytes)) return false;
  try {
    return XLSX_CONTENT_TYPES in unzipSync(bytes);
  } catch {
    return false;
  }
}

export function extractWorkbooks(bytes: Uint8Array, sourceName: string): WorkbookEntry[] {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new XtbImportError("FILE_TOO_LARGE", "Plik przekracza limit 10 MB.", { file: sourceName });
  }
  if (!isZip(bytes)) {
    throw new XtbImportError("UNSUPPORTED_FILE", "Obsługiwane są wyłącznie pliki ZIP i XLSX.", {
      file: sourceName,
    });
  }
  if (sourceName.toLowerCase().endsWith(".xlsx") || looksLikeXlsx(bytes)) {
    if (!looksLikeXlsx(bytes)) {
      throw new XtbImportError("INVALID_WORKBOOK", "Plik nie jest poprawnym XLSX.", { file: sourceName });
    }
    return [{ name: sourceName, bytes }];
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new XtbImportError("UNSAFE_ARCHIVE", "Nie można bezpiecznie rozpakować archiwum.", {
      file: sourceName,
    });
  }

  const paths = Object.keys(archive);
  if (paths.some((path) => !isSafePath(path))) {
    throw new XtbImportError("UNSAFE_ARCHIVE", "Archiwum zawiera niedozwoloną ścieżkę.", { file: sourceName });
  }
  const totalBytes = Object.values(archive).reduce((total, file) => total + file.byteLength, 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new XtbImportError("ARCHIVE_TOO_LARGE", "Rozpakowane archiwum przekracza limit 50 MB.", {
      file: sourceName,
    });
  }

  const workbooks = paths
    .filter((path) => path.toLowerCase().endsWith(".xlsx"))
    .map((path) => ({ name: path, bytes: archive[path] }));
  if (workbooks.length === 0) {
    throw new XtbImportError("UNSUPPORTED_FILE", "Archiwum nie zawiera plików XLSX.", { file: sourceName });
  }
  if (workbooks.length > MAX_WORKBOOKS) {
    throw new XtbImportError("TOO_MANY_WORKBOOKS", "Archiwum zawiera zbyt wiele skoroszytów.", {
      file: sourceName,
    });
  }
  if (workbooks.some((entry) => !looksLikeXlsx(entry.bytes))) {
    throw new XtbImportError("INVALID_WORKBOOK", "Archiwum zawiera niepoprawny skoroszyt XLSX.", {
      file: sourceName,
    });
  }
  return workbooks;
}
