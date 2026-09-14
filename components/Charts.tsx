"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { MarketData } from "../lib/marketTypes";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

type IndexName = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX";
type StrikeWindow = 8 | 15 | 25 | "ALL";

const INDEXES: IndexName[] = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
];

const INDEX_COLORS: Record<IndexName, string> = {
  NIFTY: "#00d4ff",
  BANKNIFTY: "#ffb020",
  FINNIFTY: "#00e676",
  SENSEX: "#ff4d6d",
};

const CALL_RED = "#f0533d";
const PUT_GREEN = "#3ddc84";

type Row = [number, number, number];
type TimeRow = [string, number];
type PCRRow = [string, number, number];

function raw(data: MarketData): any {
  return data as any;
}

function indexData(data: MarketData, index: IndexName): any {
  const x = raw(data)?.indices;
  if (Array.isArray(x)) {
    return x.find((v: any) =>
      String(v?.symbol ?? "").replace(/\s+/g, "").toUpperCase() === index
    );
  }
  return x?.[index];
}

function fmt(v: any, d = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtStrike(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function cleanStrikeRows(value: any): Row[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 3 &&
        Number.isFinite(Number(r[0])) &&
        Number.isFinite(Number(r[1])) &&
        Number.isFinite(Number(r[2]))
    )
    .map((r: any) => [Number(r[0]), Number(r[1]), Number(r[2])]);
}

function cleanTimeRows(value: any): TimeRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 2 &&
        typeof r[0] === "string" &&
        Number.isFinite(Number(r[1]))
    )
    .map((r: any) => [String(r[0]), Number(r[1])]);
}

function cleanPCRRows(value: any): PCRRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 3 &&
        typeof r[0] === "string" &&
        Number.isFinite(Number(r[1])) &&
        Number.isFinite(Number(r[2]))
    )
    .map((r: any) => [String(r[0]), Number(r[1]), Number(r[2])]);
}

function strikeWindow(
  rows: Row[],
  atm: number,
  window: StrikeWindow
): Row[] {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  if (window === "ALL" || !Number.isFinite(atm)) return sorted;
  if (!sorted.length) return [];

  let p = 0;
  let dist = Infinity;
  sorted.forEach((r, i) => {
    const d = Math.abs(r[0] - atm);
    if (d < dist) {
      dist = d;
      p = i;
    }
  });

  return sorted.slice(
    Math.max(0, p - window),
    Math.min(sorted.length, p + window + 1)
  );
}

const timeOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: {
      display: true,
      position: "top",
      labels: { usePointStyle: true, boxWidth: 10, color: "#dce5eb" },
    },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      title: { display: true, text: "TIME", color: "#8d9ba7" },
      ticks: {
        color: "#8d9ba7",
        autoSkip: true,
        maxTicksLimit: 20,
        maxRotation: 45,
        minRotation: 45,
      },
      grid: { color: "rgba(255,255,255,.055)" },
    },
    y: {
      title: { display: true, text: "VALUE", color: "#8d9ba7" },
      ticks: { color: "#8d9ba7" },
      grid: { color: "rgba(255,255,255,.075)" },
    },
  },
};

const strikeOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: {
      display: true,
      position: "top",
      labels: { usePointStyle: true, boxWidth: 10, color: "#dce5eb" },
    },
    tooltip: {
      enabled: true,
      callbacks: {
        label: (ctx: any) =>
          `${ctx.dataset.label}: ${fmt(ctx.raw, 0)}`,
      },
    },
  },
  scales: {
    x: {
      title: { display: true, text: "STRIKE PRICE", color: "#8d9ba7" },
      ticks: {
        color: "#8d9ba7",
        autoSkip: true,
        maxTicksLimit: 25,
        maxRotation: 45,
        minRotation: 45,
      },
      grid: { color: "rgba(255,255,255,.055)" },
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: "VALUE", color: "#8d9ba7" },
      ticks: { color: "#8d9ba7" },
      grid: { color: "rgba(255,255,255,.075)" },
    },
  },
};

