"use client";

// More — the occasionally-needed stuff, one level down. View-only links open
// the existing pages; theme choice lives here (same mechanism as desktop:
// data-theme on <html> + the pace:theme key, so the whole site follows).

import { useEffect, useState } from "react";

const OPTOUT_KEY = "pace:m:optout";

export default function MMore() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pace:theme", next); } catch {}
  }

  function useDesktop() {
    try { localStorage.setItem(OPTOUT_KEY, "1"); } catch {}
    window.location.href = "/";
  }

  return (
    <>
      <div className="mapp__sec">View</div>
      <div className="mmore">
        <a className="mmore__item" href="/service"><span className="em">⛽</span>Service sheets<small>view · print on desktop</small></a>
        <a className="mmore__item" href="/turnover"><span className="em">🔄</span>Turnover<small>view</small></a>
        <a className="mmore__item" href="/staffing/seniority"><span className="em">👥</span>Staffing<small>view</small></a>
        <a className="mmore__item" href="/object-codes"><span className="em">🔎</span>Object codes<small>reference</small></a>
      </div>

      <div className="mapp__sec">This device</div>
      <div className="mmore">
        <button type="button" className="mmore__item" onClick={toggleTheme}>
          <span className="em">{theme === "dark" ? "☀️" : "🌙"}</span>
          Switch to {theme === "dark" ? "light" : "dark"} mode
          <small>{theme} now</small>
        </button>
        <button type="button" className="mmore__item" onClick={useDesktop}>
          <span className="em">🖥️</span>Use the desktop site
          <small>stops auto-opening the app</small>
        </button>
      </div>

      <div className="mhint">
        Admin tools and printing stay on desktop. The desktop pages above open in this browser — come back with your phone's back button or by visiting /m.
      </div>
    </>
  );
}
