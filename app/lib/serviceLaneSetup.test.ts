import { describe, expect, it } from "vitest";
import { objectCodeFlagId } from "./objectCodes";
import {
  SERVICE_LANE_FLAGS,
  bringToCardsKind,
  bringToCardsReason,
  clearServiceLaneFlags,
  emptyFlagEntry,
  mergeServiceLaneSetup,
  serviceLaneSetupIssues,
  setBringToCardsKind,
  setBringToCardsReason,
} from "./serviceLaneSetup";
import { customNoteFlagId } from "./customNoteFlags";

describe("service lane setup", () => {
  it("clears the prior lane setup without touching other flags or notes", () => {
    const current = {
      ...emptyFlagEntry(),
      flags: [
        "hold",
        "cards",
        "inspection",
        "followup",
        objectCodeFlagId("6800"),
        "eng",
        customNoteFlagId("Door sticks"),
      ],
      holdReason: "Parts",
      cardsReason: "Mirror",
      inspOption: "C-24",
    };

    expect(clearServiceLaneFlags(current)).toEqual({
      ...emptyFlagEntry(),
      flags: ["eng", customNoteFlagId("Door sticks")],
    });
  });

  it("no longer treats brake tests as a lane flag", () => {
    expect(SERVICE_LANE_FLAGS).not.toContain("braketest");
    const current = { ...emptyFlagEntry(), flags: ["braketest", "hold"], holdReason: "Parade" };
    // A brake test is an ordinary maintenance flag now: the lane replacement
    // leaves it alone.
    expect(clearServiceLaneFlags(current).flags).toEqual(["braketest"]);
    expect(mergeServiceLaneSetup(current, undefined).flags).toEqual(["braketest"]);
  });

  it("keeps a cards reason through the merge and drops it with the flag", () => {
    const staged = { ...emptyFlagEntry(), flags: ["cards"], cardsReason: "Mirror" };
    const merged = mergeServiceLaneSetup(emptyFlagEntry(), staged);
    expect(merged.flags).toEqual(["cards"]);
    expect(merged.cardsReason).toBe("Mirror");
    expect(merged.holdReason).toBe("");

    const stale = { ...emptyFlagEntry(), flags: ["hold"], cardsReason: "Stale" };
    expect(mergeServiceLaneSetup(emptyFlagEntry(), stale).cardsReason).toBe("");
  });

  it("marks a bus Hold or Card, never both, and carries the reason across", () => {
    let entry = setBringToCardsKind(emptyFlagEntry(), "hold");
    entry = setBringToCardsReason(entry, "Cubs Bus");
    expect(bringToCardsKind(entry)).toBe("hold");
    expect(entry.holdReason).toBe("Cubs Bus");

    entry = setBringToCardsKind(entry, "cards");
    expect(entry.flags).toEqual(["cards"]);
    expect(entry.holdReason).toBe("");
    expect(entry.cardsReason).toBe("Cubs Bus");
    expect(bringToCardsReason(entry)).toBe("Cubs Bus");

    expect(bringToCardsKind(emptyFlagEntry())).toBeNull();
    expect(setBringToCardsReason(emptyFlagEntry(), "x")).toEqual(emptyFlagEntry());
  });

  it("merges staged details into the latest unrelated bus flags", () => {
    const current = {
      ...emptyFlagEntry(),
      flags: ["safety", customNoteFlagId("Mirror loose")],
    };
    const staged = {
      ...emptyFlagEntry(),
      flags: ["hold", "inspection", "followup", "retorque"],
      holdReason: "Parts",
      inspOption: "A-3",
      retorqueTires: ["cf", "rf"],
    };

    const merged = mergeServiceLaneSetup(current, staged);
    expect(merged.flags).toEqual(expect.arrayContaining([
      "safety",
      customNoteFlagId("Mirror loose"),
      "hold",
      "inspection",
      "followup",
      objectCodeFlagId("6603"),
      "retorque",
    ]));
    expect(merged.holdReason).toBe("Parts");
    expect(merged.inspOption).toBe("A-3");
    expect(merged.retorqueTires).toEqual(["cf", "rf"]);
  });

  it("reports staged assignments that still need required details", () => {
    expect(serviceLaneSetupIssues({
      "6427": { ...emptyFlagEntry(), flags: ["inspection"] },
      "6510": { ...emptyFlagEntry(), flags: ["retorque"] },
    })).toEqual([
      "6427 needs an inspection type",
      "6510 needs retorque tires",
    ]);
  });

  it("keeps general inspection and retorque flags when optional details are missing", () => {
    const merged = mergeServiceLaneSetup(
      emptyFlagEntry(),
      { ...emptyFlagEntry(), flags: ["inspection", "retorque"] },
    );

    expect(merged.flags).toEqual(expect.arrayContaining(["inspection", "retorque"]));
    expect(merged.inspOption).toBe("");
    expect(merged.retorqueTires).toEqual([]);
  });
});
