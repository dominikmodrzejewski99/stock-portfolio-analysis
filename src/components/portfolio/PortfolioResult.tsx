import { CalendarDays, Landmark, ReceiptText, WalletCards } from "lucide-react";
import type { BaseCurrency, PortfolioImportResult } from "./types";

function money(value: string, currency: BaseCurrency): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value),
  );
}

function percent(value: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function PortfolioResult({ result }: { result: PortfolioImportResult }) {
  const hasBlockedResult = result.diagnostics.length > 0 || result.xirr === null;
  const profitByCurrency = result.accounts
    .flatMap((account) => account.products)
    .reduce<Partial<Record<BaseCurrency, number>>>((totals, product) => {
      totals[product.currency] = (totals[product.currency] ?? 0) + Number(product.profitValue);
      return totals;
    }, {});

  return (
    <section aria-labelledby="portfolio-result-heading" className="mt-10">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-indigo-700 uppercase">Wynik importu</p>
          <h2 id="portfolio-result-heading" className="text-2xl font-semibold tracking-tight text-slate-950">
            Cały portfel
          </h2>
        </div>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <CalendarDays aria-hidden="true" className="size-4" />
          Stan na{" "}
          {new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" }).format(
            new Date(`${result.valuationDate}T12:00:00Z`),
          )}
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-7 py-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <dt className="flex items-center gap-2 text-sm text-slate-600">
            <WalletCards aria-hidden="true" className="size-4" /> Łączna wartość
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">
            {money(result.totalValue, result.baseCurrency)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm text-slate-600">
            <Landmark aria-hidden="true" className="size-4" /> Instrumenty
          </dt>
          <dd className="mt-2 text-xl font-semibold text-slate-900 tabular-nums">
            {money(result.securitiesValue, result.baseCurrency)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm text-slate-600">
            <ReceiptText aria-hidden="true" className="size-4" /> Wolne środki My Trades
          </dt>
          <dd className="mt-2 text-xl font-semibold text-slate-900 tabular-nums">
            {money(result.cashValue, result.baseCurrency)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Gotówka w planach i IKE</dt>
          <dd className="mt-2 text-xl font-semibold text-slate-900 tabular-nums">
            {money(result.otherCashValue, result.baseCurrency)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Depozyt zabezpieczający</dt>
          <dd className="mt-2 text-xl font-semibold text-slate-900 tabular-nums">
            {money(result.marginValue, result.baseCurrency)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">MWR / XIRR rocznie</dt>
          <dd
            className={`mt-2 text-xl font-semibold tabular-nums ${hasBlockedResult ? "text-amber-800" : "text-indigo-800"}`}
          >
            {hasBlockedResult ? "Nie można obliczyć" : percent(result.xirr ?? "0")}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-slate-200 py-4 text-sm">
        <span className="font-medium text-slate-900">Zysk otwartych pozycji według raportu</span>
        {Object.entries(profitByCurrency).map(([currency, value]) => (
          <span key={currency} className="font-semibold text-emerald-700 tabular-nums">
            {money(String(value), currency as BaseCurrency)}
          </span>
        ))}
      </div>

      {hasBlockedResult && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">Wynik stopy zwrotu został wstrzymany</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.diagnostics.map((item, index) => (
              <li key={`${item.code}-${item.operationId ?? index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Rachunki i plany</h3>
          <p className="mt-1 text-sm text-slate-600">Wartości w oryginalnej walucie każdego rachunku.</p>
        </div>
        <div className="divide-y divide-slate-200">
          {result.accounts.flatMap((account, accountIndex) =>
            account.products.map((product, productIndex) => (
              <div
                key={`${account.currency}-${product.name}-${accountIndex}-${productIndex}`}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Rachunek {account.currency}
                  </p>
                </div>
                <p className="text-sm text-slate-700 tabular-nums">
                  Instrumenty: {money(product.securitiesValue, product.currency)}
                </p>
                <div className="text-sm text-slate-700 tabular-nums">
                  <p>
                    {product.name === "My Trades" ? "Wolne środki" : "Gotówka"}:{" "}
                    {money(product.cashValue, product.currency)}
                  </p>
                  <p>Zysk: {money(product.profitValue, product.currency)}</p>
                  {Number(product.marginValue) !== 0 && <p>Depozyt: {money(product.marginValue, product.currency)}</p>}
                </div>
              </div>
            )),
          )}
        </div>
      </div>

      <details className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
          Jak policzono wynik
        </summary>
        <div className="mt-4 max-w-3xl space-y-2 text-slate-600">
          <p>Stopa zwrotu jest annualizowanym MWR/XIRR. Wpłaty i wypłaty uwzględniają datę oraz kwotę.</p>
          <p>
            Transfery pomiędzy własnymi rachunkami zostały wyłączone. Waluty przeliczono średnim kursem NBP z dnia
            operacji lub ostatniego wcześniejszego notowania.
          </p>
          <p>Liczba przepływów zewnętrznych użytych w audycie: {result.externalCashFlows.length}.</p>
        </div>
      </details>
    </section>
  );
}
