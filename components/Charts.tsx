

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

type IndexName =
  | "NIFTY"
  | "BANKNIFTY"
  | "FINNIFTY"
  | "SENSEX";

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

function indexData(
  data: MarketData,
  index: IndexName
): any {
  const x = raw(data)?.indices;

  if (Array.isArray(x)) {
    return x.find(
      (v: any) =>
        String(v?.symbol ?? "")
          .replace(/\s+/g, "")
          .toUpperCase() === index
    );
  }

  return x?.[index];
}

function fmt(v: any, d = 2): string {
  const n = Number(v);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-IN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtStrike(v: any): string {
  const n = Number(v);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function cleanStrikeRows(value: any): Row[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 3 &&
        Number.isFinite(Number(r[0])) &&
        Number.isFinite(Number(r[1])) &&
        Number.isFinite(Number(r[2]))
    )
    .map(
      (r: any) =>
        [
          Number(r[0]),
          Number(r[1]),
          Number(r[2]),
        ] as Row
    );
}

function cleanTimeRows(value: any): TimeRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 2 &&
        typeof r[0] === "string" &&
        Number.isFinite(Number(r[1]))
    )
    .map(
      (r: any) =>
        [
          String(r[0]),
          Number(r[1]),
        ] as TimeRow
    );
}

function cleanPCRRows(value: any): PCRRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 3 &&
        typeof r[0] === "string" &&
        Number.isFinite(Number(r[1])) &&
        Number.isFinite(Number(r[2]))
    )
    .map(
      (r: any) =>
        [
          String(r[0]),
          Number(r[1]),
          Number(r[2]),
        ] as PCRRow
    );
}

function strikeWindow(
  rows: Row[],
  atm: number,
  window: StrikeWindow
): Row[] {
  const sorted = [...rows].sort(
    (a, b) => a[0] - b[0]
  );

  if (
    window === "ALL" ||
    !Number.isFinite(atm)
  ) {
    return sorted;
  }

  if (!sorted.length) {
    return [];
  }

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

/* =========================================================
   PROFESSIONAL ON / OFF SWITCH
   ========================================================= */

function ChartToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-label={
        enabled
          ? "Turn chart off"
          : "Turn chart on"
      }
      title={
        enabled
          ? "Turn chart off"
          : "Turn chart on"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 30,
        padding: "0 10px 0 8px",
        border: enabled
          ? "1px solid rgba(61,220,132,.45)"
          : "1px solid #334250",
        borderRadius: 999,
        background: enabled
          ? "linear-gradient(180deg, rgba(31,91,65,.75), rgba(18,55,41,.75))"
          : "linear-gradient(180deg, #18212a, #10171e)",
        color: enabled
          ? "#dfffee"
          : "#7f8d99",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.6px",
        boxShadow: enabled
          ? "0 0 10px rgba(61,220,132,.12), inset 0 0 7px rgba(61,220,132,.06)"
          : "0 2px 5px rgba(0,0,0,.22)",
        transition: "all 160ms ease",
        outline: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 30,
          height: 16,
          borderRadius: 999,
          background: enabled
            ? "#1f9d61"
            : "#26333e",
          border: enabled
            ? "1px solid rgba(108,255,169,.45)"
            : "1px solid #3b4a56",
          boxShadow: enabled
            ? "inset 0 0 5px rgba(0,0,0,.22)"
            : "inset 0 0 5px rgba(0,0,0,.35)",
          transition: "all 160ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 15 : 2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: enabled
              ? "#eafff2"
              : "#7c8b97",
            boxShadow: enabled
              ? "0 0 7px rgba(119,255,175,.75)"
              : "none",
            transition:
              "left 160ms ease, background 160ms ease, box-shadow 160ms ease",
          }}
        />
      </span>

      <span>
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

/* =========================================================
   INDIVIDUAL PLOT ON / OFF TOGGLE
   ========================================================= */

