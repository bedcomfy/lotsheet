"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

// A light/dark switch for the app chrome. The actual theme is applied to
// <html data-theme> by an inline script in the layout (so there's no flash on
// load); this button just flips it and remembers the choice per device. The
// printed sheets stay white paper regardless.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "light" ? "light" : "dark");
  }, []);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pace:theme", next);
    } catch {}
  }

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => { ready: Promise<void> };
    };

    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyTheme(next);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = doc.startViewTransition(() => applyTheme(next));
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 520,
          easing: "cubic-bezier(.2,.8,.2,1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  }

  return (
    <button
      ref={buttonRef}
      className={`theme-toggle theme-toggle--${theme}`}
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title="Toggle light / dark"
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb">
          <Sun className="theme-toggle__sun" size={15} />
          <Moon className="theme-toggle__moon" size={15} />
        </span>
      </span>
      <span className="theme-toggle__label">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}
