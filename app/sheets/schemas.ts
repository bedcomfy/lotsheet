import { z } from "zod";

const stringMap = z.record(z.string(), z.string());
const stringLists = z.record(z.string(), z.array(z.string()));

export const lotSheetSchema = z
  .object({
    time: z.string().optional().default(""),
    date: z.string().optional().default(""),
    timeOverride: z.boolean().optional().default(false),
    dateOverride: z.boolean().optional().default(false),
    offProperty: z.string().optional().default(""),
    inShop: z.string().optional().default(""),
    cells: stringMap.default({}),
    lots: stringLists.default({}),
    locks: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export const turnoverSheetSchema = z
  .object({
    cells: stringMap.default({}),
    shift: z.string().default(""),
  })
  .passthrough();

export const fuelSheetSchema = z
  .object({
    date: z.string().default(""),
    ns: z.string().default(""),
    start: z.string().default(""),
    end: z.string().default(""),
    entries: z.record(
      z.string(),
      z.object({
        gals: z.string().default(""),
        serv: z.string().default(""),
      }).passthrough()
    ).default({}),
  })
  .passthrough();

export const fareboxSheetSchema = z
  .object({
    date: z.string().default(""),
    entries: z.record(
      z.string(),
      z.object({
        yn: z.enum(["", "y", "n"]).default(""),
        serv: z.string().default(""),
        note: z.string().default(""),
        noPower: z.boolean().default(false),
        wontProbe: z.boolean().default(false),
      }).passthrough()
    ).default({}),
  })
  .passthrough();

export const workOrderSheetSchema = z
  .object({
    employees: z.array(z.record(z.string(), z.unknown())).default([]),
    operations: z.array(z.record(z.string(), z.unknown())).default([]),
    parts: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  })
  .passthrough();
