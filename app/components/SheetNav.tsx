"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, Droplets, FileText, Fuel, List, RefreshCw, Users, Wrench } from "lucide-react";
import BusListEditor from "./BusListEditor";
import EmployeesEditor from "./EmployeesEditor";
import ThemeToggle from "./ThemeToggle";

export interface SheetLink {
  path: string;
  label: string;
  icon: LucideIcon;
}

// The sheets available in the hub. Add new ones here.
export const SHEETS: SheetLink[] = [
  { path: "/", label: "Lot Sheet", icon: ClipboardList },
  { path: "/shop", label: "Shop", icon: Wrench },
  { path: "/turnover", label: "Turnover Sheet", icon: RefreshCw },
  { path: "/fuel", label: "Fuel Sheet", icon: Fuel },
  { path: "/def", label: "DEF Sheet", icon: Droplets },
  { path: "/workorder", label: "Work Order", icon: FileText },
];

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname && SHEETS.some((s) => s.path === pathname) ? pathname : "/";
  const [busListOpen, setBusListOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);

  return (
    <nav className="appnav no-print" aria-label="Main navigation">
      <div className="appnav__brand">
        <span className="appnav__mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="appnav__logo" src="/logo.png" alt="" />
        </span>
        <span>
          <span className="appnav__name">Pace Northwest</span>
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

      <div className="appnav__section appnav__section--sheets">
        <div className="appnav__sectionlabel">Sheets</div>
        {SHEETS.map((sheet) => {
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
        })}
      </div>

      <div className="appnav__section">
        <div className="appnav__sectionlabel">Tools</div>
        <button className="appnav__link" onClick={() => setBusListOpen(true)}>
          <List size={18} /> <span>Bus Lists</span>
        </button>
        <button className="appnav__link" onClick={() => setEmployeesOpen(true)}>
          <Users size={18} /> <span>Employees</span>
        </button>
        <ThemeToggle />
      </div>
      {busListOpen && <BusListEditor onClose={() => setBusListOpen(false)} />}
      {employeesOpen && <EmployeesEditor onClose={() => setEmployeesOpen(false)} />}
    </nav>
  );
}
