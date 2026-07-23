"use client";

// The phone shell's bottom tab bar — the always-reachable navigation of the
// "responsive shell, print-faithful canvas" design. Fixed at the bottom on
// phones only (CSS-hidden >=700px, never printed) and layered BELOW dialogs
// but ABOVE page content; per-sheet docks sit above it, never on top of it,
// so there is always a way back from any screen.
//
// Tabs: Tonight (/home) · Lot (/) · Sheets (hub overlay) · Buses (/buses) ·
// More (hub overlay). The hubs are full-screen covers with their own close.

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const SHEETY = ["/turnover", "/service", "/workorder", "/fuel", "/def", "/farebox"];

export default function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [hub, setHub] = useState<null | "sheets" | "more">(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => setHub(null), [pathname]); // navigating closes any hub
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, [hub]);

  function go(path: string) {
    setHub(null);
    router.push(path);
  }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pace:theme", next); } catch {}
  }

  const active = (t: string) =>
    t === "tonight" ? pathname === "/home"
    : t === "lot" ? pathname === "/"
    : t === "buses" ? pathname === "/buses"
    : t === "sheets" ? SHEETY.some((p) => pathname.startsWith(p))
    : false;

  const tab = (id: string, em: string, label: string, onTap: () => void) => (
    <button
      type="button"
      key={id}
      className={`mtabbar__btn ${active(id) || hub === id ? "mtabbar__btn--on" : ""}`}
      onClick={onTap}
    >
      <span className="mtabbar__em" aria-hidden="true">{em}</span>
      {label}
    </button>
  );

  return (
    <>
      <nav className="mtabbar no-print" aria-label="Mobile navigation">
        {tab("tonight", "🏠", "Tonight", () => go("/home"))}
        {tab("lot", "📋", "Lot", () => go("/"))}
        {tab("sheets", "🗂️", "Sheets", () => setHub(hub === "sheets" ? null : "sheets"))}
        {tab("buses", "🚌", "Buses", () => go("/buses"))}
        {tab("more", "≡", "More", () => setHub(hub === "more" ? null : "more"))}
      </nav>

      {hub === "sheets" && (
        <div className="mhub no-print" role="dialog" aria-label="Sheets">
          <div className="mhub__head">
            <b>Sheets</b>
            <span>every paper, exactly as printed</span>
            <button type="button" className="mhub__close" onClick={() => setHub(null)} aria-label="Close">✕</button>
          </div>
          <div className="mhub__list">
            <button type="button" className="mhub__card" onClick={() => go("/")}>
              <span className="em">📋</span>
              <span><b>Lot Sheet</b><span>tap cells to edit · pans at actual size</span></span>
              <span className="go">›</span>
            </button>
            <button type="button" className="mhub__card" onClick={() => go("/turnover")}>
              <span className="em">🔄</span>
              <span><b>Turnover Sheet</b><span>shift handoff · legal size</span></span>
              <span className="go">›</span>
            </button>
            <button type="button" className="mhub__card" onClick={() => go("/service")}>
              <span className="em">⛽</span>
              <span><b>Service Sheets</b><span>Fuel · DEF · Farebox</span></span>
              <span className="go">›</span>
            </button>
            <div className="mhub__chips">
              <button type="button" onClick={() => go("/service?tab=fuel")}>Fuel</button>
              <button type="button" onClick={() => go("/service?tab=def")}>DEF</button>
              <button type="button" onClick={() => go("/service?tab=farebox")}>Farebox</button>
            </div>
            <button type="button" className="mhub__card" onClick={() => go("/workorder")}>
              <span className="em">📄</span>
              <span><b>Work Order</b><span>Oracle eAM form</span></span>
              <span className="go">›</span>
            </button>
          </div>
        </div>
      )}

      {hub === "more" && (
        <div className="mhub no-print" role="dialog" aria-label="More">
          <div className="mhub__head">
            <b>More</b>
            <span>tools &amp; settings</span>
            <button type="button" className="mhub__close" onClick={() => setHub(null)} aria-label="Close">✕</button>
          </div>
          <div className="mhub__list">
            <button type="button" className="mhub__card" onClick={() => go("/shop")}>
              <span className="em">🔧</span>
              <span><b>Shop</b><span>apron · bays · cards</span></span>
              <span className="go">›</span>
            </button>
            <button type="button" className="mhub__card" onClick={() => go("/staffing/seniority")}>
              <span className="em">👥</span>
              <span><b>Staffing</b><span>seniority &amp; work pick</span></span>
              <span className="go">›</span>
            </button>
            <button type="button" className="mhub__card" onClick={() => go("/object-codes")}>
              <span className="em">🔎</span>
              <span><b>Object codes</b><span>maintenance reference</span></span>
              <span className="go">›</span>
            </button>
            <button type="button" className="mhub__card" onClick={toggleTheme}>
              <span className="em">{theme === "dark" ? "☀️" : "🌙"}</span>
              <span><b>Switch to {theme === "dark" ? "light" : "dark"} mode</b><span>{theme} now</span></span>
            </button>
            <div className="mhub__note">
              Admin tools and bulk printing live on the desktop site — the phone
              is the floor companion.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
