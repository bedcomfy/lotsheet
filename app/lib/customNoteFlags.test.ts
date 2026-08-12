import { describe, expect, it } from "vitest";
import {
  LEGACY_CUSTOM_NOTE_ID,
  addCustomNote,
  customNoteFlagId,
  customNoteItems,
  customNoteText,
  removeAllCustomNotes,
  removeCustomNote,
} from "./customNoteFlags";
import { flagDisplay, flagsAndNote, fuelFlagSections, groupFlaggedBuses } from "./grid";
import type { FlagEntry } from "./types";

function entry(patch: Partial<FlagEntry> = {}): FlagEntry {
  return {
    flags: [],
    note: "",
    inspMiles: null,
    holdReason: "",
    retorqueTires: [],
    inspOption: "",
    ...patch,
  };
}

describe("custom note flags", () => {
  it("encodes punctuation without introducing database separators", () => {
    const text = "No power, won't probe / farebox #2";
    const id = customNoteFlagId(text);
    expect(id).not.toContain(",");
    expect(customNoteText(id)).toBe(text);
  });

  it("adds multiple notes and prevents duplicates", () => {
    const first = addCustomNote(entry({ flags: ["hold"] }), "Door will not close");
    const second = addCustomNote(first, "Farebox no power");
    const duplicate = addCustomNote(second, "  door   will not CLOSE  ");

    expect(customNoteItems(second).map((item) => item.text)).toEqual([
      "Door will not close",
      "Farebox no power",
    ]);
    expect(duplicate).toBe(second);
    expect(flagDisplay(second)).toBe("HOLD +2*");
    expect(flagsAndNote(second)).toBe("HOLD, Door will not close, Farebox no power");
  });

  it("removes one custom note without touching other flags or notes", () => {
    const withNotes = addCustomNote(
      addCustomNote(entry({ flags: ["inspection"] }), "Mirror loose"),
      "Radio cuts out",
    );
    const [first] = customNoteItems(withNotes);
    const updated = removeCustomNote(withNotes, first.id);

    expect(updated.flags).toContain("inspection");
    expect(customNoteItems(updated).map((item) => item.text)).toEqual(["Radio cuts out"]);
  });

  it("keeps legacy notes readable and lets the legacy chip remove them", () => {
    const legacy = entry({ note: "Old single note" });
    expect(customNoteItems(legacy)).toEqual([
      { id: LEGACY_CUSTOM_NOTE_ID, text: "Old single note", legacy: true },
    ]);
    expect(removeCustomNote(legacy, LEGACY_CUSTOM_NOTE_ID).note).toBe("");
  });

  it("groups note-only buses under Other and clears only custom notes in bulk", () => {
    const noteOnly = addCustomNote(entry(), "Needs road test");
    const mixed = addCustomNote(entry({ flags: ["hold"], note: "Legacy note" }), "Second note");
    const groups = groupFlaggedBuses({ "6401": noteOnly, "6402": mixed });

    expect(groups.find((group) => group.cat === "other")?.buses).toEqual(["6401"]);
    expect(groups.find((group) => group.cat === "hold")?.buses).toEqual(["6402"]);
    expect(removeAllCustomNotes(mixed)).toEqual(entry({ flags: ["hold"] }));
  });

  it("marks service summary rows that carry multiple service flags", () => {
    const [section] = fuelFlagSections({
      "6467": entry({ flags: ["cards", "inspection"] }),
    });

    expect(section.rows).toEqual([
      {
        bus: "6467",
        indicator: "*",
        items: [
          { id: "cards", label: "CARDS", detail: "" },
          { id: "inspection", label: "INSPECTION", detail: "" },
        ],
      },
    ]);
  });
});
