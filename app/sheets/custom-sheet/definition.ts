import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import { createBlankCustomSheet, customSheetSchema, type CustomSheetData } from "./schema";

export const customSheetDefinition: SheetDefinition<CustomSheetData> = {
  id: "custom-sheet",
  title: "Custom Sheet",
  path: "/custom-sheet",
  stateKey: "custom-sheet",
  dataVersion: 1,
  renderVersion: 1,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankCustomSheet,
  validate: (value) => value ? customSheetSchema.parse(value) : createBlankCustomSheet(),
  description: "An exact copy of the fuel form with your own heading.",
};
