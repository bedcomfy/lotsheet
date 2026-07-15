"use client";

// The Lot Sheet's SHOP menu — edit Apron / Bays / Cards without leaving the
// page. Extracted from LotSheet.tsx verbatim; all state stays in LotSheet and
// arrives through props, so behavior is identical.

import { Plus } from "lucide-react";
import { flagsFullDisplay } from "../lib/grid";
import type { FlagEntry, FlagMap } from "../lib/types";
import { useBusMaster } from "./BusMasterProvider";
import Overlay, { closeOverlayFromEvent } from "./Overlay";

const BAY_SPOTS = 10; // the shop's fixed bays (shared with the Turnover sheet)

interface ShopMenuProps {
  inShopCount: number | string;
  bays: string[]; // sheet.lots.bay
  flags: FlagMap;
  flagFor: (num: string) => FlagEntry;
  lotList: (key: string) => string[];
  foundBus: string;
  onEditLot: (key: string) => void;
  onEditBay: (index: number) => void;
  onClose: () => void;
}

export default function ShopMenu({ inShopCount, bays, flags, flagFor, lotList, foundBus, onEditLot, onEditBay, onClose }: ShopMenuProps) {
  const { label: busLabel } = useBusMaster();
  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall modal--shop"
      label="Shop"
    >
      <div className="modal__head">
        <div>
          <div className="modal__title">Shop</div>
          <div className="modal__sub">
            {inShopCount} bus{inShopCount === 1 ? "" : "es"} inside · shared live with the Shop page
          </div>
        </div>
        <button className="modal__close" onClick={closeOverlayFromEvent} aria-label="Close">
          ×
        </button>
      </div>

      <div className="shopmenu">
        <div className="shopmenu__sec">
          <div className="shopmenu__head">
            Apron <span className="shopcard__count">({lotList("apron").length})</span>
            <button className="btn btn--mini" onClick={() => onEditLot("apron")}>
              Edit
            </button>
          </div>
          <div className="apronchips">
            {lotList("apron").length === 0 && <span className="apronchips__empty">No buses on the apron.</span>}
            {lotList("apron").map((b, i) => {
              const f = flagsFullDisplay(flagFor(b));
              return (
                <span key={`a${i}`} className={`apronchip ${!!foundBus && b === foundBus ? "apronchip--found" : ""}`}>
                  {busLabel(b)}
                  {f && <span className="apronchip__flags">{f}</span>}
                </span>
              );
            })}
          </div>
        </div>

        <div className="shopmenu__sec">
          <div className="shopmenu__head">Bays</div>
          <div className="shopslots">
            {Array.from({ length: BAY_SPOTS }, (_, i) => {
              const b = bays[i] || "";
              const xed = b === "X";
              const entry = b && !xed ? flags[b] : undefined;
              // Full flags (hold reason, inspection option, the whole note)
              // — the most important info for a shop bus.
              const disp = entry ? flagsFullDisplay(entry) : "";
              const rfs = !!entry?.flags?.includes("rfs");
              const isFound = !!foundBus && b === foundBus;
              return (
                <button
                  key={`bay${i}`}
                  type="button"
                  className={`shopslot ${b && !xed ? "shopslot--filled" : ""} ${xed ? "shopslot--blocked" : ""} ${
                    rfs ? "shopslot--rfs" : ""
                  } ${isFound ? "shopslot--found" : ""}`}
                  onClick={() => onEditBay(i)}
                >
                  <span className="shopslot__label">BAY {i + 1}</span>
                  {xed ? (
                    <span className="shopslot__x">X</span>
                  ) : b ? (
                    <>
                      <span className="shopslot__bus">{busLabel(b)}</span>
                      {disp && <span className="shopslot__flag">{disp}</span>}
                    </>
                  ) : (
                    <span className="shopslot__empty">
                      <Plus size={15} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shopmenu__sec">
          <div className="shopmenu__head">
            Cards <span className="shopcard__count">({lotList("cards").length})</span>
            <button className="btn btn--mini" onClick={() => onEditLot("cards")}>
              Edit
            </button>
            <span className="shopcard__legend">
              <span className="shopcard__legenddot" /> Ready for Service
            </span>
          </div>
          <div className="apronchips">
            {lotList("cards").length === 0 && <span className="apronchips__empty">No buses in cards.</span>}
            {lotList("cards").map((b, i) => {
              const rfs = !!flags[b]?.flags?.includes("rfs");
              const f = flagsFullDisplay(flagFor(b));
              return (
                <span
                  key={`c${i}`}
                  className={`apronchip ${rfs ? "apronchip--rfs" : ""} ${!!foundBus && b === foundBus ? "apronchip--found" : ""}`}
                >
                  {busLabel(b)}
                  {f && <span className="apronchip__flags">{f}</span>}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
