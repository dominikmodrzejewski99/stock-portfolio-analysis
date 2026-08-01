import { RefreshCw, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface LiveResult {
  available: boolean;
  requiresImport?: boolean;
  baseCurrency?: string;
  totalValue?: string;
  changeSinceImport?: string;
  reportDate?: string;
  marketDate?: string;
  unavailableTickers?: string[];
  cfdFrozen?: boolean;
}

function money(value: string, currency: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value),
  );
}

export default function LiveValuation() {
  const [result, setResult] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/portfolio/live");
      setResult(response.ok ? ((await response.json()) as LiveResult) : null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/portfolio/live")
      .then(async (response) => (response.ok ? ((await response.json()) as LiveResult) : null))
      .then((payload) => {
        if (active) setResult(payload);
      })
      .catch(() => {
        if (active) setResult(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="mt-8 h-32 animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none"
        aria-label="Pobieranie bieżącej wyceny"
      />
    );
  }
  if (!result?.available) {
    if (!result?.requiresImport) return null;
    return (
      <p className="mt-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        Aby uruchomić automatyczną wycenę, zaimportuj raport jeszcze jeden raz.
      </p>
    );
  }
  const currency = result.baseCurrency ?? "PLN";
  const change = Number(result.changeSinceImport ?? 0);
  return (
    <section className="mt-8 border-y border-slate-200 py-6" aria-labelledby="live-valuation-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p id="live-valuation-title" className="flex items-center gap-2 text-sm font-medium text-indigo-800">
            <TrendingUp aria-hidden="true" className="size-4" /> Bieżąca wycena rynkowa
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
            {money(result.totalValue ?? "0", currency)}
          </p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {change >= 0 ? "+" : ""}
            {money(String(change), currency)} od raportu
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw aria-hidden="true" className="size-4" /> Odśwież ceny
        </button>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Ceny z {result.marketDate}, stan pozycji z raportu XTB z {result.reportDate}. Nowe transakcje wymagają kolejnego
        importu.
      </p>
      {((result.cfdFrozen ?? false) || (result.unavailableTickers?.length ?? 0) > 0) && (
        <p className="mt-2 text-xs leading-5 text-amber-800">
          CFD oraz instrumenty bez aktualnego notowania pozostają w wartości z raportu
          {result.unavailableTickers?.length ? `: ${result.unavailableTickers.join(", ")}` : ""}.
        </p>
      )}
    </section>
  );
}
