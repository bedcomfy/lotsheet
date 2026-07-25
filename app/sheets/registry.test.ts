import { describe, expect, it } from "vitest";
import { getSheetDefinitionByPath, SHEET_DEFINITIONS } from "./registry";

describe("SheetKit registry", () => {
  it("uses exact physical profiles for every printable route", () => {
    for (const definition of SHEET_DEFINITIONS) {
      expect(definition.paper.widthIn).toBeGreaterThan(0);
      expect(definition.paper.heightIn).toBeGreaterThan(0);
      expect(definition.expectedPages.min).toBeGreaterThan(0);
      expect(definition.expectedPages.max).toBeGreaterThanOrEqual(definition.expectedPages.min);
    }
  });

  it("declares the Turnover Sheet as US Legal portrait", () => {
    const turnover = getSheetDefinitionByPath("/turnover");
    expect(turnover?.paper).toMatchObject({
      id: "legal-portrait",
      widthIn: 8.5,
      heightIn: 14,
      orientation: "portrait",
    });
  });

  it("keeps the remaining current sheets on their approved Letter profile", () => {
    for (const definition of SHEET_DEFINITIONS.filter((item) => item.path !== "/turnover")) {
      expect(definition.paper.id).toBe("letter-portrait");
    }
  });

  it("has unique ids and paths", () => {
    expect(new Set(SHEET_DEFINITIONS.map((item) => item.id)).size).toBe(SHEET_DEFINITIONS.length);
    expect(new Set(SHEET_DEFINITIONS.map((item) => item.path)).size).toBe(SHEET_DEFINITIONS.length);
  });
});
