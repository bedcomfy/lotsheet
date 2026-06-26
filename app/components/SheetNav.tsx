"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BusListEditor from "./BusListEditor";
import EmployeesEditor from "./EmployeesEditor";

export interface SheetLink {
  path: string;
  label: string;
}

// The sheets available in the hub. Add new ones here.
export const SHEETS: SheetLink[] = [
  { path: "/", label: "Lot Sheet" },
  { path: "/turnover", label: "Turnover Sheet" },
  { path: "/fuel", label: "Fuel Sheet" },
  { path: "/def", label: "DEF Sheet" },
];

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname && SHEETS.some((s) => s.path === pathname) ? pathname : "/";
  const [busListOpen, setBusListOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);

  return (
    <div className="appnav no-print">
      <span className="appnav__brand">Pace Sheets</span>
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
      <button className="appnav__btn" onClick={() => setBusListOpen(true)}>
        Bus Lists
      </button>
      <button className="appnav__btn" onClick={() => setEmployeesOpen(true)}>
        Employees
      </button>
      {busListOpen && <BusListEditor onClose={() => setBusListOpen(false)} />}
      {employeesOpen && <EmployeesEditor onClose={() => setEmployeesOpen(false)} />}
    </div>
  );
}