function IndexButtons({
  value,
  onChange,
  compare,
}: {
  value: IndexName | "ALL";
  onChange: (v: IndexName | "ALL") => void;
  compare?: boolean;
}) {
  const items = compare ? [...INDEXES, "ALL" as const] : INDEXES;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
      {items.map((i) => {
        const active = value === i;
        const c = i === "ALL" ? "#4da3ff" : INDEX_COLORS[i];
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            style={{
              border: `1px solid ${active ? c : "var(--line)"}`,
              background: active ? `${c}22` : "var(--panel2)",
              color: active ? "#fff" : "var(--muted)",
              padding: "7px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {i === "ALL" ? "COMPARE ALL" : i}
          </button>
        );
      })}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card"
      style={{
        minWidth: 0,
        minHeight: 0,
        padding: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div className="sub" style={{ marginTop: 3 }}>
        {subtitle}
      </div>
      {children}
    </section>
  );
}

export default function Charts({ data }: { data: MarketData }) {
  const [pcr, setPcr] = useState<IndexName | "ALL">("NIFTY");
  const [straddle, setStraddle] = useState<IndexName | "ALL">("NIFTY");
  const [coiTrend, setCoiTrend] = useState<IndexName | "ALL">("NIFTY");
  const [vixCompare, setVixCompare] = useState(false);

  const [oiIndex, setOiIndex] = useState<IndexName>("NIFTY");
  const [coiIndex, setCoiIndex] = useState<IndexName>("NIFTY");
  const [oiWindow, setOiWindow] = useState<StrikeWindow>(15);
  const [coiWindow, setCoiWindow] = useState<StrikeWindow>(15);

  const d = raw(data);

  const pcrSeries = useMemo(() => {
    if (pcr === "ALL") {
      return INDEXES.map((i) => ({
        index: i,
        rows: cleanPCRRows(d?.pcrTrend?.[i]),
      }));
    }
    return [{ index: pcr, rows: cleanPCRRows(d?.pcrTrend?.[pcr]) }];
  }, [data, pcr]);

  const straddleSeries = useMemo(() => {
    if (straddle === "ALL") {
      return INDEXES.map((i) => ({
        index: i,
        rows: cleanTimeRows(d?.straddleTrend?.[i]),
      }));
    }
    return [
      {
        index: straddle,
        rows: cleanTimeRows(d?.straddleTrend?.[straddle]),
      },
    ];
  }, [data, straddle]);

  const coiSeries = useMemo(() => {
    if (coiTrend === "ALL") {
      return INDEXES.map((i) => ({
        index: i,
        rows: cleanTimeRows(d?.coiTrend?.[i]),
      }));
    }
    return [
      {
        index: coiTrend,
        rows: cleanTimeRows(d?.coiTrend?.[coiTrend]),
      },
    ];
  }, [data, coiTrend]);

  const vixRows = useMemo(
    () => cleanTimeRows(d?.vixTrend),
    [data]
  );

  const oiRows = useMemo(
    () => cleanStrikeRows(d?.strikeOI?.[oiIndex]),
    [data, oiIndex]
  );

  const coiRows = useMemo(
    () => cleanStrikeRows(d?.strikeCOI?.[coiIndex]),
    [data, coiIndex]
  );

  const oiData = indexData(data, oiIndex);
  const coiData = indexData(data, coiIndex);

  const oiFiltered = useMemo(
    () => strikeWindow(oiRows, Number(oiData?.atm), oiWindow),
    [oiRows, oiData, oiWindow]
  );

  const coiFiltered = useMemo(
    () => strikeWindow(coiRows, Number(coiData?.atm), coiWindow),
    [coiRows, coiData, coiWindow]
  );

  const pcrData = useMemo(
    () => ({
      labels: pcrSeries[0]?.rows.map((r) => r[0]) ?? [],
      datasets: pcrSeries.flatMap(({ index, rows }) => [
        {
          label: `${index} PCR(OI)`,
          data: rows.map((r) => r[1]),
          borderColor: INDEX_COLORS[index],
          backgroundColor: "transparent",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
        },
        {
          label: `${index} PCR(COI)`,
          data: rows.map((r) => r[2]),
          borderColor: INDEX_COLORS[index],
          backgroundColor: "transparent",
          borderWidth: 2.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
        },
      ]),
    }),
    [pcrSeries]
  );

  const straddleData = useMemo(
    () => ({
      labels: straddleSeries[0]?.rows.map((r) => r[0]) ?? [],
      datasets: straddleSeries.map(({ index, rows }) => ({
        label: `${index} ATM STRADDLE`,
        data: rows.map((r) => r[1]),
        borderColor: INDEX_COLORS[index],
        backgroundColor: "transparent",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
      })),
    }),
    [straddleSeries]
  );

  const coiTrendData = useMemo(
    () => ({
      labels: coiSeries[0]?.rows.map((r) => r[0]) ?? [],
      datasets: coiSeries.map(({ index, rows }) => ({
        label: `${index} PUT COI SUM - CALL COI SUM`,
        data: rows.map((r) => r[1]),
        borderColor: INDEX_COLORS[index],
        backgroundColor: "transparent",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
      })),
    }),
    [coiSeries]
  );

  const vixData = useMemo(() => {
    const labels = vixRows.map((r) => r[0]);
    const datasets: any[] = [
      {
        label: "INDIA VIX",
        data: vixRows.map((r) => r[1]),
        borderColor: "#ff4d6d",
        backgroundColor: "transparent",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
      },
    ];

    if (vixCompare) {
      // VIX is market-wide, so the same series is intentionally not duplicated.
      // The checkbox is kept as a UI state to avoid falsely implying per-index VIX.
    }
    return { labels, datasets };
  }, [vixRows, vixCompare]);

  const oiDataChart = useMemo(
    () => ({
      labels: oiFiltered.map((r) => fmtStrike(r[0])),
      datasets: [
        {
          label: `${oiIndex} CALL OI`,
          data: oiFiltered.map((r) => r[1]),
          borderColor: CALL_RED,
          backgroundColor: "transparent",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.18,
        },
        {
          label: `${oiIndex} PUT OI`,
          data: oiFiltered.map((r) => r[2]),
          borderColor: PUT_GREEN,
          backgroundColor: "transparent",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.18,
        },
      ],
    }),
    [oiFiltered, oiIndex]
  );

  const coiDataChart = useMemo(
    () => ({
      labels: coiFiltered.map((r) => fmtStrike(r[0])),
      datasets: [
        {
          label: `${coiIndex} CALL COI`,
          data: coiFiltered.map((r) => r[1]),
          borderColor: CALL_RED,
          backgroundColor: "transparent",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.18,
        },
        {
          label: `${coiIndex} PUT COI`,
          data: coiFiltered.map((r) => r[2]),
          borderColor: PUT_GREEN,
          backgroundColor: "transparent",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.18,
        },
      ],
    }),
    [coiFiltered, coiIndex]
  );

  const windowButtons = (
    value: StrikeWindow,
    setValue: (v: StrikeWindow) => void
  ) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {[
        [8, "±8"],
        [15, "±15"],
        [25, "±25"],
        ["ALL", "ALL"],
      ].map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => setValue(v as StrikeWindow)}
          style={{
            border: "1px solid var(--line)",
            background: value === v ? "#17304a" : "var(--panel2)",
            color: value === v ? "#fff" : "var(--muted)",
            borderRadius: 5,
            padding: "5px 9px",
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="page-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRO OPTIONS TERMINAL</div>
          <h1 className="page-title">Charts</h1>
          <div className="sub">
            Six market-structure charts with independent index selection.
          </div>
        </div>
        <div className="page-status">LIVE DATA</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        <ChartCard
          title="PCR(OI) & PCR(COI) vs Time"
          subtitle="Click an index for that index only, or COMPARE ALL."
        >
          <IndexButtons value={pcr} onChange={setPcr} compare />
          <div style={{ height: 360, marginTop: 12 }}>
            {pcrSeries[0]?.rows.length ? (
              <Line data={pcrData} options={timeOptions} />
            ) : (
              <div className="chart-empty">No PCR trend data.</div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="ATM Straddle vs Time"
          subtitle="Call LTP + Put LTP at the ATM strike."
        >
          <IndexButtons
            value={straddle}
            onChange={setStraddle}
            compare
          />
          <div style={{ height: 360, marginTop: 12 }}>
            {straddleSeries[0]?.rows.length ? (
              <Line data={straddleData} options={timeOptions} />
            ) : (
              <div className="chart-empty">No straddle trend data.</div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="India VIX vs Time"
          subtitle="VIX is market-wide and is not an index-specific series."
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              marginTop: 10,
              color: "var(--muted)",
              fontSize: 10,
            }}
          >
            <input
              type="checkbox"
              checked={vixCompare}
              onChange={(e) => setVixCompare(e.target.checked)}
            />
            Market-wide VIX
          </label>
          <div style={{ height: 360, marginTop: 12 }}>
            {vixRows.length ? (
              <Line data={vixData} options={timeOptions} />
            ) : (
              <div className="chart-empty">No VIX trend data.</div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="PUT COI SUM − CALL COI SUM vs Time"
          subtitle="Positive means put-side cumulative change is stronger."
        >
          <IndexButtons
            value={coiTrend}
            onChange={setCoiTrend}
            compare
          />
          <div style={{ height: 360, marginTop: 12 }}>
            {coiSeries[0]?.rows.length ? (
              <Line data={coiTrendData} options={timeOptions} />
            ) : (
              <div className="chart-empty">No COI trend data.</div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Open Interest vs Strike"
          subtitle="CALL OI = red · PUT OI = green. Line only, no dots."
        >
          <IndexButtons
            value={oiIndex}
            onChange={(v) => {
              if (v !== "ALL") setOiIndex(v);
            }}
          />
          <div className="label" style={{ marginTop: 12 }}>
            STRIKE WINDOW · ATM {fmtStrike(oiData?.atm)}
          </div>
          {windowButtons(oiWindow, setOiWindow)}
          <div style={{ height: 390, marginTop: 12 }}>
            {oiFiltered.length ? (
              <Line
                key={`oi-${oiIndex}-${String(oiWindow)}`}
                data={oiDataChart}
                options={strikeOptions}
              />
            ) : (
              <div className="chart-empty">No OI data.</div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Change in OI vs Strike"
          subtitle="CALL COI = red · PUT COI = green. Negative COI is preserved."
        >
          <IndexButtons
            value={coiIndex}
            onChange={(v) => {
              if (v !== "ALL") setCoiIndex(v);
            }}
          />
          <div className="label" style={{ marginTop: 12 }}>
            STRIKE WINDOW · ATM {fmtStrike(coiData?.atm)}
          </div>
          {windowButtons(coiWindow, setCoiWindow)}
          <div style={{ height: 390, marginTop: 12 }}>
            {coiFiltered.length ? (
              <Line
                key={`coi-${coiIndex}-${String(coiWindow)}`}
                data={coiDataChart}
                options={strikeOptions}
              />
            ) : (
              <div className="chart-empty">No COI data.</div>
            )}
          </div>
        </ChartCard>
      </div>

      <div
        className="card"
        style={{ marginTop: 14, marginBottom: 30 }}
      >
        <div className="label">CHART DATA STATUS</div>
        <div
          className="sub"
          style={{ marginTop: 7, lineHeight: 1.8 }}
        >
          PCR: <b>{pcr === "ALL" ? "ALL" : pcr}</b>
          {" · "}
          Straddle: <b>{straddle === "ALL" ? "ALL" : straddle}</b>
          {" · "}
          COI Trend: <b>{coiTrend === "ALL" ? "ALL" : coiTrend}</b>
          {" · "}
          VIX points: <b>{vixRows.length}</b>
          <br />
          OI <b>{oiIndex}</b>: <b>{oiFiltered.length}</b> strikes
          {" · "}
          COI <b>{coiIndex}</b>: <b>{coiFiltered.length}</b> strikes
        </div>
      </div>
    </section>
  );
}
