import { describe, expect, it } from "vitest";
import { pdfSignature, stableJson } from "./pdfSignature";

describe("pdf cache signature", () => {
  it("ignores object key order and array-of-object key order", () => {
    const a = { flags: { "6414": { flags: ["hold", "oos"], note: "" }, "6392": { flags: [] } }, lots: { bay: ["6414"] } };
    const b = { lots: { bay: ["6414"] }, flags: { "6392": { flags: [] }, "6414": { note: "", flags: ["hold", "oos"] } } };
    expect(stableJson(a)).toEqual(stableJson(b));
    expect(pdfSignature(a, true, "53")).toBe(pdfSignature(b, true, "53"));
  });

  it("changes when data, the maintenance toggle, or the version change", () => {
    const base = { sheet: "lot", d: { cells: { s1: "6414" } } };
    const sig = pdfSignature(base, true, "53");
    expect(pdfSignature({ ...base, d: { cells: { s1: "6415" } } }, true, "53")).not.toBe(sig);
    expect(pdfSignature(base, false, "53")).not.toBe(sig);
    expect(pdfSignature(base, true, "54")).not.toBe(sig);
  });

  it("keeps array order significant (lists print in order)", () => {
    expect(pdfSignature({ north: ["6414", "6392"] }, true, "1")).not.toBe(pdfSignature({ north: ["6392", "6414"] }, true, "1"));
  });
});
