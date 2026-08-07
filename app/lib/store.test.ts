import { describe, expect, it } from "vitest";
import {
  applySheetOps,
  getFlags,
  getPulse,
  getSheet,
  getState,
  listSheetOpsSince,
  setBusFlags,
  setState,
} from "./store";
import { customNoteFlagId, customNoteText } from "./customNoteFlags";

// Runs against an in-memory PGlite database (PGLITE_DATA="memory" in
// vitest.config.ts) — the same Drizzle queries production runs on Neon.
describe("store (PGlite in-memory)", () => {
  it("round-trips and clears bus flags", async () => {
    await setBusFlags("6510", {
      flags: ["hold"],
      note: "",
      inspMiles: null,
      holdReason: "Cubs Bus",
      retorqueTires: [],
      inspOption: "",
    });
    const flags = await getFlags();
    expect(flags["6510"]?.flags).toContain("hold");
    expect(flags["6510"]?.holdReason).toBe("Cubs Bus");

    await setBusFlags("6510", { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" });
    expect((await getFlags())["6510"]).toBeUndefined();
  });

  it("round-trips multiple custom note flags with punctuation", async () => {
    const notes = [
      customNoteFlagId("No power, won't probe"),
      customNoteFlagId("Door / ramp sensor"),
    ];
    await setBusFlags("6511", {
      flags: notes,
      note: "",
      inspMiles: null,
      holdReason: "",
      retorqueTires: [],
      inspOption: "",
    });

    const saved = (await getFlags())["6511"];
    expect(saved.flags.map(customNoteText)).toEqual(["No power, won't probe", "Door / ramp sensor"]);
  });

  it("round-trips keyed state", async () => {
    await setState("fuel", { hi: 1 });
    const got = await getState("fuel");
    expect(got.value).toEqual({ hi: 1 });
  });

  it("applies sheet ops and increments the revision", async () => {
    const r1 = await applySheetOps([{ type: "set_cell", id: "x", value: "6001" }]);
    expect(r1.sheet.cells["x"]).toBe("6001");
    const r2 = await applySheetOps([{ type: "set_cell", id: "y", value: "6002" }]);
    expect(r2.revision).toBeGreaterThan(r1.revision);
    expect((await getSheet()).sheet?.cells["y"]).toBe("6002");
  });

  it("deduplicates a retried operation id", async () => {
    const entry = {
      opId: "retry-test-1",
      baseRevision: 0,
      op: { type: "set_cell" as const, id: "retry-cell", value: "6401" },
    };
    const first = await applySheetOps([entry]);
    const retried = await applySheetOps([entry]);
    expect(first.applied).toBe(1);
    expect(retried.applied).toBe(0);
    expect(retried.duplicateOpIds).toEqual(["retry-test-1"]);
    expect(retried.revision).toBe(first.revision);
    expect(retried.sheet.cells["retry-cell"]).toBe("6401");
  });

  it("pages catch-up without skipping revisions", async () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      opId: `page-test-${index}`,
      op: { type: "set_cell" as const, id: `page-${index}`, value: String(6400 + index) },
    }));
    const written = await applySheetOps(entries);
    const first = await listSheetOpsSince(written.revision - 12, 5);
    const second = await listSheetOpsSince(first[first.length - 1].revision, 5);
    const third = await listSheetOpsSince(second[second.length - 1].revision, 5);
    expect([...first, ...second, ...third].map((record) => record.opId)).toEqual(entries.map((entry) => entry.opId));
  });

  it("bumps the change token on every write", async () => {
    const before = await getPulse();
    await setState("def", { n: 1 });
    const after = await getPulse();
    expect(after).toBeGreaterThan(before);
  });
});
