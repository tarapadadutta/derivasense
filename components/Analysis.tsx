"use client";

import { useMemo, useState } from "react";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { Bar, Line } from "react-chartjs-2";

import type { MarketData, IndexData } from "../lib/marketTypes";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

/* ============================================================
   TYPES
   ============================================================ */

type SymbolName =
  | "NIFTY"
  | "BANKNIFTY"
  | "FINNIFTY"
  | "SENSEX";

type SelectedSymbol = SymbolName | "COMPARE ALL";

type AnalysisType =
  | "OPTION CHAIN"
  | "OPEN INTEREST"
  | "CHANGE OF OPEN INTEREST"
  | "PCR"
  | "COI CHANGE"
  | "STRADDLE"
  | "VIX"
  | "SPOT/FUTURE/VWAP"
  | "BIG PLAYER"
  | "FII / DII";

type StrikeWindow =
  | 3
  | 5
  | 8
  | 10
  | 15
  | "ALL";

type StrikeRow = [
  number,
  number,
  number
];

type TrendRow = [
  string,
  ...number[]
];

type Props = {
  data: MarketData;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const SYMBOLS: SymbolName[] = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
];

const ANALYSIS_TYPES: AnalysisType[] = [
  "OPTION CHAIN",
  "OPEN INTEREST",
  "CHANGE OF OPEN INTEREST",
  "PCR",
  "COI CHANGE",
  "STRADDLE",
  "VIX",
  "SPOT/FUTURE/VWAP",
  "BIG PLAYER",
  "FII / DII",
];

const INDEX_COLORS: Record<
  SymbolName,
  string
> = {
  NIFTY: "#00d4ff",
  BANKNIFTY: "#ffb020",
  FINNIFTY: "#00e676",
  SENSEX: "#ff4d6d",
};

/* ============================================================
   FORMATTERS
   ============================================================ */

function fmt(
  value: number | null | undefined,
  decimals = 2
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "-";
  }

  return Number(value).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }
  );
}

function fmtInt(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "-";
  }

  return Number(value).toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 0,
    }
  );
}

function fmtCr(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "-";
  }

  return (
    "₹" +
    Math.abs(Number(value)).toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2,
      }
    ) +
    " Cr"
  );
}

function fmtStrike(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "-";
  }

  return Number(value).toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 0,
    }
  );
}

function signed(
  value: number | null | undefined,
  decimals = 2
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "-";
  }

  const n = Number(value);

  return (
    (n >= 0 ? "+" : "") +
    fmt(n, decimals)
  );
}

/* ============================================================
   DATA HELPERS
   ============================================================ */

function raw(data: MarketData): any {
  return data as any;
}

/* ============================================================
   INDEX LOOKUP
   ============================================================ */

function getIndex(
  data: MarketData,
  symbol: SymbolName
): IndexData | undefined {
  const indices: any = raw(data)?.indices;

  if (!indices) {
    return undefined;
  }

  /*
     Supports:

     {
       NIFTY: {...},
       BANKNIFTY: {...}
     }

     and

     [
       {...},
       {...}
     ]
  */

  if (
    !Array.isArray(indices) &&
    typeof indices === "object"
  ) {
    const direct = indices[symbol];

    if (direct) {
      return direct as IndexData;
    }
  }

  if (Array.isArray(indices)) {
    return indices.find(
      (item: any) => {
        const s = String(
          item?.symbol ?? ""
        )
          .replace(/\s+/g, "")
          .toUpperCase();

        return (
          s === symbol ||
          s ===
            symbol.replace(
              /\s+/g,
              ""
            )
        );
      }
    ) as IndexData | undefined;
  }

  return undefined;
}

/* ============================================================
   NORMALIZE STRIKE ROWS
   ============================================================ */

function getStrikeRows(
  data: MarketData,
  symbol: SymbolName,
  key: "strikeOI" | "strikeCOI"
): StrikeRow[] {
  const source =
    raw(data)?.[key]?.[symbol];

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter(
      (row: any) =>
        Array.isArray(row) &&
        row.length >= 3 &&
        Number.isFinite(
          Number(row[0])
        ) &&
        Number.isFinite(
          Number(row[1])
        ) &&
        Number.isFinite(
          Number(row[2])
        )
    )
    .map(
      (row: any) =>
        [
          Number(row[0]),
          Number(row[1]),
          Number(row[2]),
        ] as StrikeRow
    )
    .sort(
      (a, b) => a[0] - b[0]
    );
}

/* ============================================================
   NORMALIZE TREND ROWS

   Supports both:

   ["09:21", 100, 200]

   and, defensively:

   {
      time: "09:21",
      value: 100
   }
   ============================================================ */

function getTrendRows(
  data: MarketData,
  symbol: SymbolName,
  key:
    | "pcrTrend"
    | "coiTrend"
    | "straddleTrend"
    | "priceTrend"
): TrendRow[] {
  const source =
    raw(data)?.[key]?.[symbol];

  if (!Array.isArray(source)) {
    return [];
  }

  const result: TrendRow[] = [];

  for (const item of source) {
    if (Array.isArray(item)) {
      if (
        item.length >= 2 &&
        typeof item[0] === "string"
      ) {
        const values =
          item
            .slice(1)
            .map(Number)
            .filter(
              (v: number) =>
                Number.isFinite(v)
            );

        if (values.length > 0) {
          result.push([
            item[0],
            ...values,
          ]);
        }
      }

      continue;
    }

    if (
      item &&
      typeof item === "object"
    ) {
      const time =
        String(
          item.time ??
            item.timestamp ??
            item.date ??
            ""
        );

      const values: number[] = [];

      if (
        item.value !== undefined
      ) {
        values.push(
          Number(item.value)
        );
      }

      if (
        item.pcrOI !== undefined
      ) {
        values.push(
          Number(item.pcrOI)
        );
      }

      if (
        item.pcrCOI !== undefined
      ) {
        values.push(
          Number(item.pcrCOI)
        );
      }

      if (
        item.spot !== undefined
      ) {
        values.push(
          Number(item.spot)
        );
      }

      if (
        item.future !== undefined
      ) {
        values.push(
          Number(item.future)
        );
      }

      if (
        item.vwap !== undefined
      ) {
        values.push(
          Number(item.vwap)
        );
      }

      const clean = values.filter(
        (v) =>
          Number.isFinite(v)
      );

      if (
        time &&
        clean.length
      ) {
        result.push([
          time,
          ...clean,
        ]);
      }
    }
  }

  return result;
}

/* ============================================================
   VIX TREND
   ============================================================ */

function getVixRows(
  data: MarketData
): TrendRow[] {
  const source =
    raw(data)?.vixTrend;

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter(
      (row: any) =>
        Array.isArray(row) &&
        row.length >= 2 &&
        typeof row[0] === "string" &&
        Number.isFinite(
          Number(row[1])
        )
    )
    .map(
      (row: any) =>
        [
          String(row[0]),
          Number(row[1]),
        ] as TrendRow
    );
}

/* ============================================================
   FILTER STRIKES AROUND ATM
   ============================================================ */

function filterStrikes(
  rows: StrikeRow[],
  indexData:
    | IndexData
    | undefined,
  window: StrikeWindow
): StrikeRow[] {
  if (!rows.length) {
    return [];
  }

  if (window === "ALL") {
    return rows;
  }

  const atm = Number(
    indexData?.atm
  );

  if (!Number.isFinite(atm)) {
    return rows;
  }

  let nearest = 0;
  let distance = Infinity;

  rows.forEach(
    (row, i) => {
      const d = Math.abs(
        row[0] - atm
      );

      if (d < distance) {
        distance = d;
        nearest = i;
      }
    }
  );

  const start = Math.max(
    0,
    nearest - window
  );

  const end = Math.min(
    rows.length,
    nearest + window + 1
  );

  return rows.slice(
    start,
    end
  );
}

/* ============================================================
   COMMON CHART OPTIONS
   ============================================================ */

