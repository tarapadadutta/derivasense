"use client";

import { useEffect, useMemo, useState } from "react";

type CategoryKey = "RR" | "RS" | "SR" | "SS";

type OIRow = {
  symbol?: string;
  instrument?: string;
  expiryDate?: string;
  strikePrice?: number | string;
  optionType?: string;
  ltp?: number | string;
  prevClose?: number | string;
  pChange?: number | string;
  latestOI?: number | string;
  prevOI?: number | string;
  changeInOI?: number | string;
  pChangeInOI?: number | string;
  volume?: number | string;
  underlyingValue?: number | string;
  identifier?: string;
  instrumentType?: string;
};

type OIResponse = {
  source?: string;
  asOf?: string | null;
  tradingDate?: string | null;
  marketOpen?: boolean;
  stale?: boolean;
  cached?: boolean;
  message?: string;
  error?: string;
  categories?: Partial<Record<CategoryKey, OIRow[]>>;
};

const CATEGORY_INFO: Record<
  CategoryKey,
  { title: string; meaning: string }
> = {
  RR: { title: "Rise in OI + Rise in Price", meaning: "Long build-up" },
  RS: { title: "Rise in OI + Slide in Price", meaning: "Short build-up" },
  SR: { title: "Slide in OI + Rise in Price", meaning: "Short covering" },
  SS: { title: "Slide in OI + Slide in Price", meaning: "Long unwinding" },
};

