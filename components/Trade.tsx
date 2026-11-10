"use client";

import { useCallback, useEffect, useState } from "react";
import OptionsOrderTicket from "./OptionsOrderTicket";
import EquityOrderTicket from "./EquityOrderTicket";

type Row = Record<string, unknown>;
type Funds = Record<string, unknown>;

type ApiResult<T> = {
  data: T | null;
  error: string;
};

const API_PATHS = {
  funds: "/api/zerodha/funds",
  holdings: "/api/zerodha/holdings",
  positions: "/api/zerodha/positions",
  orders: "/api/zerodha/orders",
  trades: "/api/zerodha/trades",
};

function asObject(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => (
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
      ))
    : [];
}

function money(value: unknown): string {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(number);
}

function getNestedValue(
  source: Row | null,
  path: string[]
): unknown {
  let current: unknown = source;

  for (const key of path) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[key];
  }

  return current;
}

async function request<T>(
  apiBase: string,
  path: string,
  token: string
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.detail || `Request failed (${response.status})`
    );
  }

  return result as T;
}

function TablePanel({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Row[];
  columns: Array<{ key: string; label: string; currency?: boolean }>;
}) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHeading}>
        <h3 style={styles.panelTitle}>{title}</h3>
        <span style={styles.count}>{rows.length} records</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={styles.th}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={styles.empty}
                >
                  No records returned by Zerodha.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.order_id ?? row.trade_id ?? index)}>
                  {columns.map((column) => {
                    const value = row[column.key];

             return (
                      <td key={column.key} style={styles.td}>
                        {column.currency
                          ? money(value)
                          : value === null || value === undefined
                            ? "—"
                            : String(value)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    color: "#e5e7eb",
    padding: "22px",
    minHeight: "100%",
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "14px",
    marginBottom: "22px",
  },
  headingTitle: {
    fontSize: "25px",
    fontWeight: 800,
    margin: 0,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "13px",
    marginTop: "6px",
  },
  button: {
    background: "#16a34a",
    color: "#ffffff",
    border: 0,
    borderRadius: "7px",
    padding: "10px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  panel: {
    background: "#111827",
    border: "1px solid #293548",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "18px",
  },
  panelHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "14px",
  },
  panelTitle: {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  },
  count: {
    color: "#94a3b8",
    fontSize: "12px",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "12px",
    marginBottom: "18px",
  },
  card: {
    background: "#111827",
    border: "1px solid #293548",
    borderRadius: "10px",
    padding: "17px",
  },
  cardLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    marginBottom: "10px",
  },
  cardValue: {
    fontSize: "21px",
    fontWeight: 750,
    color: "#e5e7eb",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
  th: {
    color: "#94a3b8",
    textAlign: "left",
    padding: "11px 10px",
    borderBottom: "1px solid #374151",
  },
  td: {
    padding: "11px 10px",
    borderBottom: "1px solid #253044",
  },
  empty: {
    textAlign: "center",
    padding: "22px",
    color: "#94a3b8",
  },
  message: {
    padding: "12px 15px",
    borderRadius: "7px",
    marginBottom: "15px",
    fontSize: "13px",
  },
};
function FundsBreakdown({
  title,
  segment,
}: {
  title: string;
  segment: Funds | null;
}) {
  const available = asObject(segment?.available);
  const utilised = asObject(segment?.utilised);

  const availableRows: Array<[string, unknown]> = [
    ["Cash", available?.cash],
    ["Opening Balance", available?.opening_balance],
    ["Live Balance", available?.live_balance],
    ["Collateral", available?.collateral],
    ["Intraday Pay-in", available?.intraday_payin],
    ["Adhoc Margin", available?.adhoc_margin],
  ];

  const utilisedRows: Array<[string, unknown]> = [
    ["Debits", utilised?.debits],
    ["SPAN", utilised?.span],
    ["Exposure", utilised?.exposure],
    ["M2M Realised", utilised?.m2m_realised],
    ["M2M Unrealised", utilised?.m2m_unrealised],
    ["Option Premium", utilised?.option_premium],
    ["Payout", utilised?.payout],
    ["Holding Sales", utilised?.holding_sales],
    ["Turnover", utilised?.turnover],
    ["Liquid Collateral", utilised?.liquid_collateral],
    ["Stock Collateral", utilised?.stock_collateral],
    ["Equity", utilised?.equity],
    ["Delivery", utilised?.delivery],
    ["Spread Benefit NFO", utilised?.spread_benefit_nfo],
  ];

  const sectionStyle: React.CSSProperties = {
    background: "#111827",
    border: "1px solid #293548",
    borderRadius: "10px",
    padding: "16px",
    minWidth: 0,
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
  };

  const renderRows = (rows: Array<[string, unknown]>) => (
    <div style={gridStyle}>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            background: "#1b2638",
            borderRadius: "7px",
            padding: "11px",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: "11px" }}>
            {label}
          </div>

          <div style={{
            color: "#e5e7eb",
            fontSize: "14px",
            fontWeight: 700,
            marginTop: "6px",
          }}>
            {value === undefined || value === null
              ? "—"
              : money(value)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section style={sectionStyle}>
      <h3 style={{
        fontSize: "17px",
        fontWeight: 800,
        marginTop: 0,
        marginBottom: "15px",
      }}>
        {title}
      </h3>

      <div style={{
        background: "#183329",
        border: "1px solid #286448",
        borderRadius: "8px",
        padding: "13px",
        marginBottom: "20px",
      }}>
        <div style={{ color: "#86efac", fontSize: "12px" }}>
          Broker Reported Net Margin
        </div>

        <div style={{
          fontSize: "23px",
          fontWeight: 800,
          color: "#ffffff",
          marginTop: "5px",
        }}>
          {money(segment?.net)}
        </div>
      </div>

      <h4 style={{ color: "#93c5fd", fontSize: "13px" }}>
        AVAILABLE FUNDS
      </h4>

      {renderRows(availableRows)}

      <h4 style={{
        color: "#93c5fd",
        fontSize: "13px",
        marginTop: "22px",
      }}>
        UTILISED MARGIN & OTHER COMPONENTS
      </h4>

      {renderRows(utilisedRows)}
    </section>
  );
}
export default function Trade() {
  const apiBase =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
      ? "http://127.0.0.1:8000"
      : "";

  const [connected, setConnected] = useState<boolean | null>(null);
  const [funds, setFunds] = useState<Funds | null>(null);
  const [holdings, setHoldings] = useState<Row[]>([]);
  const [netPositions, setNetPositions] = useState<Row[]>([]);
  const [dayPositions, setDayPositions] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [trades, setTrades] = useState<Row[]>([]);

  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const loadAccount = useCallback(async () => {
    const token = localStorage.getItem("derivasense_token");

    if (!token) {
      setConnected(false);
      setErrors(["DerivaSense authentication is required."]);
      return;
    }

    setLoading(true);
    setErrors([]);

    try {
      const status = await request<{ connected: boolean }>(
        apiBase,
        "/api/zerodha/status",
        token
      );

      setConnected(status.connected);

      if (!status.connected) {
        throw new Error(
          "Zerodha is disconnected. Please reconnect your account."
        );
      }

      const results = await Promise.all([
        request<{ funds?: Funds }>(
          apiBase, API_PATHS.funds, token
        ).then(data => ({ data, error: "" }))
          .catch(error => ({
            data: null,
            error: `Funds: ${error.message}`,
          })),

        request<{ holdings?: Row[] }>(
          apiBase, API_PATHS.holdings, token
        ).then(data => ({ data, error: "" }))
          .catch(error => ({
            data: null,
            error: `Holdings: ${error.message}`,
          })),

        request<{ positions?: { net?: Row[]; day?: Row[] } }>(
          apiBase, API_PATHS.positions, token
        ).then(data => ({ data, error: "" }))
          .catch(error => ({
            data: null,
            error: `Positions: ${error.message}`,
          })),

        request<{ orders?: Row[] }>(
          apiBase, API_PATHS.orders, token
        ).then(data => ({ data, error: "" }))
          .catch(error => ({
            data: null,
            error: `Orders: ${error.message}`,
          })),

        request<{ trades?: Row[] }>(
          apiBase, API_PATHS.trades, token
        ).then(data => ({ data, error: "" }))
          .catch(error => ({
            data: null,
            error: `Trades: ${error.message}`,
          })),
      ]);

      const failures: string[] = [];

      if (results[0].data) {
        setFunds(results[0].data.funds ?? null);
      } else {
        failures.push(results[0].error);
      }

      if (results[1].data) {
        setHoldings(asRows(results[1].data.holdings));
      } else {
        failures.push(results[1].error);
      }

      if (results[2].data) {
        setNetPositions(asRows(results[2].data.positions?.net));
        setDayPositions(asRows(results[2].data.positions?.day));
      } else {
        failures.push(results[2].error);
      }

      if (results[3].data) {
        setOrders(asRows(results[3].data.orders));
      } else {
        failures.push(results[3].error);
      }

      if (results[4].data) {
        setTrades(asRows(results[4].data.trades));
      } else {
        failures.push(results[4].error);
      }

      setErrors(failures);
      setLastUpdated(new Date().toLocaleString("en-IN"));
    } catch (error) {
      setConnected(false);
      setErrors([
        error instanceof Error
          ? error.message
          : "Unable to connect to Zerodha.",
      ]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);
  const connectZerodha = useCallback(async () => {
    const token = localStorage.getItem("derivasense_token");

    if (!token) {
      setErrors(["Please sign in to DerivaSense first."]);
      return;
    }

    setConnecting(true);
    setErrors([]);

    try {
      const result = await request<{ login_url: string }>(
        apiBase,
        "/api/zerodha/login-url",
        token
      );

      if (!result.login_url) {
        throw new Error("Zerodha did not return a login URL.");
      }

      window.location.assign(result.login_url);
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "Unable to start Zerodha login.",
      ]);
      setConnecting(false);
    }
  }, [apiBase]);

  // ============================================================
// AUTOMATIC ZERODHA ACCOUNT REFRESH
// ============================================================

useEffect(() => {
  // Load account immediately when Trade page opens.
  void loadAccount();

  // Refresh account data every 60 seconds.
  const refreshTimer = window.setInterval(() => {
    void loadAccount();
  }, 60 * 1000);

  // Stop refreshing when Trade page is closed.
  return () => {
    window.clearInterval(refreshTimer);
  };
}, [loadAccount]);

  const equity = asObject(funds?.equity);
  const commodity = asObject(funds?.commodity);
    return (
    <div style={styles.page}>
      <div style={styles.heading}>
        <div>
          <h2 style={styles.headingTitle}>TRADE TERMINAL</h2>
          <div style={styles.subtitle}>
            Zerodha account dashboard · Read-only mode
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              ...styles.button,
              opacity: connecting ? 0.65 : 1,
            }}
            disabled={connecting || loading}
            onClick={() => void connectZerodha()}
          >
            {connecting ? "Opening Kite..." : "Connect Zerodha"}
          </button>

          <button
            type="button"
            style={{
              ...styles.button,
              opacity: loading ? 0.65 : 1,
            }}
            disabled={loading || connecting}
            onClick={() => void loadAccount()}
          >
            {loading ? "Refreshing..." : "↻ Refresh Account"}
          </button>
        </div>
      </div>

      <div
        style={{
          ...styles.message,
          background: connected ? "#123522" : "#422020",
          color: connected ? "#86efac" : "#fecaca",
        }}
      >
        {connected
          ? "● Zerodha connected"
          : "● Zerodha connection unavailable"}
        {lastUpdated && ` · Updated ${lastUpdated}`}
      </div>

      <OptionsOrderTicket apiBase={apiBase} connected={connected} />
      <EquityOrderTicket apiBase={apiBase} connected={connected} />

      {errors.map((error, index) => (
        <div
          key={index}
          style={{
            ...styles.message,
            background: "#422020",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      ))}


<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "16px",
  marginBottom: "20px",
}}>
  <FundsBreakdown
    title="EQUITY FUNDS & MARGIN"
    segment={equity}
  />

  <FundsBreakdown
    title="COMMODITY FUNDS & MARGIN"
    segment={commodity}
  />
</div>


      <TablePanel
        title="Equity Holdings"
        rows={holdings}
        columns={[
          { key: "tradingsymbol", label: "Symbol" },
          { key: "exchange", label: "Exchange" },
          { key: "quantity", label: "Quantity" },
          { key: "average_price", label: "Average Price", currency: true },
          { key: "last_price", label: "Last Price", currency: true },
          { key: "pnl", label: "P&L", currency: true },
        ]}
      />

      <TablePanel
        title="Net Positions"
        rows={netPositions}
        columns={[
          { key: "tradingsymbol", label: "Symbol" },
          { key: "exchange", label: "Exchange" },
          { key: "product", label: "Product" },
          { key: "quantity", label: "Quantity" },
          { key: "average_price", label: "Average Price", currency: true },
          { key: "last_price", label: "Last Price", currency: true },
          { key: "pnl", label: "P&L", currency: true },
        ]}
      />

      <TablePanel
        title="Day Positions"
        rows={dayPositions}
        columns={[
          { key: "tradingsymbol", label: "Symbol" },
          { key: "exchange", label: "Exchange" },
          { key: "product", label: "Product" },
          { key: "quantity", label: "Quantity" },
          { key: "buy_quantity", label: "Buy Qty" },
          { key: "sell_quantity", label: "Sell Qty" },
          { key: "pnl", label: "P&L", currency: true },
        ]}
      />

      <TablePanel
        title="Today's Order Book"
        rows={orders}
        columns={[
          { key: "order_id", label: "Order ID" },
          { key: "tradingsymbol", label: "Symbol" },
          { key: "transaction_type", label: "Side" },
          { key: "quantity", label: "Quantity" },
          { key: "filled_quantity", label: "Filled" },
          { key: "order_type", label: "Type" },
          { key: "status", label: "Status" },
        ]}
      />

      <TablePanel
        title="Today's Executed Trades"
        rows={trades}
        columns={[
          { key: "trade_id", label: "Trade ID" },
          { key: "tradingsymbol", label: "Symbol" },
          { key: "exchange", label: "Exchange" },
          { key: "transaction_type", label: "Side" },
          { key: "quantity", label: "Quantity" },
          { key: "price", label: "Execution Price", currency: true },
        ]}
      />

      <div
        style={{
          color: "#94a3b8",
          fontSize: "11px",
          textAlign: "center",
          padding: "12px",
        }}
      >
        Read-only account view. No order placement, modification or cancellation
        is available in this version.
      </div>
    </div>
  );
}