function lineOptions(
  yTitle: string
) {
  return {
    responsive: true,
    maintainAspectRatio: false,

    animation: false as const,
    datasets: {
  line: {
    pointRadius: 0,
    pointHoverRadius: 4,
  },
},

    interaction: {
      mode: "index" as const,
      intersect: false,
    },

    plugins: {
      legend: {
        display: true,
        position: "top" as const,

        labels: {
          color: "#dce5eb",
          usePointStyle: true,
          boxWidth: 10,
        },
      },

      tooltip: {
        enabled: true,
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#8d9ba7",
          autoSkip: true,
          maxTicksLimit: 20,
          maxRotation: 45,
          minRotation: 0,
        },

        grid: {
          color:
            "rgba(255,255,255,0.05)",
        },

        title: {
          display: true,
          text: "TIME",
          color: "#9aa7b2",
        },
      },

      y: {
        beginAtZero: false,

        ticks: {
          color: "#8d9ba7",
        },

        grid: {
          color:
            "rgba(255,255,255,0.08)",
        },

        title: {
          display: true,
          text: yTitle,
          color: "#9aa7b2",
        },
      },
    },
  };
}

/* ============================================================
   BAR OPTIONS
   ============================================================ */

function barOptions(
  yTitle: string
) {
  return {
    responsive: true,
    maintainAspectRatio: false,

    animation: false as const,

    interaction: {
      mode: "index" as const,
      intersect: false,
    },

    plugins: {
      legend: {
        display: true,
        position: "top" as const,

        labels: {
          color: "#dce5eb",
          usePointStyle: true,
          boxWidth: 10,
        },
      },

      tooltip: {
        enabled: true,

        callbacks: {
          label: (ctx: any) => {
            return (
              String(
                ctx.dataset.label
              ) +
              ": " +
              fmt(
                Number(ctx.raw)
              )
            );
          },
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#8d9ba7",
          autoSkip: true,
          maxTicksLimit: 20,
          maxRotation: 45,
          minRotation: 0,
        },

        grid: {
          color:
            "rgba(255,255,255,0.05)",
        },

        title: {
          display: true,
          text: "STRIKE PRICE",
          color: "#9aa7b2",
        },
      },

      y: {
        beginAtZero: true,

        ticks: {
          color: "#8d9ba7",
        },

        grid: {
          color:
            "rgba(255,255,255,0.08)",
        },

        title: {
          display: true,
          text: yTitle,
          color: "#9aa7b2",
        },
      },
    },
  };
}

/* ============================================================
   VISIBLE BUTTON
   ============================================================ */

function ControlButton({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  const activeColor =
    color || "#00d4ff";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",

        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",

        minHeight: 38,

        padding:
          "8px 15px",

        borderRadius: 7,

        border: active
          ? `1px solid ${activeColor}`
          : "1px solid #2b3945",

        background: active
          ? activeColor
          : "#111a22",

        color: active
          ? "#061018"
          : "#dce5eb",

        fontSize: 12,
        fontWeight: active
          ? 800
          : 600,

        letterSpacing:
          "0.03em",

        cursor: "pointer",

        whiteSpace:
          "nowrap",

        boxShadow: active
          ? `0 0 14px ${activeColor}44`
          : "none",

        transition:
          "all .15s ease",

        flex: "0 0 auto",
      }}
    >
      {label}
    </button>
  );
}

/* ============================================================
   CONTROL BAR
   ============================================================ */

function ControlBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 12,

        width: "100%",

        overflowX: "auto",

        paddingBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   CARD
   ============================================================ */

function AnalysisCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="card"
      style={{
        width: "100%",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   OPTION CHAIN
   ============================================================ */

function OptionChainPanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const [window, setWindow] =
    useState<StrikeWindow>(8);

  const index =
    getIndex(data, symbol);

  const rows = useMemo(() => {
    const source =
      raw(data)?.optionChain?.[
        symbol
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
      .sort(
        (a: any, b: any) =>
          Number(a[6]) -
          Number(b[6])
      );
  }, [data, symbol]);

  const atm =
    Number(index?.atm);

  const displayRows =
    useMemo(() => {
      if (!rows.length) {
        return [];
      }

      if (
        window === "ALL" ||
        !Number.isFinite(atm)
      ) {
        return rows;
      }

      let nearest = 0;
      let minDistance =
        Infinity;

      rows.forEach(
        (row: any, i: number) => {
          const d =
            Math.abs(
              Number(row[6]) -
                atm
            );

          if (d < minDistance) {
            minDistance = d;
            nearest = i;
          }
        }
      );

      const start =
        Math.max(
          0,
          nearest - window
        );

      const end =
        Math.min(
          rows.length,
          nearest +
            window +
            1
        );

      return rows.slice(
        start,
        end
      );
    }, [
      rows,
      atm,
      window,
    ]);

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="card-label">
            {symbol} · OPTION CHAIN
          </div>

          <h2
            style={{
              margin:
                "6px 0 4px",
            }}
          >
            Live Option Chain
          </h2>

          <div className="sub">
            ATM:{" "}
            <strong>
              {fmtStrike(
                index?.atm
              )}
            </strong>
            {" · "}
            Spot:{" "}
            <strong>
              {fmt(
                index?.spot
              )}
            </strong>
          </div>
        </div>

        <div
          style={{
            padding:
              "7px 10px",
            borderRadius: 6,
            border:
              "1px solid #263642",
            background:
              "#0d151c",
            fontSize: 11,
            color:
              "#8d9ba7",
          }}
        >
          {displayRows.length}{" "}
          strikes displayed
        </div>
      </div>

      <div
        style={{
          marginTop: 15,
        }}
      >
        <div className="card-label">
          STRIKE WINDOW
        </div>

        <ControlBar>
          {[
            [5, "±5 strikes"],
            [8, "±8 strikes"],
            [10, "±10 strikes"],
            [15, "±15 strikes"],
            ["ALL", "ALL strikes"],
          ].map(
            ([value, label]) => (
              <ControlButton
                key={String(
                  value
                )}
                active={
                  window === value
                }
                label={
                  label as string
                }
                color={
                  INDEX_COLORS[
                    symbol
                  ]
                }
                onClick={() =>
                  setWindow(
                    value as StrikeWindow
                  )
                }
              />
            )
          )}
        </ControlBar>
      </div>

      {!rows.length ? (
        <div
          style={{
            marginTop: 18,
            padding: 25,
            textAlign: "center",
            color:
              "#84939e",
          }}
        >
          No option chain data
          available for{" "}
          {symbol}.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,

            width: "100%",

            maxHeight: 650,

            overflowX: "auto",
            overflowY: "auto",

            border:
              "1px solid #25323d",
            borderRadius: 8,
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: 1180,
              borderCollapse:
                "collapse",
              fontSize: 11,
            }}
          >
            <thead>
              <tr
                style={{
                  position:
                    "sticky",
                  top: 0,
                  zIndex: 5,
                  background:
                    "#111b23",
                }}
              >
                <th
                  colSpan={6}
                  style={{
                    padding: 9,
                    color:
                      "#ff5c57",
                    borderBottom:
                      "1px solid #27343f",
                    textAlign:
                      "center",
                  }}
                >
                  CALL
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: 9,
                    color:
                      "#ffffff",
                    border:
                      "1px solid #27343f",
                    textAlign:
                      "center",
                  }}
                >
                  STRIKE
                </th>

                <th
                  colSpan={6}
                  style={{
                    padding: 9,
                    color:
                      "#31d17c",
                    borderBottom:
                      "1px solid #27343f",
                    textAlign:
                      "center",
                  }}
                >
                  PUT
                </th>
              </tr>

              <tr
                style={{
                  position:
                    "sticky",
                  top: 35,
                  zIndex: 5,
                  background:
                    "#0e171f",
                }}
              >
                {[
                  "OI",
                  "COI",
                  "VOL",
                  "IV",
                  "LTP",
                  "CHG",
                ].map(
                  (h) => (
                    <th
                      key={
                        "c-" + h
                      }
                      style={{
                        padding:
                          "8px 7px",
                        borderBottom:
                          "1px solid #27343f",
                        color:
                          "#84939e",
                        textAlign:
                          "right",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}

                {[
                  "CHG",
                  "LTP",
                  "IV",
                  "VOL",
                  "COI",
                  "OI",
                ].map(
                  (h) => (
                    <th
                      key={
                        "p-" + h
                      }
                      style={{
                        padding:
                          "8px 7px",
                        borderBottom:
                          "1px solid #27343f",
                        color:
                          "#84939e",
                        textAlign:
                          "right",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {displayRows.map(
                (
                  row: any,
                  rowIndex
                ) => {
                  const strike =
                    Number(
                      row[6]
                    );

                  const isATM =
                    Number.isFinite(
                      atm
                    ) &&
                    Math.abs(
                      strike - atm
                    ) <
                      0.001;

                  return (
                    <tr
                      key={`${symbol}-${strike}-${rowIndex}`}
                      style={{
                        background:
                          isATM
                            ? "rgba(0,212,255,0.10)"
                            : rowIndex %
                                  2 ===
                              0
                            ? "rgba(255,255,255,0.015)"
                            : "transparent",

                        borderBottom:
                          "1px solid #202b34",
                      }}
                    >
                      <td className="mono">
                        {fmtInt(
                          row[0]
                        )}
                      </td>

                      <td
                        className="mono"
                        style={{
                          color:
                            Number(
                              row[1]
                            ) >= 0
                              ? "#31d17c"
                              : "#ff5c57",
                        }}
                      >
                        {fmtInt(
                          row[1]
                        )}
                      </td>

                      <td className="mono">
                        {fmtInt(
                          row[2]
                        )}
                      </td>

                      <td className="mono">
                        {fmt(
                          row[3],
                          2
                        )}
                      </td>

                      <td
                        className="mono"
                        style={{
                          color:
                            "#ffffff",
                        }}
                      >
                        {fmt(
                          row[4]
                        )}
                      </td>

                      <td
                        className="mono"
                        style={{
                          color:
                            Number(
                              row[5]
                            ) >= 0
                              ? "#31d17c"
                              : "#ff5c57",
                        }}
                      >
                        {signed(
                          row[5]
                        )}
                      </td>

                      <td
                        className="mono"
                        style={{
                          textAlign:
                            "center",
                          fontWeight: 800,
                          color:
                            isATM
                              ? "#00d4ff"
                              : "#ffffff",
                          background:
                            isATM
                              ? "rgba(0,212,255,0.13)"
                              : "transparent",
                        }}
                      >
                        {fmtStrike(
                          strike
                        )}
                        {isATM
                          ? " ATM"
                          : ""}
                      </td>

                      <td
                        className="mono"
                        style={{
                          color:
                            Number(
                              row[7]
                            ) >= 0
                              ? "#31d17c"
                              : "#ff5c57",
                        }}
                      >
                        {signed(
                          row[7]
                        )}
                      </td>

                      <td className="mono">
                        {fmt(
                          row[8]
                        )}
                      </td>

                      <td className="mono">
                        {fmt(
                          row[9],
                          2
                        )}
                      </td>

                      <td className="mono">
                        {fmtInt(
                          row[10]
                        )}
                      </td>

                      <td
                        className="mono"
                        style={{
                          color:
                            Number(
                              row[11]
                            ) >= 0
                              ? "#31d17c"
                              : "#ff5c57",
                        }}
                      >
                        {fmtInt(
                          row[11]
                        )}
                      </td>

                      <td className="mono">
                        {fmtInt(
                          row[12]
                        )}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </AnalysisCard>
  );
}

/* ============================================================
   OPEN INTEREST CHART
   ============================================================ */

function OpenInterestPanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const [window, setWindow] =
    useState<StrikeWindow>(8);

  const index =
    getIndex(data, symbol);

  const rows = useMemo(() => {
    const source =
      raw(data)?.optionChain?.[
        symbol
      ];

    if (!Array.isArray(source)) {
      return [];
    }

    const oiRows: StrikeRow[] =
      source
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
            ] as StrikeRow
        )
        .sort(
          (a, b) => a[0] - b[0]
        );

    return filterStrikes(
      oiRows,
      index,
      window
    );
  }, [data, symbol, index, window]);

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => fmtStrike(r[0])
      ),

      datasets: [
        {
          label: "CALL OI",
          data: rows.map(
            (r) => r[1]
          ),
          backgroundColor:
            "#ff4d4d",
          borderColor:
            "#ff4d4d",
          borderWidth: 1,
        },

        {
          label: "PUT OI",
          data: rows.map(
            (r) => r[2]
          ),
          backgroundColor:
            "#31d17c",
          borderColor:
            "#31d17c",
          borderWidth: 1,
        },
      ],
    }),
    [rows]
  );

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        OPEN INTEREST
      </div>

      <h2
        style={{
          margin:
            "6px 0 4px",
        }}
      >
        {symbol} · Open Interest
      </h2>

      <div className="sub">
        CALL OI vs PUT OI around
        the live ATM
      </div>

      <ControlBar>
        {[
          [5, "±5"],
          [8, "±8"],
          [10, "±10"],
          [15, "±15"],
          ["ALL", "ALL"],
        ].map(
          ([value, label]) => (
            <ControlButton
              key={String(
                value
              )}
              active={
                window === value
              }
              label={`${label} strikes`}
              color="#00d4ff"
              onClick={() =>
                setWindow(
                  value as StrikeWindow
                )
              }
            />
          )
        )}
      </ControlBar>

      <div
        style={{
          marginTop: 10,
          color: "#8d9ba7",
          fontSize: 11,
        }}
      >
        ATM{" "}
        <strong
          style={{
            color:
              "#00d4ff",
          }}
        >
          {fmtStrike(
            index?.atm
          )}
        </strong>
        {" · "}
        {rows.length} strikes
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Bar
            key={`oi-${symbol}-${String(
              window
            )}`}
            data={chartData}
            options={barOptions(
              "OPEN INTEREST"
            )}
          />
        ) : (
          <EmptyState
            text={`No OI data available for ${symbol}.`}
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   CHANGE OF OPEN INTEREST CHART
   ============================================================ */

function CoiStrikePanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const [window, setWindow] =
    useState<StrikeWindow>(8);

  const index =
    getIndex(data, symbol);

  const rows = useMemo(() => {
    const source =
      raw(data)?.optionChain?.[
        symbol
      ];

    if (!Array.isArray(source)) {
      return [];
    }

    const coiRows: StrikeRow[] =
      source
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
              Number(r[6]),        // STRIKE
              Number(r[1]) || 0,   // CALL COI
              Number(r[11]) || 0,  // PUT COI
            ] as StrikeRow
        )
        .sort(
          (a, b) => a[0] - b[0]
        );

    return filterStrikes(
      coiRows,
      index,
      window
    );
  }, [data, symbol, index, window]);

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => fmtStrike(r[0])
      ),

      datasets: [
        {
          label: "CALL COI",
          data: rows.map(
            (r) => r[1]
          ),
          backgroundColor:
            "#ff4d6d",
          borderColor:
            "#ff4d6d",
          borderWidth: 1,
        },

        {
          label: "PUT COI",
          data: rows.map(
            (r) => r[2]
          ),
          backgroundColor:
            "#22c55e",
          borderColor:
            "#22c55e",
          borderWidth: 1,
        },
      ],
    }),
    [rows]
  );

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        CHANGE OF OPEN INTEREST
      </div>

      <h2
        style={{
          margin:
            "6px 0 4px",
        }}
      >
        {symbol} · Change of Open Interest
      </h2>

      <div className="sub">
        CALL COI vs PUT COI by
        strike
      </div>

      <ControlBar>
        {[
          [5, "±5"],
          [8, "±8"],
          [10, "±10"],
          [15, "±15"],
          ["ALL", "ALL"],
        ].map(
          ([value, label]) => (
            <ControlButton
              key={String(
                value
              )}
              active={
                window === value
              }
              label={`${label} strikes`}
              color="#ffb020"
              onClick={() =>
                setWindow(
                  value as StrikeWindow
                )
              }
            />
          )
        )}
      </ControlBar>

      <div
        style={{
          marginTop: 10,
          color: "#8d9ba7",
          fontSize: 11,
        }}
      >
        ATM{" "}
        <strong
          style={{
            color:
              "#ffb020",
          }}
        >
          {fmtStrike(
            index?.atm
          )}
        </strong>
        {" · "}
        {rows.length} strikes
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Bar
            key={`coi-${symbol}-${String(
              window
            )}`}
            data={chartData}
            options={barOptions(
              "CHANGE OF OI"
            )}
          />
        ) : (
          <EmptyState
            text={`No COI strike data available for ${symbol}.`}
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   PCR PANEL
   ============================================================ */

function PcrPanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const index =
    getIndex(data, symbol);

  const rows = useMemo(
    () =>
      getTrendRows(
        data,
        symbol,
        "pcrTrend"
      ),
    [data, symbol]
  );

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          label: "PCR OI",
          data: rows.map(
            (r) => Number(r[1])
          ),
          borderColor:
            INDEX_COLORS[symbol],
          backgroundColor:
            `${INDEX_COLORS[symbol]}22`,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false,
        },

        {
          label: "PCR COI",
          data: rows.map(
            (r) =>
              Number(
                r[2] ?? NaN
              )
          ),
          borderColor:
            "#ffffff",
          backgroundColor:
            "#ffffff22",
          borderWidth: 3,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false,
        },
      ],
    }),
    [rows, symbol]
  );

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        PCR ANALYSIS
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin:
                "6px 0 4px",
            }}
          >
            {symbol} · PCR
          </h2>

          <div className="sub">
            PCR OI and PCR COI
            against time
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
          }}
        >
          <div>
            <div className="label">
              PCR OI
            </div>
            <div className="metric mono">
              {fmt(
                index?.pcrOI,
                4
              )}
            </div>
          </div>

          <div>
            <div className="label">
              PCR COI
            </div>
            <div className="metric mono">
              {fmt(
                index?.pcrCOI,
                4
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Line
            key={`pcr-${symbol}`}
            data={chartData}
            options={lineOptions(
              "PCR"
            )}
          />
        ) : (
          <EmptyState
            text={`No PCR trend data available for ${symbol}.`}
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   COI TREND PANEL
   ============================================================ */

function CoiTrendPanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const rows = useMemo(
    () =>
      getTrendRows(
        data,
        symbol,
        "coiTrend"
      ),
    [data, symbol]
  );

  /* ==========================================================
     EXISTING COI LINE CHART
     ========================================================== */

  const lineChartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          label:
            "PUT COI SUM - CALL COI SUM",

          data: rows.map(
            (r) => Number(r[1])
          ),

          borderColor:
            INDEX_COLORS[symbol],

          backgroundColor:
            `${INDEX_COLORS[symbol]}22`,

          borderWidth: 3,

          pointRadius: 0,

          pointHoverRadius: 5,

          tension: 0.25,

          fill: true,
        },
      ],
    }),
    [rows, symbol]
  );

  /* ==========================================================
     LINEAR REGRESSION TRENDLINE
     
     Uses time order as X:
     0, 1, 2, 3, ...
     
     Y = PUT COI SUM - CALL COI SUM
     ========================================================== */

  const trendline = useMemo(() => {
    const values = rows
      .map((r) => Number(r[1]))
      .filter((v) =>
        Number.isFinite(v)
      );

    if (values.length < 2) {
      return values;
    }

    const n = values.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (
      let i = 0;
      i < n;
      i++
    ) {
      const x = i;
      const y = values[i];

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator =
      n * sumXX -
      sumX * sumX;

    if (denominator === 0) {
      return values;
    }

    const slope =
      (n * sumXY -
        sumX * sumY) /
      denominator;

    const intercept =
      (sumY -
        slope * sumX) /
      n;

    return values.map(
      (_value, i) =>
        intercept +
        slope * i
    );
  }, [rows]);

  /* ==========================================================
     BAR + TRENDLINE CHART
     ========================================================== */

  const barChartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          type: "bar" as const,

          label:
            "PUT COI SUM - CALL COI SUM",

          data: rows.map(
            (r) => Number(r[1])
          ),

          backgroundColor:
            rows.map((r) =>
              Number(r[1]) < 0
                ? "#ff3b30"
                : "#31d17c"
            ),

          borderColor:
            rows.map((r) =>
              Number(r[1]) < 0
                ? "#ff3b30"
                : "#31d17c"
            ),

          borderWidth: 1,

          borderRadius: 2,

          barPercentage: 0.82,

          categoryPercentage: 0.92,
        },

        {
          type: "line" as const,

          label:
            "LINEAR TREND",

          data: trendline,

          borderColor:
            "#ffff00",

          backgroundColor:
            "#ffff00",

          borderWidth: 3,

          pointRadius: 0,

          pointHoverRadius: 4,

          tension: 0,

          fill: false,

          order: 0,
        },
      ],
    }),
    [rows, trendline]
  );

  /* ==========================================================
     BAR CHART OPTIONS
     ========================================================== */

  const barChartOptions: any = {
    responsive: true,

    maintainAspectRatio: false,

    animation: false,

    interaction: {
      mode: "index",

      intersect: false,
    },

    plugins: {
      legend: {
        display: true,

        position: "top",

        labels: {
          color: "#dce5eb",

          usePointStyle: true,

          boxWidth: 10,
        },
      },

      tooltip: {
        enabled: true,

        callbacks: {
          label: (ctx: any) => {
            const value =
              Number(ctx.raw);

            if (
              ctx.dataset.type ===
              "line"
            ) {
              return (
                "Trend: " +
                fmt(value)
              );
            }

            return (
              "COI CHANGE SUM: " +
              signed(value)
            );
          },
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#8d9ba7",

          autoSkip: true,

          maxTicksLimit: 20,

          maxRotation: 45,

          minRotation: 0,
        },

        grid: {
          color:
            "rgba(255,255,255,0.05)",
        },

        title: {
          display: true,

          text: "TIME",

          color: "#9aa7b2",
        },
      },

      y: {
        beginAtZero: true,

        ticks: {
          color: "#8d9ba7",

          callback: (
            value: any
          ) =>
            fmt(
              Number(value),
              0
            ),
        },

        grid: {
          color: (
            context: any
          ) => {
            if (
              context.tick?.value ===
              0
            ) {
              return "#ffffff";
            }

            return "rgba(255,255,255,0.08)";
          },

          lineWidth: (
            context: any
          ) => {
            if (
              context.tick?.value ===
              0
            ) {
              return 1.5;
            }

            return 1;
          },
        },

        title: {
          display: true,

          text:
            "PUT COI SUM - CALL COI SUM",

          color: "#9aa7b2",
        },
      },
    },
  };

  return (
    <>
      {/* ======================================================
          PLOT 1 — COI CHANGE LINE
         ====================================================== */}

      <AnalysisCard
        style={{
          marginTop: 16,
        }}
      >
        <div className="card-label">
          COI TREND
        </div>

        <h2
          style={{
            margin:
              "6px 0 4px",
          }}
        >
          {symbol} · Change of COI
        </h2>

        <div className="sub">
          PUT COI SUM − CALL COI
          SUM against time
        </div>

        <div
          style={{
            position:
              "relative",

            width: "100%",

            height: 430,

            marginTop: 15,
          }}
        >
          {rows.length ? (
            <Line
              key={`coi-trend-${symbol}`}
              data={lineChartData}
              options={lineOptions(
                "COI DIFFERENCE"
              )}
            />
          ) : (
            <EmptyState
              text={`No COI trend data available for ${symbol}.`}
            />
          )}
        </div>
      </AnalysisCard>

      {/* ======================================================
          PLOT 2 — COI CHANGE SUM BAR + TRENDLINE
         ====================================================== */}

      <AnalysisCard
        style={{
          marginTop: 16,
        }}
      >
        <div className="card-label">
          CHANGE OF COI SUM
        </div>

        <h2
          style={{
            margin:
              "6px 0 4px",
          }}
        >
          {symbol} · COI Change Sum
        </h2>

        <div className="sub">
          PUT COI SUM − CALL COI
          SUM against time
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 12,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          <span>
            <span
              style={{
                display:
                  "inline-block",

                width: 10,

                height: 10,

                borderRadius: 2,

                background:
                  "#31d17c",

                marginRight: 6,
              }}
            />
            POSITIVE
          </span>

          <span>
            <span
              style={{
                display:
                  "inline-block",

                width: 10,

                height: 10,

                borderRadius: 2,

                background:
                  "#ff3b30",

                marginRight: 6,
              }}
            />
            NEGATIVE
          </span>

          <span>
            <span
              style={{
                display:
                  "inline-block",

                width: 18,

                height: 3,

                background:
                  "#ffff00",

                marginRight: 6,

                verticalAlign:
                  "middle",
              }}
            />
            LINEAR TREND
          </span>
        </div>

        <div
          style={{
            position:
              "relative",

            width: "100%",

            height: 430,

            marginTop: 15,
          }}
        >
          {rows.length ? (
            <Bar
              key={`coi-change-bar-${symbol}`}
              data={barChartData as any}
              options={
                barChartOptions
              }
            />
          ) : (
            <EmptyState
              text={`No COI change data available for ${symbol}.`}
            />
          )}
        </div>
      </AnalysisCard>
    </>
  );
}

