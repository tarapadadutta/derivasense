"use client";

import { useMemo, useState } from "react";
import type { MarketData } from "../lib/marketTypes";

/* =========================================================
   PRO OPTIONS TERMINAL
   PROFESSIONAL STRATEGY ENGINE
   ========================================================= */

type StrategyProps = {
  data: MarketData;
};

type IndexName =
  | "NIFTY"
  | "BANKNIFTY"
  | "FINNIFTY"
  | "SENSEX";

type OptionRow = [
  number, // Call OI
  number, // Call COI
  number, // Call Volume
  number, // Call IV
  number, // Call LTP
  number, // Call Change
  number, // Strike
  number, // Put Change
  number, // Put LTP
  number, // Put IV
  number, // Put Volume
  number, // Put COI
  number  // Put OI
];

const INDEXES: IndexName[] = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
];

/* =========================================================
   COLORS
   ========================================================= */

const RED = "#f0533d";
const GREEN = "#3ddc84";
const BLUE = "#4da3ff";
const AMBER = "#e5aa45";
const PURPLE = "#9b8cff";
const TEXT = "#e8eef3";
const MUTED = "#81909d";
const PANEL = "#0e141b";
const PANEL2 = "#121a22";
const LINE = "#202a34";

/* =========================================================
   HELPERS
   ========================================================= */

function num(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const n = Number(
    String(value)
      .replace(/,/g, "")
      .replace(/₹/g, "")
      .replace(/%/g, "")
      .trim()
  );

  return Number.isFinite(n) ? n : 0;
}

