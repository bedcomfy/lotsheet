"use client";

// The Lot Sheet's status modals (tapped from the toolbar chips), extracted
// from LotSheet.tsx verbatim. Render-only: all state stays in LotSheet.

import { Flag } from "lucide-react";
import { flagsFullDisplay } from "../lib/grid";
import type { FlagEntry } from "../lib/types";
import { useBusMaster } from "./BusMasterProvider";
import Overlay, { closeOverlayFromEvent } from "./Overlay";
import TypeCodes from "./TypeCodes";

// Which active buses aren't anywhere on the sheet (tap the stats chip).
export function MissingBusesModal({ missingBuses, accountedBuses, flagFor, onEditFlags, onClose }: {
  missingBuses: string[];
  accountedBuses: string[];
  flagFor: (num: string) => FlagEntry;
  onEditFlags: (bus: string) => void;
  onClose: () => void;
}) {
  const { label: busLabel } = useBusMaster();
  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall"
      label="Missing buses"
    >
      <div className="modal__head">
        <div>
          <div className="modal__title">Missing buses</div>
          <div className="modal__sub">
            {missingBuses.length
              ? `${missingBuses.length} active bus${missingBuses.length === 1 ? "" : "es"} unaccounted for.`
              : "Every active bus is accounted for."}
            {accountedBuses.length
              ? ` ${accountedBuses.length} off property / in shop.`
              : ""}
          </div>
        </div>
        <button className="modal__close" onClick={closeOverlayFromEvent} aria-label="Close">
          ×
        </button>
      </div>
      <div className="lotlist">
        {[...missingBuses, ...accountedBuses].map((bus, i) => {
          const fdisp = flagsFullDisplay(flagFor(bus));
          const firstAccounted = i === missingBuses.length && accountedBuses.length > 0;
          return (
            <div key={bus}>
              {firstAccounted && (
                <div className="lotlist__section">Off property / in shop (not missing)</div>
              )}
              <div className="lotitem">
                <div className="lotitem__info">
                  <span className="lotitem__bus">{busLabel(bus)}</span>
                  <TypeCodes num={bus} />
                  {fdisp && <span className="lotitem__flag">{fdisp}</span>}
                </div>
                <div className="lotitem__actions">
                  <button
                    className="lotitem__move"
                    onClick={() => onEditFlags(bus)} /* stacks on top — Done returns here */
                    aria-label="Edit flags"
                    title="Edit this bus's flags"
                  >
                    <Flag size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="modal__actions">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={closeOverlayFromEvent}>
          Done
        </button>
      </div>
    </Overlay>
  );
}

// Usable / Out of Service detail (tapped from the service chips): where each
// bus is and why it's off the grid.
export function ServiceDetailModal({ kind, readyForService, notReadyForService, fleetLocations, flagFor, onEditFlags, onClose }: {
  kind: "usable" | "outOfService";
  readyForService: Iterable<string>;
  notReadyForService: Iterable<string>;
  fleetLocations: Record<string, string[]>;
  flagFor: (num: string) => FlagEntry;
  onEditFlags: (bus: string) => void;
  onClose: () => void;
}) {
  const { label: busLabel } = useBusMaster();
  const isOut = kind === "outOfService";
  const buses = [...(isOut ? notReadyForService : readyForService)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall"
      label={isOut ? "Out of Service" : "Usable buses"}
    >
      <div className="modal__head">
        <div>
          <div className="modal__title">{isOut ? "Out of Service" : "Usable buses"}</div>
          <div className="modal__sub">
            {isOut
              ? `${buses.length} active bus${buses.length === 1 ? "" : "es"} off the service grid — where they are and why.`
              : `${buses.length} active bus${buses.length === 1 ? "" : "es"} on the service grid.`}
          </div>
        </div>
        <button className="modal__close" onClick={closeOverlayFromEvent} aria-label="Close">
          ×
        </button>
      </div>
      <div className="lotlist">
        {buses.length === 0 && (
          <div className="lotlist__empty">
            {isOut ? "Every active bus is on the grid." : "No buses on the grid yet."}
          </div>
        )}
        {buses.map((bus) => {
          const where = (fleetLocations[bus] || []).join(" / ");
          const why = flagsFullDisplay(flagFor(bus));
          return (
            <div className="oositem" key={bus}>
              <div className="oositem__main">
                <span className="lotitem__bus">{busLabel(bus)}</span>
                <TypeCodes num={bus} />
                <button
                  className="lotitem__move oositem__flagbtn"
                  onClick={() => onEditFlags(bus)} /* stacks on top — Done returns here */
                  aria-label="Edit flags"
                  title="Edit this bus's flags"
                >
                  <Flag size={13} />
                </button>
              </div>
              <div className="oositem__meta">
                <span className="oositem__where">{where || "Not placed"}</span>
                {why && <span className="oositem__why">{why}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="modal__actions">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={closeOverlayFromEvent}>
          Done
        </button>
      </div>
    </Overlay>
  );
}
