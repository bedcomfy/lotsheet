"use client";

import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { interiorCleaningDefinition } from "./definition";
import { InteriorCleaningPaper } from "./InteriorCleaningPaper";
import type { InteriorCleaningData } from "./schema";

interface InteriorCleaningSheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

function getDate(value: InteriorCleaningData) {
  return value.date;
}

function setDate(value: InteriorCleaningData, date: string) {
  return { ...value, date };
}

export default function InteriorCleaningSheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: InteriorCleaningSheetProps) {
  return (
    <KeyedSheetWorkspace
      definition={interiorCleaningDefinition}
      paperLabel="Interior Cleaning paper preview"
      embedded={embedded}
      marker={marker}
      getDate={getDate}
      setDate={setDate}
      onReady={onReady}
      onRegisterFlush={onRegisterFlush}
      describeHistory={(value) => ({
        title: value.date ? `Date: ${value.date}` : "Undated cleaning sheet",
        meta: value.busNumber ? `Bus ${value.busNumber}` : "No bus entered",
      })}
      renderPaper={({ value, onChange, dateOverride }) => (
        <InteriorCleaningPaper
          data={value}
          onChange={onChange}
          dateOverride={dateOverride}
        />
      )}
    />
  );
}
