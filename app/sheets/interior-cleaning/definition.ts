import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import { InteriorCleaningPaper } from "./InteriorCleaningPaper";
import {
  createBlankInteriorCleaning,
  interiorCleaningSchema,
  type InteriorCleaningData,
} from "./schema";

export const interiorCleaningDefinition: SheetDefinition<InteriorCleaningData> = {
  id: "interior-cleaning",
  title: "Interior Cleaning",
  path: "/interior-cleaning",
  stateKey: "interior-cleaning",
  dataVersion: 1,
  renderVersion: 4,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankInteriorCleaning,
  validate: (value) => interiorCleaningSchema.parse(value || {}),
  Paper: InteriorCleaningPaper,
  description: "Interior bus cleaning checklist and sign-off.",
};
