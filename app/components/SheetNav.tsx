"use client";

import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Activity, ClipboardList, Droplets, FileText, Fuel, Home, RefreshCw, SearchCode, ShieldAlert, Users, Wrench } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { APP_VERSION } from "../lib/appVersion";

export interface SheetLink {
  path: string;
  label: string;
  icon: LucideIcon;
  // Grouped destinations (Staffing, Admin Tools) land on a default page but own a
  // whole path prefix via in-page tabs; matchPrefix keeps the single sidebar entry
  // highlighted across all of its sub-pages.
  matchPrefix?: string;
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

// Staffing and Admin Tools each have their own tabbed shell, so the sidebar lists
// ONE entry apiece (the tabs handle Seniority/Work Pick and Flag Editor/Bus Lists).
export const STAFFING_LINK: SheetLink = { path: "/staffing/seniority", label: "Staffing", icon: Users, matchPrefix: "/staffing" };
export const ADMIN_LINK: SheetLink = { path: "/admin/flags", label: "Admin Tools", icon: ShieldAlert, matchPrefix: "/admin" };

export const UTILITY_LINKS: SheetLink[] = [
  { path: "/object-codes", label: "Object Codes", icon: SearchCode },
];

export const SYSTEM_LINKS: SheetLink[] = [
  { path: "/audit", label: "Audit Log", icon: Activity },
];

// The main flat list under Home (everyday destinations). Admin Tools and the
// Audit Log are pinned to the bottom of the sidebar instead.
export const NAV_LINKS: SheetLink[] = [...DAILY_SHEETS, ...SHOP_SHEETS, ...FORM_SHEETS, STAFFING_LINK, ...UTILITY_LINKS];

// Pinned to the bottom, above the theme toggle / version.
export const BOTTOM_LINKS: SheetLink[] = [ADMIN_LINK, ...SYSTEM_LINKS];

// Every destination for the mobile picker.
export const SHEETS: SheetLink[] = [HOME_LINK, ...NAV_LINKS, ...BOTTOM_LINKS];

function isActive(sheet: SheetLink, pathname: string | null): boolean {
  if (!pathname) return false;
  if (sheet.matchPrefix) return pathname === sheet.path || pathname.startsWith(sheet.matchPrefix);
  return pathname === sheet.path;
}

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const current = SHEETS.find((s) => isActive(s, pathname))?.path || "/";
  const renderLink = (sheet: SheetLink) => {
    const Icon = sheet.icon;
    return (
      <button
        key={sheet.path}
        className={`appnav__link ${isActive(sheet, pathname) ? "appnav__link--active" : ""}`}
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
        {NAV_LINKS.map(renderLink)}
      </div>

      <div className="appnav__section appnav__section--bottom">
        {BOTTOM_LINKS.map(renderLink)}
        <ThemeToggle />
        <div className="appnav__version">v{APP_VERSION}</div>
      </div>
    </nav>
  );
}
