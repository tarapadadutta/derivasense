"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScreenerStock } from "../lib/marketTypes";

type CategoryKey = "RR" | "RS" | "SR" | "SS";

type OIRow = {
  symbol?: string;
  instrumentType?: string;
  expiryDate?: string;
  ltp?: number | string;
  pChange?: number | string;
  changeInOI?: number | string;
  pChangeInOI?: number | string;
  volume?: number | string;
};

type OIData = {
  asOf?: string | null;
  marketOpen?: boolean;
  stale?: boolean;
  cached?: boolean;
  categories?: Partial<Record<CategoryKey, OIRow[]>>;
  error?: string;
  message?: string;
};

const categories: CategoryKey[] = ["RR", "RS", "SR", "SS"];

const meanings: Record<CategoryKey, string> = {
  RR: "Long build-up",
  RS: "Short build-up",
  SR: "Short covering",
  SS: "Long unwinding",
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function fmt(value: unknown, decimals = 2): string {
  const valueNum = num(value);
  return valueNum === null
    ? "?"
    : valueNum.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

function expiryRank(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parts = value.split("-");
  if (parts.length !== 3) return Number.MAX_SAFE_INTEGER;

  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const month = months[parts[1]];
  const day = Number(parts[0]);
  const year = Number(parts[2]);

  if (month === undefined || !day || !year) {
    return Number.MAX_SAFE_INTEGER;
  }
  return new Date(year, month, day).getTime();
}

type Direction = "Bullish" | "Bearish";
type Agreement = "Aligned" | "Divergence" | "Neutral";

function directionFor(category: CategoryKey): Direction {
  return category === "RR" || category === "SR" ? "Bullish" : "Bearish";
}

function agreementFor(direction: Direction, cashChange: number): Agreement {
  if (cashChange === 0) return "Neutral";
  const cashIsBullish = cashChange > 0;
  return (direction === "Bullish") === cashIsBullish
    ? "Aligned"
    : "Divergence";
}

function oiMagnitudePoints(changePercent: number): number {
  const magnitude = Math.abs(changePercent);
  if (magnitude >= 3) return 20;
  if (magnitude >= 2) return 16;
  if (magnitude >= 1) return 12;
  if (magnitude >= 0.5) return 8;
  if (magnitude > 0) return 4;
  return 0;
}

function confirmationScore(
  category: CategoryKey,
  row: OIRow,
  stock: ScreenerStock,
  volumePoints: number
): number | null {
  const oiChangePercent = num(row.pChangeInOI);
  const futuresPriceChange = num(row.pChange);

  if (
    oiChangePercent === null ||
    futuresPriceChange === null ||
    !Number.isFinite(stock.change)
  ) {
    return null;
  }

  const direction = directionFor(category);
  const agreement = agreementFor(direction, stock.change);

  const signalPoints = 40;
  const agreementPoints =
    agreement === "Aligned" ? 25 : agreement === "Neutral" ? 12 : 0;
  const oiPoints = oiMagnitudePoints(oiChangePercent);

  return Math.max(
    0,
    Math.min(100, signalPoints + agreementPoints + oiPoints + volumePoints)
  );
}

function strengthFor(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 45) return "Moderate";
  return "Weak";
}

export default function MAVOWatchlist({
  stocks,
}: {
  stocks: ScreenerStock[];
}) {
  const [data, setData] = useState<OIData | null>(null);
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
          throw new Error(result.error || "Unable to load NSE OI data.");
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

  const matches = useMemo(() => {
    const bySymbol = new Map<
      string,
      { category: CategoryKey; row: OIRow }[]
    >();

    for (const category of categories) {
      for (const row of data?.categories?.[category] ?? []) {
        if (row.instrumentType !== "FUTSTK" || !row.symbol) continue;

        const symbol = row.symbol.trim().toUpperCase();
        const list = bySymbol.get(symbol) ?? [];
        list.push({ category, row });
        bySymbol.set(symbol, list);
      }
    }

    const result = new Map<
      string,
      { category: CategoryKey; row: OIRow }
    >();

    for (const stock of stocks) {
      const symbol = stock.symbol.trim().toUpperCase();
      const candidates = [...(bySymbol.get(symbol) ?? [])];

      candidates.sort((a, b) => {
        const expiryDifference =
          expiryRank(a.row.expiryDate) - expiryRank(b.row.expiryDate);
        if (expiryDifference !== 0) return expiryDifference;
        return (num(b.row.volume) ?? 0) - (num(a.row.volume) ?? 0);
      });

      if (candidates.length > 0) result.set(symbol, candidates[0]);
    }

    return result;
  }, [data, stocks]);

  const volumeScores = useMemo(() => {
    const ranked = [...stocks].sort((a, b) => b.volume - a.volume);
    const result = new Map<string, number>();

    ranked.forEach((stock, index) => {
      const points =
        ranked.length <= 1
          ? 15
          : Math.round(((ranked.length - 1 - index) / (ranked.length - 1)) * 15);
      result.set(stock.symbol.trim().toUpperCase(), points);
    });

    return result;
  }, [stocks]);

  const stale = Boolean(data?.stale || !data?.marketOpen);

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
          fontSize: 11,
        }}
      >
        <span
          style={{
            padding: "5px 9px",
            borderRadius: 5,
            background: stale ? "#78350f" : "#064e3b",
            color: stale ? "#fde68a" : "#a7f3d0",
          }}
        >
          {loading
            ? "LOADING OI"
            : error
              ? "OI UNAVAILABLE"
              : stale
                ? "STALE / CACHED OI"
                : "LIVE FUTURES OI"}
        </span>
        <span className="sub">NSE snapshot: {data?.asOf ?? "?"}</span>
        <span className="sub">Stock futures only ? Nearest expiry</span>
      </div>

      {error && (
        <div className="sub" style={{ marginBottom: 10 }}>
          {error} Existing MAVO stock data is unaffected.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="label">
              <th style={{ textAlign: "left", padding: 10 }}>STOCK</th>
              <th style={{ textAlign: "right", padding: 10 }}>LTP</th>
              <th style={{ textAlign: "right", padding: 10 }}>CHANGE %</th>
              <th style={{ textAlign: "right", padding: 10 }}>VOLUME</th>
              <th style={{ textAlign: "left", padding: 10 }}>FUTURES SIGNAL</th>
              <th style={{ textAlign: "right", padding: 10 }}>OI CHANGE</th>
              <th style={{ textAlign: "right", padding: 10 }}>OI CHANGE %</th>
              <th style={{ textAlign: "right", padding: 10 }}>FUTURES PRICE %</th>
              <th style={{ textAlign: "left", padding: 10 }}>EXPIRY</th>
              <th style={{ textAlign: "left", padding: 10 }}>DIRECTION</th>
              <th style={{ textAlign: "left", padding: 10 }}>AGREEMENT</th>
              <th style={{ textAlign: "right", padding: 10 }}>CONFIRMATION SCORE</th>
              <th style={{ textAlign: "left", padding: 10 }}>STRENGTH</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const match = matches.get(stock.symbol.trim().toUpperCase());
              const category = match?.category;
              const row = match?.row;
              const direction = category ? directionFor(category) : null;
              const agreement =
                direction !== null
                  ? agreementFor(direction, stock.change)
                  : null;
              const score =
                category && row && !stale
                  ? confirmationScore(
                      category,
                      row,
                      stock,
                      volumeScores.get(stock.symbol.trim().toUpperCase()) ?? 0
                    )
                  : null;

              return (
                <tr key={stock.symbol}>
                  <td style={{ padding: 10, fontWeight: 700 }}>
                    {stock.symbol}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {fmt(stock.price)}
                  </td>
                  <td
                    className={`mono ${stock.change >= 0 ? "up" : "down"}`}
                    style={{ textAlign: "right", padding: 10 }}
                  >
                    {stock.change > 0 ? "+" : ""}{fmt(stock.change)}%
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {fmt(stock.volume, 0)}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {category && row ? (
                      <>
                        {stale ? "STALE " : ""}
                        <strong title={meanings[category]}>{category}</strong>
                        <span className="sub"> ? {meanings[category]}</span>
                      </>
                    ) : (
                      <span className="sub">
                        {loading ? "Loading?" : "No OI match"}
                      </span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {row ? fmt(row.changeInOI, 0) : "?"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {row ? fmt(row.pChangeInOI) + "%" : "?"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {row ? fmt(row.pChange) + "%" : "?"}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {row?.expiryDate ?? "?"}
                  </td>
                  <td style={{ padding: 10 }}>
                    {direction ?? "Unconfirmed"}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      fontWeight: 600,
                      color:
                        agreement === "Aligned"
                          ? "#16a34a"
                          : agreement === "Divergence"
                            ? "#dc2626"
                            : "inherit",
                    }}
                  >
                    {agreement ?? "N/A"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: 10 }}>
                    {stale
                      ? "Suppressed"
                      : score === null
                        ? "N/A"
                        : `${score}/100`}
                  </td>
                  <td style={{ padding: 10 }}>
                    {!category || !row
                      ? "No OI Data"
                      : stale
                        ? "Historical"
                        : score === null
                          ? "Unrated"
                          : strengthFor(score)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sub" style={{ marginTop: 9 }}>
        NSE classification uses stock-futures contract price and OI, not the
        cash share price. Stale signals are historical, not live confirmation.
        No OI match means no matching stock-futures record was found in the
        returned NSE Spurts categories.
      </div>
      <div className="sub" style={{ marginTop: 8 }}>
        Confirmation model: futures signal 40 points, cash/futures agreement
        25 points, absolute OI change magnitude 20 points, and relative MAVO
        volume rank 15 points. OI bands and score thresholds are provisional
        research settings, not validated trading probabilities.
      </div>
    </div>
  );
}
