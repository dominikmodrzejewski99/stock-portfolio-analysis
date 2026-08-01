import { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessDay, IChartApi, MouseEventParams, Time } from "lightweight-charts";

interface Point {
  date: string;
  totalValue: number;
  netInvestedCapital: number;
  totalProfit: number;
}
interface PerformancePoint extends Point {
  periodProfit: number;
  periodReturn: number;
}
type Range = "1M" | "6M" | "1R" | "YTD" | "MAX";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

function startDate(range: Range, last: string): string {
  const date = new Date(`${last}T00:00:00Z`);
  if (range === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
  if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  if (range === "1R") date.setUTCFullYear(date.getUTCFullYear() - 1);
  if (range === "YTD") return `${date.getUTCFullYear()}-01-01`;
  return range === "MAX" ? "0000-01-01" : date.toISOString().slice(0, 10);
}

function toBusinessDay(date: string): BusinessDay {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function dateFromTime(time: Time): string {
  if (typeof time === "string") return time;
  if (typeof time === "number") return new Date(time * 1000).toISOString().slice(0, 10);
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

export function calculatePeriodPerformance(visible: Point[]): PerformancePoint[] {
  const first = visible[0];
  let compounded = 1;
  let cumulativeFlows = 0;
  return visible.map((point, index) => {
    if (index > 0) {
      const previous = visible[index - 1];
      const flow = point.netInvestedCapital - previous.netInvestedCapital;
      cumulativeFlows += flow;
      if (previous.totalValue !== 0) compounded *= (point.totalValue - flow) / previous.totalValue;
    }
    return {
      ...point,
      periodProfit: point.totalValue - first.totalValue - cumulativeFlows,
      periodReturn: (compounded - 1) * 100,
    };
  });
}

export default function PortfolioHistoryChart({ points, currency }: { points: Point[]; currency: string }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<Range>("MAX");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const visible = useMemo(() => {
    const from = startDate(range, points.at(-1)?.date ?? "1970-01-01");
    return points.filter((point) => point.date >= from && point.netInvestedCapital !== 0);
  }, [points, range]);
  const performance = useMemo(() => calculatePeriodPerformance(visible), [visible]);
  const active = performance.find((point) => point.date === selectedDate) ?? performance.at(-1);
  const activeReturn = active?.periodReturn ?? 0;

  useEffect(() => {
    const element = container.current;
    if (!element || performance.length < 2) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;

    void import("lightweight-charts").then(({ BaselineSeries, ColorType, CrosshairMode, createChart }) => {
      if (disposed) return;
      const chart = createChart(element, {
        width: element.clientWidth,
        height: 430,
        autoSize: false,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#64748b",
          attributionLogo: false,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
        },
        grid: {
          vertLines: { color: "#f1f5f9" },
          horzLines: { color: "#e2e8f0" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#cbd5e1", minimumWidth: 72, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: "#cbd5e1", timeVisible: false, rightOffset: 1, barSpacing: 6 },
        localization: { locale: "pl-PL" },
      });
      chartRef.current = chart;
      const series = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topLineColor: "#047857",
        topFillColor1: "rgba(4, 120, 87, 0.24)",
        topFillColor2: "rgba(4, 120, 87, 0.03)",
        bottomLineColor: "#b91c1c",
        bottomFillColor1: "rgba(185, 28, 28, 0.03)",
        bottomFillColor2: "rgba(185, 28, 28, 0.22)",
        lineWidth: 3,
        priceLineVisible: true,
        priceLineColor: "#64748b",
        priceLineWidth: 1,
        lastValueVisible: true,
        priceFormat: { type: "custom", formatter: (value: number) => percentage(value), minMove: 0.01 },
      });
      series.setData(
        performance.map((point) => ({
          time: toBusinessDay(point.date),
          value: point.periodReturn,
        })),
      );
      chart.timeScale().fitContent();
      const move = (event: MouseEventParams) => {
        setSelectedDate(event.time ? dateFromTime(event.time) : null);
      };
      chart.subscribeCrosshairMove(move);
      observer = new ResizeObserver(() => {
        chart.applyOptions({ width: element.clientWidth });
      });
      observer.observe(element);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [performance]);

  return (
    <section aria-labelledby="history-chart-title">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Stan na{" "}
            {active
              ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" }).format(new Date(`${active.date}T12:00:00Z`))
              : "brak danych"}
          </p>
          <h2
            id="history-chart-title"
            className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums"
          >
            {active ? money(active.totalValue, currency) : "Brak danych"}
          </h2>
          {active && (
            <p
              className={`mt-1 text-sm font-semibold tabular-nums ${activeReturn >= 0 ? "text-emerald-700" : "text-red-700"}`}
            >
              Wynik za okres: {money(active.periodProfit, currency)} ({percentage(activeReturn)})
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Zakres wykresu">
          {(["1M", "6M", "1R", "YTD", "MAX"] as Range[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setRange(item);
                setSelectedDate(null);
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
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Stopa zwrotu za wybrany okres
          </p>
          <div
            ref={container}
            className="h-[430px] w-full"
            role="img"
            aria-label="Interaktywny wykres procentowego wyniku portfela. Zielony obszar oznacza wynik powyżej zera, czerwony poniżej zera."
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-700" /> Zysk, powyżej 0%
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-700" /> Strata, poniżej 0%
            </span>
            <span className="text-xs">Oś X: data · Oś Y: wynik procentowy</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Wykres wykorzystuje{" "}
            <a
              href="https://www.tradingview.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-slate-800"
            >
              TradingView Lightweight Charts™
            </a>
            .
          </p>
        </div>
      ) : (
        <p className="py-16 text-center text-slate-600">Za mało danych, aby narysować wykres.</p>
      )}
    </section>
  );
}
