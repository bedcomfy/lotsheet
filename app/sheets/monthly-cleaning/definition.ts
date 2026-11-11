import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import {
  createBlankMonthlyCleaning,
  monthlyCleaningSchema,
  type MonthlyCleaningData,
} from "./schema";

export const monthlyCleaningDefinition: SheetDefinition<MonthlyCleaningData> = {
  id: "monthly-cleaning",
  title: "Monthly Bus Cleaning",
  path: "/monthly-cleaning",
  stateKey: "monthly-cleaning",
  dataVersion: 1,
  renderVersion: 2,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankMonthlyCleaning,
  validate: (value) =>
    value ? monthlyCleaningSchema.parse(value) : createBlankMonthlyCleaning(),
  description: "Monthly cleaning entries on an exact copy of the fuel sheet's lane roster and grid.",
};
