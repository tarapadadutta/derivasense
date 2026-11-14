"use client";

import { useEffect, useMemo, useState } from "react";

type OptionRow = [
  number, number, number, number, number, number,
  number, number, number, number, number, number, number
];

type Props = {
  index: string;
  expiry: string;
  dte: number | null;
  spot: number;
  atm: number;
  rows: OptionRow[];
  strategy: string;
  rawBias: string;
  confidence: number;
};

type Contract = {
  tradingsymbol: string;
  instrument_type: string;
  strike: number;
  lot_size: number;
  expiry: string;
  exchange: string;
};

type Leg = {
  side: "BUY" | "SELL";
  type: "CE" | "PE";
  strike: number;
  premium: number;
  volume: number;
  contract?: Contract;
};

type Candidate = {
  name: string;
  description: string;
  legs: Leg[];
  netPremium: number;
  maxProfit: number | null;
  maxLoss: number;
  breakeven: number;
  riskReward: string;
};

function expiryISO(value: string): string {
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return value;

  const [, day, month, year] = match;
  return `${year}-${months[month.toUpperCase()] || "01"}-${day.padStart(2, "0")}`;
}

function money(value: number): string {
  return `₹${value.toFixed(2)}`;
}

function fmtStrike(value: number): string {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function getRiskReward(profit: number | null, loss: number): string {
  if (profit === null) return "Unlimited potential";
  if (loss <= 0) return "Not available";
  return `${(profit / loss).toFixed(2)} : 1`;
}
function buildCandidate(
  name: string,
  description: string,
  legs: Leg[],
  netPremium: number,
  maxProfit: number | null,
  maxLoss: number,
  breakeven: number
): Candidate {
  return {
    name,
    description,
    legs,
    netPremium,
    maxProfit,
    maxLoss,
    breakeven,
    riskReward: getRiskReward(maxProfit, maxLoss),
  };
}

export default function StrikeStrategyBuilder({
  index,
  expiry,
  dte,
  spot,
  atm,
  rows,
  strategy,
  rawBias,
  confidence,
}: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [validationStatus, setValidationStatus] = useState(
    "NOT CHECKED"
  );
  const [validationMessage, setValidationMessage] = useState("");

  const exchange = index === "SENSEX" ? "BFO" : "NFO";
  const expiryDate = expiryISO(expiry);

  // Validate actual contracts against the Zerodha instrument master.
  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
      setContracts([]);
      setValidationMessage("");

      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("derivasense_token")
          : null;

      if (!token) {
        setValidationStatus("NOT CONNECTED");
        setValidationMessage(
          "Log in to DerivaSense and connect Zerodha to validate lot sizes and trading symbols."
        );
        return;
      }

      if (!expiryDate || !index) {
        setValidationStatus("UNAVAILABLE");
        setValidationMessage("Underlying or expiry is missing.");
        return;
      }

      setValidationStatus("CHECKING");

      try {
        const apiBase =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"
            ? "http://127.0.0.1:8000"
            : "";

        const params = new URLSearchParams({
          exchange,
          underlying: index,
          expiry: expiryDate,
          option_type: "ALL",
          limit: "1000",
        });

        const response = await fetch(
          `${apiBase}/api/zerodha/instruments/options?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Zerodha validation returned HTTP ${response.status}`
          );
        }

        const result = await response.json();
        const list = Array.isArray(result)
          ? result
          : result.instruments || result.contracts || [];

        if (!cancelled) {
          setContracts(list);
          setValidationStatus(
            list.length > 0 ? "VALIDATED" : "NO MATCH"
          );
          setValidationMessage(
            list.length > 0
              ? `${list.length} contracts loaded from ${exchange}.`
              : "No matching contracts returned. Check the underlying name and expiry."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setValidationStatus("UNAVAILABLE");
          setValidationMessage(
            error instanceof Error
              ? error.message
              : "Unable to validate contracts."
          );
        }
      }
    }

    loadContracts();

    return () => {
      cancelled = true;
    };
  }, [index, expiryDate, exchange]);

  const chain = useMemo(() => {
    return (rows || [])
      .filter(
        (row) =>
          Array.isArray(row) &&
          row.length >= 13 &&
          Number(row[6]) > 0
      )
      .map((row) => ({
        strike: Number(row[6]),
        callVolume: Number(row[2]),
        callLtp: Number(row[4]),
        putLtp: Number(row[8]),
        putVolume: Number(row[10]),
      }))
      .sort((a, b) => a.strike - b.strike);
  }, [rows]);

  const candidates = useMemo(() => {
    if (
      !chain.length ||
      !Number.isFinite(spot) ||
      spot <= 0 ||
      !Number.isFinite(atm) ||
      confidence < 50 ||
      strategy.toUpperCase().includes("NO TRADE")
    ) {
      return [];
    }

    const bias = rawBias.toUpperCase();
    const bullish = bias.includes("BULL");
    const bearish = bias.includes("BEAR");

    if (!bullish && !bearish) return [];

    const center = chain.reduce((best, row, i) => {
      return Math.abs(row.strike - atm) <
        Math.abs(chain[best].strike - atm)
        ? i
        : best;
    }, 0);

    const atmRow = chain[center];
    const lower1 = chain[center - 1];
    const lower2 = chain[center - 2];
    const higher1 = chain[center + 1];
    const higher2 = chain[center + 2];

    function makeLeg(
      row: (typeof chain)[number],
      type: "CE" | "PE",
      side: "BUY" | "SELL"
    ): Leg | null {
      const premium = type === "CE" ? row.callLtp : row.putLtp;
      const volume = type === "CE" ? row.callVolume : row.putVolume;

      if (
        !Number.isFinite(premium) ||
        premium <= 0 ||
        !Number.isFinite(volume) ||
        volume <= 0
      ) {
        return null;
      }

      return {
        side,
        type,
        strike: row.strike,
        premium,
        volume,
      };
    }

    const plans: Candidate[] = [];

    if (bullish) {
      const longCall = makeLeg(atmRow, "CE", "BUY");

      if (longCall) {
        plans.push(
          buildCandidate(
            "BUY CALL",
            "Directional bullish position. Maximum loss is the premium paid.",
            [longCall],
            longCall.premium,
            null,
            longCall.premium,
            longCall.strike + longCall.premium
          )
        );
      }

      if (higher1) {
        const buy = makeLeg(atmRow, "CE", "BUY");
        const sell = makeLeg(higher1, "CE", "SELL");

        if (buy && sell) {
          const debit = buy.premium - sell.premium;
          const width = sell.strike - buy.strike;

          if (debit > 0 && width > debit) {
            plans.push(
              buildCandidate(
                "BULL CALL SPREAD",
                "Defined-risk bullish debit spread.",
                [buy, sell],
                debit,
                width - debit,
                debit,
                buy.strike + debit
              )
            );
          }
        }
      }

      if (lower1 && lower2) {
        const sell = makeLeg(lower1, "PE", "SELL");
        const buy = makeLeg(lower2, "PE", "BUY");

        if (sell && buy) {
          const credit = sell.premium - buy.premium;
          const width = sell.strike - buy.strike;

          if (credit > 0 && width > credit) {
            plans.push(
              buildCandidate(
                "BULL PUT SPREAD",
                "Defined-risk bullish credit spread.",
                [sell, buy],
                -credit,
                credit,
                width - credit,
                sell.strike - credit
              )
            );
          }
        }
      }
    }

    if (bearish) {
      const longPut = makeLeg(atmRow, "PE", "BUY");

      if (longPut) {
        plans.push(
          buildCandidate(
            "BUY PUT",
            "Directional bearish position. Maximum loss is the premium paid.",
            [longPut],
            longPut.premium,
            Math.max(0, longPut.strike - longPut.premium),
            longPut.premium,
            longPut.strike - longPut.premium
          )
        );
      }

      if (lower1) {
        const buy = makeLeg(atmRow, "PE", "BUY");
        const sell = makeLeg(lower1, "PE", "SELL");

        if (buy && sell) {
          const debit = buy.premium - sell.premium;
          const width = buy.strike - sell.strike;

          if (debit > 0 && width > debit) {
            plans.push(
              buildCandidate(
                "BEAR PUT SPREAD",
                "Defined-risk bearish debit spread.",
                [buy, sell],
                debit,
                width - debit,
                debit,
                buy.strike - debit
              )
            );
          }
        }
      }

      if (higher1 && higher2) {
        const sell = makeLeg(higher1, "CE", "SELL");
        const buy = makeLeg(higher2, "CE", "BUY");

        if (sell && buy) {
          const credit = sell.premium - buy.premium;
          const width = buy.strike - sell.strike;

          if (credit > 0 && width > credit) {
            plans.push(
              buildCandidate(
                "BEAR CALL SPREAD",
                "Defined-risk bearish credit spread.",
                [sell, buy],
                -credit,
                credit,
                width - credit,
                sell.strike + credit
              )
            );
          }
        }
      }
    }

    return plans;
  }, [chain, spot, atm, confidence, strategy, rawBias]);
  const validatedCandidates = useMemo(() => {
    return candidates.map((candidate) => {
      const legs = candidate.legs.map((leg) => {
        const contract = contracts.find(
          (item) =>
            item.instrument_type === leg.type &&
            Number(item.strike) === leg.strike &&
            item.lot_size > 0
        );

        return { ...leg, contract };
      });

      return { ...candidate, legs };
    });
  }, [candidates, contracts]);
       
  const decisionRanking = useMemo(() => {
    const engineSignal = strategy.toUpperCase().trim();
    const bias = rawBias.toUpperCase().trim();

    const expiryScore =
      dte === null || dte < 0 ? 0 :
      dte <= 1 ? 0 :
      dte <= 3 ? 5 :
      dte <= 7 ? 10 :
      dte <= 14 ? 15 : 20;

    const expiryLabel =
      dte === null ? "UNKNOWN — DTE UNAVAILABLE" :
      dte < 0 ? "EXPIRED" :
      dte <= 1 ? "VERY HIGH EXPIRY RISK" :
      dte <= 3 ? "HIGH EXPIRY RISK" :
      dte <= 7 ? "ELEVATED EXPIRY RISK" :
      dte <= 14 ? "MODERATE EXPIRY RISK" :
      "NORMAL EXPIRY WINDOW";

    const noTrade =
      dte === null || dte < 0 || dte <= 1;

    const eligible = validatedCandidates
      .map((candidate) => {
        const allValidated = candidate.legs.every(
          (leg) => Boolean(leg.contract)
        );

        const lotSize = candidate.legs[0]?.contract?.lot_size ?? 0;

        const validLot =
          allValidated &&
          lotSize > 0 &&
          candidate.legs.every(
            (leg) => leg.contract?.lot_size === lotSize
          );

        if (
          !validLot ||
          !Number.isFinite(candidate.maxLoss) ||
          candidate.maxLoss <= 0
        ) {
          return null;
        }

        const candidateName = candidate.name.toUpperCase().trim();

        const isBullishCandidate =
          candidateName.includes("BULL") ||
          candidateName.includes("BUY CALL");

        const isBearishCandidate =
          candidateName.includes("BEAR") ||
          candidateName.includes("BUY PUT");

        let exactMatch = false;
        let alignmentScore = 0;

        if (engineSignal.includes("BEAR PUT SPREAD")) {
          exactMatch = candidateName.includes("BEAR PUT SPREAD");
        } else if (engineSignal.includes("BEAR CALL SPREAD")) {
          exactMatch = candidateName.includes("BEAR CALL SPREAD");
        } else if (engineSignal.includes("BULL PUT SPREAD")) {
          exactMatch = candidateName.includes("BULL PUT SPREAD");
        } else if (engineSignal.includes("BULL CALL SPREAD")) {
          exactMatch = candidateName.includes("BULL CALL SPREAD");
        } else if (
          engineSignal.includes("BUY PE") ||
          engineSignal.includes("BUY PUT")
        ) {
          exactMatch = candidateName.includes("BUY PUT");
        } else if (
          engineSignal.includes("BUY CE") ||
          engineSignal.includes("BUY CALL")
        ) {
          exactMatch = candidateName.includes("BUY CALL");
        } else if (engineSignal.includes("SELL PE")) {
          exactMatch = candidateName.includes("BULL PUT SPREAD");
        } else if (engineSignal.includes("SELL CE")) {
          exactMatch = candidateName.includes("BEAR CALL SPREAD");
        }

        if (exactMatch) {
          alignmentScore = 25;
        } else if (
          (bias.includes("BEAR") && isBearishCandidate) ||
          (bias.includes("BULL") && isBullishCandidate)
        ) {
          alignmentScore = 12;
        }

        const rr =
          candidate.maxProfit === null
            ? null
            : candidate.maxProfit / candidate.maxLoss;

        const isLongOption =
          candidateName.includes("BUY PUT") ||
          candidateName.includes("BUY CALL");

        const riskRewardScore =
          rr === null
            ? 10
            : isLongOption
              ? Math.min(10, Math.max(0, rr * 10))
              : Math.min(20, Math.max(0, rr * 10));
        const definedRiskScore =
          candidate.maxProfit === null ? 16 : 20;

        const confidenceScore = Math.min(
          10,
          Math.max(0, confidence * 0.1)
        );

        const minVolume = Math.min(
          ...candidate.legs.map((leg) => leg.volume)
        );

        const volumeScore =
          minVolume >= 10000 ? 5 :
          minVolume >= 5000 ? 4 :
          minVolume >= 1000 ? 3 :
          minVolume >= 500 ? 2 :
          minVolume > 0 ? 1 : 0;

        const score = Math.min(
          100,
          Math.round(
            alignmentScore +
            definedRiskScore +
            riskRewardScore +
            expiryScore +
            confidenceScore +
            volumeScore
          )
        );

        return {
          candidate,
          lotSize,
          score,
          rr,
          alignmentScore,
          definedRiskScore,
          riskRewardScore,
          expiryScore,
          confidenceScore,
          volumeScore,
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> => item !== null
      )
      .sort((a, b) => b.score - a.score);

    return {
      best: eligible[0] ?? null,
      second: eligible[1] ?? null,
      eligibleCount: eligible.length,
      expiryScore,
      expiryLabel,
      noTrade,
    };
  }, [validatedCandidates, confidence, strategy, rawBias, dte]);
  const C = {
    panel: "#111827",
    border: "#334155",
    text: "#e2e8f0",
    muted: "#94a3b8",
    green: "#34d399",
    red: "#fb7185",
    blue: "#60a5fa",
    amber: "#fbbf24",
  };

  return (
    <section
      style={{
        marginTop: 22,
        padding: 18,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        background: C.panel,
        color: C.text,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>
            STRIKE-LEVEL STRATEGY BUILDER
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>
            {index} · Expiry {expiry} · Spot {fmtStrike(spot)} · ATM{" "}
            {fmtStrike(atm)} · Calendar DTE (market snapshot): {dte ?? "Unknown"}
          </div>
        </div>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            fontSize: 10,
            fontWeight: 800,
            color:
              validationStatus === "VALIDATED"
                ? C.green
                : validationStatus === "CHECKING"
                  ? C.amber
                  : C.muted,
          }}
        >
          ZERODHA: {validationStatus}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: "#172033",
          borderRadius: 8,
          fontSize: 11,
          color: C.muted,
        }}
      >
        {validationMessage ||
          "Contract validation checks the Zerodha instrument master."}
      </div>

      {decisionRanking.noTrade && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: `1px solid ${C.red}`,
            borderRadius: 8,
            color: C.red,
            background: "#291722",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          WAIT — NO TRADE. Expiry status: {decisionRanking.expiryLabel}.
          {dte === null
            ? " DTE is unavailable; a reliable expiry assessment cannot be made."
            : dte < 0
              ? " This contract expiry has passed."
              : " One or fewer calendar days remain. Time decay and execution risk are elevated."}
          Any candidates below are informational only.
        </div>
      )}

      {confidence < 55 && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: `1px solid ${C.amber}`,
            borderRadius: 8,
            color: C.amber,
            fontSize: 11,
          }}
        >
          Low-confidence signal. Treat these calculations as informational,
          not as a trade recommendation.
        </div>
      )}
		
      {/* FINAL STRATEGY DECISION SCORECARD */}
      <div
        style={{
          marginTop: 18,
          padding: 15,
          border: `1px solid ${C.blue}`,
          borderRadius: 10,
          background: "#0b1628",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, color: C.blue }}>
          FINAL STRATEGY DECISION SCORECARD
        </div>

        <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>
          Comparative ranking · Engine confidence: {confidence}% ·
          Not a probability of profit
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 11,
            border: `1px solid ${decisionRanking.noTrade ? C.red : C.border}`,
            borderRadius: 8,
            background: "#172033",
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 900, color: decisionRanking.noTrade ? C.red : C.amber }}>
            {decisionRanking.noTrade ? "DECISION: WAIT — NO TRADE" : "EXPIRY ASSESSMENT"}
          </div>
          <div>Expiry date: {expiry}</div>
          <div>Calendar DTE from market snapshot: {dte ?? "Unavailable"}</div>
          <div>Expiry risk: {decisionRanking.expiryLabel}</div>
          <div>Expiry suitability score: {decisionRanking.expiryScore}/20</div>
        </div>

        {decisionRanking.best ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 10,
                marginTop: 14,
              }}
            >
              {[
                {
                  label: decisionRanking.noTrade ? "TOP CANDIDATE — INFORMATIONAL" : "BEST STRATEGY",
                  item: decisionRanking.best,
                  color: C.green,
                },
                {
                  label: "SECOND-BEST STRATEGY",
                  item: decisionRanking.second,
                  color: C.blue,
                },
              ].map(({ label, item, color }) =>
                item ? (
                  <div
                    key={label}
                    style={{
                      padding: 12,
                      border: `1px solid ${color}`,
                      borderRadius: 8,
                      background: "#111c2e",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        color,
                      }}
                    >
                      {label}
                    </div>

                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        marginTop: 7,
                      }}
                    >
                      {item.candidate.name}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color,
                        marginTop: 5,
                      }}
                    >
                      COMPARATIVE SCORE: {item.score}/100
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 10,
                        color: C.muted,
                        lineHeight: 1.7,
                      }}
                    >
                      Engine alignment: {item.alignmentScore}/25
                      {" · "}Defined risk: {item.definedRiskScore}/20
                      {" · "}Risk/reward: {Math.round(item.riskRewardScore)}/20
                      {" · "}Expiry: {item.expiryScore}/20
                      {" · "}Confidence: {Math.round(item.confidenceScore)}/10
                      {" · "}Volume: {item.volumeScore}/5
                    </div>

                    <div style={{ marginTop: 12, fontSize: 10, color: C.muted }}>
                      OPTION LEGS
                    </div>

                    {item.candidate.legs.map((leg, i) => (
                      <div
                        key={`${leg.type}-${leg.strike}-${i}`}
                        style={{
                          marginTop: 5,
                          fontSize: 11,
                        }}
                      >
                        <strong>{leg.side} {leg.type}</strong>
                        {" · "}
                        {fmtStrike(leg.strike)}
                        {" · LTP "}
                        {money(leg.premium)}
                      </div>
                    ))}

                    <div style={{ marginTop: 12, fontSize: 10, color: C.muted }}>
                      INDICATIVE NET ENTRY PER UNIT
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {item.candidate.netPremium >= 0 ? "Debit " : "Credit "}
                      {money(Math.abs(item.candidate.netPremium))}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      NET ENTRY PER LOT ({item.lotSize})
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {money(
                        Math.abs(item.candidate.netPremium * item.lotSize)
                      )}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      MAXIMUM LOSS PER LOT
                    </div>
                    <div style={{ color: C.red, fontWeight: 800 }}>
                      {money(item.candidate.maxLoss * item.lotSize)}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      MAXIMUM PROFIT PER LOT
                    </div>
                    <div style={{ color: C.green, fontWeight: 800 }}>
                      {item.candidate.maxProfit === null
                        ? "Theoretical unlimited"
                        : money(item.candidate.maxProfit * item.lotSize)}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      EXPIRY BREAKEVEN
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {fmtStrike(item.candidate.breakeven)}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      MAXIMUM RISK / REWARD
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {item.candidate.riskReward}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      INTRADAY STOP-LOSS / TARGET
                    </div>
                    <div style={{ color: C.amber, fontSize: 11 }}>
                      Not calculated — exit rules and executable quotes required
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
                      EXECUTABLE ENTRY RANGE
                    </div>
                    <div style={{ color: C.amber, fontSize: 11 }}>
                      Unavailable — bid/ask data not used
                    </div>
                  </div>
                ) : null
              )}
            </div>

            <div
              style={{
                marginTop: 13,
                padding: 10,
                borderRadius: 7,
                background: "#172033",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: C.green }}>
                WHY THESE CANDIDATES RANKED
              </strong>
              <div style={{ color: C.muted, marginTop: 5 }}>
                Ranking considers validated contracts, matching lot sizes,
                engine confidence, payoff risk/reward and option-leg volume.
                Higher score means a stronger comparative fit under this
                model, not a guaranteed return or probability of success.
              </div>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 12, color: C.amber, fontSize: 11 }}>
            No eligible strategy can be ranked. Validated contracts and
            consistent lot sizes are required before a recommendation.
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: `1px solid ${C.red}`,
            borderRadius: 7,
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: C.red }}>AVOID</strong>
          <div style={{ marginTop: 5 }}>
            Naked short CALL or PUT positions: not recommended by this
            defined-risk strategy builder. Also avoid taking the opposite
            directional bias while the current engine signal remains active
            without a separate reversal confirmation.
          </div>
        </div>
      </div>
      {/* END FINAL STRATEGY DECISION SCORECARD */}

      {validatedCandidates.length === 0 ? (
        <div
          style={{
            marginTop: 18,
            padding: 18,
            border: `1px dashed ${C.border}`,
            borderRadius: 8,
            textAlign: "center",
            color: C.muted,
            fontSize: 12,
          }}
        >
          No suitable strike-level candidates are available.
          <div style={{ marginTop: 7 }}>
            Check option-chain premiums, volume, market bias and the existing
            Strategy Engine signal.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {validatedCandidates.map((candidate, indexNo) => {
            const allValidated = candidate.legs.every(
              (leg) => Boolean(leg.contract)
            );
	    const lotSize = candidate.legs[0]?.contract?.lot_size ?? 0;

	const lotCalculationAvailable =
  	allValidated &&
 	 lotSize > 0 &&
  	candidate.legs.every(
   	 (leg) => leg.contract?.lot_size === lotSize
 	 );	
            return (
              <div
                key={`${candidate.name}-${indexNo}`}
                style={{
                  padding: 14,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  background: "#0b1220",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: C.blue,
                  }}
                >
                  {candidate.name}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    fontSize: 10,
                    color: C.muted,
                    lineHeight: 1.5,
                  }}
                >
                  {candidate.description}
                </div>

                <div
                  style={{
                    marginTop: 13,
                    fontSize: 10,
                    fontWeight: 800,
                    color: C.muted,
                  }}
                >
                  OPTION LEGS
                </div>

                {candidate.legs.map((leg, legIndex) => (
                  <div
                    key={`${leg.type}-${leg.strike}-${legIndex}`}
                    style={{
                      marginTop: 8,
                      padding: 9,
                      borderRadius: 7,
                      background: "#172033",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 11,
                      }}
                    >
                      <strong
                        style={{
                          color: leg.side === "BUY" ? C.green : C.red,
                        }}
                      >
                        {leg.side} {leg.type}
                      </strong>
                      <strong>{fmtStrike(leg.strike)}</strong>
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 10,
                        color: C.muted,
                      }}
                    >
                      Indicative LTP: {money(leg.premium)}
                      {" · "}Volume: {leg.volume.toLocaleString("en-IN")}
                    </div>

                    {leg.contract ? (
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 10,
                          color: C.green,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {leg.contract.tradingsymbol}
                        {" · "}Lot size: {leg.contract.lot_size}
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 10,
                          color: C.amber,
                        }}
                      >
                        Contract not validated
                      </div>
                    )}
                  </div>
                ))}

                <div
                  style={{
                    marginTop: 12,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 10,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.muted }}>
  		NET PREMIUM PER LOT ({lotSize})
		</div>
	<div style={{ fontSize: 15, fontWeight: 800 }}>
  	{lotCalculationAvailable
   	 ? `${candidate.netPremium >= 0 ? "Debit " : "Credit "}${money(Math.abs(candidate.netPremium * lotSize))}`
   	 : "Unavailable — contract validation required"}
	</div>

	<div style={{ marginTop: 10, fontSize: 10, color: C.muted }}>
  	MAXIMUM PROFIT PER LOT
	</div>
	<div style={{ color: C.green, fontWeight: 700 }}>
  	{!lotCalculationAvailable
   	 ? "Unavailable"
    	: candidate.maxProfit === null
      	? "Theoretical — Unlimited"
      	: money(candidate.maxProfit * lotSize)}
	</div>

	<div style={{ marginTop: 9, fontSize: 10, color: C.muted }}>
  	MAXIMUM LOSS PER LOT
	</div>
	<div style={{ color: C.red, fontWeight: 700 }}>
  	{lotCalculationAvailable
   	 ? money(candidate.maxLoss * lotSize)
    	: "Unavailable"}
	</div>

                  <div style={{ marginTop: 9, fontSize: 10, color: C.muted }}>
                    BREAKEVEN AT EXPIRY
                  </div>
                  <div style={{ fontWeight: 700 }}>
                    {fmtStrike(candidate.breakeven)}
                  </div>

                  <div style={{ marginTop: 9, fontSize: 10, color: C.muted }}>
                    MAXIMUM RISK / REWARD
                  </div>
                  <div style={{ fontWeight: 700 }}>
                    {candidate.riskReward}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      padding: 7,
                      borderRadius: 6,
                      background: "#172033",
                      fontSize: 10,
                      color: allValidated ? C.green : C.amber,
                    }}
                  >
                    {!allValidated &&
 			 "Lot-based calculation unavailable until every leg is validated"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          paddingTop: 11,
          borderTop: `1px solid ${C.border}`,
          color: C.muted,
          fontSize: 10,
          lineHeight: 1.6,
        }}
      >
        PREVIEW ONLY · Per-unit expiry payoff estimates, before charges and
        slippage. Premiums use option-chain LTP, not executable bid/ask
        prices. Lot-based totals are intentionally omitted until every leg
        is validated. No broker order is submitted.
      </div>
    </section>
  );
}