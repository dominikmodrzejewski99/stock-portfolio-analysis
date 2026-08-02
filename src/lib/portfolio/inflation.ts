const GUS_CPI_CSV_URL =
  "https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultstronaopisowa/4741/1/1/miesiecznewskaznikicentowarowiuslugkonsumpcyjnychod1982roku_7.csv";

export interface InflationPoint {
  month: string;
  index: number;
}

export function parsePolishCpi(csv: string): InflationPoint[] {
  const monthlyChanges = new Map<string, number>();

  for (const row of csv.split(/\r?\n/).slice(1)) {
    const columns = row.split(";").map((column) => column.trim());
    if (columns[2] !== "Poprzedni miesiąc = 100") continue;

    const year = Number(columns[3]);
    const month = Number(columns[4]);
    const valueText = columns[5];
    const value = Number(valueText.replace(",", "."));
    if (!Number.isInteger(year) || month < 1 || month > 12 || !valueText || !Number.isFinite(value) || value <= 0) {
      continue;
    }

    monthlyChanges.set(`${year}-${String(month).padStart(2, "0")}`, value);
  }

  const values = [...monthlyChanges]
    .map(([month, value]) => ({ month, value }))
    .sort((left, right) => left.month.localeCompare(right.month));

  let index = 100;
  return values.map((value) => {
    index *= value.value / 100;
    return { month: value.month, index };
  });
}

export async function getPolishCpi(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<InflationPoint[]> {
  const response = await fetcher(GUS_CPI_CSV_URL);
  if (!response.ok) throw new Error(`GUS CPI returned ${response.status}.`);
  return parsePolishCpi(new TextDecoder("windows-1250").decode(await response.arrayBuffer()));
}
