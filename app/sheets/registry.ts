import { LEGAL_PORTRAIT, LETTER_PORTRAIT } from "./core/profiles";
import type { SheetDefinition } from "./core/types";
import {
  fareboxSheetSchema,
  fuelSheetSchema,
  lotSheetSchema,
  turnoverSheetSchema,
  workOrderSheetSchema,
} from "./schemas";

export const SHEET_DEFINITIONS = [
  {
    id: "lot",
    title: "Lot Sheet",
    path: "/",
    stateKey: "current",
    dataVersion: 1,
    renderVersion: 36,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 4 },
    variants: ["current", "blank", "flags"],
    createBlank: () => lotSheetSchema.parse({}),
    validate: (value) => lotSheetSchema.parse(value || {}),
    description: "Daily fleet placement and printed lot lists.",
  },
  {
    id: "fuel",
    title: "Fuel Sheet",
    path: "/fuel",
    stateKey: "fuel",
    dataVersion: 1,
    renderVersion: 14,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 2 },
    variants: ["current", "blank", "flags"],
    createBlank: () => fuelSheetSchema.parse({}),
    validate: (value) => fuelSheetSchema.parse(value || {}),
  },
  {
    id: "def",
    title: "DEF Sheet",
    path: "/def",
    stateKey: "def",
    dataVersion: 1,
    renderVersion: 14,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 3 },
    variants: ["current", "blank", "flags", "north-south"],
    createBlank: () => fuelSheetSchema.parse({}),
    validate: (value) => fuelSheetSchema.parse(value || {}),
  },
  {
    id: "farebox",
    title: "Farebox Checks",
    path: "/farebox",
    stateKey: "farebox",
    dataVersion: 1,
    renderVersion: 9,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 10 },
    variants: ["current", "blank", "north-south"],
    createBlank: () => fareboxSheetSchema.parse({}),
    validate: (value) => fareboxSheetSchema.parse(value || {}),
  },
  {
    id: "service-all",
    title: "All Service Sheets",
    path: "/service/print-all",
    dataVersion: 1,
    renderVersion: 8,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 3, max: 16 },
    variants: ["current", "flags"],
  },
  {
    id: "service-blank",
    title: "Blank Service Sheets",
    path: "/service/print-blank",
    dataVersion: 1,
    renderVersion: 5,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 3, max: 16 },
    variants: ["blank"],
  },
  {
    id: "turnover",
    title: "Turnover Sheet",
    path: "/turnover",
    stateKey: "turnover",
    dataVersion: 1,
    renderVersion: 9,
    paper: LEGAL_PORTRAIT,
    expectedPages: { min: 1, max: 1 },
    variants: ["current", "blank", "flags"],
    description: "Legal-size shift handoff document.",
    createBlank: () => turnoverSheetSchema.parse({}),
    validate: (value) => turnoverSheetSchema.parse(value || {}),
  },
  {
    id: "workorder",
    title: "Work Order",
    path: "/workorder",
    stateKey: "workorder",
    dataVersion: 1,
    renderVersion: 6,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 50 },
    variants: ["current", "blank"],
    createBlank: () => workOrderSheetSchema.parse({}),
    validate: (value) => workOrderSheetSchema.parse(value || {}),
  },
] as const satisfies readonly SheetDefinition[];

const BY_PATH = new Map<string, SheetDefinition>(
  SHEET_DEFINITIONS.map((definition) => [definition.path, definition])
);

const BY_ID = new Map<string, SheetDefinition>(
  SHEET_DEFINITIONS.map((definition) => [definition.id, definition])
);

export function getSheetDefinitionByPath(path: string): SheetDefinition | undefined {
  return BY_PATH.get(path);
}

export function getSheetDefinition(id: string): SheetDefinition | undefined {
  return BY_ID.get(id);
}

export function isPrintableSheetPath(path: string): boolean {
  return BY_PATH.has(path);
}
