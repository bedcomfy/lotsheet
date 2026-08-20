"use client";

import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { busErrorsDefinition } from "./definition";
import { BusErrorsPaper } from "./BusErrorsPaper";

interface BusErrorsSheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

export default function BusErrorsSheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: BusErrorsSheetProps) {
  return (
    <KeyedSheetWorkspace
      definition={busErrorsDefinition}
      paperLabel="Bus Errors paper preview"
      embedded={embedded}
      marker={marker}
      onReady={onReady}
      onRegisterFlush={onRegisterFlush}
      describeHistory={(value) => {
        const filled = value.rows.filter((row) =>
          Object.values(row).some((entry) => String(entry).trim()),
        ).length;
        return {
          title: "Bus Errors",
          meta: `${filled} completed row${filled === 1 ? "" : "s"}`,
        };
      }}
      renderPaper={({ value, onChange }) => (
        <BusErrorsPaper data={value} onChange={onChange} />
      )}
    />
  );
}
