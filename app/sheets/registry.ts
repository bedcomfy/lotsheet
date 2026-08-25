import { LEGAL_PORTRAIT, LETTER_PORTRAIT } from "./core/profiles";
import type { SheetDefinition } from "./core/types";
import { busErrorsDefinition } from "./bus-errors/definition";
import { hybridDailyDefinition } from "./hybrid-daily/definition";
import { hybridWeeklyDefinition } from "./hybrid-weekly/definition";
import { interiorCleaningDefinition } from "./interior-cleaning/definition";
import { meterReadingsDefinition } from "./meter-readings/definition";
import { monthlyCleaningDefinition } from "./monthly-cleaning/definition";
import {
  fareboxSheetSchema,
  fuelSheetSchema,
  lotSheetSchema,
  turnoverSheetSchema,
  workOrderSheetSchema,
} from "./schemas";

function defineSheet<T>(definition: SheetDefinition<T>): SheetDefinition<T> {
  return definition;
}

export const SHEET_DEFINITIONS = [
  defineSheet({
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
  }),
  defineSheet({
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
  }),
  defineSheet({
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
  }),
  defineSheet({
    id: "farebox",
    title: "Farebox Checks",
    path: "/farebox",
    stateKey: "farebox",
    dataVersion: 1,
    renderVersion: 12,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 10 },
    variants: ["current", "blank", "north-south"],
    createBlank: () => fareboxSheetSchema.parse({}),
    validate: (value) => fareboxSheetSchema.parse(value || {}),
  }),
  defineSheet({
    id: "service-summary",
    title: "Service Flag Summary",
    path: "/service/summary",
    dataVersion: 1,
    renderVersion: 2,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 1, max: 1 },
    variants: ["current", "flags"],
  }),
  defineSheet({
    id: "service-all",
    title: "All Service Sheets",
    path: "/service/print-all",
    dataVersion: 1,
    renderVersion: 15,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 5, max: 18 },
    variants: ["current", "flags"],
  }),
  defineSheet({
    id: "service-blank",
    title: "Blank Service Sheets",
    path: "/service/print-blank",
    dataVersion: 1,
    renderVersion: 12,
    paper: LETTER_PORTRAIT,
    expectedPages: { min: 5, max: 18 },
    variants: ["blank"],
  }),
  defineSheet({
    id: "turnover",
    title: "Turnover Sheet",
    path: "/turnover",
    stateKey: "turnover",
    dataVersion: 1,
    renderVersion: 11,
    paper: LEGAL_PORTRAIT,
    expectedPages: { min: 1, max: 1 },
    variants: ["current", "blank", "flags"],
    description: "Legal-size shift handoff document.",
    createBlank: () => turnoverSheetSchema.parse({}),
    validate: (value) => turnoverSheetSchema.parse(value || {}),
  }),
  defineSheet({
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
  }),
  meterReadingsDefinition,
  busErrorsDefinition,
  interiorCleaningDefinition,
  hybridDailyDefinition,
  hybridWeeklyDefinition,
  monthlyCleaningDefinition,
] as const;

type RegisteredSheetDefinition = (typeof SHEET_DEFINITIONS)[number];

const BY_PATH = new Map<string, RegisteredSheetDefinition>(
  SHEET_DEFINITIONS.map((definition) => [definition.path, definition] as const)
);

const BY_ID = new Map<string, RegisteredSheetDefinition>(
  SHEET_DEFINITIONS.map((definition) => [definition.id, definition] as const)
);

export function getSheetDefinitionByPath(path: string): RegisteredSheetDefinition | undefined {
  return BY_PATH.get(path);
}

export function getSheetDefinition(id: string): RegisteredSheetDefinition | undefined {
  return BY_ID.get(id);
}

export function isPrintableSheetPath(path: string): boolean {
  return BY_PATH.has(path);
}