function PlotToggle({
  enabled,
  onChange,
  label,
  color,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-label={enabled ? `Hide ${label}` : `Show ${label}`}
      title={enabled ? `Hide ${label}` : `Show ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 28,
        padding: "0 9px 0 7px",
        border: enabled
          ? `1px solid ${color}70`
          : "1px solid #334250",
        borderRadius: 999,
        background: enabled
          ? `linear-gradient(180deg, ${color}22, ${color}0d)`
          : "linear-gradient(180deg, #18212a, #10171e)",
        color: enabled ? "#e9f2f7" : "#7f8d99",
        cursor: "pointer",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.35px",
        boxShadow: enabled
          ? `0 0 9px ${color}18, inset 0 0 6px ${color}0b`
          : "0 2px 5px rgba(0,0,0,.20)",
        transition: "all 160ms ease",
        outline: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 27,
          height: 15,
          borderRadius: 999,
          background: enabled ? color : "#26333e",
          border: enabled
            ? `1px solid ${color}90`
            : "1px solid #3b4a56",
          boxShadow: enabled
            ? `inset 0 0 5px rgba(0,0,0,.22), 0 0 5px ${color}20`
            : "inset 0 0 5px rgba(0,0,0,.35)",
          transition: "all 160ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 14 : 2,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: enabled ? "#f5fffa" : "#7c8b97",
            boxShadow: enabled
              ? `0 0 7px ${color}cc`
              : "none",
            transition:
              "left 160ms ease, background 160ms ease, box-shadow 160ms ease",
          }}
        />
      </span>

      <span>{enabled ? "ON" : "OFF"}</span>
      <span style={{ opacity: enabled ? 1 : 0.72 }}>{label}</span>
    </button>
  );
}

function PlotLegend({
  items,
}: {
  items: Array<{
    key: string;
    label: string;
    color: string;
    hidden: boolean;
    onChange: (value: boolean) => void;
  }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 7,
        marginTop: 10,
        minHeight: 28,
      }}
    >
      {items.map((item) => (
        <PlotToggle
          key={item.key}
          enabled={!item.hidden}
          onChange={item.onChange}
          label={item.label}
          color={item.color}
        />
      ))}
    </div>
  );
}

/* =========================================================
   INDEX SELECTOR BUTTONS
   ========================================================= */

function IndexButtons({
  value,
  onChange,
  compare,
}: {
  value: IndexName | "ALL";
  onChange: (
    v: IndexName | "ALL"
  ) => void;
  compare?: boolean;
}) {
  const items = compare
    ? [
        ...INDEXES,
        "ALL" as const,
      ]
    : INDEXES;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
        alignItems: "center",
      }}
    >
      {items.map((i) => {
        const active = value === i;

        const activeColor =
          i === "ALL"
            ? "#4da3ff"
            : INDEX_COLORS[i];

        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            style={{
              position: "relative",
              height: 34,
              minWidth:
                i === "ALL"
                  ? 112
                  : 82,
              padding: "0 16px",
              border: active
                ? `1px solid ${activeColor}`
                : "1px solid #334250",
              borderRadius: 999,
              background: active
                ? `linear-gradient(180deg, ${activeColor}35, ${activeColor}16)`
                : "linear-gradient(180deg, #18212a, #10171e)",
              color: active
                ? "#ffffff"
                : "#8d9ba7",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.5px",
              boxShadow: active
                ? `0 0 12px ${activeColor}30, inset 0 0 8px ${activeColor}12`
                : "0 2px 5px rgba(0,0,0,.25)",
              transition:
                "all 160ms ease",
              outline: "none",
            }}
          >
            {i === "ALL"
              ? "COMPARE ALL"
              : i}

            {active && (
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 4,
                  transform:
                    "translateX(-50%)",
                  width: 22,
                  height: 2,
                  borderRadius: 999,
                  background:
                    activeColor,
                  boxShadow:
                    `0 0 7px ${activeColor}`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   STRIKE WINDOW BUTTONS
   ========================================================= */

function WindowButtons({
  value,
  setValue,
}: {
  value: StrikeWindow;
  setValue: (
    v: StrikeWindow
  ) => void;
}) {
  const items: Array<
    [StrikeWindow, string]
  > = [
    [8, "±8"],
    [15, "±15"],
    [25, "±25"],
    ["ALL", "ALL"],
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 8,
        alignItems: "center",
      }}
    >
      {items.map(
        ([v, label]) => {
          const active =
            value === v;

          return (
            <button
              key={String(v)}
              type="button"
              onClick={() =>
                setValue(v)
              }
              style={{
                position: "relative",
                height: 30,
                minWidth:
                  v === "ALL"
                    ? 58
                    : 52,
                padding:
                  "0 13px",
                border: active
                  ? "1px solid #4da3ff"
                  : "1px solid #334250",
                borderRadius: 999,
                background: active
                  ? "linear-gradient(180deg, #214666, #162d42)"
                  : "linear-gradient(180deg, #18212a, #10171e)",
                color: active
                  ? "#ffffff"
                  : "#8d9ba7",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing:
                  "0.4px",
                boxShadow: active
                  ? "0 0 10px rgba(77,163,255,.18), inset 0 0 7px rgba(77,163,255,.08)"
                  : "0 2px 5px rgba(0,0,0,.22)",
                transition:
                  "all 160ms ease",
                outline: "none",
              }}
            >
              {label}

              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 3,
                    transform:
                      "translateX(-50%)",
                    width: 16,
                    height: 2,
                    borderRadius:
                      999,
                    background:
                      "#4da3ff",
                    boxShadow:
                      "0 0 6px rgba(77,163,255,.7)",
                  }}
                />
              )}
            </button>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   CHART CARD
   ========================================================= */

function ChartCard({
  title,
  subtitle,
  children,
  enabled,
  onToggle,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  enabled: boolean;
  onToggle: (value: boolean) => void;
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {title}
          </div>

          <div
            className="sub"
            style={{
              marginTop: 3,
            }}
          >
            {subtitle}
          </div>
        </div>

        <ChartToggle
          enabled={enabled}
          onChange={onToggle}
        />
      </div>

      {children}
    </section>
  );
}

/* =========================================================
   CHART OPTIONS
   ========================================================= */

const timeOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,

  interaction: {
    mode: "index",
    intersect: false,
  },

  plugins: {
    legend: {
      display: false,
    },

    tooltip: {
      enabled: true,
    },
  },

  scales: {
    x: {
      title: {
        display: true,
        text: "TIME",
        color: "#8d9ba7",
      },

      ticks: {
        color: "#8d9ba7",
        autoSkip: true,
        maxTicksLimit: 20,
        maxRotation: 45,
        minRotation: 45,
      },

      grid: {
        color:
          "rgba(255,255,255,.055)",
      },
    },

    y: {
      title: {
        display: true,
        text: "VALUE",
        color: "#8d9ba7",
      },

      ticks: {
        color: "#8d9ba7",
      },

      grid: {
        color:
          "rgba(255,255,255,.075)",
      },
    },
  },
};

const strikeOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,

  interaction: {
    mode: "index",
    intersect: false,
  },

  plugins: {
    legend: {
      display: false,
    },

    tooltip: {
      enabled: true,

      callbacks: {
        label: (ctx: any) =>
          `${ctx.dataset.label}: ${fmt(
            ctx.raw,
            0
          )}`,
      },
    },
  },

  scales: {
    x: {
      title: {
        display: true,
        text: "STRIKE PRICE",
        color: "#8d9ba7",
      },

      ticks: {
        color: "#8d9ba7",
        autoSkip: true,
        maxTicksLimit: 25,
        maxRotation: 45,
        minRotation: 45,
      },

      grid: {
        color:
          "rgba(255,255,255,.055)",
      },
    },

    y: {
      beginAtZero: true,

      title: {
        display: true,
        text: "VALUE",
        color: "#8d9ba7",
      },

      ticks: {
        color: "#8d9ba7",
      },

      grid: {
        color:
          "rgba(255,255,255,.075)",
      },
    },
  },
};

/* =========================================================
   MAIN CHARTS
   ========================================================= */

export default function Charts({
  data,
}: {
  data: MarketData;
}) {
  const [pcr, setPcr] =
    useState<IndexName | "ALL">(
      "NIFTY"
    );

  const [straddle, setStraddle] =
    useState<IndexName | "ALL">(
      "NIFTY"
    );

  const [coiTrend, setCoiTrend] =
    useState<IndexName | "ALL">(
      "NIFTY"
    );

  const [oiIndex, setOiIndex] =
    useState<IndexName>(
      "NIFTY"
    );

  const [coiIndex, setCoiIndex] =
    useState<IndexName>(
      "NIFTY"
    );

  const [oiWindow, setOiWindow] =
    useState<StrikeWindow>(
      15
    );

  const [coiWindow, setCoiWindow] =
    useState<StrikeWindow>(
      15
    );

  /* =======================================================
     INDIVIDUAL CHART ON / OFF STATES
     ======================================================= */

  const [pcrEnabled, setPcrEnabled] =
    useState(true);

  const [
    straddleEnabled,
    setStraddleEnabled,
  ] = useState(true);

  const [vixEnabled, setVixEnabled] =
    useState(true);

  const [
    coiTrendEnabled,
    setCoiTrendEnabled,
  ] = useState(true);

  const [oiEnabled, setOiEnabled] =
    useState(true);

  const [coiEnabled, setCoiEnabled] =
    useState(true);

  /* =======================================================
     INDIVIDUAL PLOT ON / OFF STATES
     ======================================================= */

  const [hiddenPlots, setHiddenPlots] =
    useState<Record<string, boolean>>({});

  const togglePlot = (
    key: string,
    enabled: boolean
  ) => {
    setHiddenPlots((prev) => ({
      ...prev,
      [key]: !enabled,
    }));
  };

  const isPlotEnabled = (key: string) =>
    hiddenPlots[key] !== true;

  const d = raw(data);

  /* =======================================================
     PCR SERIES
     ======================================================= */

  const pcrSeries = useMemo(() => {
    if (pcr === "ALL") {
      return INDEXES.map(
        (i) => ({
          index: i,
          rows: cleanPCRRows(
            d?.pcrTrend?.[i]
          ),
        })
      );
    }

    return [
      {
        index: pcr,
        rows: cleanPCRRows(
          d?.pcrTrend?.[pcr]
        ),
      },
    ];
  }, [data, pcr]);

  /* =======================================================
     STRADDLE SERIES
     ======================================================= */

  const straddleSeries =
    useMemo(() => {
      if (straddle === "ALL") {
        return INDEXES.map(
          (i) => ({
            index: i,
            rows: cleanTimeRows(
              d?.straddleTrend?.[i]
            ),
          })
        );
      }

      return [
        {
          index: straddle,
          rows: cleanTimeRows(
            d?.straddleTrend?.[
              straddle
            ]
          ),
        },
      ];
    }, [data, straddle]);

  /* =======================================================
     COI TREND SERIES
     ======================================================= */

  const coiSeries = useMemo(() => {
    if (coiTrend === "ALL") {
      return INDEXES.map(
        (i) => ({
          index: i,
          rows: cleanTimeRows(
            d?.coiTrend?.[i]
          ),
        })
      );
    }

    return [
      {
        index: coiTrend,
        rows: cleanTimeRows(
          d?.coiTrend?.[coiTrend]
        ),
      },
    ];
  }, [data, coiTrend]);

  /* =======================================================
     VIX
     ======================================================= */

  const vixRows = useMemo(
    () =>
      cleanTimeRows(
        d?.vixTrend
      ),
    [data]
  );

  /* =======================================================
     OI / COI STRIKE DATA
     ======================================================= */

 const oiRows = useMemo(
  () => {
    const source =
      raw(data)?.optionChain?.[
        oiIndex
      ];

    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .filter(
        (r: any) =>
          Array.isArray(r) &&
          r.length >= 13 &&
          Number.isFinite(
            Number(r[6])
          )
      )
      .map(
        (r: any) =>
          [
            Number(r[6]),       // STRIKE
            Number(r[0]) || 0,  // CALL OI
            Number(r[12]) || 0, // PUT OI
          ] as Row
      )
      .sort(
        (a, b) => a[0] - b[0]
      );
  },
  [data, oiIndex]
);

  const coiRows = useMemo(
  () => {
    const source =
      raw(data)?.optionChain?.[
        coiIndex
      ];

    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .filter(
        (r: any) =>
          Array.isArray(r) &&
          r.length >= 13 &&
          Number.isFinite(
            Number(r[6])
          )
      )
      .map(
        (r: any) =>
          [
            Number(r[6]),       // STRIKE
            Number(r[1]) || 0,  // CALL COI
            Number(r[11]) || 0, // PUT COI
          ] as Row
      )
      .sort(
        (a, b) => a[0] - b[0]
      );
  },
  [data, coiIndex]
);

  const oiData = indexData(
    data,
    oiIndex
  );

  const coiData = indexData(
    data,
    coiIndex
  );

  const oiFiltered = useMemo(
    () =>
      strikeWindow(
        oiRows,
        Number(oiData?.atm),
        oiWindow
      ),
    [
      oiRows,
      oiData,
      oiWindow,
    ]
  );
  console.log("[OI WINDOW]", oiWindow, "rows:", oiFiltered.length);

  const coiFiltered = useMemo(
    () =>
      strikeWindow(
        coiRows,
        Number(coiData?.atm),
        coiWindow
      ),
    [
      coiRows,
      coiData,
      coiWindow,
    ]
  );
  console.log("[COI WINDOW]", coiWindow, "rows:", coiFiltered.length);

  /* =======================================================
     PCR CHART DATA
     ======================================================= */

  const pcrData = useMemo(
    () => ({
      labels:
        pcrSeries[0]?.rows.map(
          (r) => r[0]
        ) ?? [],

      datasets:
        pcrSeries.flatMap(
          ({
            index,
            rows,
          }) => [
            {
              label: `${index} PCR(OI)`,
              data: rows.map(
                (r) => r[1]
              ),
              borderColor:
                INDEX_COLORS[index],
              backgroundColor:
                "transparent",
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
              hidden: hiddenPlots[`pcr-${index}-oi`] === true,
            },

            {
              label: `${index} PCR(COI)`,
              data: rows.map(
                (r) => r[2]
              ),
              borderColor:
                INDEX_COLORS[index],
              backgroundColor:
                "transparent",
              borderWidth: 2.5,
              borderDash: [6, 4],
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
              hidden: hiddenPlots[`pcr-${index}-coi`] === true,
            },
          ]
        ),
    }),
    [pcrSeries, hiddenPlots]
  );

  /* =======================================================
     STRADDLE CHART DATA
     ======================================================= */

  const straddleData =
    useMemo(
      () => ({
        labels:
          straddleSeries[0]?.rows.map(
            (r) => r[0]
          ) ?? [],

        datasets:
          straddleSeries.map(
            ({
              index,
              rows,
            }) => ({
              label: `${index} ATM STRADDLE`,
              data: rows.map(
                (r) => r[1]
              ),
              borderColor:
                INDEX_COLORS[index],
              backgroundColor:
                "transparent",
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
              hidden: hiddenPlots[`straddle-${index}`] === true,
            })
          ),
      }),
      [straddleSeries, hiddenPlots]
    );

  /* =======================================================
     COI TREND CHART DATA
     ======================================================= */

  const coiTrendData =
    useMemo(
      () => ({
        labels:
          coiSeries[0]?.rows.map(
            (r) => r[0]
          ) ?? [],

        datasets:
          coiSeries.map(
            ({
              index,
              rows,
            }) => ({
              label: `${index} PUT COI SUM - CALL COI SUM`,
              data: rows.map(
                (r) => r[1]
              ),
              borderColor:
                INDEX_COLORS[index],
              backgroundColor:
                "transparent",
              borderWidth: 2.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.2,
              hidden: hiddenPlots[`coiTrend-${index}`] === true,
            })
          ),
      }),
      [coiSeries, hiddenPlots]
    );

  /* =======================================================
     VIX CHART DATA
     ======================================================= */

  const vixData = useMemo(() => {
    const labels =
      vixRows.map(
        (r) => r[0]
      );

    const datasets: any[] = [
      {
        label: "INDIA VIX",
        data: vixRows.map(
          (r) => r[1]
        ),
        borderColor:
          "#ff4d6d",
        backgroundColor:
          "transparent",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
        hidden: hiddenPlots["vix"] === true,
      },
    ];

    return {
      labels,
      datasets,
    };
  }, [vixRows, hiddenPlots]);

  /* =======================================================
     OI CHART DATA
     ======================================================= */

  const oiDataChart =
    useMemo(
      () => ({
        labels:
          oiFiltered.map(
            (r) =>
              fmtStrike(r[0])
          ),

        datasets: [
          {
            label: `${oiIndex} CALL OI`,
            data:
              oiFiltered.map(
                (r) => r[1]
              ),
            borderColor:
              CALL_RED,
            backgroundColor:
              "transparent",
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.18,
            hidden: hiddenPlots["oi-call"] === true,
          },

          {
            label: `${oiIndex} PUT OI`,
            data:
              oiFiltered.map(
                (r) => r[2]
              ),
            borderColor:
              PUT_GREEN,
            backgroundColor:
              "transparent",
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.18,
            hidden: hiddenPlots["oi-put"] === true,
          },
        ],
      }),
      [oiFiltered, oiIndex, hiddenPlots]
    );

  /* =======================================================
     COI CHART DATA
     ======================================================= */

  const coiDataChart =
    useMemo(
      () => ({
        labels:
          coiFiltered.map(
            (r) =>
              fmtStrike(r[0])
          ),

        datasets: [
          {
            label: `${coiIndex} CALL COI`,
            data:
              coiFiltered.map(
                (r) => r[1]
              ),
            borderColor:
              CALL_RED,
            backgroundColor:
              "transparent",
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.18,
            hidden: hiddenPlots["coi-call"] === true,
          },

          {
            label: `${coiIndex} PUT COI`,
            data:
              coiFiltered.map(
                (r) => r[2]
              ),
            borderColor:
              PUT_GREEN,
            backgroundColor:
              "transparent",
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.18,
            hidden: hiddenPlots["coi-put"] === true,
          },
        ],
      }),
      [coiFiltered, coiIndex, hiddenPlots]
    );

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <section className="page-workspace">

      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Charts
          </h1>

          <div className="sub">
            Six market-structure
            charts with
            independent index
            selection.
          </div>
        </div>

        <div className="page-status">
          LIVE DATA
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2,minmax(0,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >

        {/* =================================================
            1. PCR
            ================================================= */}

        <ChartCard
          title="PCR(OI) & PCR(COI) vs Time"
          subtitle="Click an index for that index only, or COMPARE ALL."
          enabled={pcrEnabled}
          onToggle={setPcrEnabled}
        >
          <IndexButtons
            value={pcr}
            onChange={setPcr}
            compare
          />

          <PlotLegend
            items={pcrSeries.flatMap(({ index }) => [
              {
                key: `pcr-${index}-oi`,
                label: `${index} PCR(OI)`,
                color: INDEX_COLORS[index],
                hidden: !isPlotEnabled(`pcr-${index}-oi`),
                onChange: (enabled) =>
                  togglePlot(`pcr-${index}-oi`, enabled),
              },
              {
                key: `pcr-${index}-coi`,
                label: `${index} PCR(COI)`,
                color: INDEX_COLORS[index],
                hidden: !isPlotEnabled(`pcr-${index}-coi`),
                onChange: (enabled) =>
                  togglePlot(`pcr-${index}-coi`, enabled),
              },
            ])}
          />

          {pcrEnabled ? (
            <div
              style={{
                height: 360,
                marginTop: 12,
              }}
            >
              {pcrSeries[0]?.rows
                .length ? (
                <Line
                  data={pcrData}
                  options={
                    timeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No PCR trend
                  data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 360,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              PCR CHART OFF
            </div>
          )}
        </ChartCard>

        {/* =================================================
            2. STRADDLE
            ================================================= */}

        <ChartCard
          title="ATM Straddle vs Time"
          subtitle="Call LTP + Put LTP at the ATM strike."
          enabled={straddleEnabled}
          onToggle={
            setStraddleEnabled
          }
        >
          <IndexButtons
            value={straddle}
            onChange={
              setStraddle
            }
            compare
          />

          <PlotLegend
            items={straddleSeries.map(({ index }) => ({
              key: `straddle-${index}`,
              label: `${index} ATM STRADDLE`,
              color: INDEX_COLORS[index],
              hidden: !isPlotEnabled(`straddle-${index}`),
              onChange: (enabled) =>
                togglePlot(`straddle-${index}`, enabled),
            }))}
          />

          {straddleEnabled ? (
            <div
              style={{
                height: 360,
                marginTop: 12,
              }}
            >
              {straddleSeries[0]
                ?.rows.length ? (
                <Line
                  data={
                    straddleData
                  }
                  options={
                    timeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No straddle trend
                  data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 360,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              STRADDLE CHART OFF
            </div>
          )}
        </ChartCard>

        {/* =================================================
            3. INDIA VIX
            ================================================= */}

        <ChartCard
          title="India VIX vs Time"
          subtitle="VIX is market-wide and is not an index-specific series."
          enabled={vixEnabled}
          onToggle={setVixEnabled}
        >
          <PlotLegend
            items={[
              {
                key: "vix",
                label: "INDIA VIX · MARKET-WIDE",
                color: "#ff4d6d",
                hidden: !isPlotEnabled("vix"),
                onChange: (enabled) =>
                  togglePlot("vix", enabled),
              },
            ]}
          />

          {vixEnabled ? (
            <div
              style={{
                height: 360,
                marginTop: 12,
              }}
            >
              {vixRows.length ? (
                <Line
                  data={vixData}
                  options={
                    timeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No VIX trend
                  data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 360,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              INDIA VIX CHART OFF
            </div>
          )}
        </ChartCard>

        {/* =================================================
            4. COI TREND
            ================================================= */}

        <ChartCard
          title="PUT COI SUM − CALL COI SUM vs Time"
          subtitle="Positive means put-side cumulative change is stronger."
          enabled={coiTrendEnabled}
          onToggle={
            setCoiTrendEnabled
          }
        >
          <IndexButtons
            value={coiTrend}
            onChange={
              setCoiTrend
            }
            compare
          />

          <PlotLegend
            items={coiSeries.map(({ index }) => ({
              key: `coiTrend-${index}`,
              label: `${index} PUT COI SUM - CALL COI SUM`,
              color: INDEX_COLORS[index],
              hidden: !isPlotEnabled(`coiTrend-${index}`),
              onChange: (enabled) =>
                togglePlot(`coiTrend-${index}`, enabled),
            }))}
          />

          {coiTrendEnabled ? (
            <div
              style={{
                height: 360,
                marginTop: 12,
              }}
            >
              {coiSeries[0]?.rows
                .length ? (
                <Line
                  data={
                    coiTrendData
                  }
                  options={
                    timeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No COI trend
                  data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 360,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              COI TREND CHART OFF
            </div>
          )}
        </ChartCard>

        {/* =================================================
            5. OPEN INTEREST
            ================================================= */}

        <ChartCard
          title="Open Interest vs Strike"
          subtitle="CALL OI = red · PUT OI = green. Line only, no dots."
          enabled={oiEnabled}
          onToggle={setOiEnabled}
        >
          <IndexButtons
            value={oiIndex}
            onChange={(v) => {
              if (v !== "ALL") {
                setOiIndex(v);
              }
            }}
          />

          <div
            className="label"
            style={{
              marginTop: 12,
            }}
          >
            STRIKE WINDOW · ATM{" "}
            {fmtStrike(
              oiData?.atm
            )}
          </div>

          <WindowButtons
            value={oiWindow}
            setValue={
              setOiWindow
            }
          />

          <PlotLegend
            items={[
              {
                key: "oi-call",
                label: `${oiIndex} CALL OI`,
                color: CALL_RED,
                hidden: !isPlotEnabled("oi-call"),
                onChange: (enabled) =>
                  togglePlot("oi-call", enabled),
              },
              {
                key: "oi-put",
                label: `${oiIndex} PUT OI`,
                color: PUT_GREEN,
                hidden: !isPlotEnabled("oi-put"),
                onChange: (enabled) =>
                  togglePlot("oi-put", enabled),
              },
            ]}
          />

          {oiEnabled ? (
            <div
              style={{
                height: 390,
                marginTop: 12,
              }}
            >
              {oiFiltered.length ? (
                <Line
                  key={`oi-${oiIndex}-${String(
                    oiWindow
                  )}`}
                  data={
                    oiDataChart
                  }
                  options={
                    strikeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No OI data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 390,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              OPEN INTEREST CHART OFF
            </div>
          )}
        </ChartCard>

        {/* =================================================
            6. CHANGE IN OI
            ================================================= */}

        <ChartCard
          title="Change in OI vs Strike"
          subtitle="CALL COI = red · PUT COI = green. Negative COI is preserved."
          enabled={coiEnabled}
          onToggle={setCoiEnabled}
        >
          <IndexButtons
            value={coiIndex}
            onChange={(v) => {
              if (v !== "ALL") {
                setCoiIndex(v);
              }
            }}
          />

          <div
            className="label"
            style={{
              marginTop: 12,
            }}
          >
            STRIKE WINDOW · ATM{" "}
            {fmtStrike(
              coiData?.atm
            )}
          </div>

          <WindowButtons
            value={coiWindow}
            setValue={
              setCoiWindow
            }
          />

          <PlotLegend
            items={[
              {
                key: "coi-call",
                label: `${coiIndex} CALL COI`,
                color: CALL_RED,
                hidden: !isPlotEnabled("coi-call"),
                onChange: (enabled) =>
                  togglePlot("coi-call", enabled),
              },
              {
                key: "coi-put",
                label: `${coiIndex} PUT COI`,
                color: PUT_GREEN,
                hidden: !isPlotEnabled("coi-put"),
                onChange: (enabled) =>
                  togglePlot("coi-put", enabled),
              },
            ]}
          />

          {coiEnabled ? (
            <div
              style={{
                height: 390,
                marginTop: 12,
              }}
            >
              {coiFiltered.length ? (
                <Line
                  key={`coi-${coiIndex}-${String(
                    coiWindow
                  )}`}
                  data={
                    coiDataChart
                  }
                  options={
                    strikeOptions
                  }
                />
              ) : (
                <div className="chart-empty">
                  No COI data.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: 390,
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  "1px dashed #293742",
                borderRadius: 8,
                color: "#667682",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing:
                  "0.5px",
              }}
            >
              CHANGE IN OI CHART OFF
            </div>
          )}
        </ChartCard>
      </div>

      {/* =====================================================
          STATUS
          ===================================================== */}

      <div
        className="card"
        style={{
          marginTop: 14,
          marginBottom: 30,
        }}
      >
        <div className="label">
          CHART DATA STATUS
        </div>

        <div
          className="sub"
          style={{
            marginTop: 7,
            lineHeight: 1.8,
          }}
        >
          PCR:{" "}
          <b>
            {pcr === "ALL"
              ? "ALL"
              : pcr}
          </b>

          {" · "}

          Straddle:{" "}
          <b>
            {straddle === "ALL"
              ? "ALL"
              : straddle}
          </b>

          {" · "}

          COI Trend:{" "}
          <b>
            {coiTrend === "ALL"
              ? "ALL"
              : coiTrend}
          </b>

          {" · "}

          VIX points:{" "}
          <b>
            {vixRows.length}
          </b>

          <br />

          OI{" "}
          <b>
            {oiIndex}
          </b>
          :{" "}
          <b>
            {oiFiltered.length}
          </b>{" "}
          strikes

          {" · "}

          COI{" "}
          <b>
            {coiIndex}
          </b>
          :{" "}
          <b>
            {coiFiltered.length}
          </b>{" "}
          strikes
        </div>
      </div>
    </section>
  );
}
