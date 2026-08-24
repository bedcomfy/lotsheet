"use client";

import { useEffect, useMemo, useState } from "react";
import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { useBusMaster } from "../../components/BusMasterProvider";
import { hybridWeeklyDefinition } from "./definition";
import { HybridWeeklyPaper } from "./HybridWeeklyPaper";
import {
  normalizeHybridWeekStart,
  type HybridWeeklyData,
} from "./schema";

interface HybridWeeklySheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

function getWeek(value: HybridWeeklyData) {
  return value.weekStarting;
}

function setWeek(value: HybridWeeklyData, date: string) {
  return { ...value, weekStarting: normalizeHybridWeekStart(date) };
}

export default function HybridWeeklySheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: HybridWeeklySheetProps) {
  const { hybridServiceBuses, ready: busMasterReady } = useBusMaster();
  const [sheetReady, setSheetReady] = useState(false);
  const busNumbers = useMemo(() => hybridServiceBuses(), [hybridServiceBuses]);
  const ready = sheetReady && busMasterReady;

  useEffect(() => {
    onReady?.(ready);
  }, [onReady, ready]);

  return (
    <>
      <KeyedSheetWorkspace
        definition={hybridWeeklyDefinition}
        paperLabel="Hybrid Bus Weekly Servicing Log paper preview"
        embedded={embedded}
        marker={false}
        dateLabel="Week of"
        dateShortYear={false}
        getDate={getWeek}
        setDate={setWeek}
        onReady={setSheetReady}
        onRegisterFlush={onRegisterFlush}
        describeHistory={(value) => ({
          title: value.weekStarting
            ? `Week of ${value.weekStarting}`
            : "Undated hybrid service log",
          meta: `${busNumbers.length} hybrid buses`,
        })}
        renderPaper={({ value, dateOverride }) => (
          <HybridWeeklyPaper
            data={value}
            busNumbers={busNumbers}
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
