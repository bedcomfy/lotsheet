"use client";

// Shop — bays, apron, and cards at a glance (mechanic country). Tapping any
// bus opens its card. View-first for v1; editing stays on desktop.

import { useLotSheet, useFlags } from "../../lib/queries";
import { flagsFullDisplay } from "../../lib/grid";
import { useBusMaster } from "../BusMasterProvider";

const BAY_SPOTS = 10;

export default function MShop({ onOpenBus }: { onOpenBus: (bus: string) => void }) {
  const { data } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { label } = useBusMaster();
  const sheet = data?.sheet || null;
  const lots = sheet?.lots || {};

  const bayList = lots.bay || [];
  const chips = (key: "apron" | "cards" | "north" | "east" | "fence") => (lots[key] || []).filter((b) => b && b !== "X");

  const flagLine = (bus: string) => {
    const entry = flags[bus];
    if (!entry) return "";
    const rfs = (entry.flags || []).includes("rfs");
    return rfs ? "READY FOR SERVICE" : flagsFullDisplay(entry);
  };

  function chipRow(title: string, key: "apron" | "cards" | "north" | "east" | "fence") {
    const list = chips(key);
    return (
      <>
        <div className="mapp__sec">{title} · {list.length}</div>
        {list.length === 0 ? (
          <div className="mhint">Nothing here right now.</div>
        ) : (
          <div className="mbuschips">
            {list.map((b, i) => (
              <button
                type="button"
                key={`${b}${i}`}
                className={`mbuschip ${(flags[b]?.flags || []).length ? "mbuschip--flag" : ""}`}
                onClick={() => onOpenBus(b)}
              >
                {label(b)}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mapp__sec">Bays</div>
      <div className="mbays">
        {Array.from({ length: BAY_SPOTS }, (_, i) => {
          const b = bayList[i] || "";
          const xed = b === "X";
          if (!b || xed) {
            return (
              <div className={`mbay mbay--empty`} key={i}>
                <small>BAY {i + 1}</small>
                <b>{xed ? "✕ blocked" : "Empty"}</b>
              </div>
            );
          }
          const rfs = (flags[b]?.flags || []).includes("rfs");
          return (
            <button type="button" className={`mbay ${rfs ? "mbay--rfs" : ""}`} key={i} onClick={() => onOpenBus(b)}>
              <small>BAY {i + 1}</small>
              <b>{label(b)}</b>
              {flagLine(b) && <em>{flagLine(b)}</em>}
            </button>
          );
        })}
      </div>
      {chipRow("Apron", "apron")}
      {chipRow("Cards", "cards")}
      {chipRow("North Lot", "north")}
      {chipRow("East Lot", "east")}
      {chipRow("Fence", "fence")}
    </>
  );
}
