"use client";

import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { requestTimeOffDefinition } from "./definition";
import { RequestTimeOffPaper } from "./RequestTimeOffPaper";

interface RequestTimeOffSheetProps {
  embedded?: boolean;
  marker?: boolean;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

export default function RequestTimeOffSheet({
  embedded = false,
  marker = true,
  onReady,
  onRegisterFlush,
}: RequestTimeOffSheetProps) {
  return (
    <KeyedSheetWorkspace
      definition={requestTimeOffDefinition}
      paperLabel="Request Time Off paper preview"
      embedded={embedded}
      marker={marker}
      onReady={onReady}
      onRegisterFlush={onRegisterFlush}
      blankPrintLabel="Print Blank Request"
      describeHistory={(value) => ({
        title:
          value.startDate.month || value.startDate.day || value.startDate.year
            ? `Leave starting ${value.startDate.month || "__"}/${value.startDate.day || "__"}/${value.startDate.year || "____"}`
            : "Undated time-off request",
        meta: value.badgeNumber
          ? `Badge ${value.badgeNumber}`
          : "No badge number entered",
      })}
      renderPaper={({ value, onChange }) => (
        <RequestTimeOffPaper data={value} onChange={onChange} />
      )}
    />
  );
}
