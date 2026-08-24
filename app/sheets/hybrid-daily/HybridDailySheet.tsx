"use client";

import { useEffect, useMemo, useState } from "react";
import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { useBusMaster } from "../../components/BusMasterProvider";
import { hybridDailyDefinition } from "./definition";
import { HybridDailyPaper } from "./HybridDailyPaper";
import type { HybridDailyData } from "./schema";

interface HybridDailySheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

function getDate(value: HybridDailyData) {
  return value.date;
}

function setDate(value: HybridDailyData, date: string) {
  return { ...value, date };
}

export default function HybridDailySheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: HybridDailySheetProps) {
  const { hybridServiceBuses, ready: busMasterReady } = useBusMaster();
  const [sheetReady, setSheetReady] = useState(false);
  const [queryReady, setQueryReady] = useState(false);
  const [requestedDate, setRequestedDate] = useState("");
  const busNumbers = useMemo(() => hybridServiceBuses(), [hybridServiceBuses]);
  const ready = sheetReady && busMasterReady && queryReady;

  useEffect(() => {
    setRequestedDate(
      new URLSearchParams(window.location.search).get("dateOverride") || "",
    );
    setQueryReady(true);
  }, []);

  useEffect(() => {
    onReady?.(ready);
  }, [onReady, ready]);

  return (
    <>
      <KeyedSheetWorkspace
        definition={hybridDailyDefinition}
        paperLabel="Hybrid Bus Daily Servicing Log paper preview"
        embedded={embedded}
        marker={false}
        dateOverride={requestedDate}
        dateLabel="Service date"
        dateShortYear={false}
        getDate={getDate}
        setDate={setDate}
        onReady={setSheetReady}
        onRegisterFlush={onRegisterFlush}
        printLabel="Print Current Roster"
        blankPrintLabel="Print Blank Daily Log"
        getBlankPrintParams={(value) => ({ dateOverride: value.date })}
        describeHistory={(value) => ({
          title: value.date ? `Date: ${value.date}` : "Undated hybrid daily log",
          meta: `${busNumbers.length} hybrid buses`,
        })}
        renderPaper={({ value, blank, dateOverride }) => (
          <HybridDailyPaper
            data={value}
            busNumbers={blank ? [] : busNumbers}
            dateOverride={dateOverride}
          />
        )}
      />
      {marker && ready && (
        <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />
      )}
    </>
  );
}
