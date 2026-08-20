import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import { BusErrorsPaper } from "./BusErrorsPaper";
import {
  busErrorsSchema,
  createBlankBusErrors,
  type BusErrorsData,
} from "./schema";

export const busErrorsDefinition: SheetDefinition<BusErrorsData> = {
  id: "bus-errors",
  title: "Bus Errors",
  path: "/bus-errors",
  stateKey: "bus-errors",
  dataVersion: 1,
  renderVersion: 5,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankBusErrors,
  validate: (value) => {
    const parsed = busErrorsSchema.parse(value || {});
    const blank = createBlankBusErrors();
    return {
      ...parsed,
      rows: Array.from(
        { length: Math.max(blank.rows.length, parsed.rows.length) },
        (_, index) => parsed.rows[index] || blank.rows[index],
      ),
    };
  },
  Paper: BusErrorsPaper,
  description: "Fueling-system bus number and data-entry errors.",
};
