"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { Line } from "react-chartjs-2";

import { fetchMarketData } from "../lib/marketData";
import type { MarketData } from "../lib/marketTypes";

import Header from "../components/Header";
import Sidebar, { Page } from "../components/Sidebar";
import Charts from "../components/Charts";
import Analysis from "../components/Analysis";
import Strategy from "../components/Strategy";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

/* ============================================================
   TYPES
   ============================================================ */

type IndexName =
  | "NIFTY"
  | "BANKNIFTY"
  | "FINNIFTY"
  | "SENSEX";

/* ============================================================
   PAGE LIST
   ============================================================ */

const PAGES: Array<[Page, string, string]> = [
  ["dashboard", "⌂", "Dashboard"],
  ["charts", "◒", "Charts"],
  ["analysis", "▦", "Analysis"],
  ["strategy", "◆", "Strategy"],
  ["watchlist", "★", "Watchlist"],
  ["market", "◫", "Market"],
  ["settings", "⚙", "Settings"],
];

const INDEXES: IndexName[] = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
];

/* ============================================================
   FORMATTERS
   ============================================================ */

function fmt(
  value: unknown,
  decimals = 2
): string {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function sign(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "";
  }

  return n > 0 ? "+" : "";
}

/* ============================================================
   INDEX NORMALIZATION
   Supports:

   NIFTY
   NIFTY 50
   BANKNIFTY
   BANK NIFTY
   FINNIFTY
   FIN NIFTY
   SENSEX
   ============================================================ */

function normalizeSymbol(
  value: unknown
): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/_/g, "");
}

function getIndex(
  data: MarketData,
  symbol: IndexName
): any {
  const raw: any = data.indices as any;

  if (!raw) {
    return undefined;
  }

  if (Array.isArray(raw)) {
    return raw.find(
      (item: any) =>
        normalizeSymbol(item?.symbol) ===
        normalizeSymbol(symbol)
    );
  }

  if (
    typeof raw === "object" &&
    raw[symbol]
  ) {
    return raw[symbol];
  }

  return undefined;
}

/* ============================================================
   SIGNAL
   ============================================================ */

