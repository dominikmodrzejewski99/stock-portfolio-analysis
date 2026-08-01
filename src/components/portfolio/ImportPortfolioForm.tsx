import { FileCheck2, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useId, useState, type SyntheticEvent } from "react";
import { PortfolioResult } from "./PortfolioResult";
import type { BaseCurrency, PortfolioImportResult } from "./types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function ImportPortfolioForm() {
  const fileInputId = useId();
  const currencyId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<BaseCurrency>("PLN");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PortfolioImportResult | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Wybierz plik ZIP lub XLSX wyeksportowany z XTB.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Plik przekracza limit 10 MB.");
      return;
    }

    setIsLoading(true);
    const body = new FormData();
    body.set("file", file);
    body.set("baseCurrency", currency);
    try {
      const response = await fetch("/api/portfolio/import", { method: "POST", body });
      const payload = await response.json<PortfolioImportResult | { error?: string }>();
      if (!response.ok || !("importId" in payload)) {
        setError("error" in payload && payload.error ? payload.error : "Nie udało się zaimportować raportu.");
        return;
      }
      setResult(payload);
    } catch {
      setError("Nie udało się połączyć z aplikacją. Spróbuj ponownie.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-8" noValidate>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div>
            <label
              htmlFor={fileInputId}
              className="group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors duration-200 focus-within:border-indigo-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/40"
            >
              {file ? (
                <FileCheck2 aria-hidden="true" className="size-8 text-indigo-700" />
              ) : (
                <FileSpreadsheet aria-hidden="true" className="size-8 text-slate-500 group-hover:text-indigo-700" />
              )}
              <span className="mt-4 font-semibold text-slate-900">{file ? file.name : "Wybierz raport XTB"}</span>
              <span className="mt-1 max-w-md text-sm leading-6 text-slate-600">
                ZIP z wieloma rachunkami lub pojedynczy XLSX. Pełny zakres od początku rachunku, maksymalnie 10 MB.
              </span>
              <input
                id={fileInputId}
                type="file"
                accept=".zip,.xlsx,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
            </label>
          </div>

          <div className="flex flex-col justify-between gap-6">
            <div>
              <label htmlFor={currencyId} className="text-sm font-medium text-slate-800">
                Waluta wyniku
              </label>
              <select
                id={currencyId}
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value as BaseCurrency);
                }}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="PLN">PLN, złoty</option>
                <option value="EUR">EUR, euro</option>
                <option value="USD">USD, dolar</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-500">Pozostałe waluty przeliczymy według tabeli A NBP.</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-indigo-50 transition-colors duration-200 hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{" "}
                  Analizuję raport
                </>
              ) : (
                <>
                  <Upload aria-hidden="true" className="size-4" /> Importuj i oblicz
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {isLoading ? "Trwa analiza raportu." : result ? "Raport został przeanalizowany." : ""}
        </p>
      </form>

      {result && <PortfolioResult result={result} />}
    </>
  );
}