/* ============================================================
   STRADDLE PANEL
   ============================================================ */

function StraddlePanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const rows = useMemo(
    () =>
      getTrendRows(
        data,
        symbol,
        "straddleTrend"
      ),
    [data, symbol]
  );

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          label:
            `${symbol} ATM STRADDLE`,
          data: rows.map(
            (r) => Number(r[1])
          ),
          borderColor:
            INDEX_COLORS[symbol],
          backgroundColor:
            `${INDEX_COLORS[symbol]}22`,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: true,
        },
      ],
    }),
    [rows, symbol]
  );

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        STRADDLE
      </div>

      <h2
        style={{
          margin:
            "6px 0 4px",
        }}
      >
        {symbol} · ATM Straddle
      </h2>

      <div className="sub">
        ATM straddle premium
        against time
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Line
            key={`straddle-${symbol}`}
            data={chartData}
            options={lineOptions(
              "PREMIUM"
            )}
          />
        ) : (
          <EmptyState
            text={`No straddle data available for ${symbol}.`}
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   VIX PANEL
   ============================================================ */

function VixPanel({
  data,
}: {
  data: MarketData;
}) {
  const rows =
    getVixRows(data);

  const value =
    Number(
      data.vix?.value ?? 0
    );

  const change =
    Number(
      data.vix?.chg ?? 0
    );

  const changePct =
    Number(
      data.vix?.chgPct ?? 0
    );

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          label: "INDIA VIX",
          data: rows.map(
            (r) => Number(r[1])
          ),
          borderColor:
            "#ff4d6d",
          backgroundColor:
            "#ff4d6d22",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: true,
        },
      ],
    }),
    [rows]
  );

  let note =
    "VOLATILITY DATA";

  if (value > 0) {
    if (value < 15) {
      note =
        "LOW VOLATILITY";
    } else if (value < 20) {
      note =
        "MODERATE VOLATILITY";
    } else {
      note =
        "HIGH VOLATILITY";
    }
  }

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        INDIA VIX
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin:
                "6px 0 4px",
            }}
          >
            India VIX
          </h2>

          <div
            className="metric mono"
            style={{
              marginTop: 10,
            }}
          >
            {fmt(value)}
          </div>

          <div
            className={`sub ${
              change >= 0
                ? "up"
                : "down"
            }`}
            style={{
              marginTop: 5,
            }}
          >
            {signed(
              change
            )}{" "}
            (
            {signed(
              changePct
            )}
            %)
          </div>
        </div>

        <div
          style={{
            padding:
              "9px 12px",
            borderRadius: 7,
            border:
              "1px solid #293743",
            background:
              "#101820",
            fontSize: 11,
            fontWeight: 700,
            color:
              "#dce5eb",
          }}
        >
          {note}
        </div>
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Line
            data={chartData}
            options={lineOptions(
              "INDIA VIX"
            )}
          />
        ) : (
          <EmptyState
            text="No VIX trend data available."
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   PRICE PANEL
   ============================================================ */

function PricePanel({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const index =
    getIndex(data, symbol);

  const rows = useMemo(
    () =>
      getTrendRows(
        data,
        symbol,
        "priceTrend"
      ),
    [data, symbol]
  );

  const chartData = useMemo(
    () => ({
      labels: rows.map(
        (r) => r[0]
      ),

      datasets: [
        {
          label: "SPOT",
          data: rows.map(
            (r) =>
              Number.isFinite(
                Number(r[1])
              )
                ? Number(r[1])
                : null
          ),
          borderColor:
            "#e8eef3",
          backgroundColor:
            "transparent",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          spanGaps: true,
        },

        {
          label: "FUTURE",
          data: rows.map(
            (r) =>
              Number.isFinite(
                Number(r[2])
              )
                ? Number(r[2])
                : null
          ),
          borderColor:
            "#31d17c",
          backgroundColor:
            "transparent",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          spanGaps: true,
        },

        {
          label: "VWAP",
          data: rows.map(
            (r) =>
              Number.isFinite(
                Number(r[3])
              )
                ? Number(r[3])
                : null
          ),
          borderColor:
            "#e5aa45",
          backgroundColor:
            "transparent",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          spanGaps: true,
        },
      ],
    }),
    [rows]
  );

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
      }}
    >
      <div className="card-label">
        PRICE STRUCTURE
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin:
                "6px 0 4px",
            }}
          >
            {symbol} · Spot /
            Future / VWAP
          </h2>

          <div className="sub">
            Intraday price structure
            from the live exporter
          </div>
        </div>

        <div
          className="metric mono"
          style={{
            color:
              INDEX_COLORS[
                symbol
              ],
          }}
        >
          {fmt(
            index?.spot
          )}
        </div>
      </div>

      <div
        style={{
          position:
            "relative",
          width: "100%",
          height: 430,
          marginTop: 15,
        }}
      >
        {rows.length ? (
          <Line
            key={`price-${symbol}`}
            data={chartData}
            options={lineOptions(
              "PRICE"
            )}
          />
        ) : (
          <EmptyState
            text={`No price trend data available for ${symbol}.`}
          />
        )}
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   BIG PLAYER
   ============================================================ */

