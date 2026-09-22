
"use client";

type Index = {
  symbol: string;
  spot: number;
  chg: number;
  chgPct: number;
};

type HeaderProps = {
  indices: Index[];
  marketOpen: boolean;
  asOf: string;
  menuOpen: boolean;
  onMenu: () => void;
  onSignIn: () => void;
  isAuthenticated: boolean;
  onSignOut: () => void;
};

const f = (n: number) =>
  Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Header({
  indices,
  marketOpen,
  asOf,
  menuOpen,
  onMenu,
  onSignIn,
  isAuthenticated,
  onSignOut,
}: HeaderProps) {
  /* =====================================================
     MARKET TICKER DATA
     ===================================================== */

  const ticks: Index[] = [
    ...indices,
    {
      symbol: "INDIA VIX",
      spot: 13.85,
      chg: -0.06,
      chgPct: -0.46,
    },
  ];

  return (
    <header className="topbar">
      {/* =====================================================
          MAIN HORIZONTAL HEADER
         ===================================================== */}

      <div className="brandbar">

        {/* ===================================================
            LEFT SIDE — MENU + LOGO
           =================================================== */}

        <div className="brand-left">

          <button
            className={`menu-button ${
              menuOpen ? "active" : ""
            }`}
            onClick={onMenu}
            aria-label="Open navigation menu"
            title="Menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <img
            className="brand-logo"
            src="/Logo.png"
            alt="DerivaSense AI"
          />

          <div>
            <div className="brand-title">
              DERIVASENSE AI
            </div>

            <div className="brand-sub">
              PRO OPTIONS TERMINAL
            </div>
          </div>
        </div>

        {/* ===================================================
            RIGHT SIDE
           =================================================== */}

        <div className="brand-right">

          {/* MARKET STATUS */}

          <div className="status">
            <span
              className={`dot ${
                marketOpen ? "" : "off"
              }`}
            />

            <span>
              {marketOpen
                ? "Market Open"
                : "Market Closed"}
            </span>

            <span className="mono">
              {asOf}
            </span>
          </div>

          {/* =================================================
              SIGN IN / SIGN OUT
             ================================================= */}

          {isAuthenticated ? (
            <button
              className="signin"
              onClick={onSignOut}
            >
              SIGN OUT
            </button>
          ) : (
            <button
              className="signin"
              onClick={onSignIn}
            >
              SIGN IN
            </button>
          )}

          {/* COMPANY NAME */}

          <img
            className="wordmark"
            src="/Company_name.png"
            alt="DerivaSense AI"
          />
        </div>
      </div>

      {/* =====================================================
          MARKET TICKER
         ===================================================== */}

      <div className="ticker">
        <div className="ticker-track">

          {[...ticks, ...ticks].map(
            (item, index) => (
              <div
                className="tick"
                key={`${item.symbol}-${index}`}
              >
                <b>
                  {item.symbol}
                </b>

                <strong
                  className={`mono ${
                    item.chg >= 0
                      ? "up"
                      : "down"
                  }`}
                >
                  {f(item.spot)}{" "}
                  {item.chg >= 0
                    ? "+"
                    : ""}
                  {f(item.chg)}{" "}
                  {" ("}
                  {item.chgPct >= 0
                    ? "+"
                    : ""}
                  {f(item.chgPct)}
                  {"%)"}
                </strong>
              </div>
            )
          )}

        </div>
      </div>
    </header>
  );
}
