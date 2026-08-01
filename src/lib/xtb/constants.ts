export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_WORKBOOKS = 10;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export const REQUIRED_SHEETS = ["Cash Operations", "Open Positions"] as const;
export const SUPPORTED_CURRENCIES = ["PLN", "EUR", "USD"] as const;

export const CASH_OPERATION_HEADERS = ["Type", "Time", "Amount", "ID", "Product"] as const;
export const OPEN_POSITION_HEADERS = ["Product", "Instrument/Position", "Ticker", "Volume", "Value"] as const;
