"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Eraser,
  FileDown,
  Flag,
  History,
  LayoutGrid,
  ListChecks,
  ListX,
  MoreHorizontal,
  Search,
  Share2,
  Wrench,
  X,
} from "lucide-react";

export interface MobileLotChromeProps {
  zoom: "pan" | "fit";
  onZoom: (zoom: "pan" | "fit") => void;
  searchRequest: number;
  onFill: () => void;
  onFlags: () => void;
  onShop: () => void;
  onPrint: () => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  onPrev: () => void;
  onShare: () => void;
  onPrintBlank: () => void;
  onClearGrid: () => void;
  onClearLots: () => void;
  showMaint: boolean;
  onShowMaint: (value: boolean) => void;
  usableCount: number;
  outCount: number;
  missingCount: number;
  onUsable: () => void;
  onOut: () => void;
  onMissing: () => void;
  findVal: string;
  onFind: (value: string) => void;
  foundWhere: string;
  foundBus: string;
}

export default function MobileLotChrome(props: MobileLotChromeProps) {
  // Open/close: the sheet renders while open OR closing; the rise animation
  // plays via CSS the moment it mounts (no requestAnimationFrame state flip —
  // that left the sheet stuck in its pointer-events:none "closing" style if
  // the frame callback was delayed or dropped, which read as "the menu is
  // there but nothing can be tapped").
  const [moreOpen, setMoreOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const openMore = useCallback(() => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setClosing(false);
    setMoreOpen(true);
  }, []);

  const closeMore = useCallback(() => {
    setClosing(true);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setMoreOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    if (!props.searchRequest) return;
    openMore();
  }, [openMore, props.searchRequest]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMore();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMore, moreOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!moreOpen || !props.searchRequest) return;
    const timer = window.setTimeout(() => findInputRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [moreOpen, props.searchRequest]);

  function run(action: () => void) {
    closeMore();
    action();
  }

  return (
    <>
      <button
        type="button"
        className="mchrome__zoom no-print"
        onClick={() => props.onZoom(props.zoom === "fit" ? "pan" : "fit")}
        aria-label={props.zoom === "fit" ? "View sheet at 100 percent" : "Fit whole sheet"}
      >
        {props.zoom === "fit" ? "100%" : "Fit"}
      </button>

      <div className="mobile-actions no-print" aria-label="Lot Sheet actions">
        <button className="mobile-action mobile-action--primary" onClick={props.onFill} type="button">
          <LayoutGrid size={18} />
          <span>Fill</span>
        </button>
        <button className="mobile-action" onClick={props.onFlags} type="button">
          <Flag size={18} />
          <span>Flags</span>
        </button>
        <button className="mobile-action" onClick={props.onShop} type="button">
          <Wrench size={18} />
          <span>Shop</span>
        </button>
        <button className="mobile-action" onClick={props.onPrint} type="button">
          <FileDown size={18} />
          <span>Print</span>
        </button>
        <button
          className={`mobile-action ${moreOpen ? "mobile-action--open" : ""}`}
          onClick={openMore}
          type="button"
        >
          <MoreHorizontal size={18} />
          <span>More</span>
        </button>
      </div>

      {(moreOpen || closing) && (
        <div className={`mchrome__scrim no-print ${closing ? "mchrome__scrim--closing" : ""}`} onClick={closeMore}>
          <section
            className="mchrome__sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More Lot Sheet actions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mchrome__grab" aria-hidden="true" />
            <header className="mchrome__head">
              <div>
                <h2>More</h2>
                <p>Find a bus or use a sheet action.</p>
              </div>
              <button type="button" className="mchrome__close" onClick={closeMore} aria-label="Close">
                <X size={20} />
              </button>
            </header>

            <div className="mchrome__body">
              <label className="mchrome__find">
                <Search size={17} />
                <input
                  ref={findInputRef}
                  aria-label="Find bus"
                  placeholder="Find bus"
                  inputMode="numeric"
                  value={props.findVal}
                  onChange={(event) => props.onFind(event.target.value)}
                />
                {props.findVal && (
                  <button type="button" className="mchrome__findclear" onClick={() => props.onFind("")} aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </label>
              {props.findVal && (
                <p className={`mchrome__findmsg ${props.foundBus ? "mchrome__findmsg--found" : ""}`}>
                  {props.foundBus ? props.foundWhere || "Not on the sheet" : "Enter a four-digit bus number"}
                </p>
              )}

              <h3>Status</h3>
              <div className="mchrome__stats">
                <button type="button" className="mchrome__stat mchrome__stat--ok" onClick={() => run(props.onUsable)}>
                  {props.usableCount} usable
                </button>
                <button type="button" className="mchrome__stat mchrome__stat--bad" onClick={() => run(props.onOut)}>
                  {props.outCount} out of service
                </button>
                <button type="button" className={`mchrome__stat ${props.missingCount ? "mchrome__stat--warn" : ""}`} onClick={() => run(props.onMissing)}>
                  {props.missingCount} missing
                </button>
              </div>

              <h3>Actions</h3>
              <div className="mchrome__grid">
                <button type="button" className="mchrome__item" onClick={() => run(props.onToggleSelect)}>
                  <ListChecks size={17} /> {props.selectMode ? "Exit select" : "Select buses"}
                </button>
                <button type="button" className="mchrome__item" onClick={() => run(props.onPrev)}>
                  <History size={17} /> Prev Sheets
                </button>
                <button type="button" className="mchrome__item" onClick={() => run(props.onShare)}>
                  <Share2 size={17} /> Share as text
                </button>
                <button type="button" className="mchrome__item" onClick={() => run(props.onPrintBlank)}>
                  <ClipboardList size={17} /> Print Blank
                </button>
              </div>

              <label className="mchrome__toggle">
                <input
                  type="checkbox"
                  checked={props.showMaint}
                  onChange={(event) => props.onShowMaint(event.target.checked)}
                />
                <span>
                  <strong>Maintenance info</strong>
                  <small>Include maintenance details on the printout.</small>
                </span>
              </label>

              <h3>Danger zone</h3>
              <div className="mchrome__grid">
                <button type="button" className="mchrome__item mchrome__item--danger" onClick={() => run(props.onClearGrid)}>
                  <Eraser size={17} /> Clear Grid
                </button>
                <button type="button" className="mchrome__item mchrome__item--danger" onClick={() => run(props.onClearLots)}>
                  <ListX size={17} /> Clear Lots
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
