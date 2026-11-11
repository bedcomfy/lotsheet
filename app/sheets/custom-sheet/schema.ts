import { z } from "zod";
import { fuelSheetSchema } from "../schemas";
import { chicagoDateShort } from "../../lib/chicagoTime";

export const customSheetSchema = fuelSheetSchema.extend({
  version: z.literal(1).default(1),
  header: z.string().default(""),
});
export type CustomSheetData = z.infer<typeof customSheetSchema>;

export function createBlankCustomSheet(): CustomSheetData {
  return customSheetSchema.parse({ date: chicagoDateShort() });
}
