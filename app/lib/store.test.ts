import { describe, expect, it } from "vitest";
import { applySheetOps, getFlags, getPulse, getSheet, getState, setBusFlags, setState } from "./store";

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

  it("bumps the change token on every write", async () => {
    const before = await getPulse();
    await setState("def", { n: 1 });
    const after = await getPulse();
    expect(after).toBeGreaterThan(before);
  });
});
