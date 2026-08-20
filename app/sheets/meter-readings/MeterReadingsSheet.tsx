"use client";

import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { meterReadingsDefinition } from "./definition";
import { MeterReadingsPaper } from "./MeterReadingsPaper";
import type { MeterReadingsData } from "./schema";

interface MeterReadingsSheetProps {
  embedded?: boolean;
  marker?: boolean;
  dateOverride?: string;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

function getDate(value: MeterReadingsData) {
  return value.date;
}

function setDate(value: MeterReadingsData, date: string) {
  return { ...value, date };
}

export default function MeterReadingsSheet({
  embedded = false,
  marker = true,
  dateOverride = "",
  onReady,
  onRegisterFlush,
}: MeterReadingsSheetProps) {
  return (
    <KeyedSheetWorkspace
      definition={meterReadingsDefinition}
      paperLabel="Fuel Meter Readings paper preview"
      embedded={embedded}
      marker={marker}
      dateOverride={dateOverride}
      getDate={getDate}
      setDate={setDate}
      onReady={onReady}
      onRegisterFlush={onRegisterFlush}
      describeHistory={(value) => ({
        title: value.date ? `Date: ${value.date}` : "Undated meter readings",
        meta: value.busesWashed
          ? "Bus wash recorded"
          : value.busesNotWashed
            ? "Buses not washed"
            : "No wash status",
      })}
      renderPaper={({ value, onChange, dateOverride: paperDate }) => (
        <MeterReadingsPaper
          data={value}
          onChange={onChange}
          dateOverride={paperDate}
        />
      )}
    />
  );
}
