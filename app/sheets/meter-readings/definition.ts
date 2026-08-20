import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import { MeterReadingsPaper } from "./MeterReadingsPaper";
import {
  createBlankMeterReadings,
  meterReadingsSchema,
  type MeterReadingsData,
} from "./schema";

export const meterReadingsDefinition: SheetDefinition<MeterReadingsData> = {
  id: "meter-readings",
  title: "Fuel Meter Readings",
  path: "/meter-readings",
  stateKey: "meter-readings",
  dataVersion: 1,
  renderVersion: 3,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankMeterReadings,
  validate: (value) => meterReadingsSchema.parse(value || {}),
  Paper: MeterReadingsPaper,
  description: "Daily fuel meter, bus wash, and probe readings.",
};
