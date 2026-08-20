import { z } from "zod";

export const INTERIOR_CLEANING_TASKS = [
  { id: "floors", label: "Floors (including gum)" },
  {
    id: "ceiling",
    label: "Ceiling, dome lens (inside and outside of lens)",
  },
  { id: "windows", label: "Windows (including windshield)" },
  { id: "walls", label: "Walls, handrails, and stanchions." },
  { id: "ducts", label: "Floor ducts, heat vent area" },
  { id: "graffiti", label: "Remove graffiti, tape, gum, and stickers." },
  { id: "seats", label: "Clean seats, remove stains." },
  {
    id: "signs",
    label: "Clean side destination signs, farebox, front run box",
  },
] as const;

export const DRIVER_AREA_TASKS = [
  {
    id: "driver-foot-area",
    label:
      "Drivers foot area, seat, modesty panel and door. (DO NOT SOAK PEDALS)",
  },
  {
    id: "driver-window",
    label: "Drivers window, exit door, steps, side dash and front dash.",
  },
  {
    id: "washer-reservoir",
    label: "Fill windshield washer reservoir",
  },
] as const;

export const interiorCleaningSchema = z
  .object({
    version: z.literal(1).default(1),
    busNumber: z.string().default(""),
    date: z.string().default(""),
    workOrderNumber: z.string().default(""),
    initials: z.record(z.string(), z.string()).default({}),
    foremanInitials: z.string().default(""),
    defects: z.array(z.string()).default(["", ""]),
  })
  .passthrough();

export type InteriorCleaningData = z.infer<typeof interiorCleaningSchema>;

export function createBlankInteriorCleaning(): InteriorCleaningData {
  return interiorCleaningSchema.parse({});
}
