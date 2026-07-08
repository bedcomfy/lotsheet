"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Activity, ChevronDown, ClipboardList, Droplets, FileText, Fuel, Home, List, RefreshCw, SearchCode, Users, Wrench } from "lucide-react";
import BusListEditor from "./BusListEditor";
import EmployeesEditor from "./EmployeesEditor";
import ThemeToggle from "./ThemeToggle";
import { APP_VERSION } from "../lib/appVersion";

export interface SheetLink {
  path: string;
  label: string;
  icon: LucideIcon;
}

const HOME_LINK: SheetLink = { path: "/home", label: "Home", icon: Home };

export const DAILY_SHEETS: SheetLink[] = [
  { path: "/", label: "Lot Sheet", icon: ClipboardList },
  { path: "/turnover", label: "Turnover Sheet", icon: RefreshCw },
  { path: "/fuel", label: "Fuel Sheet", icon: Fuel },
  { path: "/def", label: "DEF Sheet", icon: Droplets },
];

export const SHOP_SHEETS: SheetLink[] = [
  { path: "/shop", label: "Shop", icon: Wrench },
];

export const FORM_SHEETS: SheetLink[] = [
  { path: "/workorder", label: "Work Order", icon: FileText },
];

export const SYSTEM_LINKS: SheetLink[] = [
  { path: "/audit", label: "Audit Log", icon: Activity },
];

export const UTILITY_LINKS: SheetLink[] = [
  { path: "/object-codes", label: "Object Codes", icon: SearchCode },
];

// The sheets available in the mobile picker. Add new ones here.
export const SHEETS: SheetLink[] = [HOME_LINK, ...DAILY_SHEETS, ...SHOP_SHEETS, ...FORM_SHEETS, ...UTILITY_LINKS, ...SYSTEM_LINKS];

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname && SHEETS.some((s) => s.path === pathname) ? pathname : "/";
  const [busListOpen, setBusListOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(() => UTILITY_LINKS.some((s) => s.path === current));
  const renderLink = (sheet: SheetLink) => {
    const Icon = sheet.icon;
    return (
      <button
        key={sheet.path}
        className={`appnav__link ${current === sheet.path ? "appnav__link--active" : ""}`}
        onClick={() => router.push(sheet.path)}
      >
        <Icon size={18} />
        <span>{sheet.label}</span>
      </button>
    );
  };

  return (
    <nav className="appnav no-print" aria-label="Main navigation">
      <div className="appnav__brand">
        <span className="appnav__mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="appnav__logo" src="/logo.png" alt="" />
        </span>
        <span>
          <span className="appnav__name">Pace Northwest</span>
          <span className="appnav__sub">Operations</span>
        </span>
      </div>

      <label className="appnav__picker">
        <span className="appnav__pickerlabel">Sheet</span>
        <select
          className="appnav__select"
          value={current}
          onChange={(e) => router.push(e.target.value)}
        >
          {SHEETS.map((s) => (
            <option key={s.path} value={s.path}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="appnav__section appnav__section--primary">
        {renderLink(HOME_LINK)}
      </div>

      <div className="appnav__section appnav__section--sheets">
        <div className="appnav__sectionlabel">Daily Sheets</div>
        {DAILY_SHEETS.map(renderLink)}
      </div>

      <div className="appnav__section">
        <div className="appnav__sectionlabel">Shop</div>
        {SHOP_SHEETS.map(renderLink)}
        <button className="appnav__link" onClick={() => setBusListOpen(true)}>
          <List size={18} /> <span>Bus Lists</span>
        </button>
        <button className="appnav__link" onClick={() => setEmployeesOpen(true)}>
          <Users size={18} /> <span>Employees</span>
        </button>
      </div>

      <div className="appnav__section">
        <div className="appnav__sectionlabel">Forms</div>
        {FORM_SHEETS.map(renderLink)}
      </div>

      <div className="appnav__section">
        <button
          className="appnav__sectiontoggle"
          onClick={() => setUtilitiesOpen((open) => !open)}
          aria-expanded={utilitiesOpen}
        >
          <span>Utilities</span>
          <ChevronDown size={15} className={utilitiesOpen ? "appnav__chev appnav__chev--open" : "appnav__chev"} />
        </button>
        {utilitiesOpen && <div className="appnav__subsection">{UTILITY_LINKS.map(renderLink)}</div>}
      </div>

      <div className="appnav__section appnav__section--bottom">
        <div className="appnav__sectionlabel">System</div>
        {SYSTEM_LINKS.map(renderLink)}
        <ThemeToggle />
        <div className="appnav__version">v{APP_VERSION}</div>
      </div>
      {busListOpen && <BusListEditor onClose={() => setBusListOpen(false)} />}
      {employeesOpen && <EmployeesEditor onClose={() => setEmployeesOpen(false)} />}
    </nav>
  );
}
