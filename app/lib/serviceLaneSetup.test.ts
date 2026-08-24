import { describe, expect, it } from "vitest";
import { objectCodeFlagId } from "./objectCodes";
import {
  clearServiceLaneFlags,
  emptyFlagEntry,
  mergeServiceLaneSetup,
  serviceLaneSetupIssues,
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
      inspOption: "C-24",
    };

    expect(clearServiceLaneFlags(current)).toEqual({
      ...emptyFlagEntry(),
      flags: ["eng", customNoteFlagId("Door sticks")],
    });
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
