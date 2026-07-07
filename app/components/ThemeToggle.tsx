"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// A light/dark switch for the app chrome. The actual theme is applied to
// <html data-theme> by an inline script in the layout (so there's no flash on
// load); this button just flips it and remembers the choice per device. The
// printed sheets stay white paper regardless.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pace:theme", next);
    } catch {}
  }

  return (
    <button
      className="appnav__btn appnav__icon"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title="Toggle light / dark"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      <span className="appnav__themeText">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}