function fmt(
  value: number | null | undefined,
  decimals = 2
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtStrike(value: number): string {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function normalizeIndex(symbol: unknown): string {
  return String(symbol ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace("NIFTY50", "NIFTY");
}

function getIndexData(
  data: MarketData,
  index: IndexName
): any {
  const indices: any = (data as any).indices;

  if (Array.isArray(indices)) {
    return (
      indices.find(
        (x: any) =>
          normalizeIndex(x?.symbol) === index
      ) || {}
    );
  }

  return indices?.[index] || {};
}

function getOptionRows(
  data: MarketData,
  index: IndexName
): OptionRow[] {
  const raw =
    (data as any).optionChain?.[index] || [];

  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (r: any) =>
        Array.isArray(r) &&
        r.length >= 13 &&
        Number.isFinite(Number(r[6]))
    )
    .map(
      (r: any) =>
        [
          num(r[0]),
          num(r[1]),
          num(r[2]),
          num(r[3]),
          num(r[4]),
          num(r[5]),
          num(r[6]),
          num(r[7]),
          num(r[8]),
          num(r[9]),
          num(r[10]),
          num(r[11]),
          num(r[12]),
        ] as OptionRow
    )
    .sort((a, b) => a[6] - b[6]);
}

/* =========================================================
   TREND HELPERS
   ========================================================= */

function trend(
  values: number[],
  toleranceFactor = 0.02
): "RISING" | "FALLING" | "FLAT" {
  if (!values || values.length < 2) {
    return "FLAT";
  }

  const recent = values.slice(-3);

  if (recent.length < 2) {
    return "FLAT";
  }

  const first = recent[0];
  const last = recent[recent.length - 1];

  const difference = last - first;

  const tolerance = Math.max(
    Math.abs(last) * toleranceFactor,
    Math.abs(first) * toleranceFactor,
    0.000001
  );

  if (difference > tolerance) {
    return "RISING";
  }

  if (difference < -tolerance) {
    return "FALLING";
  }

  return "FLAT";
}

function trendArrow(
  value:
    | "RISING"
    | "FALLING"
    | "FLAT"
): string {
  if (value === "RISING") return "↑";
  if (value === "FALLING") return "↓";
  return "→";
}

function trendColor(
  value:
    | "RISING"
    | "FALLING"
    | "FLAT"
): string {
  if (value === "RISING") return GREEN;
  if (value === "FALLING") return RED;
  return AMBER;
}

/* =========================================================
   BIG PLAYER ENGINE

   IMPORTANT:

   USE COMPLETE OPTION CHAIN.

   1. MAX CALL VOLUME
   2. MAX PUT VOLUME
   3. CALL COI / CALL VOLUME
   4. PUT COI / PUT VOLUME
   5. HIGHER RATIO = BIG PLAYER
   6. OI AT THOSE SAME STRIKES
   7. OI % = PIE SIZE

   CALL = RED
   PUT = GREEN
   ========================================================= */

function calculateBigPlayer(
  rows: OptionRow[]
) {
  if (!rows.length) {
    return {
      callStrike: 0,
      putStrike: 0,
      callVolume: 0,
      putVolume: 0,
      callCOI: 0,
      putCOI: 0,
      callRatio: 0,
      putRatio: 0,
      callOI: 0,
      putOI: 0,
      totalOI: 0,
      callPct: 50,
      putPct: 50,
      bigPlayerSide: "—",
      retailerSide: "—",
    };
  }

  /* -------------------------------------------------------
     MAXIMUM CALL VOLUME
     ------------------------------------------------------- */

  const callMax = rows.reduce(
    (best, row) =>
      row[2] > best[2] ? row : best,
    rows[0]
  );

  /* -------------------------------------------------------
     MAXIMUM PUT VOLUME
     ------------------------------------------------------- */

  const putMax = rows.reduce(
    (best, row) =>
      row[10] > best[10] ? row : best,
    rows[0]
  );

  const callStrike = callMax[6];
  const putStrike = putMax[6];

  const callVolume = callMax[2];
  const putVolume = putMax[10];

  const callCOI = callMax[1];
  const putCOI = putMax[11];

  /*
   * DO NOT ABS() COI HERE.
   *
   * The user's rule is actual COI / Volume.
   *
   * Positive COI = addition
   * Negative COI = reduction
   */

  const callRatio =
    callVolume !== 0
      ? callCOI / callVolume
      : 0;

  const putRatio =
    putVolume !== 0
      ? putCOI / putVolume
      : 0;

  let bigPlayerSide:
    | "CALL"
    | "PUT"
    | "—" = "—";

  let retailerSide:
    | "CALL"
    | "PUT"
    | "—" = "—";

  if (callRatio > putRatio) {
    bigPlayerSide = "CALL";
    retailerSide = "PUT";
  } else if (putRatio > callRatio) {
    bigPlayerSide = "PUT";
    retailerSide = "CALL";
  }

  /*
   * OI AT SAME SELECTED STRIKES
   */

  const callOI = callMax[0];
  const putOI = putMax[12];

  const totalOI = callOI + putOI;

  const callPct =
    totalOI > 0
      ? (callOI / totalOI) * 100
      : 50;

  const putPct =
    totalOI > 0
      ? (putOI / totalOI) * 100
      : 50;

  return {
    callStrike,
    putStrike,

    callVolume,
    putVolume,

    callCOI,
    putCOI,

    callRatio,
    putRatio,

    callOI,
    putOI,
    totalOI,

    callPct,
    putPct,

    bigPlayerSide,
    retailerSide,
  };
}

/* =========================================================
   3D PIE CHART
   ========================================================= */

function ThreeDPie({
  callPct,
  putPct,
  bigPlayerSide,
  retailerSide,
}: {
  callPct: number;
  putPct: number;
  bigPlayerSide: string;
  retailerSide: string;
}) {
  const callDeg = Math.max(
    0,
    Math.min(360, callPct * 3.6)
  );

  const callLabel =
    bigPlayerSide === "CALL"
      ? "BIG PLAYER"
      : retailerSide === "CALL"
        ? "RETAILER"
        : "CALL";

  const putLabel =
    bigPlayerSide === "PUT"
      ? "BIG PLAYER"
      : retailerSide === "PUT"
        ? "RETAILER"
        : "PUT";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        flexWrap: "wrap",
        padding: "22px 10px 8px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 205,
          height: 205,
          perspective: 800,
        }}
      >
        {/* bottom extrusion */}
        <div
          style={{
            position: "absolute",
            inset: "15px 0 0",
            borderRadius: "50%",
            background: `conic-gradient(
              ${RED} 0deg ${callDeg}deg,
              ${GREEN} ${callDeg}deg 360deg
            )`,
            transform:
              "rotateX(58deg) translateY(18px)",
            filter:
              "brightness(.45) blur(.2px)",
          }}
        />

        {/* main pie */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(
              ${RED} 0deg ${callDeg}deg,
              ${GREEN} ${callDeg}deg 360deg
            )`,
            transform:
              "rotateX(58deg)",
            boxShadow:
              "0 18px 35px rgba(0,0,0,.45)",
          }}
        />

        {/* center highlight */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 35% 25%, rgba(255,255,255,.16), transparent 45%)",
            transform:
              "rotateX(58deg)",
          }}
        />

        
        
        {/* call label */}
        <div
          style={{
            position: "absolute",
            left: 158,
            top: 78,
            transform: "translateX(-50%)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            textAlign: "center",
            width: 70,
            lineHeight: 1.15,
            textShadow:
              "0 2px 4px rgba(0,0,0,.9)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {callLabel}
          <br />
          <span
            style={{
              fontSize: 15,
              fontFamily: "Consolas, monospace",
            }}
          >
            {callPct.toFixed(1)}%
          </span>
        </div>

        {/* put label */}
        <div
          style={{
            position: "absolute",
            left: 47,
            top: 78,
            transform: "translateX(-50%)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            textAlign: "center",
            width: 70,
            lineHeight: 1.15,
            textShadow:
              "0 2px 4px rgba(0,0,0,.9)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {putLabel}
          <br />
          <span
            style={{
              fontSize: 15,
              fontFamily: "Consolas, monospace",
            }}
          >
            {putPct.toFixed(1)}%
          </span>
        </div>
      </div>





      {/* Legend */}
      <div
        style={{
          minWidth: 170,
          fontSize: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: RED,
              display: "inline-block",
            }}
          />

          <div>
            <div
              style={{
                fontWeight: 800,
              }}
            >
              CALL
            </div>

            <div
              style={{
                color: MUTED,
                fontSize: 11,
              }}
            >
              {callLabel}
            </div>
          </div>

          <strong
            style={{
              marginLeft: "auto",
              fontFamily:
                "Consolas, monospace",
            }}
          >
            {callPct.toFixed(1)}%
          </strong>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: GREEN,
              display: "inline-block",
            }}
          />

          <div>
            <div
              style={{
                fontWeight: 800,
              }}
            >
              PUT
            </div>

            <div
              style={{
                color: MUTED,
                fontSize: 11,
              }}
            >
              {putLabel}
            </div>
          </div>

          <strong
            style={{
              marginLeft: "auto",
              fontFamily:
                "Consolas, monospace",
            }}
          >
            {putPct.toFixed(1)}%
          </strong>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STRATEGY ENGINE
   ========================================================= */

function calculateStrategy(
  indexData: any,
  rows: OptionRow[],
  big: ReturnType<typeof calculateBigPlayer>,
  data: MarketData,
  index: IndexName
) {
  const spot = num(indexData?.spot);
  const future = num(indexData?.future);
  const vwap = num(indexData?.vwap);

  const spotChange = num(indexData?.chg);
  const spotPct = num(indexData?.chgPct);

  /* -------------------------------------------------------
     CURRENT PCR
     ------------------------------------------------------- */

  let callOISum = 0;
  let putOISum = 0;

  let callCOISum = 0;
  let putCOISum = 0;

  let callVolumeSum = 0;
  let putVolumeSum = 0;

  let callIVSum = 0;
  let putIVSum = 0;

  let callIVCount = 0;
  let putIVCount = 0;

  rows.forEach((r) => {
    callOISum += r[0];
    callCOISum += r[1];
    callVolumeSum += r[2];

    if (r[3] > 0) {
      callIVSum += r[3];
      callIVCount++;
    }

    putVolumeSum += r[10];
    putCOISum += r[11];
    putOISum += r[12];

    if (r[9] > 0) {
      putIVSum += r[9];
      putIVCount++;
    }
  });

  const pcrOI =
    callOISum !== 0
      ? putOISum / callOISum
      : num(indexData?.pcrOI);

  const pcrCOI =
    callCOISum !== 0
      ? putCOISum / callCOISum
      : num(indexData?.pcrCOI);

  const avgCallIV =
    callIVCount > 0
      ? callIVSum / callIVCount
      : 0;

  const avgPutIV =
    putIVCount > 0
      ? putIVSum / putIVCount
      : 0;

  const avgIV =
    avgCallIV > 0 && avgPutIV > 0
      ? (avgCallIV + avgPutIV) / 2
      : Math.max(avgCallIV, avgPutIV);

  /* -------------------------------------------------------
     COI DIFFERENCE

     USER DEFINED:

     PUT COI SUM - CALL COI SUM
     ------------------------------------------------------- */

  const coiDifference =
    putCOISum - callCOISum;

  /* -------------------------------------------------------
     COI HISTORY
     ------------------------------------------------------- */

  const coiHistoryRaw =
    (data as any).coiTrend?.[index] || [];

  const coiHistory = Array.isArray(
    coiHistoryRaw
  )
    ? coiHistoryRaw
        .map((x: any) =>
          Array.isArray(x)
            ? num(x[1])
            : num(
                x?.value ??
                  x?.coi_sum ??
                  x?.change
              )
        )
        .filter((x: number) =>
          Number.isFinite(x)
        )
    : [];

  coiHistory.push(coiDifference);

  const coiTrend = trend(
    coiHistory,
    0.02
  );

  /* -------------------------------------------------------
     PCR HISTORY

     [time, PCR OI, PCR COI]
     ------------------------------------------------------- */

  const pcrHistory =
    (data as any).pcrTrend?.[index] ||
    [];

  const pcrOIHistory: number[] = [];
  const pcrCOIHistory: number[] = [];

  if (Array.isArray(pcrHistory)) {
    pcrHistory.forEach((x: any) => {
      if (Array.isArray(x)) {
        if (Number.isFinite(Number(x[1]))) {
          pcrOIHistory.push(
            Number(x[1])
          );
        }

        if (Number.isFinite(Number(x[2]))) {
          pcrCOIHistory.push(
            Number(x[2])
          );
        }
      }
    });
  }

  pcrOIHistory.push(pcrOI);
  pcrCOIHistory.push(pcrCOI);

  const pcrOITrend = trend(
    pcrOIHistory,
    0.02
  );

  const pcrCOITrend = trend(
    pcrCOIHistory,
    0.02
  );

  /* -------------------------------------------------------
     VIX
     ------------------------------------------------------- */

  const vix = num(
    (data as any).vix?.value
  );

  const vixChange = num(
    (data as any).vix?.chg
  );

  const vixHistoryRaw =
    (data as any).vixTrend || [];

  const vixHistory = Array.isArray(
    vixHistoryRaw
  )
    ? vixHistoryRaw
        .map((x: any) =>
          Array.isArray(x)
            ? num(x[1])
            : num(x?.value)
        )
        .filter((x: number) =>
          Number.isFinite(x)
        )
    : [];

  if (vix > 0) {
    vixHistory.push(vix);
  }

  const vixTrend = trend(
    vixHistory,
    0.01
  );

  /* -------------------------------------------------------
     FUTURE VS VWAP
     ------------------------------------------------------- */

  let futureVWAP:
    | "ABOVE"
    | "BELOW"
    | "AT"
    | "UNAVAILABLE" =
    "UNAVAILABLE";

  if (future > 0 && vwap > 0) {
    if (future > vwap) {
      futureVWAP = "ABOVE";
    } else if (future < vwap) {
      futureVWAP = "BELOW";
    } else {
      futureVWAP = "AT";
    }
  }

  const futureVWAPDistance =
    future > 0 && vwap > 0
      ? ((future - vwap) / vwap) * 100
      : 0;

  /* -------------------------------------------------------
     ATM
     ------------------------------------------------------- */

  const atm = num(indexData?.atm);

  /* -------------------------------------------------------
     SUPPORT / RESISTANCE

     Prefer supplied values.

     Fallback = highest OI around
     the active chain.
     ------------------------------------------------------- */

  let resistance = num(
    indexData?.resistance
  );

  let support = num(
    indexData?.support
  );

  if (!resistance && rows.length) {
    resistance = rows.reduce(
      (best, row) =>
        row[0] > best[0] ? row : best,
      rows[0]
    )[6];
  }

  if (!support && rows.length) {
    support = rows.reduce(
      (best, row) =>
        row[12] > best[12] ? row : best,
      rows[0]
    )[6];
  }

  /* -------------------------------------------------------
     DISTANCE FROM SUPPORT / RESISTANCE
     ------------------------------------------------------- */

  const resistanceDistance =
    resistance > 0
      ? ((resistance - spot) / spot) *
        100
      : 0;

  const supportDistance =
    support > 0
      ? ((spot - support) / spot) *
        100
      : 0;

  const nearResistance =
    resistance > 0 &&
    spot >= resistance * 0.997;

  const nearSupport =
    support > 0 &&
    spot <= support * 1.003;

  const aboveResistance =
    resistance > 0 &&
    spot > resistance;

  const belowSupport =
    support > 0 &&
    spot < support;

  /* -------------------------------------------------------
     VOLUME CONCENTRATION

     Since the exporter currently supplies current
     option-chain volume rather than historical volume,
     we measure:

       maximum volume / average volume

     as the current volume-intensity signal.
     ------------------------------------------------------- */

  const activeRows = rows.filter(
    (r) =>
      r[2] > 0 ||
      r[10] > 0
  );

  const totalVolume =
    callVolumeSum +
    putVolumeSum;

  const averageVolume =
    activeRows.length > 0
      ? totalVolume / activeRows.length
      : 0;

  const maxCallVolume =
    big.callVolume;

  const maxPutVolume =
    big.putVolume;

  const maxSideVolume =
    Math.max(
      maxCallVolume,
      maxPutVolume
    );

  const volumeIntensity =
    averageVolume > 0
      ? maxSideVolume / averageVolume
      : 0;

  const volumeSide =
    maxCallVolume > maxPutVolume
      ? "CALL"
      : maxPutVolume > maxCallVolume
        ? "PUT"
        : "BALANCED";

  /* -------------------------------------------------------
     IV REGIME
     ------------------------------------------------------- */

  let ivRegime:
    | "LOW"
    | "NORMAL"
    | "HIGH"
    | "ELEVATED" =
    "NORMAL";

  if (avgIV > 0) {
    if (avgIV < 12) {
      ivRegime = "LOW";
    } else if (avgIV < 18) {
      ivRegime = "NORMAL";
    } else if (avgIV < 25) {
      ivRegime = "HIGH";
    } else {
      ivRegime = "ELEVATED";
    }
  }

  /* -------------------------------------------------------
     DIRECTIONAL SCORE

     Positive = bullish
     Negative = bearish
     ------------------------------------------------------- */

  let score = 0;

  const reasons: string[] = [];

  /* PCR OI */

  if (pcrOI > 1.05) {
    score += 2;
    reasons.push("PCR(OI) supports bullish positioning");
  } else if (pcrOI < 0.85) {
    score -= 2;
    reasons.push("PCR(OI) shows call-side dominance");
  }

  /* PCR COI */

  if (pcrCOI > 1.05) {
    score += 2;
    reasons.push("PCR(COI) favours put-side addition");
  } else if (
    pcrCOI > 0 &&
    pcrCOI < 0.85
  ) {
    score -= 2;
    reasons.push("PCR(COI) favours call-side addition");
  }

  /* PCR OI TREND */

  if (pcrOITrend === "RISING") {
    score += 1;
    reasons.push("PCR(OI) rising");
  } else if (
    pcrOITrend === "FALLING"
  ) {
    score -= 1;
    reasons.push("PCR(OI) falling");
  }

  /* PCR COI TREND */

  if (pcrCOITrend === "RISING") {
    score += 1;
    reasons.push("PCR(COI) rising");
  } else if (
    pcrCOITrend === "FALLING"
  ) {
    score -= 1;
    reasons.push("PCR(COI) falling");
  }

  /* COI DIFFERENCE */

  if (coiDifference > 0) {
    score += 2;
    reasons.push(
      "PUT COI − CALL COI is positive"
    );
  } else if (coiDifference < 0) {
    score -= 2;
    reasons.push(
      "PUT COI − CALL COI is negative"
    );
  }

  /* COI TREND */

  if (coiTrend === "RISING") {
    score += 1;
    reasons.push(
      "PUT COI − CALL COI is rising"
    );
  } else if (
    coiTrend === "FALLING"
  ) {
    score -= 1;
    reasons.push(
      "PUT COI − CALL COI is falling"
    );
  }

  /* SPOT */

  if (spotChange > 0) {
    score += 1;
    reasons.push("Spot is positive");
  } else if (spotChange < 0) {
    score -= 1;
    reasons.push("Spot is negative");
  }

  /* FUTURE / VWAP */

  if (futureVWAP === "ABOVE") {
    score += 2;
    reasons.push(
      "Future trading above VWAP"
    );
  } else if (
    futureVWAP === "BELOW"
  ) {
    score -= 2;
    reasons.push(
      "Future trading below VWAP"
    );
  }

  /* BIG PLAYER */

  if (big.bigPlayerSide === "CALL") {
    score += 1;
    reasons.push(
      "Big Player detected on CALL side"
    );
  } else if (
    big.bigPlayerSide === "PUT"
  ) {
    score -= 1;
    reasons.push(
      "Big Player detected on PUT side"
    );
  }

  /* VOLUME */

  if (
    volumeIntensity >= 3 &&
    volumeSide === "CALL"
  ) {
    score += 1;
    reasons.push(
      "Strong CALL volume concentration"
    );
  } else if (
    volumeIntensity >= 3 &&
    volumeSide === "PUT"
  ) {
    score -= 1;
    reasons.push(
      "Strong PUT volume concentration"
    );
  }

  /* -------------------------------------------------------
     RAW BIAS
     ------------------------------------------------------- */

  let rawBias:
    | "STRONG BULLISH"
    | "BULLISH"
    | "MILD BULLISH"
    | "NEUTRAL"
    | "MILD BEARISH"
    | "BEARISH"
    | "STRONG BEARISH";

  if (score >= 8) {
    rawBias = "STRONG BULLISH";
  } else if (score >= 5) {
    rawBias = "BULLISH";
  } else if (score >= 2) {
    rawBias = "MILD BULLISH";
  } else if (score <= -8) {
    rawBias = "STRONG BEARISH";
  } else if (score <= -5) {
    rawBias = "BEARISH";
  } else if (score <= -2) {
    rawBias = "MILD BEARISH";
  } else {
    rawBias = "NEUTRAL";
  }

  /* -------------------------------------------------------
     MARKET STRUCTURE
     ------------------------------------------------------- */

  let marketRegime =
    "BALANCED MARKET";

  if (
    aboveResistance &&
    score >= 4
  ) {
    marketRegime =
      "BREAKOUT CONFIRMED";
  } else if (
    nearResistance &&
    score >= 3
  ) {
    marketRegime =
      "BREAKOUT BUILDING";
  } else if (
    belowSupport &&
    score <= -4
  ) {
    marketRegime =
      "BREAKDOWN CONFIRMED";
  } else if (
    nearSupport &&
    score <= -3
  ) {
    marketRegime =
      "BREAKDOWN BUILDING";
  } else if (
    score >= 4 &&
    resistanceDistance > 0.25
  ) {
    marketRegime =
      "BULLISH TREND";
  } else if (
    score <= -4 &&
    supportDistance > 0.25
  ) {
    marketRegime =
      "BEARISH TREND";
  } else if (
    Math.abs(score) <= 2
  ) {
    marketRegime =
      "RANGE / UNSTABLE";
  } else if (
    score > 0
  ) {
    marketRegime =
      "BULLISH RANGE";
  } else {
    marketRegime =
      "BEARISH RANGE";
  }

  /* -------------------------------------------------------
     VOLATILITY / STRATEGY OVERLAY
     ------------------------------------------------------- */

  let strategy =
    "NO TRADE";

  let strategyDetail =
    "Wait for clearer confirmation";

  /* BREAKOUT */

  if (
    marketRegime ===
      "BREAKOUT CONFIRMED" ||
    marketRegime ===
      "BREAKOUT BUILDING"
  ) {
    if (ivRegime === "LOW") {
      strategy = "BUY CE";
      strategyDetail =
        "Upside momentum with relatively low implied volatility";
    } else if (
      ivRegime === "NORMAL"
    ) {
      strategy = "BULL CALL SPREAD";
      strategyDetail =
        "Use defined-risk bullish spread near resistance breakout";
    } else {
      strategy = "BULL PUT SPREAD";
      strategyDetail =
        "High IV favours premium-selling bullish structure";
    }
  }

  /* BREAKDOWN */

  else if (
    marketRegime ===
      "BREAKDOWN CONFIRMED" ||
    marketRegime ===
      "BREAKDOWN BUILDING"
  ) {
    if (ivRegime === "LOW") {
      strategy = "BUY PE";
      strategyDetail =
        "Downside momentum with relatively low implied volatility";
    } else if (
      ivRegime === "NORMAL"
    ) {
      strategy = "BEAR PUT SPREAD";
      strategyDetail =
        "Defined-risk bearish spread for downside continuation";
    } else {
      strategy = "BEAR CALL SPREAD";
      strategyDetail =
        "High IV favours premium-selling bearish structure";
    }
  }

  /* STRONG BULLISH */

  else if (
    rawBias === "STRONG BULLISH"
  ) {
    if (
      futureVWAP === "ABOVE" &&
      pcrOI > 1
    ) {
      strategy = "BULL PUT SPREAD";
      strategyDetail =
        "Strong bullish structure with downside support";
    } else {
      strategy = "BUY CE";
      strategyDetail =
        "Strong directional bullish momentum";
    }
  }

  /* BULLISH */

  else if (
    rawBias === "BULLISH"
  ) {
    if (
      ivRegime === "HIGH" ||
      ivRegime === "ELEVATED"
    ) {
      strategy = "BULL PUT SPREAD";
      strategyDetail =
        "Bullish bias with elevated IV favours credit structure";
    } else {
      strategy = "SELL PE";
      strategyDetail =
        "Bullish range with put-side support";
    }
  }

  /* STRONG BEARISH */

  else if (
    rawBias === "STRONG BEARISH"
  ) {
    if (
      futureVWAP === "BELOW" &&
      pcrOI < 0.85
    ) {
      strategy = "BUY PE";
      strategyDetail =
        "Strong bearish momentum below VWAP";
    } else {
      strategy = "BEAR CALL SPREAD";
      strategyDetail =
        "Defined-risk bearish premium strategy";
    }
  }

  /* BEARISH */

  else if (
    rawBias === "BEARISH"
  ) {
    if (
      ivRegime === "HIGH" ||
      ivRegime === "ELEVATED"
    ) {
      strategy = "BEAR CALL SPREAD";
      strategyDetail =
        "Bearish bias with elevated IV";
    } else {
      strategy = "SELL CE";
      strategyDetail =
        "Bearish range with resistance overhead";
    }
  }

  /* RANGE */

  else if (
    marketRegime ===
    "RANGE / UNSTABLE"
  ) {
    if (
      ivRegime === "HIGH" ||
      ivRegime === "ELEVATED"
    ) {
      strategy =
        "SHORT STRANGLE";
      strategyDetail =
        "Range structure with elevated IV; use strict risk control";
    } else if (
      ivRegime === "LOW"
    ) {
      strategy = "LONG STRANGLE";
      strategyDetail =
        "Low IV range with potential expansion risk";
    } else {
      strategy = "NO TRADE";
      strategyDetail =
        "Signals are mixed; wait for range resolution";
    }
  }

  /* BULLISH RANGE */

  else if (
    marketRegime ===
    "BULLISH RANGE"
  ) {
    if (
      pcrOI > 1 &&
      pcrCOI > 1
    ) {
      strategy = "SELL PE";
      strategyDetail =
        "Put-side support dominates the range";
    } else {
      strategy =
        "BULL PUT SPREAD";
      strategyDetail =
        "Defined-risk bullish range strategy";
    }
  }

  /* BEARISH RANGE */

  else if (
    marketRegime ===
    "BEARISH RANGE"
  ) {
    if (
      pcrOI < 1 &&
      pcrCOI < 1
    ) {
      strategy = "SELL CE";
      strategyDetail =
        "Call-side resistance dominates the range";
    } else {
      strategy =
        "BEAR CALL SPREAD";
      strategyDetail =
        "Defined-risk bearish range strategy";
    }
  }

  /* -------------------------------------------------------
     STRATEGY CONFIDENCE
     ------------------------------------------------------- */

  const absoluteScore =
    Math.min(Math.abs(score), 12);

  let confidence =
    50 +
    Math.round(
      absoluteScore * 3.5
    );

  /* Additional confirmation */

  if (
    futureVWAP === "ABOVE" &&
    score > 0
  ) {
    confidence += 3;
  }

  if (
    futureVWAP === "BELOW" &&
    score < 0
  ) {
    confidence += 3;
  }

  if (
    pcrOI > 1 &&
    pcrCOI > 1 &&
    score > 0
  ) {
    confidence += 3;
  }

  if (
    pcrOI < 1 &&
    pcrCOI < 1 &&
    score < 0
  ) {
    confidence += 3;
  }

  confidence = Math.max(
    50,
    Math.min(95, confidence)
  );

  /* -------------------------------------------------------
     FINAL DISPLAY CLASS
     ------------------------------------------------------- */

  let biasColor = AMBER;

  if (score >= 3) {
    biasColor = GREEN;
  } else if (score <= -3) {
    biasColor = RED;
  }

  let strategyColor = BLUE;

  if (
    strategy.includes("BUY")
  ) {
    strategyColor =
      score >= 0 ? GREEN : RED;
  }

  if (
    strategy.includes("SELL")
  ) {
    strategyColor =
      score >= 0 ? GREEN : RED;
  }

  if (
    strategy.includes("SPREAD")
  ) {
    strategyColor = PURPLE;
  }

  if (
    strategy.includes("STRANGLE") ||
    strategy.includes("STRADDLE")
  ) {
    strategyColor = AMBER;
  }

  if (strategy === "NO TRADE") {
    strategyColor = AMBER;
  }

  return {
    spot,
    nearSupport,
    nearResistance,
    future,
    vwap,
    spotChange,
    spotPct,

    pcrOI,
    pcrCOI,

    pcrOITrend,
    pcrCOITrend,

    coiDifference,
    coiTrend,

    vix,
    vixChange,
    vixTrend,

    avgCallIV,
    avgPutIV,
    avgIV,
    ivRegime,

    futureVWAP,
    futureVWAPDistance,

    atm,
    support,
    resistance,

    resistanceDistance,
    supportDistance,

    volumeIntensity,
    volumeSide,

    callOISum,
    putOISum,
    callCOISum,
    putCOISum,

    marketRegime,
    rawBias,

    strategy,
    strategyDetail,

    score,
    confidence,

    biasColor,
    strategyColor,

    reasons,
  };
}

/* =========================================================
   SIGNAL CARD
   ========================================================= */

function SignalCard({
  title,
  value,
  note,
  color = TEXT,
}: {
  title: string;
  value: string;
  note?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        padding: 15,
        minHeight: 92,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 10,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color,
          fontSize: 20,
          fontWeight: 800,
          fontFamily:
            "Consolas, monospace",
        }}
      >
        {value}
      </div>

      {note && (
        <div
          style={{
            color: MUTED,
            fontSize: 10,
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   TREND CARD
   ========================================================= */

function TrendCard({
  title,
  value,
  note,
}: {
  title: string;
  value:
    | "RISING"
    | "FALLING"
    | "FLAT";
  note: string;
}) {
  return (
    <SignalCard
      title={title}
      value={`${trendArrow(value)} ${value}`}
      note={note}
      color={trendColor(value)}
    />
  );
}

/* =========================================================
   COMPONENT
   ========================================================= */

export default function Strategy({
  data,
}: StrategyProps) {
  const [selectedIndex, setSelectedIndex] =
    useState<IndexName>("NIFTY");

  const indexData = useMemo(
    () =>
      getIndexData(
        data,
        selectedIndex
      ),
    [data, selectedIndex]
  );

  const rows = useMemo(
    () =>
      getOptionRows(
        data,
        selectedIndex
      ),
    [data, selectedIndex]
  );

  const bigPlayer = useMemo(
    () =>
      calculateBigPlayer(rows),
    [rows]
  );

  const engine = useMemo(
    () =>
      calculateStrategy(
        indexData,
        rows,
        bigPlayer,
        data,
        selectedIndex
      ),
    [
      indexData,
      rows,
      bigPlayer,
      data,
      selectedIndex,
    ]
  );

  const biasIcon =
    engine.rawBias.includes("BULLISH")
      ? "📈"
      : engine.rawBias.includes(
          "BEARISH"
        )
        ? "📉"
        : "⚖️";

  return (
    <section
      style={{
        width: "100%",
        }}
    >
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div
        style={{
          marginBottom: 18,
        }}
      >
        <div
          style={{
            color: BLUE,
            fontSize: 10,
            letterSpacing: ".18em",
            fontWeight: 700,
            marginBottom: 5,
          }}
        >
          PRO OPTIONS TERMINAL
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: ".02em",
          }}
        >
          Strategy Engine
        </h1>

        <div
          style={{
            color: MUTED,
            fontSize: 12,
            marginTop: 5,
          }}
        >
          Multi-factor option-flow intelligence
          using the complete live option chain.
        </div>
      </div>

      {/* =====================================================
          INDEX SELECTOR
          ===================================================== */}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {INDEXES.map((index) => {
          const active =
            selectedIndex === index;

          return (
            <button
              key={index}
              onClick={() =>
                setSelectedIndex(index)
              }
              style={{
                border: active
                  ? `1px solid ${BLUE}`
                  : `1px solid ${LINE}`,
                background: active
                  ? "#17304a"
                  : "#0d141b",
                color: active
                  ? "#fff"
                  : "#9eacb7",
                borderRadius: 7,
                padding:
                  "9px 18px",
                cursor: "pointer",
                fontWeight: active
                  ? 800
                  : 600,
                letterSpacing: ".03em",
                transition:
                  "all .15s ease",
              }}
            >
              {index}
            </button>
          );
        })}
      </div>

      {/* =====================================================
          TOP MARKET COMMAND PANEL
          ===================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(0,2fr) minmax(280px,1fr)",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* MARKET BIAS */}

        <div
          style={{
            background: PANEL,
            border: `1px solid ${LINE}`,
            borderRadius: 11,
            padding: 20,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              color: MUTED,
              fontSize: 10,
              letterSpacing: ".15em",
              textTransform: "uppercase",
            }}
          >
            {selectedIndex} MARKET BIAS
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 15,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 31,
                fontWeight: 900,
                color:
                  engine.biasColor,
                letterSpacing: ".02em",
              }}
            >
              {biasIcon}{" "}
              {engine.rawBias}
            </div>

            <div
              style={{
                background:
                  engine.biasColor +
                  "18",
                border:
                  `1px solid ${engine.biasColor}55`,
                borderRadius: 7,
                padding:
                  "8px 13px",
              }}
            >
              <div
                style={{
                  color: MUTED,
                  fontSize: 9,
                  letterSpacing: ".12em",
                }}
              >
                CONFIDENCE
              </div>

              <div
                style={{
                  color:
                    engine.biasColor,
                  fontSize: 20,
                  fontWeight: 900,
                  fontFamily:
                    "Consolas, monospace",
                }}
              >
                {engine.confidence}%
              </div>
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginTop: 13,
              padding:
                "7px 11px",
              borderRadius: 6,
              background:
                engine.biasColor +
                "12",
              border:
                `1px solid ${engine.biasColor}35`,
              color:
                engine.biasColor,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".08em",
            }}
          >
            MARKET STRUCTURE&nbsp; · &nbsp;
            {engine.marketRegime}
          </div>

          <div
            style={{
              marginTop: 13,
              color: MUTED,
              fontSize: 11,
              lineHeight: 1.65,
              maxWidth: 900,
            }}
          >
            {engine.reasons
              .slice(0, 5)
              .map(
                (
                  reason,
                  i
                ) => (
                  <span
                    key={i}
                    style={{
                      marginRight: 15,
                      display:
                        "inline-block",
                    }}
                  >
                    • {reason}
                  </span>
                )
              )}
          </div>
        </div>

        {/* TRADE STRATEGY */}

        <div
          style={{
            background: PANEL,
            border: `1px solid ${LINE}`,
            borderRadius: 11,
            padding: 20,
          }}
        >
          <div
            style={{
              color: MUTED,
              fontSize: 10,
              letterSpacing: ".15em",
              textTransform: "uppercase",
            }}
          >
            RECOMMENDED TRADE STRATEGY
          </div>

          <div
            style={{
              color:
                engine.strategyColor,
              fontSize: 27,
              fontWeight: 900,
              marginTop: 10,
              lineHeight: 1.15,
            }}
          >
            {engine.strategy}
          </div>

          <div
            style={{
              marginTop: 9,
              color: TEXT,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {engine.strategyDetail}
          </div>

          <div
            style={{
              marginTop: 15,
              borderTop:
                `1px solid ${LINE}`,
              paddingTop: 11,
              display: "flex",
              justifyContent:
                "space-between",
              color: MUTED,
              fontSize: 10,
            }}
          >
            <span>
              ENGINE SCORE
            </span>

            <strong
              style={{
                color:
                  engine.score > 0
                    ? GREEN
                    : engine.score <
                        0
                      ? RED
                      : AMBER,
                fontFamily:
                  "Consolas, monospace",
                fontSize: 13,
              }}
            >
              {engine.score > 0
                ? "+"
                : ""}
              {engine.score}
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================
          BIG PLAYER / RETAILER
          ===================================================== */}

      <div
        style={{
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 11,
          padding: 17,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 15,
              }}
            >
              {selectedIndex} ·
              Big Player / Retailer
            </h3>

            <div
              style={{
                color: MUTED,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              Resistance / Support positioning
            </div>
          </div>

          <div
            style={{
              color:
                bigPlayer.bigPlayerSide ===
                "CALL"
                  ? RED
                  : bigPlayer.bigPlayerSide ===
                      "PUT"
                    ? GREEN
                    : AMBER,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            BIG PLAYER:{" "}
            {bigPlayer.bigPlayerSide}
          </div>
        </div>

        <ThreeDPie
          callPct={
            bigPlayer.callPct
          }
          putPct={
            bigPlayer.putPct
          }
          bigPlayerSide={
            bigPlayer.bigPlayerSide
          }
          retailerSide={
            bigPlayer.retailerSide
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4,minmax(0,1fr))",
            gap: 8,
            marginTop: 7,
          }}
        >
          <div
            style={{
              background: PANEL2,
              borderRadius: 7,
              padding: 10,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              CALL STRIKE
            </div>
            <strong
              style={{
                color: RED,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                bigPlayer.callStrike
              )}
            </strong>
          </div>

          <div
            style={{
              background: PANEL2,
              borderRadius: 7,
              padding: 10,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              PUT STRIKE
            </div>
            <strong
              style={{
                color: GREEN,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                bigPlayer.putStrike
              )}
            </strong>
          </div>

          <div
            style={{
              background: PANEL2,
              borderRadius: 7,
              padding: 10,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              RESISTANCE
            </div>
            <strong
              style={{
                color: RED,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                engine.resistance
              )}
            </strong>
          </div>

          <div
            style={{
              background: PANEL2,
              borderRadius: 7,
              padding: 10,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              SUPPORT
            </div>
            <strong
              style={{
                color: GREEN,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                engine.support
              )}
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================
          CORE MARKET SIGNALS
          ===================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <SignalCard
          title="PCR OI"
          value={fmt(
            engine.pcrOI
          )}
          note="Current put OI ÷ call OI"
          color={
            engine.pcrOI >= 1
              ? GREEN
              : RED
          }
        />

        <SignalCard
          title="PCR COI"
          value={fmt(
            engine.pcrCOI
          )}
          note="Current put COI ÷ call COI"
          color={
            engine.pcrCOI >= 1
              ? GREEN
              : RED
          }
        />

        <SignalCard
          title="COI DIFFERENCE"
          value={fmt(
            engine.coiDifference,
            0
          )}
          note="PUT COI SUM − CALL COI SUM"
          color={
            engine.coiDifference >=
            0
              ? GREEN
              : RED
          }
        />

        <SignalCard
          title="INDIA VIX"
          value={fmt(
            engine.vix
          )}
          note={`${trendArrow(
            engine.vixTrend
          )} ${engine.vixTrend} · ${engine.ivRegime} volatility`}
          color={
            engine.vixTrend ===
            "FALLING"
              ? GREEN
              : engine.vixTrend ===
                  "RISING"
                ? RED
                : AMBER
          }
        />
      </div>

      {/* =====================================================
          TREND ENGINE
          ===================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <TrendCard
          title="PCR(OI) TREND"
          value={
            engine.pcrOITrend
          }
          note={`Current ${fmt(
            engine.pcrOI
          )}`}
        />

        <TrendCard
          title="PCR(COI) TREND"
          value={
            engine.pcrCOITrend
          }
          note={`Current ${fmt(
            engine.pcrCOI
          )}`}
        />

        <TrendCard
          title="COI BALANCE TREND"
          value={
            engine.coiTrend
          }
          note={`PUT − CALL ${fmt(
            engine.coiDifference,
            0
          )}`}
        />

        <TrendCard
          title="VIX TREND"
          value={
            engine.vixTrend
          }
          note={`VIX ${fmt(
            engine.vix
          )}`}
        />
      </div>

      {/* =====================================================
          FUTURE / VWAP / IV / VOLUME
          ===================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <SignalCard
          title="FUTURE vs VWAP"
          value={
            engine.futureVWAP ===
            "UNAVAILABLE"
              ? "—"
              : engine.futureVWAP
          }
          note={
            engine.futureVWAP ===
            "UNAVAILABLE"
              ? "VWAP unavailable"
              : `Future ${fmt(
                  engine.future
                )} · VWAP ${fmt(
                  engine.vwap
                )}`
          }
          color={
            engine.futureVWAP ===
            "ABOVE"
              ? GREEN
              : engine.futureVWAP ===
                  "BELOW"
                ? RED
                : AMBER
          }
        />

        <SignalCard
          title="AVERAGE IV"
          value={fmt(
            engine.avgIV
          )}
          note={`${engine.ivRegime} IV regime`}
          color={
            engine.ivRegime ===
            "LOW"
              ? GREEN
              : engine.ivRegime ===
                  "ELEVATED"
                ? RED
                : AMBER
          }
        />

        <SignalCard
          title="VOLUME INTENSITY"
          value={`${engine.volumeIntensity.toFixed(
            1
          )}×`}
          note={`Heavy ${engine.volumeSide} volume concentration`}
          color={
            engine.volumeSide ===
            "CALL"
              ? RED
              : engine.volumeSide ===
                  "PUT"
                ? GREEN
                : AMBER
          }
        />

        <SignalCard
          title="SPOT"
          value={fmt(
            engine.spot
          )}
          note={`${engine.spotChange >= 0 ? "+" : ""}${fmt(
            engine.spotChange
          )} · ${engine.spotPct >= 0 ? "+" : ""}${fmt(
            engine.spotPct
          )}%`}
          color={
            engine.spotChange > 0
              ? GREEN
              : engine.spotChange < 0
                ? RED
                : AMBER
          }
        />
      </div>

      {/* =====================================================
          MARKET STRUCTURE
          ===================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <SignalCard
          title="ATM"
          value={fmtStrike(
            engine.atm
          )}
          note={`Spot ${fmt(
            engine.spot
          )}`}
        />

        <SignalCard
          title="SUPPORT"
          value={fmtStrike(
            engine.support
          )}
          note={
            engine.nearSupport
              ? "Price near support"
              : `${engine.supportDistance.toFixed(
                  2
                )}% below spot`
          }
          color={GREEN}
        />

        <SignalCard
          title="RESISTANCE"
          value={fmtStrike(
            engine.resistance
          )}
          note={
            engine.nearResistance
              ? "Price near resistance"
              : `${engine.resistanceDistance.toFixed(
                  2
                )}% above spot`
          }
          color={RED}
        />

        <SignalCard
          title="FUTURE PREMIUM"
          value={
            engine.future > 0 &&
            engine.spot > 0
              ? `${engine.future - engine.spot >= 0 ? "+" : ""}${fmt(
                  engine.future -
                    engine.spot
                )}`
              : "—"
          }
          note="Future − Spot"
          color={
            engine.future >
            engine.spot
              ? GREEN
              : RED
          }
        />
      </div>

      {/* =====================================================
          OPTION FLOW INTELLIGENCE
          ===================================================== */}

      <div
        style={{
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 11,
          padding: 16,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            color: MUTED,
            fontSize: 10,
            letterSpacing: ".15em",
            textTransform: "uppercase",
            marginBottom: 13,
          }}
        >
          OPTION FLOW INTELLIGENCE
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3,minmax(0,1fr))",
            gap: 10,
          }}
        >
          <div
            style={{
              background: PANEL2,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
                letterSpacing: ".1em",
              }}
            >
              CALL SIDE
            </div>

            <div
              style={{
                marginTop: 7,
                fontSize: 13,
                fontWeight: 800,
                color: RED,
              }}
            >
              {bigPlayer.bigPlayerSide ===
              "CALL"
                ? "BIG PLAYER"
                : "RETAILER"}
            </div>

            <div
              style={{
                color: MUTED,
                fontSize: 10,
                marginTop: 5,
              }}
            >
              Max volume strike{" "}
              <strong
                style={{
                  color: TEXT,
                }}
              >
                {fmtStrike(
                  bigPlayer.callStrike
                )}
              </strong>
            </div>
          </div>

          <div
            style={{
              background: PANEL2,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
                letterSpacing: ".1em",
              }}
            >
              PUT SIDE
            </div>

            <div
              style={{
                marginTop: 7,
                fontSize: 13,
                fontWeight: 800,
                color: GREEN,
              }}
            >
              {bigPlayer.bigPlayerSide ===
              "PUT"
                ? "BIG PLAYER"
                : "RETAILER"}
            </div>

            <div
              style={{
                color: MUTED,
                fontSize: 10,
                marginTop: 5,
              }}
            >
              Max volume strike{" "}
              <strong
                style={{
                  color: TEXT,
                }}
              >
                {fmtStrike(
                  bigPlayer.putStrike
                )}
              </strong>
            </div>
          </div>

          <div
            style={{
              background: PANEL2,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
                letterSpacing: ".1em",
              }}
            >
              COI / VOLUME
            </div>

            <div
              style={{
                marginTop: 7,
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 12,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              <span
                style={{
                  color: RED,
                }}
              >
                C{" "}
                {bigPlayer.callRatio.toFixed(
                  5
                )}
              </span>

              <span
                style={{
                  color: GREEN,
                }}
              >
                P{" "}
                {bigPlayer.putRatio.toFixed(
                  5
                )}
              </span>
            </div>

            <div
              style={{
                color: MUTED,
                fontSize: 10,
                marginTop: 5,
              }}
            >
              Higher ratio determines Big
              Player
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          PROFESSIONAL DECISION MATRIX
          ===================================================== */}

      <div
        style={{
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 11,
          padding: 17,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            color: MUTED,
            fontSize: 10,
            letterSpacing: ".15em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          PROFESSIONAL DECISION MATRIX
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(6,minmax(0,1fr))",
            gap: 8,
          }}
        >
          {[
            [
              "PCR(OI)",
              fmt(engine.pcrOI),
              engine.pcrOI >=
              1
                ? "BULLISH"
                : "BEARISH",
              engine.pcrOI >=
              1
                ? GREEN
                : RED,
            ],
            [
              "PCR(COI)",
              fmt(engine.pcrCOI),
              engine.pcrCOI >=
              1
                ? "BULLISH"
                : "BEARISH",
              engine.pcrCOI >=
              1
                ? GREEN
                : RED,
            ],
            [
              "COI BALANCE",
              fmt(
                engine.coiDifference,
                0
              ),
              engine.coiDifference >=
              0
                ? "PUT SUPPORT"
                : "CALL PRESSURE",
              engine.coiDifference >=
              0
                ? GREEN
                : RED,
            ],
            [
              "VIX",
              fmt(engine.vix),
              engine.ivRegime,
              engine.ivRegime ===
              "LOW"
                ? GREEN
                : engine.ivRegime ===
                    "ELEVATED"
                  ? RED
                  : AMBER,
            ],
            [
              "FUTURE/VWAP",
              engine.futureVWAP,
              engine.futureVWAP ===
              "ABOVE"
                ? "BULLISH"
                : engine.futureVWAP ===
                    "BELOW"
                  ? "BEARISH"
                  : "NEUTRAL",
              engine.futureVWAP ===
              "ABOVE"
                ? GREEN
                : engine.futureVWAP ===
                    "BELOW"
                  ? RED
                  : AMBER,
            ],
            [
              "BIG PLAYER",
              bigPlayer.bigPlayerSide,
              bigPlayer.bigPlayerSide ===
              "CALL"
                ? "BULLISH"
                : bigPlayer.bigPlayerSide ===
                    "PUT"
                  ? "BEARISH"
                  : "NEUTRAL",
              bigPlayer.bigPlayerSide ===
              "CALL"
                ? GREEN
                : bigPlayer.bigPlayerSide ===
                    "PUT"
                  ? RED
                  : AMBER,
            ],
          ].map(
            (
              item,
              i
            ) => (
              <div
                key={i}
                style={{
                  background:
                    PANEL2,
                  borderRadius: 7,
                  padding: 11,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: MUTED,
                    fontSize: 8,
                    letterSpacing:
                      ".08em",
                    marginBottom: 7,
                  }}
                >
                  {item[0]}
                </div>

                <div
                  style={{
                    fontFamily:
                      "Consolas, monospace",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {item[1]}
                </div>

                <div
                  style={{
                    color:
                      item[3] as string,
                    fontSize: 9,
                    fontWeight: 800,
                    marginTop: 5,
                  }}
                >
                  {item[2]}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* =====================================================
          FINAL ENGINE OUTPUT
          ===================================================== */}

      <div
        style={{
          border: `1px solid ${engine.strategyColor}55`,
          background:
            `linear-gradient(135deg, ${engine.strategyColor}10, ${PANEL})`,
          borderRadius: 11,
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                color: MUTED,
                fontSize: 9,
                letterSpacing: ".15em",
              }}
            >
              FINAL STRATEGY ENGINE OUTPUT
            </div>

            <div
              style={{
                color:
                  engine.strategyColor,
                fontSize: 24,
                fontWeight: 900,
                marginTop: 6,
              }}
            >
              {engine.strategy}
            </div>

            <div
              style={{
                color: TEXT,
                fontSize: 11,
                marginTop: 5,
              }}
            >
              {selectedIndex} ·{" "}
              {engine.marketRegime}
            </div>
          </div>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <div
              style={{
                color: MUTED,
                fontSize: 9,
                letterSpacing: ".1em",
              }}
            >
              CONFIDENCE
            </div>

            <div
              style={{
                color:
                  engine.biasColor,
                fontSize: 27,
                fontWeight: 900,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {engine.confidence}%
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop:
              `1px solid ${LINE}`,
            display: "grid",
            gridTemplateColumns:
              "repeat(4,minmax(0,1fr))",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              SPOT
            </div>
            <strong
              style={{
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmt(engine.spot)}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              SUPPORT
            </div>
            <strong
              style={{
                color: GREEN,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                engine.support
              )}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              RESISTANCE
            </div>
            <strong
              style={{
                color: RED,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {fmtStrike(
                engine.resistance
              )}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: MUTED,
                fontSize: 9,
              }}
            >
              FUTURE / VWAP
            </div>
            <strong
              style={{
                color:
                  engine.futureVWAP ===
                  "ABOVE"
                    ? GREEN
                    : engine.futureVWAP ===
                        "BELOW"
                      ? RED
                      : AMBER,
                fontFamily:
                  "Consolas, monospace",
              }}
            >
              {engine.futureVWAP}
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================
          FOOTER
          ===================================================== */}

      <div
        style={{
          marginTop: 12,
          color: "#5f6d78",
          fontSize: 10,
          lineHeight: 1.6,
        }}
      >
        Strategy engine is a decision-support model.
        It combines option positioning, OI/COI flow,
        volume, IV, volatility, price structure and
        futures/VWAP confirmation. It does not guarantee
        future market movement.
      </div>
    </section>
  );
}