const keys: CategoryKey[] = ["RR", "RS", "SR", "SS"];

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function formatNumber(value: unknown, decimals = 0): string {
  const n = numberValue(value);
  if (n === null) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSigned(value: unknown, decimals = 2): string {
  const n = numberValue(value);
  if (n === null) return "—";
  const prefix = n > 0 ? "+" : "";
  return prefix + n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function uniqueValues(rows: OIRow[], field: keyof OIRow): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => String(row[field] ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

const selectStyle: React.CSSProperties = {
  background: "#111827",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 6,
  padding: "8px 10px",
  minWidth: 120,
  maxWidth: "100%",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "right",
  whiteSpace: "nowrap",
  color: "#9ca3af",
  fontSize: 11,
  fontWeight: 600,
  borderBottom: "1px solid #374151",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "right",
  whiteSpace: "nowrap",
  fontSize: 12,
  borderBottom: "1px solid #1f2937",
};

export default function OISpurtsPanel() {
  const [data, setData] = useState<OIResponse | null>(null);
  const [active, setActive] = useState<CategoryKey>("RR");
  const [symbol, setSymbol] = useState("ALL");
  const [instrument, setInstrument] = useState("ALL");
  const [expiry, setExpiry] = useState("ALL");
  const [optionType, setOptionType] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/market/oi-spurts", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to load OI Spurts.");
        }

        if (mounted) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "OI Spurts request failed."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 60000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const allRows = data?.categories?.[active] ?? [];

  const symbols = useMemo(() => uniqueValues(allRows, "symbol"), [allRows]);
  const instruments = useMemo(
    () => uniqueValues(allRows, "instrument"),
    [allRows]
  );
  const expiries = useMemo(
    () => uniqueValues(allRows, "expiryDate"),
    [allRows]
  );

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) => {
        return (
          (symbol === "ALL" || row.symbol === symbol) &&
          (instrument === "ALL" || row.instrument === instrument) &&
          (expiry === "ALL" || row.expiryDate === expiry) &&
          (optionType === "ALL" || row.optionType === optionType)
        );
      }),
    [allRows, symbol, instrument, expiry, optionType]
  );

  function changeCategory(key: CategoryKey) {
    setActive(key);
    setSymbol("ALL");
    setInstrument("ALL");
    setExpiry("ALL");
    setOptionType("ALL");
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid #374151",
        borderRadius: 10,
        background: "#111827",
        color: "#e5e7eb",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
            NSE OI SPURTS
          </h2>
          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 5 }}>
            Four contract-level open-interest and price classifications
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              padding: "5px 9px",
              borderRadius: 5,
              background: data?.marketOpen ? "#064e3b" : "#374151",
              color: data?.marketOpen ? "#a7f3d0" : "#d1d5db",
            }}
          >
            {data?.marketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "5px 9px",
              borderRadius: 5,
              background: data?.stale ? "#78350f" : "#064e3b",
              color: data?.stale ? "#fde68a" : "#a7f3d0",
            }}
          >
            {data?.stale ? "STALE / CACHED" : "CURRENT SNAPSHOT"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => changeCategory(key)}
            style={{
              padding: "11px 6px",
              borderRadius: 7,
              border: active === key ? "1px solid #60a5fa" : "1px solid #374151",
              background: active === key ? "#1e3a5f" : "#1f2937",
              color: "#f9fafb",
              cursor: "pointer",
              minWidth: 0,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15 }}>{key}</div>
            <div style={{ fontSize: 10, marginTop: 4, color: "#cbd5e1" }}>
              {CATEGORY_INFO[key].meaning}
            </div>
            <div style={{ fontSize: 10, marginTop: 3, color: "#9ca3af" }}>
              {data?.categories?.[key]?.length ?? 0} stocks/contracts
            </div>
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 9,
          alignItems: "center",
          marginBottom: 13,
        }}
      >
        <select
          aria-label="Filter symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={selectStyle}
        >
          <option value="ALL">All Symbols</option>
          {symbols.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter instrument"
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          style={selectStyle}
        >
          <option value="ALL">All Instruments</option>
          {instruments.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter expiry"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          style={selectStyle}
        >
          <option value="ALL">All Expiries</option>
          {expiries.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter option type"
          value={optionType}
          onChange={(e) => setOptionType(e.target.value)}
          style={selectStyle}
        >
          <option value="ALL">CE + PE + Futures</option>
          <option value="CE">CE</option>
          <option value="PE">PE</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setSymbol("ALL");
            setInstrument("ALL");
            setExpiry("ALL");
            setOptionType("ALL");
          }}
          style={{
            ...selectStyle,
            cursor: "pointer",
            minWidth: 80,
          }}
        >
          Reset
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: "#9ca3af",
          marginBottom: 10,
        }}
      >
        <span>
          {CATEGORY_INFO[active].title} — {CATEGORY_INFO[active].meaning}
        </span>
        <span>
          NSE timestamp: {data?.asOf || "Not available"}
          {data?.tradingDate ? ` | Trading date: ${data.tradingDate}` : ""}
        </span>
      </div>

      {loading && !data && (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
          Loading NSE OI Spurts...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 10,
            borderRadius: 6,
            background: "#451a1a",
            color: "#fecaca",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {!loading && data?.message && (
        <div style={{ color: "#fbbf24", fontSize: 12, marginBottom: 10 }}>
          {data.message}
        </div>
      )}

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table
          style={{
            width: "100%",
            minWidth: 1120,
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {[
                ["Symbol", "left"],
                ["Instrument", "left"],
                ["Expiry", "left"],
                ["Strike", "right"],
                ["CE / PE", "center"],
                ["LTP", "right"],
                ["Contract Price %", "right"],
                ["OI Change", "right"],
                ["OI Change %", "right"],
                ["Volume", "right"],
                ["Underlying", "right"],
              ].map(([heading, align]) => (
                <th
                  key={heading}
                  style={{
                    ...thStyle,
                    textAlign: align as React.CSSProperties["textAlign"],
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={row.identifier || `${row.symbol}-${row.expiryDate}-${row.strikePrice}-${row.optionType}-${index}`}>
                <td style={{ ...tdStyle, textAlign: "left", fontWeight: 700 }}>
                  {row.symbol || "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "left" }}>
                  {row.instrument || row.instrumentType || "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "left" }}>
                  {row.expiryDate || "—"}
                </td>
                <td style={tdStyle}>{formatNumber(row.strikePrice, 2)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {row.optionType || "—"}
                </td>
                <td style={tdStyle}>{formatNumber(row.ltp, 2)}</td>
                <td
                  style={{
                    ...tdStyle,
                    color: (numberValue(row.pChange) ?? 0) >= 0 ? "#34d399" : "#f87171",
                  }}
                >
                  {formatSigned(row.pChange)}
                </td>
                <td style={tdStyle}>{formatSigned(row.changeInOI, 0)}</td>
                <td style={tdStyle}>{formatSigned(row.pChangeInOI)}</td>
                <td style={tdStyle}>{formatNumber(row.volume)}</td>
                <td style={tdStyle}>{formatNumber(row.underlyingValue, 2)}</td>
              </tr>
            ))}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    padding: 28,
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: 12,
                  }}
                >
                  No contracts available for this category and filter selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid #374151",
          color: "#9ca3af",
          fontSize: 10,
          lineHeight: 1.6,
        }}
      >
        Source: {data?.source || "NSE India"}. Contract Price % refers to the
        traded instrument's price change, not necessarily the underlying
        stock's price change. Data refreshes every 60 seconds. A cached or
        stale snapshot is identified separately and must not be treated as live.
      </div>
    </section>
  );
}
