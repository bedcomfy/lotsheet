import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import {
  createBlankHybridWeekly,
  hybridWeeklySchema,
  type HybridWeeklyData,
} from "./schema";

export const hybridWeeklyDefinition: SheetDefinition<HybridWeeklyData> = {
  id: "hybrid-weekly",
  title: "Hybrid Weekly Service Log",
  path: "/hybrid-weekly",
  stateKey: "hybrid-weekly",
  dataVersion: 1,
  renderVersion: 1,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankHybridWeekly,
  validate: (value) =>
    value ? hybridWeeklySchema.parse(value) : createBlankHybridWeekly(),
  description: "Sunday-through-Saturday Gillig hybrid servicing log.",
};
