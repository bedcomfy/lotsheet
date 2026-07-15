"use client";

import { useEffect, useState } from "react";
import { Layers, Fuel, Droplets, Coins, FileDown } from "lucide-react";
import { openSheetPdf } from "../lib/pdf";
import FuelSheet from "./FuelSheet";
import FareboxSheet from "./FareboxSheet";

// Service Sheets — the lane sheets printed at the start of every shift, on one
// page. Structured like the Staffing/Admin pages: header, tabs, then the sheet.
// "All" stacks every sheet on one page and offers Print Blank — one blank copy
// of each (no flags, no lane indicator on DEF, a single farebox set) for the
// clipboard stash. The individual tabs behave exactly like the old separate
// pages, except printing now always carries flags, and DEF/Farebox print an
// N-circled copy and an S-circled copy in one PDF.

const TABS = [
  { id: "all", label: "All", hint: "every sheet", icon: Layers },
  { id: "fuel", label: "Fuel", hint: "1 copy", icon: Fuel },
  { id: "def", label: "DEF", hint: "N + S copies", icon: Droplets },
  { id: "farebox", label: "Farebox", hint: "N + S sets", icon: Coins },
] as const;
type TabId = (typeof TABS)[number]["id"];

function initialTab(): TabId {
  if (typeof window === "undefined") return "all";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "fuel" || t === "def" || t === "farebox" ? t : "all";
}

export default function ServiceSheets() {
  const [tab, setTab] = useState<TabId>(initialTab);

  // Keep the tab in the URL so links/refresh land on the same sheet.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  function printBlankAll() {
    // One PDF: blank fuel + blank DEF (no N/S) + one blank farebox set.
    openSheetPdf({ path: "/service/print-blank", params: { blank: 1 } });
  }

  // marker={false}: #print-ready is only for the standalone print routes the
  // PDF renderer loads (/fuel, /def, /farebox) — never this page, and three
  // sheets on one page must not render duplicate ids.
  const fuel = <FuelSheet title="PNW FUEL SHEET" storageKey="fuel" marker={false} />;
  const def = <FuelSheet title="PNW DEF SHEET" storageKey="def" showShiftFields laneCopies marker={false} />;
  const farebox = <FareboxSheet marker={false} />;

  return (
    <main className="adminpage servicepage">
      <section className="adminhero">
        <div>
          <span className="adminhero__eyebrow">Daily sheets</span>
          <h1>Service Sheets</h1>
          <p>The lane sheets printed at the start of every shift — Fuel (1 copy), DEF (N &amp; S copies), and the Farebox checks (N &amp; S sets).</p>
        </div>
      </section>

      <nav className="admintabs" aria-label="Service sheets">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              className={`admintab ${active ? "admintab--active" : ""}`}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{t.label}</span>
              <small className="admintab__hint">{t.hint}</small>
            </button>
          );
        })}
      </nav>

      {tab === "all" && (
        <>
          <div className="serviceall no-print">
            <span className="serviceall__note">
              Every sheet, one page. Each sheet keeps its own toolbar and Print PDF.
            </span>
            <button
              className="btn"
              onClick={printBlankAll}
              title="One blank copy of every sheet — no flags, no lane indicator on DEF, one farebox set"
            >
              <FileDown size={16} /> Print Blank (all sheets)
            </button>
          </div>
          {fuel}
          {def}
          {farebox}
        </>
      )}
      {tab === "fuel" && fuel}
      {tab === "def" && def}
      {tab === "farebox" && farebox}
    </main>
  );
}
