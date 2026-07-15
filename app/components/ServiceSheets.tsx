"use client";

import { useEffect, useState } from "react";
import { Fuel, Droplets, Coins } from "lucide-react";
import FuelSheet from "./FuelSheet";
import FareboxSheet from "./FareboxSheet";

// Service Sheets — the lane sheets printed at the start of every shift, on one
// page: Fuel (1 copy), DEF (2 copies — north & south lane), and the Farebox
// checks (2 copies — north & south lane). Only the active tab is mounted; each
// sheet keeps its own toolbar, autosave, and Print PDF exactly as before.
// (/fuel, /def, and /farebox still exist as standalone routes — the PDF
// renderer uses them — they're just no longer in the sidebar.)

const TABS = [
  { id: "fuel", label: "Fuel", copies: "print 1", icon: Fuel },
  { id: "def", label: "DEF", copies: "print 2 — N & S", icon: Droplets },
  { id: "farebox", label: "Farebox", copies: "print 2 — N & S", icon: Coins },
] as const;
type TabId = (typeof TABS)[number]["id"];

function initialTab(): TabId {
  if (typeof window === "undefined") return "fuel";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "def" || t === "farebox" ? t : "fuel";
}

export default function ServiceSheets() {
  const [tab, setTab] = useState<TabId>(initialTab);

  // Keep the tab in the URL so links/refresh land on the same sheet.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "fuel") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  return (
    <>
      <nav className="servicetabs no-print" aria-label="Service sheets">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              className={`servicetab ${active ? "servicetab--active" : ""}`}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              <small>{t.copies}</small>
            </button>
          );
        })}
      </nav>
      {tab === "fuel" && <FuelSheet title="PNW FUEL SHEET" storageKey="fuel" />}
      {tab === "def" && <FuelSheet title="PNW DEF SHEET" storageKey="def" showShiftFields />}
      {tab === "farebox" && <FareboxSheet />}
    </>
  );
}
