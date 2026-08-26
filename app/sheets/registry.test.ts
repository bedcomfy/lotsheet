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

  it("registers the weekly hybrid log as a single Letter portrait page", () => {
    const hybrid = getSheetDefinitionByPath("/hybrid-weekly");
    expect(hybrid).toMatchObject({
      id: "hybrid-weekly",
      stateKey: "hybrid-weekly",
      expectedPages: { min: 1, max: 1 },
    });
    expect(hybrid?.paper.id).toBe("letter-portrait");
  });

  it("registers the daily hybrid log as its own single Letter page", () => {
    const hybrid = getSheetDefinitionByPath("/hybrid-daily");
    expect(hybrid).toMatchObject({
      id: "hybrid-daily",
      stateKey: "hybrid-daily",
      expectedPages: { min: 1, max: 1 },
      variants: ["current", "blank"],
    });
    expect(hybrid?.paper.id).toBe("letter-portrait");
  });

  it("registers monthly bus cleaning as a single Letter page", () => {
    const cleaning = getSheetDefinitionByPath("/monthly-cleaning");
    expect(cleaning).toMatchObject({
      id: "monthly-cleaning",
      stateKey: "monthly-cleaning",
      expectedPages: { min: 1, max: 1 },
      variants: ["current", "blank"],
    });
    expect(cleaning?.paper.id).toBe("letter-portrait");
  });

  it("registers Request Time Off as a blank-capable Letter form", () => {
    const request = getSheetDefinitionByPath("/request-time-off");
    expect(request).toMatchObject({
      id: "request-time-off",
      stateKey: "request-time-off",
      expectedPages: { min: 1, max: 1 },
      variants: ["current", "blank"],
    });
    expect(request?.paper.id).toBe("letter-portrait");
  });

  it("has unique ids and paths", () => {
    expect(new Set(SHEET_DEFINITIONS.map((item) => item.id)).size).toBe(SHEET_DEFINITIONS.length);
    expect(new Set(SHEET_DEFINITIONS.map((item) => item.path)).size).toBe(SHEET_DEFINITIONS.length);
  });
});
