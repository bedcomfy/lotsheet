import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import {
  createBlankHybridDaily,
  hybridDailySchema,
  type HybridDailyData,
} from "./schema";

export const hybridDailyDefinition: SheetDefinition<HybridDailyData> = {
  id: "hybrid-daily",
  title: "Hybrid Daily Service Log",
  path: "/hybrid-daily",
  stateKey: "hybrid-daily",
  dataVersion: 1,
  renderVersion: 1,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankHybridDaily,
  validate: (value) =>
    value ? hybridDailySchema.parse(value) : createBlankHybridDaily(),
  description: "Single-day Gillig hybrid servicing log.",
};
