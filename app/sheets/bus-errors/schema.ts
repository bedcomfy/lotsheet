import { z } from "zod";

export const BUS_ERROR_ROW_COUNT = 27;

export const busErrorRowSchema = z
  .object({
    bus: z.string().default(""),
    fuel: z.string().default(""),
    oil: z.string().default(""),
    description: z.string().default(""),
    servicer: z.string().default(""),
  })
  .passthrough();

export type BusErrorRow = z.infer<typeof busErrorRowSchema>;

export const busErrorsSchema = z
  .object({
    version: z.literal(1).default(1),
    rows: z.array(busErrorRowSchema).default([]),
  })
  .passthrough();

export type BusErrorsData = z.infer<typeof busErrorsSchema>;

export function createBlankBusErrorRow(): BusErrorRow {
  return busErrorRowSchema.parse({});
}

export function createBlankBusErrors(): BusErrorsData {
  return busErrorsSchema.parse({
    rows: Array.from({ length: BUS_ERROR_ROW_COUNT }, createBlankBusErrorRow),
  });
}
