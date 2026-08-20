import { z } from "zod";

export const meterReadingsSchema = z
  .object({
    version: z.literal(1).default(1),
    date: z.string().default(""),
    fuelBeginningNorth: z.string().default(""),
    fuelBeginningSouth: z.string().default(""),
    fuelEndingNorth: z.string().default(""),
    fuelEndingSouth: z.string().default(""),
    busesWashed: z.boolean().default(false),
    busesNotWashed: z.boolean().default(false),
    washStart: z.string().default(""),
    washEnd: z.string().default(""),
    reason: z.string().default(""),
    probeNorth: z.string().default(""),
    probeSouth: z.string().default(""),
  })
  .passthrough();

export type MeterReadingsData = z.infer<typeof meterReadingsSchema>;

export function createBlankMeterReadings(): MeterReadingsData {
  return meterReadingsSchema.parse({});
}
