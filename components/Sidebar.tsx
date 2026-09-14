"use client";

export type Page =
  | "dashboard"
  | "charts"
  | "analysis"
  | "strategy"
  | "watchlist"
  | "market"
  | "settings";

const workspaceItems: Array<[Page, string, string]> = [
  ["dashboard", "⌂", "Dashboard"],
  ["charts", "◒", "Charts"],
  ["analysis", "▦", "Analysis"],
  ["strategy", "◆", "Strategy"],
  ["watchlist", "★", "Watchlist"],
  ["market", "◫", "Market"],
];

type SidebarProps = {
  page: Page;
  setPage: (page: Page) => void;
  onSignIn: () => void;
};

export default function Sidebar({
  page,
  setPage,
  onSignIn,
}: SidebarProps) {

  return (
    <aside className="sidebar">

      {/* HEADER */}

      <div className="sidebar-header">

        <div className="sidebar-title">
          MENU
        </div>

        <div className="sidebar-subtitle">
          PRO OPTIONS TERMINAL
        </div>

      </div>

      {/* WORKSPACE */}

      <div className="sidebar-section-title">
        WORKSPACE
      </div>

      <nav className="sidebar-nav">

        {workspaceItems.map(
          ([id, icon, label]) => (

            <button
              key={id}
              className={`side-button ${
                page === id ? "active" : ""
              }`}
              onClick={() => setPage(id)}
            >

              <span className="side-icon">
                {icon}
              </span>

              <span className="side-label">
                {label}
              </span>

              {page === id && (
                <span className="side-active-indicator" />
              )}

            </button>

          )
        )}

      </nav>

      {/* SYSTEM */}

      <div className="sidebar-section-title system-title">
        SYSTEM
      </div>

      <button
        className={`side-button ${
          page === "settings" ? "active" : ""
        }`}
        onClick={() => setPage("settings")}
      >

        <span className="side-icon">
          ⚙
        </span>

        <span className="side-label">
          Settings
        </span>

        {page === "settings" && (
          <span className="side-active-indicator" />
        )}

      </button>

      {/* SPACER */}

      <div className="sidebar-spacer" />

      {/* SIGN IN */}

      <div className="sidebar-signin-container">

        <button
          className="sidebar-signin"
          onClick={onSignIn}
        >

          <span className="signin-lock">
            ⇥
          </span>

          <span>
            SIGN IN
          </span>

        </button>

      </div>

      {/* FOOTER */}

      <div className="sidebar-footer">
        DERIVASENSE AI
        <br />
        <span>v1.0 · Foundation</span>
      </div>

    </aside>
  );
}