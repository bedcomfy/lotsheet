import { hybridWeeklySchema } from "./schema";

export const HYBRID_WEEKLY_SAMPLE_BUSES = [
  "25538",
  "25539",
  "25540",
  "25541",
  "25542",
  "25543",
  "25544",
  "25545",
  "25546",
  "25547",
];

export const hybridWeeklyFixtures = {
  blank: hybridWeeklySchema.parse({ weekStarting: "08/23/2026" }),
  typical: hybridWeeklySchema.parse({ weekStarting: "08/23/2026" }),
  stress: hybridWeeklySchema.parse({ weekStarting: "12/27/2026" }),
};
