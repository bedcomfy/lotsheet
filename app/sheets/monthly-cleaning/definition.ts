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
  renderVersion: 1,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankMonthlyCleaning,
  validate: (value) =>
    value ? monthlyCleaningSchema.parse(value) : createBlankMonthlyCleaning(),
  description: "Monthly interior-cleaning roster for every active bus.",
};
