"use client";

import { useEffect } from "react";
import { fuelFlagSections } from "../lib/grid";
import { chicagoDateShort } from "../lib/chicagoTime";
import { useFlags } from "../lib/queries";
import { PaperViewport } from "../sheets/core";
import { LETTER_PORTRAIT } from "../sheets/core/profiles";

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

interface ServiceFlagSummaryProps {
  dateOverride?: string;
  onReady?: (ready: boolean) => void;
}

// The service-lane flag list is intentionally its own page. Fuel and DEF PDFs
// stay one-purpose documents; Print All appends this page exactly once.
export default function ServiceFlagSummary({ dateOverride = "", onReady }: ServiceFlagSummaryProps) {
  const { data: flags = {}, isSuccess } = useFlags();
  const sections = fuelFlagSections(flags);
  const displayDate = dateOverride || param("dateOverride") || chicagoDateShort();

  useEffect(() => {
    onReady?.(isSuccess);
  }, [isSuccess, onReady]);

  return (
    <div className="app service-summary">
      <PaperViewport
        profile={LETTER_PORTRAIT}
        mobileViewer
        label="Service Lane paper preview"
        className="fuelsum-scroll"
      >
        <div
          className="sheet fuel-sheet fuelsum fuel-sheet--flags"
          data-paper-page=""
          data-paper-profile="letter-portrait"
          data-sheet-id="service-summary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sheet-brand-logo" src="/logo.png" alt="Pace" />
          <div className="fuelsum__head">
            <div className="fuelsum__title">SERVICE LANE</div>
            <div className="fuelsum__date">{displayDate}</div>
          </div>
          {sections.length ? (
            <div className="fuelsum__sections">
              {sections.map((section) => (
                <div className="fuelsum__section" key={section.id}>
                  <div className="fuelsum__seclabel">{section.label}</div>
                  {section.rows.map((row) => (
                    <div className="fuelsum__row" key={row.bus}>
                      <span className="fuelsum__bus">
                        {row.indicator === "∗" && (
                          <span className="fuelsum__asterisk" aria-label="Multiple service flags">*</span>
                        )}
                        {row.bus}
                      </span>
                      <span className="fuelsum__flags">
                        {row.items.map((item) => `${item.label}${item.detail ? ` (${item.detail})` : ""}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="fuelsum__empty">No active service-lane items.</div>
          )}
        </div>
      </PaperViewport>
    </div>
  );
}
