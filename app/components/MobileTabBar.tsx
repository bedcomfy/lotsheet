"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BusFront,
  ChevronRight,
  ClipboardList,
  FileText,
  Fuel,
  Home,
  Layers3,
  Moon,
  MoreHorizontal,
  RefreshCw,
  SearchCode,
  ShieldAlert,
  Sun,
  Users,
  Wrench,
  X,
} from "lucide-react";

const SHEET_PATHS = ["/turnover", "/service", "/workorder", "/fuel", "/def", "/farebox"];

interface HubLink {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
}

const SHEET_LINKS: HubLink[] = [
  { label: "Lot Sheet", description: "Live placement and bus flags", path: "/", icon: ClipboardList },
  { label: "Turnover Sheet", description: "Shift handoff and first-half notes", path: "/turnover", icon: RefreshCw },
  { label: "Service Sheets", description: "Fuel, DEF, farebox, and lane", path: "/service", icon: Fuel },
  { label: "Work Order", description: "Oracle eAM printable form", path: "/workorder", icon: FileText },
];

const MORE_LINKS: HubLink[] = [
  { label: "Shop", description: "Apron, bays, and cards", path: "/shop", icon: Wrench },
  { label: "Staffing", description: "Seniority and work picks", path: "/staffing/seniority", icon: Users },
  { label: "Object Codes", description: "Maintenance code reference", path: "/object-codes", icon: SearchCode },
  { label: "Admin Tools", description: "Flags, fleet, and employees", path: "/admin/flags", icon: ShieldAlert },
  { label: "Audit Log", description: "Recent changes across sheets", path: "/audit", icon: Activity },
];

export default function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [hub, setHub] = useState<null | "sheets" | "more">(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => setHub(null), [pathname]);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, [hub]);

  function go(path: string) {
    setHub(null);
    router.push(path);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pace:theme", next);
    } catch {}
  }

  function isActive(id: string) {
    if (id === "home") return pathname === "/home";
    if (id === "lot") return pathname === "/";
    if (id === "fleet") return pathname === "/buses";
    if (id === "sheets") return SHEET_PATHS.some((path) => pathname.startsWith(path));
    return false;
  }

  function tab(id: string, Icon: LucideIcon, label: string, onTap: () => void) {
    return (
      <button
        type="button"
        key={id}
        className={`mtabbar__btn ${isActive(id) || hub === id ? "mtabbar__btn--on" : ""}`}
        onClick={onTap}
      >
        <Icon className="mtabbar__icon" size={20} strokeWidth={2} />
        <span>{label}</span>
      </button>
    );
  }

  function renderHub(title: string, description: string, links: HubLink[]) {
    return (
      <div className="mhub no-print" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mhub__head">
          <span className="mhub__eyebrow">Pace Northwest</span>
          <b>{title}</b>
          <span>{description}</span>
          <button type="button" className="mhub__close" onClick={() => setHub(null)} aria-label={`Close ${title}`}>
            <X size={20} />
          </button>
        </div>
        <div className="mhub__list">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button type="button" className="mhub__card" key={link.path} onClick={() => go(link.path)}>
                <span className="mhub__icon"><Icon size={20} /></span>
                <span className="mhub__copy"><b>{link.label}</b><small>{link.description}</small></span>
                <ChevronRight size={18} />
              </button>
            );
          })}
          {title === "More" && (
            <button type="button" className="mhub__card mhub__theme" onClick={toggleTheme}>
              <span className="mhub__icon">{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}</span>
              <span className="mhub__copy">
                <b>{theme === "dark" ? "Light mode" : "Dark mode"}</b>
                <small>Switch application appearance</small>
              </span>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <nav className="mtabbar no-print" aria-label="Mobile navigation">
        {tab("home", Home, "Home", () => go("/home"))}
        {tab("lot", ClipboardList, "Lot", () => go("/"))}
        {tab("sheets", Layers3, "Sheets", () => setHub(hub === "sheets" ? null : "sheets"))}
        {tab("fleet", BusFront, "Fleet", () => go("/buses"))}
        {tab("more", MoreHorizontal, "More", () => setHub(hub === "more" ? null : "more"))}
      </nav>

      {hub === "sheets" && renderHub("Sheets", "Daily garage forms", SHEET_LINKS)}
      {hub === "more" && renderHub("More", "Tools and administration", MORE_LINKS)}
    </>
  );
}
