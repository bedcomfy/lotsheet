"use client";

import { useEffect, useMemo, useState } from "react";
import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { useBusMaster } from "../../components/BusMasterProvider";
import { countsTowardFleet } from "../../lib/fleetStats";
import { monthlyCleaningDefinition } from "./definition";
import { MonthlyCleaningPaper } from "./MonthlyCleaningPaper";
import {
  cleaningMonthLabel,
  normalizeCleaningMonth,
  type MonthlyCleaningData,
} from "./schema";

interface MonthlyCleaningSheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

function getMonth(value: MonthlyCleaningData) {
  return value.month;
}

function setMonth(value: MonthlyCleaningData, month: string) {
  return { ...value, month: normalizeCleaningMonth(month) };
}

export default function MonthlyCleaningSheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: MonthlyCleaningSheetProps) {
  const { master, ready: busMasterReady } = useBusMaster();
  const [sheetReady, setSheetReady] = useState(false);
  const busNumbers = useMemo(
    () => master.buses.filter(countsTowardFleet).map((bus) => bus.num),
    [master.buses],
  );
  const ready = sheetReady && busMasterReady;

  useEffect(() => {
    onReady?.(ready);
  }, [onReady, ready]);

  return (
    <>
      <KeyedSheetWorkspace
        definition={monthlyCleaningDefinition}
        paperLabel="Monthly Bus Cleaning paper preview"
        embedded={embedded}
        marker={false}
        dateLabel="Cleaning month"
        dateControlType="month"
        getDate={getMonth}
        setDate={setMonth}
        onReady={setSheetReady}
        onRegisterFlush={onRegisterFlush}
        blankPrintLabel="Print Blank Monthly Sheet"
        describeHistory={(value) => ({
          title: cleaningMonthLabel(value.month) || "Undated cleaning month",
          meta: `${Object.keys(value.entries || {}).length} buses completed`,
        })}
        renderPaper={({ value, onChange, blank }) => (
          <MonthlyCleaningPaper
            data={value}
            busNumbers={busNumbers}
            blank={blank}
            onChange={onChange}
          />
        )}
      />
      {marker && ready && (
        <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />
      )}
    </>
  );
}
