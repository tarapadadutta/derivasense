"use client";

import { useCallback, useEffect, useState } from "react";

type OptionContract = {
  instrument_token: number;
  exchange: string;
  tradingsymbol: string;
  name: string;
  expiry: string;
  strike: number;
  lot_size: number;
  tick_size: number;
  instrument_type: "CE" | "PE";
  segment: string;
};

type OptionsResponse = {
  success: boolean;
  exchange: string;
  underlying?: string;
  expiry?: string;
  option_type?: string;
  available_underlyings?: string[];
  available_expiries?: string[];
  total_count?: number;
  count?: number;
  truncated?: boolean;
  requires_underlying?: boolean;
  requires_expiry?: boolean;
  instruments?: OptionContract[];
  detail?: string;
};
type MarginEstimateResponse = {
  success: boolean;
  estimate_only: boolean;
  estimated_at: string;
  order: {
    exchange: string;
    tradingsymbol: string;
    transaction_type: string;
    product: string;
    order_type: string;
    quantity: number;
    price: number;
    lot_size: number;
    tick_size: number;
  };
  margin: Record<string, unknown>;
};
async function fetchOptions(
  apiBase: string,
  params: Record<string, string>
): Promise<OptionsResponse> {
  const token = localStorage.getItem("derivasense_token");

  if (!token) {
    throw new Error("DerivaSense authentication is required.");
  }

  const query = new URLSearchParams(params);

  const response = await fetch(
    `${apiBase}/api/zerodha/instruments/options?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.detail || `Options request failed (${response.status})`
    );
  }

  return result as OptionsResponse;
}

const panelStyle: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #293548",
  borderRadius: "10px",
  padding: "18px",
  marginBottom: "18px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: "12px",
  marginBottom: "7px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px",
  borderRadius: "7px",
  border: "1px solid #374151",
  background: "#1b2638",
  color: "#e5e7eb",
  fontSize: "13px",
};

export default function OptionsOrderTicket({
  apiBase,
  connected,
}: {
  apiBase: string;
  connected: boolean | null;
}) {
  const [exchange, setExchange] = useState("NFO");
  const [underlyings, setUnderlyings] = useState<string[]>([]);
  const [underlying, setUnderlying] = useState("");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [optionType, setOptionType] = useState("ALL");
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [contractToken, setContractToken] = useState("");

  const [side, setSide] = useState("BUY");
  const [lots, setLots] = useState("1");
  const [orderType, setOrderType] = useState("LIMIT");
  const [limitPrice, setLimitPrice] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState("NRML");
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginError, setMarginError] = useState("");
  const [marginEstimate, setMarginEstimate] =
    useState<MarginEstimateResponse | null>(null);

  useEffect(() => {
    setMarginEstimate(null);
    setMarginError("");
  }, [exchange, contractToken, side, product, orderType, lots, limitPrice]);
  const selectedContract =
    contracts.find(
      (item) => String(item.instrument_token) === contractToken
    ) ?? null;

  const loadUnderlyings = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    setUnderlying("");
    setExpiry("");
    setExpiries([]);
    setContracts([]);
    setContractToken("");

    try {
      const result = await fetchOptions(apiBase, {
        exchange,
        option_type: "ALL",
        limit: "300",
      });

      setUnderlyings(result.available_underlyings ?? []);

      if (!result.available_underlyings?.length) {
        setMessage("No option underlyings were returned.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load underlyings."
      );
    } finally {
      setLoading(false);
    }
  }, [apiBase, exchange]);

  useEffect(() => {
    if (connected) {
      void loadUnderlyings();
    }
  }, [connected, loadUnderlyings]);

  async function loadExpiries(nextUnderlying: string) {
    setUnderlying(nextUnderlying);
    setExpiry("");
    setExpiries([]);
    setContracts([]);
    setContractToken("");
    setError("");
    setMessage("");

    if (!nextUnderlying) return;

    setLoading(true);

    try {
      const result = await fetchOptions(apiBase, {
        exchange,
        underlying: nextUnderlying,
        option_type: "ALL",
        limit: "300",
      });

      setExpiries(result.available_expiries ?? []);

      if (!result.available_expiries?.length) {
        setMessage("No expiry dates are available for this underlying.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load expiries."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadContracts(
    nextExpiry: string,
    nextOptionType: string
  ) {
    setExpiry(nextExpiry);
    setContracts([]);
    setContractToken("");
    setError("");
    setMessage("");

    if (!underlying || !nextExpiry) return;

    setLoading(true);

    try {
      const result = await fetchOptions(apiBase, {
        exchange,
        underlying,
        expiry: nextExpiry,
        option_type: nextOptionType,
        limit: "300",
      });

      const rows = result.instruments ?? [];
      setContracts(rows);

      if (rows.length === 0) {
        setMessage("No contracts matched the selected filters.");
      } else if (result.truncated) {
        setMessage(
          `Showing ${rows.length} of ${result.total_count ?? "more"} contracts.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load contracts."
      );
    } finally {
      setLoading(false);
    }
  }

  function changeOptionType(nextType: string) {
    setOptionType(nextType);

    if (expiry) {
      void loadContracts(expiry, nextType);
    } else {
      setContracts([]);
      setContractToken("");
    }
  }
 async function estimateMargin() {
    if (!selectedContract || quantity <= 0) return;

    const parsedLots = Number(lots);
    if (!Number.isInteger(parsedLots) || parsedLots <= 0) {
      setMarginError("Enter a valid positive whole number of lots.");
      return;
    }

    const parsedPrice = orderType === "LIMIT" ? Number(limitPrice) : 0;
    if (
      orderType === "LIMIT" &&
      (!Number.isFinite(parsedPrice) || parsedPrice <= 0)
    ) {
      setMarginError("Enter a valid positive limit price.");
      return;
    }

    const token = localStorage.getItem("derivasense_token");
    if (!token) {
      setMarginError("DerivaSense authentication is required.");
      return;
    }

    setMarginLoading(true);
    setMarginError("");
    setMarginEstimate(null);

    try {
      const response = await fetch(
        `${apiBase}/api/zerodha/margins/estimate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            exchange,
            tradingsymbol: selectedContract.tradingsymbol,
            transaction_type: side,
            product,
            order_type: orderType,
            quantity,
            price: parsedPrice,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.detail || `Margin estimate failed (${response.status})`
        );
      }

      setMarginEstimate(result as MarginEstimateResponse);
    } catch (err) {
      setMarginError(
        err instanceof Error
          ? err.message
          : "Unable to estimate order margin."
      );
    } finally {
      setMarginLoading(false);
    }
  }
  const lotCount = Math.max(0, Math.floor(Number(lots) || 0));
  const quantity = selectedContract
    ? lotCount * selectedContract.lot_size
    : 0;

  const price = Number(limitPrice);
  const estimatedValue =
    orderType === "LIMIT" &&
    Number.isFinite(price) &&
    price > 0 &&
    quantity > 0
      ? price * quantity
      : null;

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>
          OPTIONS ORDER TICKET
        </h3>

        <span
          style={{
            color: "#fbbf24",
            background: "#422f13",
            border: "1px solid #79551c",
            borderRadius: "6px",
            padding: "5px 9px",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          DRAFT ONLY · LIVE ORDERS DISABLED
        </span>
      </div>

      <p style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "18px" }}>
        Select a real Zerodha contract and prepare an order preview.
        No order is sent to the broker.
      </p>

      {connected !== true ? (
        <div style={{ color: "#fca5a5", fontSize: "13px" }}>
          Connect Zerodha before using the options contract selector.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Exchange</label>
              <select
                style={inputStyle}
                value={exchange}
                onChange={(event) => setExchange(event.target.value)}
                disabled={loading}
              >
                <option value="NFO">NFO</option>
                <option value="BFO">BFO</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Underlying</label>
              <select
                style={inputStyle}
                value={underlying}
                onChange={(event) => void loadExpiries(event.target.value)}
                disabled={loading || underlyings.length === 0}
              >
                <option value="">Select underlying</option>
                {underlyings.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Expiry</label>
              <select
                style={inputStyle}
                value={expiry}
                onChange={(event) =>
                  void loadContracts(event.target.value, optionType)
                }
                disabled={loading || expiries.length === 0}
              >
                <option value="">Select expiry</option>
                {expiries.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Option Type</label>
              <select
                style={inputStyle}
                value={optionType}
                onChange={(event) => changeOptionType(event.target.value)}
                disabled={loading}
              >
                <option value="ALL">CE + PE</option>
                <option value="CE">Call (CE)</option>
                <option value="PE">Put (PE)</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Zerodha Contract</label>
              <select
                style={inputStyle}
                value={contractToken}
                onChange={(event) => setContractToken(event.target.value)}
                disabled={loading || contracts.length === 0}
              >
                <option value="">Select contract</option>
                {contracts.map((item) => (
                  <option
                    key={item.instrument_token}
                    value={String(item.instrument_token)}
                  >
                    {item.tradingsymbol} · Strike {item.strike} · {item.instrument_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Transaction</label>
              <select
                style={inputStyle}
                value={side}
                onChange={(event) => setSide(event.target.value)}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
  <label style={labelStyle}>Product</label>
  <select
    style={inputStyle}
    value={product}
    onChange={(event) => setProduct(event.target.value)}
    disabled={marginLoading}
  >
    <option value="NRML">NRML</option>
    <option value="MIS">MIS</option>
  </select>
</div>
            <div>
              <label style={labelStyle}>Order Type</label>
              <select
                style={inputStyle}
                value={orderType}
                onChange={(event) => setOrderType(event.target.value)}
              >
                <option value="LIMIT">LIMIT</option>
                <option value="MARKET">MARKET (draft only)</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Number of Lots</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                step="1"
                value={lots}
                onChange={(event) => setLots(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Limit Price (₹)</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                step={selectedContract?.tick_size ?? 0.05}
                placeholder="Enter manually"
                value={limitPrice}
                onChange={(event) => setLimitPrice(event.target.value)}
                disabled={orderType !== "LIMIT"}
              />
            </div>
          </div>

          {loading && (
            <p style={{ color: "#93c5fd", fontSize: "12px" }}>
              Loading Zerodha contracts...
            </p>
          )}

          {error && (
            <p style={{ color: "#fca5a5", fontSize: "12px" }}>{error}</p>
          )}

          {message && (
            <p style={{ color: "#fbbf24", fontSize: "12px" }}>{message}</p>
          )}

          {selectedContract && (
	   <>
            <div
              style={{
                marginTop: "18px",
                padding: "15px",
                borderRadius: "8px",
                border: "1px solid #374151",
                background: "#1b2638",
              }}
            >
              <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>
                Draft Order Preview
              </h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={labelStyle}>Trading Symbol</label>
                  <strong>{selectedContract.tradingsymbol}</strong>
                </div>

                <div>
                  <label style={labelStyle}>Strike / Type</label>
                  <strong>
                    {selectedContract.strike} {selectedContract.instrument_type}
                  </strong>
                </div>

                <div>
                  <label style={labelStyle}>Lot Size</label>
                  <strong>{selectedContract.lot_size}</strong>
                </div>

                <div>
                  <label style={labelStyle}>Total Quantity</label>
                  <strong>{quantity}</strong>
                </div>

                <div>
                  <label style={labelStyle}>Tick Size</label>
                  <strong>₹{selectedContract.tick_size}</strong>
                </div>

                <div>
                  <label style={labelStyle}>Transaction</label>
                  <strong style={{ color: side === "BUY" ? "#86efac" : "#fca5a5" }}>
                    {side}
                  </strong>
                </div>
              </div>

              {estimatedValue !== null && (
                <div style={{ marginTop: "14px", fontSize: "13px" }}>
                  Indicative order value:{" "}
                  <strong>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 2,
                    }).format(estimatedValue)}
                  </strong>
                </div>
              )}

              <div
                style={{
                  marginTop: "15px",
                  padding: "10px",
                  borderRadius: "6px",
                  background: "#422f13",
                  color: "#fcd34d",
                  fontSize: "12px",
                }}
              >
                Preview only. The price is manually entered, not a live quote.
                Order value is not margin. No broker order has been submitted.
              </div>
            </div>
            <div
                style={{
                  marginTop: "15px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => void estimateMargin()}
                  disabled={
                    marginLoading ||
                    !selectedContract ||
                    quantity <= 0 ||
                    (orderType === "LIMIT" &&
                      (!Number.isFinite(price) ||
                        price <= 0 ||
                        Math.abs(
                          price / selectedContract.tick_size -
                            Math.round(price / selectedContract.tick_size)
                        ) > 0.000001))
                  }
                  style={{
                    padding: "10px 15px",
                    borderRadius: "7px",
                    border: "1px solid #2563eb",
                    background: marginLoading ? "#334155" : "#1d4ed8",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: marginLoading ? "wait" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  {marginLoading
                    ? "Estimating Margin..."
                    : "Estimate Zerodha Margin"}
                </button>

                <span style={{ color: "#94a3b8", fontSize: "11px" }}>
                  Read-only broker estimate · No order placement
                </span>
              </div>

              {marginError && (
                <p
                  style={{
                    color: "#fca5a5",
                    fontSize: "12px",
                    marginTop: "12px",
                  }}
                >
                  {marginError}
                </p>
              )}

              {marginEstimate && (
                <div
                  style={{
                    marginTop: "15px",
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px solid #2563eb",
                    background: "#172554",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>
                    Zerodha Margin Estimate
                  </h4>

                  <p style={{ color: "#bfdbfe", fontSize: "11px" }}>
                    {marginEstimate.order.tradingsymbol} ·{" "}
                    {marginEstimate.order.transaction_type} ·{" "}
                    {marginEstimate.order.product} ·{" "}
                    {marginEstimate.order.quantity} quantity
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "10px",
                      marginTop: "12px",
                    }}
                  >
                    {Object.entries(marginEstimate.margin).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          style={{
                            padding: "9px",
                            borderRadius: "6px",
                            background: "#1e3a5f",
                            overflowWrap: "anywhere",
                          }}
                        >
                          <label style={labelStyle}>
                            {key.replace(/_/g, " ")}
                          </label>
                          <strong style={{ fontSize: "13px" }}>
                            {typeof value === "number"
                              ? `₹${value.toLocaleString("en-IN", {
                                  maximumFractionDigits: 2,
                                })}`
                              : typeof value === "object" && value !== null
                                ? JSON.stringify(value)
                                : String(value)}
                          </strong>
                        </div>
                      )
                    )}
                  </div>

                  <p
                    style={{
                      color: "#bfdbfe",
                      fontSize: "11px",
                      marginTop: "12px",
                    }}
                  >
                    Estimate only. Broker margin requirements may change.
                    This request does not place, modify, or cancel an order.
                  </p>
                </div>
              )}
	     </>
          )}
        </>
      )}
    </section>
  );
}
