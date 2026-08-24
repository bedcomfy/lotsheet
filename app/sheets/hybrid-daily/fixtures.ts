import { hybridDailySchema } from "./schema";

export const HYBRID_DAILY_SAMPLE_BUSES = [
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

export const hybridDailyFixtures = {
  blank: hybridDailySchema.parse({ date: "08/24/2026" }),
  typical: hybridDailySchema.parse({ date: "08/24/2026" }),
  stress: hybridDailySchema.parse({ date: "12/31/2026" }),
};
