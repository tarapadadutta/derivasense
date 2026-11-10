"use client";

import { useState } from "react";

type EquityInstrument = {
  instrument_token: number;
  exchange: string;
  tradingsymbol: string;
  name: string;
  lot_size: number;
  tick_size: number;
  instrument_type: string;
  segment: string;
};

type SearchResponse = {
  success: boolean;
  instruments?: EquityInstrument[];
  detail?: string;
};

type MarginResponse = {
  success: boolean;
  estimate_only?: boolean;
  order?: {
    indicative_price?: number;
    indicative_value?: number;
  };
  margin?: Record<string, unknown>;
  detail?: string;
};

type Draft = {
  symbol: string;
  name: string;
  side: string;
  product: string;
  orderType: string;
  quantity: number;
  limitPrice: number | null;
  referenceValue: number | null;
  createdAt: string;
};

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

const buttonStyle: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: "7px",
  border: "1px solid #475569",
  background: "#263449",
  color: "#e5e7eb",
  cursor: "pointer",
  fontSize: "13px",
};

export default function EquityOrderTicket({
  apiBase,
  connected,
}: {
  apiBase: string;
  connected: boolean | null;
}) {
  const [search, setSearch] = useState("RELIANCE");
  const [results, setResults] = useState<EquityInstrument[]>([]);
  const [selected, setSelected] = useState<EquityInstrument | null>(null);
  const [side, setSide] = useState("BUY");
  const [product, setProduct] = useState("CNC");
  const [orderType, setOrderType] = useState("LIMIT");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [margin, setMargin] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const apiRoot = apiBase.replace(/\/+$/, "");

  async function authenticatedFetch(
    path: string,
    options: RequestInit = {},
  ) {
    const token = localStorage.getItem("derivasense_token");

    if (!token) {
      throw new Error("DerivaSense authentication is required.");
    }

    const response = await fetch(`${apiRoot}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.detail || `Request failed (${response.status}).`,
      );
    }

    return result;
  }

  async function searchEquities() {
    setError("");
    setNotice("");
    setResults([]);
    setSelected(null);
    setMargin(null);
    setDraft(null);

    const term = search.trim();

    if (term.length < 2) {
      setError("Enter at least two characters to search NSE shares.");
      return;
    }

    setBusy(true);

    try {
      const result = (await authenticatedFetch(
        `/api/zerodha/instruments/equity?search=${encodeURIComponent(term)}&limit=30`,
      )) as SearchResponse;

      setResults(result.instruments || []);

      if (!result.instruments?.length) {
        setNotice("No matching NSE equity instruments were found.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Equity search failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseInstrument(item: EquityInstrument) {
    setSelected(item);
    setResults([]);
    setMargin(null);
    setDraft(null);
    setError("");
    setNotice(
      `${item.tradingsymbol} selected. Market quote access is unavailable with the current Zerodha Personal app.`,
    );
  }

  async function prepareDraft() {
    setError("");
    setNotice("");
    setMargin(null);
    setDraft(null);

    if (!selected) {
      setError("Search and select an NSE share first.");
      return;
    }

    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    let price: number | null = null;

    if (orderType === "LIMIT") {
      price = Number(limitPrice);

      if (!Number.isFinite(price) || price <= 0) {
        setError("Enter a valid positive LIMIT price.");
        return;
      }

      const tick = Number(selected.tick_size) || 0.05;
      const steps = price / tick;

      if (Math.abs(steps - Math.round(steps)) > 0.000001) {
        setError(`Price must follow the NSE tick size of ${tick}.`);
        return;
      }
    }

    setBusy(true);

    try {
      let marginResult: MarginResponse | null = null;
      let referenceValue: number | null = null;

      const mustCheckHoldings =
        side === "SELL" && product === "CNC";

      if (orderType === "LIMIT" || mustCheckHoldings) {
        try {
          marginResult = (await authenticatedFetch(
            "/api/zerodha/equity/margins/estimate",
            {
              method: "POST",
              body: JSON.stringify({
                exchange: "NSE",
                tradingsymbol: selected.tradingsymbol,
                transaction_type: side,
                product,
                order_type: orderType,
                quantity: qty,
                price: price ?? 0,
              }),
            },
          )) as MarginResponse;

          if (marginResult.margin) {
            setMargin(marginResult.margin);
          }

          if (typeof marginResult.order?.indicative_value === "number") {
            referenceValue = marginResult.order.indicative_value;
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Margin estimate failed.";

          const expectedMarketRestriction =
            orderType === "MARKET" &&
            mustCheckHoldings &&
            message.includes("MARKET draft saved only in the ticket");

          if (expectedMarketRestriction) {
            setNotice(
              "CNC holding check passed. Market margin cannot be estimated without market-data permission.",
            );
          } else if (
            mustCheckHoldings ||
            message.includes("authentication") ||
            message.includes("401") ||
            message.includes("403")
          ) {
            throw err;
          } else {
            setNotice(`Margin estimate unavailable: ${message}`);
          }
        }
      }

      if (orderType === "LIMIT" && price !== null) {
        referenceValue = qty * price;
      }

      setDraft({
        symbol: selected.tradingsymbol,
        name: selected.name,
        side,
        product,
        orderType,
        quantity: qty,
        limitPrice: price,
        referenceValue,
        createdAt: new Date().toLocaleString(),
      });

      if (orderType === "MARKET") {
        setNotice(
          "Market draft prepared locally. No live market price or margin estimate is available.",
        );
      } else if (!marginResult) {
        setNotice(
          "LIMIT draft prepared locally using your entered price. Margin estimate is unavailable.",
        );
      } else {
        setNotice(
          "LIMIT draft prepared. The reference value uses your entered limit price, not a live quote.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to prepare equity draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "8px",
        }}
      >
        <h2 style={{ color: "#e5e7eb", fontSize: "18px", margin: 0 }}>
          EQUITY ORDER TICKET
        </h2>

        <span
          style={{
            color: "#fbbf24",
            background: "#422f16",
            border: "1px solid #76551f",
            borderRadius: "6px",
            padding: "5px 9px",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          DRAFT ONLY · NO LIVE ORDERS
        </span>
      </div>

      <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: 0 }}>
        NSE equity drafts using your existing Zerodha Personal application.
        No order is sent to the exchange.
      </p>

      <div
        style={{
          background: "#302719",
          border: "1px solid #69512b",
          color: "#fcd68a",
          padding: "10px",
          borderRadius: "7px",
          fontSize: "12px",
          marginBottom: "15px",
        }}
      >
        Market quotes are not available with the current app permissions.
        LIMIT reference values use your entered price. MARKET drafts have no
        live-price or margin estimate.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "9px",
          marginBottom: "12px",
        }}
      >
        <div>
          <label style={labelStyle}>SEARCH NSE SHARE</label>
          <input
            style={inputStyle}
            value={search}
            onChange={(event) => setSearch(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchEquities();
            }}
            placeholder="RELIANCE, TCS, INFY..."
          />
        </div>

        <div style={{ alignSelf: "end" }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => void searchEquities()}
            disabled={busy || !connected}
          >
            Search
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div
          style={{
            border: "1px solid #374151",
            borderRadius: "7px",
            marginBottom: "14px",
            maxHeight: "190px",
            overflowY: "auto",
          }}
        >
          {results.map((item) => (
            <button
              type="button"
              key={`${item.exchange}-${item.tradingsymbol}`}
              onClick={() => chooseInstrument(item)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px",
                border: 0,
                borderBottom: "1px solid #293548",
                background: "#1b2638",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              <strong>{item.tradingsymbol}</strong>
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                {" "}— {item.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          style={{
            background: "#172538",
            border: "1px solid #334155",
            borderRadius: "7px",
            padding: "10px",
            marginBottom: "14px",
            color: "#e5e7eb",
            fontSize: "13px",
          }}
        >
          <strong>{selected.tradingsymbol}</strong> — {selected.name}
          <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "4px" }}>
            NSE · Tick size {selected.tick_size} · Lot size {selected.lot_size}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: "12px",
        }}
      >
        <div>
          <label style={labelStyle}>TRANSACTION</label>
          <select
            style={inputStyle}
            value={side}
            onChange={(event) => {
              setSide(event.target.value);
              setDraft(null);
              setMargin(null);
            }}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>PRODUCT</label>
          <select
            style={inputStyle}
            value={product}
            onChange={(event) => {
              setProduct(event.target.value);
              setDraft(null);
              setMargin(null);
            }}
          >
            <option value="CNC">CNC (Delivery)</option>
            <option value="MIS">MIS (Intraday)</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>ORDER TYPE</label>
          <select
            style={inputStyle}
            value={orderType}
            onChange={(event) => {
              setOrderType(event.target.value);
              setDraft(null);
              setMargin(null);
            }}
          >
            <option value="LIMIT">LIMIT</option>
            <option value="MARKET">MARKET</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>QUANTITY</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setDraft(null);
              setMargin(null);
            }}
          />
        </div>

        {orderType === "LIMIT" && (
          <div>
            <label style={labelStyle}>LIMIT PRICE (₹)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step={selected?.tick_size || 0.05}
              value={limitPrice}
              onChange={(event) => {
                setLimitPrice(event.target.value);
                setDraft(null);
                setMargin(null);
              }}
              placeholder="Enter limit price"
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: "16px" }}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            background: "#174b38",
            borderColor: "#287653",
            fontWeight: 700,
            opacity: busy || !connected ? 0.6 : 1,
          }}
          onClick={() => void prepareDraft()}
          disabled={busy || !connected}
        >
          {busy ? "PLEASE WAIT..." : "PREPARE EQUITY DRAFT"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            color: "#fecaca",
            background: "#422020",
            borderRadius: "7px",
            padding: "10px",
            marginTop: "12px",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            color: "#bfdbfe",
            background: "#172b45",
            borderRadius: "7px",
            padding: "10px",
            marginTop: "12px",
            fontSize: "12px",
          }}
        >
          {notice}
        </div>
      )}

      {draft && (
        <div
          style={{
            marginTop: "16px",
            padding: "13px",
            border: "1px solid #3b536e",
            borderRadius: "8px",
            background: "#142235",
            color: "#e5e7eb",
          }}
        >
          <h3 style={{ fontSize: "14px", margin: "0 0 10px" }}>
            DRAFT REVIEW — NOT SUBMITTED
          </h3>

          <div style={{ fontSize: "12px", lineHeight: 1.9 }}>
            <div>Share: <strong>{draft.symbol}</strong> ({draft.name})</div>
            <div>Transaction: <strong>{draft.side}</strong></div>
            <div>Product: <strong>{draft.product}</strong></div>
            <div>Order type: <strong>{draft.orderType}</strong></div>
            <div>Quantity: <strong>{draft.quantity}</strong></div>
            {draft.limitPrice !== null && (
              <div>Entered limit price: <strong>₹{draft.limitPrice.toFixed(2)}</strong></div>
            )}
            {draft.referenceValue !== null && (
              <div>
                Reference value: <strong>₹{draft.referenceValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
              </div>
            )}
            <div style={{ color: "#94a3b8" }}>Prepared: {draft.createdAt}</div>
          </div>

          <p style={{ color: "#fbbf24", fontSize: "11px", marginBottom: 0 }}>
            This is a local ticket draft only. It is not saved as a Zerodha
            order and has not been transmitted.
          </p>
        </div>
      )}

      {margin && (
        <div style={{ marginTop: "13px" }}>
          <h3 style={{ color: "#cbd5e1", fontSize: "13px" }}>
            ZERODHA MARGIN ESTIMATE
          </h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              background: "#0b1220",
              color: "#cbd5e1",
              border: "1px solid #293548",
              borderRadius: "7px",
              padding: "11px",
              fontSize: "11px",
            }}
          >
            {JSON.stringify(margin, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}