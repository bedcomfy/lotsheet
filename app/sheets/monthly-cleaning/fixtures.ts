import type { MonthlyCleaningData } from "./schema";

export const MONTHLY_CLEANING_SAMPLE_BUSES = [
  "2770",
  "2771",
  "2772",
  "6392",
  "6393",
  "6400",
  "6427",
  "6510",
  "25538",
  "25539",
];

export const monthlyCleaningFixtures: Record<
  "blank" | "typical" | "stress",
  MonthlyCleaningData
> = {
  blank: { version: 1, month: "2026-08", entries: {} },
  typical: {
    version: 1,
    month: "2026-08",
    entries: {
      "2770": { date: "8/04", serv: "104851" },
      "6427": { date: "8/18", serv: "105977" },
    },
  },
  stress: {
    version: 1,
    month: "2026-12",
    entries: {
      "25538": { date: "12/31", serv: "106173" },
    },
  },
};