function BigPlayerPanel({
  data,
  symbols,
}: {
  data: MarketData;
  symbols: SymbolName[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(360px,1fr))",
        gap: 14,
        marginTop: 16,
      }}
    >
      {symbols.map(
        (symbol) => {
          const b =
            raw(data)
              ?.bigPlayer?.[
              symbol
            ];

          if (!b) {
            return (
              <AnalysisCard
                key={symbol}
              >
                <div className="card-label">
                  {symbol}
                </div>

                <h2
                  style={{
                    margin:
                      "6px 0",
                  }}
                >
                  Big Player
                </h2>

                <EmptyState
                  text="No Big Player data available."
                />
              </AnalysisCard>
            );
          }

          const call =
            Number(
              b.callOiLakh
            ) || 0;

          const put =
            Number(
              b.putOiLakh
            ) || 0;

          const total =
            call + put;

          const callPct =
            total > 0
              ? (call /
                  total) *
                100
              : 0;

          const putPct =
            total > 0
              ? (put /
                  total) *
                100
              : 0;

          const side =
            String(
              b.bigPlayerSide ??
                ""
            ).toUpperCase();

          return (
            <AnalysisCard
              key={symbol}
            >
              <div className="card-label">
                {symbol}
              </div>

              <h2
                style={{
                  margin:
                    "6px 0 4px",
                }}
              >
                Big Player vs
                Retailer
              </h2>

              <div className="sub">
                OI based split
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "145px 1fr",
                  gap: 22,
                  alignItems:
                    "center",
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    width: 135,
                    height: 135,
                    borderRadius:
                      "50%",
                    background:
                      `conic-gradient(
                        #ff0000 0deg ${callPct * 3.6}deg,
                        #00c853 ${callPct * 3.6}deg 360deg
                      )`,
                    boxShadow:
                      "0 0 25px rgba(0,0,0,.25)",
                  }}
                />

                <div>
                  <div className="row">
                    <span>
                      <span
                        style={{
                          display:
                            "inline-block",
                          width: 9,
                          height: 9,
                          borderRadius:
                            2,
                          background:
                            "#ff0000",
                          marginRight:
                            8,
                        }}
                      />
                      CALL
                    </span>

                    <b>
                      {fmt(
                        callPct,
                        1
                      )}
                      %
                    </b>
                  </div>

                  <div
                    className="row"
                    style={{
                      marginTop: 10,
                    }}
                  >
                    <span>
                      <span
                        style={{
                          display:
                            "inline-block",
                          width: 9,
                          height: 9,
                          borderRadius:
                            2,
                          background:
                            "#00c853",
                          marginRight:
                            8,
                        }}
                      />
                      PUT
                    </span>

                    <b>
                      {fmt(
                        putPct,
                        1
                      )}
                      %
                    </b>
                  </div>

                  <div
                    className="hr"
                  />

                  <div className="label">
                    BIG PLAYER SIDE
                  </div>

                  <div
                    className={`metric ${
                      side === "CALL"
                        ? "down"
                        : side ===
                          "PUT"
                        ? "up"
                        : ""
                    }`}
                    style={{
                      marginTop: 4,
                    }}
                  >
                    {side ||
                      "-"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                <div className="notice">
                  Resistance{" "}
                  <b>
                    {fmtStrike(
                      b.resistanceStrike
                    )}
                  </b>
                </div>

                <div className="notice">
                  Support{" "}
                  <b>
                    {fmtStrike(
                      b.supportStrike
                    )}
                  </b>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <div className="notice">
                  Call OI{" "}
                  <b>
                    {fmt(
                      call
                    )}
                    L
                  </b>
                </div>

                <div className="notice">
                  Put OI{" "}
                  <b>
                    {fmt(
                      put
                    )}
                    L
                  </b>
                </div>
              </div>
            </AnalysisCard>
          );
        }
      )}
    </div>
  );
}

