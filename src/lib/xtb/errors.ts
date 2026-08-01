export type XtbImportErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "UNSAFE_ARCHIVE"
  | "TOO_MANY_WORKBOOKS"
  | "ARCHIVE_TOO_LARGE"
  | "INVALID_WORKBOOK"
  | "MISSING_SHEET"
  | "MISSING_HEADER"
  | "INVALID_CELL"
  | "UNSUPPORTED_CURRENCY";

export class XtbImportError extends Error {
  constructor(
    public readonly code: XtbImportErrorCode,
    message: string,
    public readonly location?: { file?: string; sheet?: string; row?: number },
  ) {
    super(message);
    this.name = "XtbImportError";
  }
}
