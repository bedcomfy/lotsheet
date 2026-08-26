import { LETTER_PORTRAIT } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import {
  createBlankRequestTimeOff,
  requestTimeOffSchema,
  type RequestTimeOffData,
} from "./schema";

export const requestTimeOffDefinition: SheetDefinition<RequestTimeOffData> = {
  id: "request-time-off",
  title: "Request Time Off",
  path: "/request-time-off",
  stateKey: "request-time-off",
  dataVersion: 1,
  renderVersion: 1,
  paper: LETTER_PORTRAIT,
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlankRequestTimeOff,
  validate: (value) => requestTimeOffSchema.parse(value || {}),
  description: "Employee leave request and maintenance approval form.",
};