/* ============================================================
   FII / DII
   ============================================================ */

function FiiDiiPanel({
  data,
}: {
  data: MarketData;
}) {
  const fii =
    Number(
      data.fiidii?.netFII ??
        0
    );

  const dii =
    Number(
      data.fiidii?.netDII ??
        0
    );

  const participantActivity =
    Array.isArray(
      data.participantActivity
    )
      ? data.participantActivity
      : [];

  const participantActivityDate =
    data.participantActivityDate ??
    "";

  const flowRows =
    Array.isArray(
      raw(data)?.flowTrend
    )
      ? raw(data).flowTrend
          .filter(
            (r: any) =>
              Array.isArray(r) &&
              r.length >= 3 &&
              typeof r[0] ===
                "string"
          )
          .map(
            (r: any) => [
              String(r[0]),
              Number(r[1]) || 0,
              Number(r[2]) || 0,
            ]
          )
      : [];

  const fiiRows =
    Array.isArray(
      raw(data)?.fiiPctTrend
    )
      ? raw(data).fiiPctTrend
          .filter(
            (r: any) =>
              Array.isArray(r) &&
              r.length >= 3 &&
              typeof r[0] ===
                "string"
          )
          .map(
            (r: any) => [
              String(r[0]),
              Number(r[1]) || 0,
              Number(r[2]) || 0,
            ]
          )
      : [];

  const flowChart = {
    labels: flowRows.map(
      (r: any) => r[0]
    ),

    datasets: [
      {
        label: "NET FII",
        data: flowRows.map(
          (r: any) => r[1]
        ),
        backgroundColor:
          "#ff4d4d",
      },

      {
        label: "NET DII",
        data: flowRows.map(
          (r: any) => r[2]
        ),
        backgroundColor:
          "#31d17c",
      },
    ],
  };

  const fiiChart = {
    labels: fiiRows.map(
      (r: any) => r[0]
    ),

    datasets: [
      {
        label: "LONG %",
        data: fiiRows.map(
          (r: any) => r[1]
        ),
        borderColor:
          "#31d17c",
        backgroundColor:
          "transparent",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.25,
      },

      {
        label: "SHORT %",
        data: fiiRows.map(
          (r: any) => r[2]
        ),
        borderColor:
          "#ff4d4d",
        backgroundColor:
          "transparent",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.25,
      },
    ],
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(360px,1fr))",
        gap: 14,
        marginTop: 16,
      }}
    >
      {/* =====================================================
          NET FII / DII
         ===================================================== */}

      <AnalysisCard>
        <div className="card-label">
          FII / DII
        </div>

        <h2
          style={{
            margin:
              "6px 0 4px",
          }}
        >
          Net Institutional Flow
        </h2>

        <div className="sub">
          Current live FII and
          DII net position
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 12,
            marginTop: 18,
          }}
        >
          <div
            className="card"
            style={{
              background:
                "#101820",
            }}
          >
            <div className="label">
              FII
            </div>

            <div
              className={`metric mono ${
                fii >= 0
                  ? "up"
                  : "down"
              }`}
              style={{
                marginTop: 7,
              }}
            >
              {fmtCr(fii)}
            </div>

            <div className="sub">
              {fii >= 0
                ? "NET BUY"
                : "NET SELL"}
            </div>
          </div>

          <div
            className="card"
            style={{
              background:
                "#101820",
            }}
          >
            <div className="label">
              DII
            </div>

            <div
              className={`metric mono ${
                dii >= 0
                  ? "up"
                  : "down"
              }`}
              style={{
                marginTop: 7,
              }}
            >
              {fmtCr(dii)}
            </div>

            <div className="sub">
              {dii >= 0
                ? "NET BUY"
                : "NET SELL"}
            </div>
          </div>
        </div>

        <div
          style={{
            position:
              "relative",
            width: "100%",
            height: 320,
            marginTop: 18,
          }}
        >
          {flowRows.length ? (
            <Bar
              data={flowChart}
              options={barOptions(
                "₹ Cr"
              )}
            />
          ) : (
            <EmptyState
              text="No FII/DII flow trend available."
            />
          )}
        </div>
      </AnalysisCard>

      {/* =====================================================
          FII FUTURES
         ===================================================== */}

      <AnalysisCard>
        <div className="card-label">
          FII FUTURES
        </div>

        <h2
          style={{
            margin:
              "6px 0 4px",
          }}
        >
          FII Long / Short
        </h2>

        <div className="sub">
          Futures long and short
          percentage trend
        </div>

        <div
          style={{
            position:
              "relative",
            width: "100%",
            height: 320,
            marginTop: 18,
          }}
        >
          {fiiRows.length ? (
            <Line
              data={fiiChart}
              options={lineOptions(
                "PERCENT"
              )}
            />
          ) : (
            <EmptyState
              text="No FII long/short trend available."
            />
          )}
        </div>
      </AnalysisCard>

      {/* =====================================================
          PARTICIPANT ACTIVITY
         ===================================================== */}

      <AnalysisCard>
        <div className="card-label">
          PARTICIPANT ACTIVITY
        </div>

        <h2
          style={{
            margin:
              "6px 0 4px",
          }}
        >
          FII / DII / PRO / RETAIL
        </h2>

        <div className="sub">
          {participantActivityDate
            ? `${participantActivityDate} - FII DII FNO/Cash Data`
            : "Latest NSE participant activity"}
        </div>

        <div
          style={{
            marginTop: 18,
            width: "100%",
            overflowX: "auto",
          }}
        >
          {participantActivity.length ? (
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: 720,
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding:
                        "10px 12px",
                      borderBottom:
                        "1px solid #26323d",
                      color: "#9aa7b2",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    PARTICIPANT
                  </th>

                  <th
                    style={{
                      textAlign: "left",
                      padding:
                        "10px 12px",
                      borderBottom:
                        "1px solid #26323d",
                      color: "#9aa7b2",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    SEGMENT
                  </th>

                  <th
                    style={{
                      textAlign: "right",
                      padding:
                        "10px 12px",
                      borderBottom:
                        "1px solid #26323d",
                      color: "#9aa7b2",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    CHANGE
                  </th>

                  <th
                    style={{
                      textAlign: "left",
                      padding:
                        "10px 12px",
                      borderBottom:
                        "1px solid #26323d",
                      color: "#9aa7b2",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    ACTIVITY
                  </th>

                  <th
                    style={{
                      textAlign: "center",
                      padding:
                        "10px 12px",
                      borderBottom:
                        "1px solid #26323d",
                      color: "#9aa7b2",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    VIEWS
                  </th>
                </tr>
              </thead>

              <tbody>
                {participantActivity.map(
                  (row, index) => {
                    const participant =
                      String(
                        row.participant ??
                          ""
                      );

                    const change =
                      Number(
                        row.change ?? 0
                      );

                    const views =
                      String(
                        row.views ?? ""
                      );

                    const participantBg =
                      participant ===
                      "FII"
                        ? "#24183a"
                        : participant ===
                            "PRO"
                          ? "#123331"
                          : participant ===
                              "DII"
                            ? "#3a2818"
                            : participant ===
                                "RETAIL"
                              ? "#381c2d"
                              : "#101820";

                    const valueColor =
                      change >= 0
                        ? "#31d17c"
                        : "#ff4d4d";

                    const viewColor =
                      views ===
                      "Bullish"
                        ? "#31d17c"
                        : "#ff4d4d";

                    return (
                      <tr
                        key={`${participant}-${row.segment}-${index}`}
                      >
                        <td
                          style={{
                            padding:
                              "9px 12px",
                            borderBottom:
                              "1px solid #202a34",
                            fontWeight: 700,
                            color:
                              "#e8eef3",
                            background:
                              participantBg,
                          }}
                        >
                          {participant}
                        </td>

                        <td
                          style={{
                            padding:
                              "9px 12px",
                            borderBottom:
                              "1px solid #202a34",
                            color:
                              "#dce5eb",
                          }}
                        >
                          {row.segment}
                        </td>

                        <td
                          className="mono"
                          style={{
                            padding:
                              "9px 12px",
                            borderBottom:
                              "1px solid #202a34",
                            textAlign:
                              "right",
                            fontWeight: 700,
                            color:
                              valueColor,
                          }}
                        >
                          {change >= 0
                            ? "+"
                            : ""}
                          {change.toLocaleString(
                            "en-IN"
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              "9px 12px",
                            borderBottom:
                              "1px solid #202a34",
                            color:
                              "#dce5eb",
                          }}
                        >
                          {row.activity}
                        </td>

                        <td
                          style={{
                            padding:
                              "9px 12px",
                            borderBottom:
                              "1px solid #202a34",
                            textAlign:
                              "center",
                            fontWeight: 700,
                            color:
                              viewColor,
                          }}
                        >
                          {views}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          ) : (
            <EmptyState
              text="No participant activity data available."
            />
          )}
        </div>
      </AnalysisCard>
    </div>
  );
}

/* ============================================================
   SNAPSHOT
   ============================================================ */

function Snapshot({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: SymbolName;
}) {
  const index =
    getIndex(data, symbol);

  if (!index) {
    return null;
  }

  const future =
    Number(
      index.future ?? 0
    );

  const vwap =
    Number(
      index.vwap ?? 0
    );

  let futureText =
    "NO DATA";

  if (
    future > 0 &&
    vwap > 0
  ) {
    if (future > vwap) {
      futureText =
        "ABOVE VWAP";
    } else if (
      future < vwap
    ) {
      futureText =
        "BELOW VWAP";
    } else {
      futureText =
        "AT VWAP";
    }
  }

  return (
    <AnalysisCard
      style={{
        marginTop: 16,
        marginBottom: 30,
      }}
    >
      <div className="card-label">
        {symbol} SNAPSHOT
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(145px,1fr))",
          gap: 14,
          marginTop: 15,
        }}
      >
        <div>
          <div className="label">
            SPOT
          </div>

          <div className="smallmetric mono">
            {fmt(
              index.spot
            )}
          </div>
        </div>

        <div>
          <div className="label">
            FUTURE
          </div>

          <div className="smallmetric mono">
            {fmt(
              index.future
            )}
          </div>
        </div>

        <div>
          <div className="label">
            VWAP
          </div>

          <div className="smallmetric mono">
            {fmt(
              index.vwap
            )}
          </div>
        </div>

        <div>
          <div className="label">
            ATM
          </div>

          <div className="smallmetric mono">
            {fmtStrike(
              index.atm
            )}
          </div>
        </div>

        <div>
          <div className="label">
            PCR OI
          </div>

          <div className="smallmetric mono">
            {fmt(
              index.pcrOI,
              4
            )}
          </div>
        </div>

        <div>
          <div className="label">
            PCR COI
          </div>

          <div className="smallmetric mono">
            {fmt(
              index.pcrCOI,
              4
            )}
          </div>
        </div>

        <div>
          <div className="label">
            CHANGE
          </div>

          <div
            className={`smallmetric mono ${
              index.chgPct >= 0
                ? "up"
                : "down"
            }`}
          >
            {signed(
              index.chgPct
            )}
            %
          </div>
        </div>

        <div>
          <div className="label">
            FUTURE vs VWAP
          </div>

          <div
            className={`smallmetric ${
              futureText ===
              "ABOVE VWAP"
                ? "up"
                : futureText ===
                  "BELOW VWAP"
                ? "down"
                : ""
            }`}
          >
            {futureText}
          </div>
        </div>
      </div>
    </AnalysisCard>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems:
          "center",
        justifyContent:
          "center",
        textAlign: "center",
        color: "#7f8d98",
        fontSize: 12,
        border:
          "1px dashed #293640",
        borderRadius: 8,
        background:
          "rgba(255,255,255,.01)",
        padding: 20,
      }}
    >
      {text}
    </div>
  );
}

/* ============================================================
   COMPARE ALL
   ============================================================ */

function CompareAll({
  data,
  type,
}: {
  data: MarketData;
  type: AnalysisType;
}) {
  if (
    type === "OPTION CHAIN"
  ) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(280px,1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {SYMBOLS.map(
          (symbol) => {
            const index =
              getIndex(
                data,
                symbol
              );

            const rows =
              getStrikeRows(
                data,
                symbol,
                "strikeOI"
              );

            const filtered =
              filterStrikes(
                rows,
                index,
                3
              );

            return (
              <AnalysisCard
                key={symbol}
              >
                <div
                  className="card-label"
                >
                  {symbol}
                </div>

                <h3>
                  ATM OI
                </h3>

                <div className="sub">
                  ATM{" "}
                  {fmtStrike(
                    index?.atm
                  )}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    overflowX:
                      "auto",
                  }}
                >
                  <table
                    style={{
                      width:
                        "100%",
                      borderCollapse:
                        "collapse",
                      fontSize: 10,
                    }}
                  >
                    <thead>
                      <tr>
                        <th>
                          STRIKE
                        </th>
                        <th>
                          CALL OI
                        </th>
                        <th>
                          PUT OI
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map(
                        (
                          row
                        ) => (
                          <tr
                            key={
                              row[0]
                            }
                          >
                            <td className="mono">
                              {fmtStrike(
                                row[0]
                              )}
                            </td>

                            <td
                              className="mono"
                              style={{
                                color:
                                  "#ff5c57",
                              }}
                            >
                              {fmtInt(
                                row[1]
                              )}
                            </td>

                            <td
                              className="mono"
                              style={{
                                color:
                                  "#31d17c",
                              }}
                            >
                              {fmtInt(
                                row[2]
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </AnalysisCard>
            );
          }
        )}
      </div>
    );
  }

  if (
    type === "BIG PLAYER"
  ) {
    return (
      <BigPlayerPanel
        data={data}
        symbols={SYMBOLS}
      />
    );
  }

  if (
    type === "VIX"
  ) {
    return (
      <VixPanel data={data} />
    );
  }

  if (
    type === "FII / DII"
  ) {
    return (
      <FiiDiiPanel
        data={data}
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(430px,1fr))",
        gap: 14,
        marginTop: 16,
      }}
    >
      {SYMBOLS.map(
        (symbol) => (
          <div key={symbol}>
                  {type ===
      "OPEN INTEREST" ? (
        <OpenInterestPanel
          data={data}
          symbol={
            symbol
          }
        />
      ) : type ===
        "CHANGE OF OPEN INTEREST" ? (
        <CoiStrikePanel
          data={data}
          symbol={
            symbol
          }
        />
      ) : type ===
        "PCR" ? (
              <PcrPanel
                data={data}
                symbol={
                  symbol
                }
              />
            ) : type ===
              "COI CHANGE" ? (
              <CoiTrendPanel
                data={data}
                symbol={
                  symbol
                }
              />
            ) : type ===
              "STRADDLE" ? (
              <StraddlePanel
                data={data}
                symbol={
                  symbol
                }
              />
            ) : (
              <PricePanel
                data={data}
                symbol={
                  symbol
                }
              />
            )}
          </div>
        )
      )}
    </div>
  );
}

/* ============================================================
   MAIN ANALYSIS
   ============================================================ */

export default function Analysis({
  data,
}: Props) {
  const [
    symbol,
    setSymbol,
  ] = useState<SelectedSymbol>(
    "NIFTY"
  );

  const [
    type,
    setType,
  ] =
    useState<AnalysisType>(
      "OPTION CHAIN"
    );

  const isCompare =
    symbol ===
    "COMPARE ALL";

  const currentIndex =
    !isCompare
      ? getIndex(
          data,
          symbol as SymbolName
        )
      : undefined;

  return (
    <section
      className="page-workspace"
      style={{
        width: "100%",
        paddingBottom: 30,
        minWidth: 0,
      }}
    >
      {/* =====================================================
          HEADER
         ===================================================== */}

      <div
        className="page-heading"
        style={{
          marginBottom: 14,
        }}
      >
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Analysis
          </h1>

          <div className="sub">
            Detailed option analysis
            using the live JSON
            exporter.
          </div>
        </div>

        <div className="page-status">
          LIVE DATA
        </div>
      </div>

      {/* =====================================================
          INDEX SELECTOR
         ===================================================== */}

      <AnalysisCard
        style={{
          marginTop: 12,
          padding: 14,
        }}
      >
        <div className="card-label">
          SELECT INDEX
        </div>

        <ControlBar>
          {SYMBOLS.map(
            (item) => (
              <ControlButton
                key={item}
                active={
                  symbol === item
                }
                label={item}
                color={
                  INDEX_COLORS[
                    item
                  ]
                }
                onClick={() =>
                  setSymbol(
                    item
                  )
                }
              />
            )
          )}

          <ControlButton
            active={isCompare}
            label="COMPARE ALL"
            color="#9b8cff"
            onClick={() =>
              setSymbol(
                "COMPARE ALL"
              )
            }
          />
        </ControlBar>
      </AnalysisCard>

      {/* =====================================================
          ANALYSIS TYPE
         ===================================================== */}

      <AnalysisCard
        style={{
          marginTop: 10,
          padding: 14,
        }}
      >
        <div className="card-label">
          ANALYSIS TYPE
        </div>

        <ControlBar>
          {ANALYSIS_TYPES.map(
            (item) => (
              <ControlButton
                key={item}
                active={
                  type === item
                }
                label={item}
                color="#00d4ff"
                onClick={() =>
                  setType(item)
                }
              />
            )
          )}
        </ControlBar>
      </AnalysisCard>

      {/* =====================================================
          QUICK SELECTED INDEX STATUS
         ===================================================== */}

      {!isCompare &&
        currentIndex && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(150px,1fr))",
              gap: 10,
              marginTop: 12,
            }}
          >
            <div className="card">
              <div className="label">
                SPOT
              </div>

              <div className="smallmetric mono">
                {fmt(
                  currentIndex.spot
                )}
              </div>
            </div>

            <div className="card">
              <div className="label">
                ATM
              </div>

              <div className="smallmetric mono">
                {fmtStrike(
                  currentIndex.atm
                )}
              </div>
            </div>

            <div className="card">
              <div className="label">
                PCR OI
              </div>

              <div className="smallmetric mono">
                {fmt(
                  currentIndex.pcrOI,
                  4
                )}
              </div>
            </div>

            <div className="card">
              <div className="label">
                PCR COI
              </div>

              <div className="smallmetric mono">
                {fmt(
                  currentIndex.pcrCOI,
                  4
                )}
              </div>
            </div>

            <div className="card">
              <div className="label">
                CHANGE
              </div>

              <div
                className={`smallmetric mono ${
                  currentIndex.chgPct >=
                  0
                    ? "up"
                    : "down"
                }`}
              >
                {signed(
                  currentIndex.chgPct
                )}
                %
              </div>
            </div>
          </div>
        )}

      {/* =====================================================
          WORKSPACE
         ===================================================== */}

      {!isCompare &&
      type ===
        "OPTION CHAIN" ? (
        <OptionChainPanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : isCompare ? (
        <CompareAll
          data={data}
          type={type}
        />
      ) : type ===
        "OPEN INTEREST" ? (
        <OpenInterestPanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "CHANGE OF OPEN INTEREST" ? (
        <CoiStrikePanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "PCR" ? (
        <PcrPanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "COI CHANGE" ? (
        <CoiTrendPanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "STRADDLE" ? (
        <StraddlePanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "VIX" ? (
        <VixPanel
          data={data}
        />
      ) : type ===
        "SPOT/FUTURE/VWAP" ? (
        <PricePanel
          data={data}
          symbol={
            symbol as SymbolName
          }
        />
      ) : type ===
        "BIG PLAYER" ? (
        <BigPlayerPanel
          data={data}
          symbols={[
            symbol as SymbolName,
          ]}
        />
      ) : (
        <FiiDiiPanel
          data={data}
        />
      )}

      {/* =====================================================
          SNAPSHOT
         ===================================================== */}

      {!isCompare &&
        type !==
          "OPTION CHAIN" && (
          <Snapshot
            data={data}
            symbol={
              symbol as SymbolName
            }
          />
        )}

      {/* =====================================================
          DATA STATUS
         ===================================================== */}

      <AnalysisCard
        style={{
          marginTop: 14,
        }}
      >
        <div className="card-label">
          DATA STATUS
        </div>

        <div
          className="sub"
          style={{
            marginTop: 9,
            lineHeight: 1.8,
          }}
        >
          {isCompare ? (
            <>
              Comparison mode ·
              showing all four
              indices.
            </>
          ) : (
            <>
              Selected index:{" "}
              <strong>
                {symbol}
              </strong>
              {" · "}
              Analysis:{" "}
              <strong>
                {type}
              </strong>
            </>
          )}

          <br />

          Dashboard timestamp:{" "}
          <strong>
            {data.asOf || "-"}
          </strong>

          <br />

          Market:{" "}
          <strong
            className={
              data.marketOpen
                ? "up"
                : "down"
            }
          >
            {data.marketOpen
              ? "OPEN"
              : "CLOSED"}
          </strong>
        </div>
      </AnalysisCard>
    </section>
  );
}