function getSignal(index: any): string {
  if (!index) {
    return "—";
  }

  const pcr =
    Number(index.pcrCOI ?? 0);

  const change =
    Number(index.chgPct ?? 0);

  if (pcr >= 2 && change >= 0) {
    return "BULLISH";
  }

  if (pcr < 1 && change < 0) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

/* ============================================================
   EMPTY DATA HELPERS
   ============================================================ */

const EMPTY_STATS = {
  advances: 0,
  declines: 0,
  unchanged: 0,
};

/* ============================================================
   SECTION HEADER
   ============================================================ */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        marginBottom: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 800,
        }}
      >
        {title}
      </h2>

      {subtitle ? (
        <div
          className="sub"
          style={{
            marginTop: 5,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================
   INDEX CARD
   ============================================================ */

function IndexCard({
  data,
  symbol,
}: {
  data: MarketData;
  symbol: IndexName;
}) {
  const index = getIndex(
    data,
    symbol
  );

  if (!index) {
    return (
      <div className="card">
        <div className="label">
          {symbol}
        </div>

        <div className="sub">
          No data
        </div>
      </div>
    );
  }

  const change =
    Number(index.chg ?? 0);

  const changePct =
    Number(index.chgPct ?? 0);

  return (
    <div className="card">
      <div className="label">
        {symbol}
      </div>

      <div
        className="metric mono"
        style={{
          marginTop: 6,
        }}
      >
        {fmt(index.spot)}
      </div>

      <div
        className={`mono ${
          change >= 0
            ? "up"
            : "down"
        }`}
        style={{
          marginTop: 4,
          fontSize: 13,
        }}
      >
        {sign(change)}
        {fmt(change)}
        {"  "}
        (
        {sign(changePct)}
        {fmt(changePct)}
        %)
      </div>

      <div className="hr" />

      <div className="row">
        <span className="sub">
          Future
        </span>

        <b className="mono">
          {fmt(index.future)}
        </b>
      </div>

      <div
        className="row"
        style={{
          marginTop: 6,
        }}
      >
        <span className="sub">
          VWAP
        </span>

        <b className="mono">
          {fmt(index.vwap)}
        </b>
      </div>

      <div
        className="row"
        style={{
          marginTop: 6,
        }}
      >
        <span className="sub">
          PCR OI
        </span>

        <b className="mono">
          {fmt(index.pcrOI, 2)}
        </b>
      </div>

      <div
        className="row"
        style={{
          marginTop: 6,
        }}
      >
        <span className="sub">
          PCR COI
        </span>

        <b className="mono">
          {fmt(index.pcrCOI, 2)}
        </b>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          fontWeight: 800,
        }}
        className={
          getSignal(index) ===
          "BULLISH"
            ? "up"
            : getSignal(index) ===
              "BEARISH"
            ? "down"
            : ""
        }
      >
        {getSignal(index)}
      </div>
    </div>
  );
}

/* ============================================================
   VIX CARD + CHART
   ============================================================ */

function VixPanel({
  data,
}: {
  data: MarketData;
}) {
  const rows =
    Array.isArray(data.vixTrend)
      ? data.vixTrend.filter(
          (r: any) =>
            Array.isArray(r) &&
            r.length >= 2 &&
            r[0] != null &&
            Number.isFinite(
              Number(r[1])
            )
        )
      : [];

  const vix =
    Number(data.vix?.value ?? 0);

  const vixChg =
    Number(data.vix?.chg ?? 0);

  const vixChgPct =
    Number(
      data.vix?.chgPct ?? 0
    );

  const note =
    vix < 15
      ? "Low volatility regime"
      : vix < 20
      ? "Moderate volatility"
      : "Elevated volatility";

  const chartData = {
    labels: rows.map(
      (r: any) => String(r[0])
    ),

    datasets: [
      {
        label: "INDIA VIX",

        data: rows.map(
          (r: any) => Number(r[1])
        ),

        borderColor: "#e5aa45",

        backgroundColor:
          "rgba(229,170,69,0.08)",

        borderWidth: 2,

        fill: true,

        pointRadius: 2,

        pointHoverRadius: 5,

        tension: 0.25,
      },
    ],
  };

  const options: any = {
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
          usePointStyle: true,

          boxWidth: 8,

          color: "#dce5eb",
        },
      },

      tooltip: {
        enabled: true,

        callbacks: {
          label: (
            context: any
          ) =>
            `INDIA VIX: ${fmt(
              context.raw,
              2
            )}`,
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#8d9ba7",

          autoSkip: true,

          maxTicksLimit: 12,

          maxRotation: 45,

          minRotation: 0,
        },

        grid: {
          display: false,
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
            "rgba(255,255,255,0.07)",
        },

        title: {
          display: true,

          text: "INDIA VIX",

          color: "#9aa7b2",
        },
      },
    },
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="label">
            INDIA VIX
          </div>

          <div
            className="metric mono"
            style={{
              marginTop: 5,
            }}
          >
            {fmt(vix)}
          </div>

          <div className="sub">
            {note}
          </div>
        </div>

        <div
          className={`mono ${
            vixChg >= 0
              ? "up"
              : "down"
          }`}
        >
          {sign(vixChg)}
          {fmt(vixChg)}
          {"  "}
          (
          {sign(vixChgPct)}
          {fmt(vixChgPct)}
          %)
        </div>
      </div>

      <div
        style={{
          height: 250,
          marginTop: 15,
        }}
      >
        {rows.length >= 2 ? (
          <Line
            data={chartData}
            options={options}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border:
                "1px dashed var(--line)",
              borderRadius: 8,
            }}
          >
            <div className="sub">
              VIX trend data not available
            </div>
          </div>
        )}
      </div>
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
      data.fiidii?.netFII ?? 0
    );

  const dii =
    Number(
      data.fiidii?.netDII ?? 0
    );

  return (
    <div className="card">
      <SectionHeader
        title="FII / DII"
        subtitle="Institutional net cash-market flow"
      />

      <div className="grid2">
        <div
          className="card"
          style={{
            background:
              "var(--panel2)",
          }}
        >
          <div className="label">
            FII NET
          </div>

          <div
            className={`smallmetric mono ${
              fii >= 0
                ? "up"
                : "down"
            }`}
            style={{
              marginTop: 6,
            }}
          >
            ₹
            {fmt(
              Math.abs(fii),
              2
            )}{" "}
            Cr
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
              "var(--panel2)",
          }}
        >
          <div className="label">
            DII NET
          </div>

          <div
            className={`smallmetric mono ${
              dii >= 0
                ? "up"
                : "down"
            }`}
            style={{
              marginTop: 6,
            }}
          >
            ₹
            {fmt(
              Math.abs(dii),
              2
            )}{" "}
            Cr
          </div>

          <div className="sub">
            {dii >= 0
              ? "NET BUY"
              : "NET SELL"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SECTOR HEATMAP
   ============================================================ */

function SectorPanel({
  data,
}: {
  data: MarketData;
}) {
  const sectors =
    Array.isArray(data.sectors)
      ? data.sectors
      : [];

  return (
    <div className="card">
      <SectionHeader
        title="Sector Indices"
        subtitle="Sectoral market performance"
      />

      {!sectors.length ? (
        <div className="sub">
          No sector data available
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(170px,1fr))",
            gap: 8,
          }}
        >
          {sectors.map(
            (sector: any) => {
              const change =
                Number(
                  sector.chg ?? 0
                );

              const magnitude =
                Math.min(
                  0.85,
                  0.12 +
                    Math.abs(
                      change
                    ) /
                      4
                );

              return (
                <div
                  key={
                    String(
                      sector.name
                    )
                  }
                  style={{
                    padding:
                      "11px 12px",

                    border:
                      "1px solid var(--line)",

                    borderRadius: 7,

                    background:
                      change >= 0
                        ? `rgba(49,209,124,${magnitude})`
                        : `rgba(255,92,87,${magnitude})`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {String(
                      sector.name
                    ).replace(
                      /^NIFTY\s+/i,
                      ""
                    )}
                  </div>

                  <div
                    className={`mono ${
                      change >= 0
                        ? "up"
                        : "down"
                    }`}
                    style={{
                      marginTop: 5,
                      fontWeight: 800,
                    }}
                  >
                    {sign(change)}
                    {fmt(change)}
                    %
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TOP GAINERS / LOSERS
   ============================================================ */

function MoversPanel({
  title,
  rows,
  positive,
}: {
  title: string;
  rows: any[];
  positive: boolean;
}) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  return (
    <div className="card">
      <SectionHeader
        title={title}
        subtitle={
          positive
            ? "Strongest positive movers"
            : "Weakest negative movers"
        }
      />

      {!safeRows.length ? (
        <div className="sub">
          No data yet
        </div>
      ) : (
        <div>
          {safeRows
            .slice(0, 10)
            .map(
              (
                mover: any,
                index: number
              ) => {
                const change =
                  Number(
                    mover.chg ?? 0
                  );

                return (
                  <div
                    key={`${mover.symbol}-${index}`}
                    className="row"
                    style={{
                      padding:
                        "9px 0",

                      borderBottom:
                        index ===
                        safeRows.length -
                          1
                          ? "none"
                          : "1px solid var(--line)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {
                          mover.symbol
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                      }}
                    >
                      <div className="mono">
                        {fmt(
                          mover.price
                        )}
                      </div>

                      <div
                        className={`mono ${
                          change >= 0
                            ? "up"
                            : "down"
                        }`}
                        style={{
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {sign(
                          change
                        )}
                        {fmt(
                          change
                        )}
                        %
                      </div>
                    </div>
                  </div>
                );
              }
            )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MARKET BREADTH
   ============================================================ */

function BreadthPanel({
  data,
}: {
  data: MarketData;
}) {
  const stats =
    data.marketStats ??
    EMPTY_STATS;

  const advances =
    Number(
      stats.advances ?? 0
    );

  const declines =
    Number(
      stats.declines ?? 0
    );

  const unchanged =
    Number(
      stats.unchanged ?? 0
    );

  const net =
    advances - declines;

  return (
    <div className="card">
      <SectionHeader
        title="Market Breadth"
        subtitle={
          advances >= declines
            ? "More Advances than Declines points to broad-based strength; watch where volume in the Most Active tables is concentrated"
            : "More Declines than Advances points to broad-based weakness; watch where volume in the Most Active tables is concentrated"
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
        }}
      >
        <div
          className="card"
          style={{
            background:
              "var(--panel2)",
          }}
        >
          <div className="label">
            ADVANCES
          </div>

          <div
            className="smallmetric mono up"
            style={{
              marginTop: 5,
            }}
          >
            {fmtInt(advances)}
          </div>
        </div>

        <div
          className="card"
          style={{
            background:
              "var(--panel2)",
          }}
        >
          <div className="label">
            DECLINES
          </div>

          <div
            className="smallmetric mono down"
            style={{
              marginTop: 5,
            }}
          >
            {fmtInt(declines)}
          </div>
        </div>

        <div
          className="card"
          style={{
            background:
              "var(--panel2)",
          }}
        >
          <div className="label">
            UNCHANGED
          </div>

          <div
            className="smallmetric mono"
            style={{
              marginTop: 5,
            }}
          >
            {fmtInt(unchanged)}
          </div>
        </div>

        <div
          className="card"
          style={{
            background:
              "var(--panel2)",
          }}
        >
          <div className="label">
            NET
          </div>

          <div
            className={`smallmetric mono ${
              net >= 0
                ? "up"
                : "down"
            }`}
            style={{
              marginTop: 5,
            }}
          >
            {sign(net)}
            {fmtInt(net)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MOST ACTIVE OPTIONS
   Format:

   [contract, LTP, change, %change]
   ============================================================ */

function MostActiveTable({
  title,
  rows,
}: {
  title: string;
  rows: any[];
}) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  return (
    <div>
      <div
        className="label"
        style={{
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      {!safeRows.length ? (
        <div className="sub">
          No data yet
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              tableLayout:
                "fixed",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: "58%",
                  }}
                >
                  CONTRACT
                </th>

                <th
                  style={{
                    width: "18%",
                  }}
                >
                  LTP
                </th>

                <th
                  style={{
                    width: "24%",
                  }}
                >
                  % CHNG
                </th>
              </tr>
            </thead>

            <tbody>
              {safeRows
                .slice(0, 10)
                .map(
                  (
                    row: any,
                    index: number
                  ) => {
                    const contract =
                      String(
                        row?.[0] ??
                          "—"
                      );

                    const ltp =
                      Number(
                        row?.[1] ??
                          0
                      );

                    const pct =
                      Number(
                        row?.[3] ??
                          0
                      );

                    return (
                      <tr
                        key={`${contract}-${index}`}
                      >
                        <td
                          title={
                            contract
                          }
                          style={{
                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {contract}
                        </td>

                        <td className="mono">
                          {fmt(ltp)}
                        </td>

                        <td
                          className={`mono ${
                            pct >= 0
                              ? "up"
                              : "down"
                          }`}
                        >
                          {sign(pct)}
                          {fmt(pct)}
                          %
                        </td>
                      </tr>
                    );
                  }
                )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MOST ACTIVE PANEL
   ============================================================ */

function MostActivePanel({
  data,
}: {
  data: MarketData;
}) {
  const active =
    data.mostActive ?? {};

  return (
    <div className="card">
      <SectionHeader
        title="Market Activity"
        subtitle="Most active options by trading activity and open interest"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(3,minmax(0,1fr))",
          gap: 18,
        }}
      >
        <MostActiveTable
          title="MOST ACTIVE OPTION CALLS"
          rows={
            active.calls ?? []
          }
        />

        <MostActiveTable
          title="MOST ACTIVE OPTION PUTS"
          rows={
            active.puts ?? []
          }
        />

        <MostActiveTable
          title="MOST ACTIVE OPTIONS BY OI"
          rows={
            active.byOI ?? []
          }
        />
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function DashboardHome({
  data,
}: {
  data: MarketData;
}) {
  return (
    <section
      className="page-workspace"
      style={{
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}

      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Dashboard
          </h1>

          <div className="sub">
            Live market overview —
            indices, VIX, sectors,
            institutional flow,
            market breadth and
            most-active contracts.
          </div>
        </div>

        <div className="page-status">
          {data.marketOpen
            ? "LIVE DATA"
            : "MARKET CLOSED"}
        </div>
      </div>

      {/* INDEX CARDS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        {INDEXES.map(
          (symbol) => (
            <IndexCard
              key={symbol}
              data={data}
              symbol={symbol}
            />
          )
        )}
      </div>

      {/* VIX + FII/DII */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0,1.5fr) minmax(0,1fr)",
          gap: 12,
          marginTop: 12,
        }}
      >
        <VixPanel data={data} />

        <FiiDiiPanel
          data={data}
        />
      </div>

      {/* SECTORS */}

      <div
        style={{
          marginTop: 12,
        }}
      >
        <SectorPanel
          data={data}
        />
      </div>

      {/* GAINERS / LOSERS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2,minmax(0,1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <MoversPanel
          title="Top Gainers"
          rows={
            data.gainers ?? []
          }
          positive={true}
        />

        <MoversPanel
          title="Top Losers"
          rows={
            data.losers ?? []
          }
          positive={false}
        />
      </div>

      {/* MARKET BREADTH */}

      <div
        style={{
          marginTop: 12,
        }}
      >
        <BreadthPanel
          data={data}
        />
      </div>

      {/* MOST ACTIVE */}

      <div
        style={{
          marginTop: 12,
          marginBottom: 30,
        }}
      >
        <MostActivePanel
          data={data}
        />
      </div>
    </section>
  );
}

/* ============================================================
   WATCHLIST
   ============================================================ */

function Watchlist({
  data,
}: {
  data: MarketData;
}) {
  return (
    <section className="page-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Watchlist
          </h1>

          <div className="sub">
            Index watchlist and
            market signals.
          </div>
        </div>

        <div className="page-status">
          LIVE DATA
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 14,
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
          }}
        >
          <thead>
            <tr>
              <th>SYMBOL</th>
              <th>SPOT</th>
              <th>CHANGE</th>
              <th>%</th>
              <th>FUTURE</th>
              <th>VWAP</th>
              <th>PCR OI</th>
              <th>PCR COI</th>
              <th>SIGNAL</th>
            </tr>
          </thead>

          <tbody>
            {INDEXES.map(
              (symbol) => {
                const index =
                  getIndex(
                    data,
                    symbol
                  );

                const change =
                  Number(
                    index?.chg ?? 0
                  );

                const changePct =
                  Number(
                    index?.chgPct ??
                      0
                  );

                const signal =
                  getSignal(index);

                return (
                  <tr key={symbol}>
                    <td>
                      {symbol}
                    </td>

                    <td className="mono">
                      {fmt(
                        index?.spot
                      )}
                    </td>

                    <td
                      className={
                        change >= 0
                          ? "up"
                          : "down"
                      }
                    >
                      {sign(change)}
                      {fmt(change)}
                    </td>

                    <td
                      className={
                        changePct >= 0
                          ? "up"
                          : "down"
                      }
                    >
                      {sign(
                        changePct
                      )}
                      {fmt(
                        changePct
                      )}
                      %
                    </td>

                    <td className="mono">
                      {fmt(
                        index?.future
                      )}
                    </td>

                    <td className="mono">
                      {fmt(
                        index?.vwap
                      )}
                    </td>

                    <td className="mono">
                      {fmt(
                        index?.pcrOI,
                        2
                      )}
                    </td>

                    <td className="mono">
                      {fmt(
                        index?.pcrCOI,
                        2
                      )}
                    </td>

                    <td
                      className={
                        signal ===
                        "BULLISH"
                          ? "up"
                          : signal ===
                            "BEARISH"
                          ? "down"
                          : ""
                      }
                    >
                      {signal}
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================
   MARKET PAGE
   ============================================================ */

function MarketPage({
  data,
}: {
  data: MarketData;
}) {
  return (
    <section className="page-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Market
          </h1>

          <div className="sub">
            Market-wide information
            kept separate from
            index-specific option
            analysis.
          </div>
        </div>

        <div className="page-status">
          LIVE DATA
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
        }}
      >
        <BreadthPanel
          data={data}
        />
      </div>

      <div
        style={{
          marginTop: 12,
        }}
      >
        <SectorPanel
          data={data}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2,minmax(0,1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <MoversPanel
          title="Top Gainers"
          rows={
            data.gainers ?? []
          }
          positive={true}
        />

        <MoversPanel
          title="Top Losers"
          rows={
            data.losers ?? []
          }
          positive={false}
        />
      </div>

      <div
        style={{
          marginTop: 12,
        }}
      >
        <MostActivePanel
          data={data}
        />
      </div>
    </section>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */

function SettingsPage({
  data,
}: {
  data: MarketData;
}) {
  return (
    <section className="page-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PRO OPTIONS TERMINAL
          </div>

          <h1 className="page-title">
            Settings
          </h1>

          <div className="sub">
            Current terminal
            configuration.
          </div>
        </div>

        <div className="page-status">
          SYSTEM
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 14,
        }}
      >
        <div className="card-label">
          DATA ENGINE
        </div>

        <h3
          style={{
            marginTop: 8,
          }}
        >
          Live JSON Data
        </h3>

        <div
          className="sub"
          style={{
            marginTop: 8,
            lineHeight: 1.8,
          }}
        >
          Browser refresh interval:
          <strong>
            {" "}
            30 seconds
          </strong>
          <br />

          Source:
          <strong>
            {" "}
            dashboard_data.json
          </strong>
          <br />

          FII/DII source:
          <strong>
            {" "}
            fiidii_data.json
          </strong>
          <br />

          Last data timestamp:
          <strong>
            {" "}
            {data.asOf ||
              "—"}
          </strong>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   MAIN HOME COMPONENT
   ============================================================ */

export default function Home() {
  const [data, setData] =
    useState<MarketData | null>(
      null
    );

  const [page, setPage] =
    useState<Page>(
      "dashboard"
    );

  const [menuOpen, setMenuOpen] =
    useState(false);
  const [signInOpen, setSignInOpen] = useState(false);  

  const [lastRefresh, setLastRefresh] =
    useState<number | null>(
      null
    );

  /* ==========================================================
     LOAD DATA
     ========================================================== */

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const next =
          await fetchMarketData();

        if (!alive) {
          return;
        }

        setData(next);
        setLastRefresh(
          Date.now()
        );
      } catch (error) {
        console.error(
          "Market data refresh failed:",
          error
        );
      }
    }

    loadData();

    const timer =
      window.setInterval(
        loadData,
        30000
      );

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          loadData();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      alive = false;

      window.clearInterval(
        timer
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  /* ==========================================================
     PAGE CHANGE
     ========================================================== */

  const changePage = (
    next: Page
  ) => {
    setPage(next);
    setMenuOpen(false);
  };

  /* ==========================================================
     LOADING
     ========================================================== */

  if (!data) {
    return (
      <div className="app-shell">
        <Header
          indices={[]}
          marketOpen={false}
          asOf="Loading..."
          menuOpen={false}
          onMenu={() => {}}
          onSignIn={() => {}}
        />

        <div className="loading-screen">
          Loading market data...
        </div>
      </div>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="app-shell">
      {/* ======================================================
          HEADER
         ====================================================== */}

      <Header
        indices={data.indices}
        marketOpen={
          data.marketOpen
        }
        asOf={data.asOf}
        menuOpen={menuOpen}
        onMenu={() =>
          setMenuOpen(
            (value) =>
              !value
          )
        }
        onSignIn={() => {
          setSignInOpen(true);
        }}
      />

      {/* ======================================================
          SIDEBAR
         ====================================================== */}

      {menuOpen && (
        <>
          <div
            className="sidebar-overlay"
            onClick={() =>
              setMenuOpen(false)
            }
          />

          <Sidebar
            page={page}
            setPage={
              changePage
            }
            onSignIn={() => {
              setSignInOpen(true);
            }}
          />
        </>
      )}

      {/* ======================================================
          MAIN CONTENT
         ====================================================== */}

      <main className="content">
        {page ===
          "dashboard" && (
          <DashboardHome
            data={data}
          />
        )}

        {page === "charts" && (
          <Charts
            data={data}
          />
        )}

        {page ===
          "analysis" && (
          <Analysis
            data={data}
          />
        )}

        {page ===
          "strategy" && (
          <Strategy
            data={data}
          />
        )}

        {page ===
          "watchlist" && (
          <Watchlist
            data={data}
          />
        )}

        {page ===
          "market" && (
          <MarketPage
            data={data}
          />
        )}

        {page ===
          "settings" && (
          <SettingsPage
            data={data}
          />
        )}
      </main>
      {/* ======================================================
          SIGN IN MODAL
        ====================================================== */}

      {signInOpen && (
        <div
          className="signin-overlay"
          onClick={() => setSignInOpen(false)}
        >
          <div
            className="signin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="signin-modal-header">
              <div>
                <div className="eyebrow">
                  DERIVASENSE AI
                </div>

                <h2 className="signin-title">
                  Sign In
                </h2>

                <div className="sub">
                  Access your Pro Options Terminal
                </div>
              </div>

              <button
                className="signin-close"
                onClick={() => setSignInOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="signin-form">

              <label>
                EMAIL
              </label>

              <input
                type="email"
                placeholder="Enter your email"
              />

              <label>
                PASSWORD
              </label>

              <input
                type="password"
                placeholder="Enter your password"
              />

              <button
                className="signin-submit"
                onClick={() => {
                  alert("Sign-in authentication will be connected next.");
                }}
              >
                SIGN IN
              </button>

            </div>

            <div className="signin-modal-footer">
              Demo authentication interface
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          FOOTER
         ====================================================== */}

      <footer
        className="footer"
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <span>
          PRO OPTIONS TERMINAL
        </span>

        <span>
          DERIVASENSE AI
        </span>

        <span>
          {lastRefresh
            ? `Updated ${new Date(
                lastRefresh
              ).toLocaleTimeString(
                "en-IN"
              )}`
            : "Updating..."}
        </span>
      </footer>
    </div>
  );
}