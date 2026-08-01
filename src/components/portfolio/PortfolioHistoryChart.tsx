import { useMemo, useState } from "react";

interface Point {
  date: string;
  totalValue: number;
  netInvestedCapital: number;
  totalProfit: number;
}
type Range = "1M" | "6M" | "1R" | "YTD" | "MAX";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function startDate(range: Range, last: string): string {
  const date = new Date(`${last}T00:00:00Z`);
  if (range === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
  if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  if (range === "1R") date.setUTCFullYear(date.getUTCFullYear() - 1);
  if (range === "YTD") return `${date.getUTCFullYear()}-01-01`;
  return range === "MAX" ? "0000-01-01" : date.toISOString().slice(0, 10);
}

export default function PortfolioHistoryChart({ points, currency }: { points: Point[]; currency: string }) {
  const [range, setRange] = useState<Range>("MAX");
  const [selected, setSelected] = useState<number | null>(null);
  const visible = useMemo(() => {
    const from = startDate(range, points.at(-1)?.date ?? "1970-01-01");
    return points.filter((point) => point.date >= from);
  }, [points, range]);
  const width = 1000;
  const height = 390;
  const pad = 34;
  const values = visible.flatMap((point) => [point.totalValue, point.netInvestedCapital]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, 1);
  const x = (index: number) => pad + (index / Math.max(visible.length - 1, 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const path = (key: "totalValue" | "netInvestedCapital") =>
    visible.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const active = visible[selected ?? visible.length - 1];

  return (
    <section aria-labelledby="history-chart-title">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Stan na{" "}
            {new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" }).format(new Date(`${active.date}T12:00:00Z`))}
          </p>
          <h2
            id="history-chart-title"
            className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums"
          >
            {money(active.totalValue, currency)}
          </h2>
          <p
            className={`mt-1 text-sm font-semibold tabular-nums ${active.totalProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}
          >
            Wynik: {money(active.totalProfit, currency)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Zakres wykresu">
          {(["1M", "6M", "1R", "YTD", "MAX"] as Range[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setRange(item);
                setSelected(null);
              }}
              aria-pressed={range === item}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${range === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 1 ? (
        <div className="mt-7">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Wartość portfela i wpłacony kapitał netto w czasie"
            className="h-auto w-full overflow-visible"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const relative = (event.clientX - bounds.left) / bounds.width;
              setSelected(Math.max(0, Math.min(visible.length - 1, Math.round(relative * (visible.length - 1)))));
            }}
            onPointerLeave={() => {
              setSelected(null);
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={pad}
                x2={width - pad}
                y1={pad + ratio * (height - pad * 2)}
                y2={pad + ratio * (height - pad * 2)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            ))}
            <path d={path("netInvestedCapital")} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 7" />
            <path
              d={path("totalValue")}
              fill="none"
              stroke="#4338ca"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {selected !== null && (
              <>
                <line x1={x(selected)} x2={x(selected)} y1={pad} y2={height - pad} stroke="#64748b" strokeWidth="1" />
                <circle
                  cx={x(selected)}
                  cy={y(active.totalValue)}
                  r="6"
                  fill="#4338ca"
                  stroke="white"
                  strokeWidth="3"
                />
              </>
            )}
          </svg>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <span className="flex items-center gap-2">
              <span className="h-1 w-6 rounded bg-indigo-700" /> Wartość portfela
            </span>
            <span className="flex items-center gap-2">
              <span className="w-6 border-t-2 border-dashed border-slate-400" /> Kapitał netto
            </span>
          </div>
        </div>
      ) : (
        <p className="py-16 text-center text-slate-600">Za mało punktów, aby narysować wykres.</p>
      )}
    </section>
  );
}
