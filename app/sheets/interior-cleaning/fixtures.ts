import {
  createBlankInteriorCleaning,
  type InteriorCleaningData,
} from "./schema";

export const interiorCleaningFixtures: Record<
  "blank" | "typical" | "stress",
  InteriorCleaningData
> = {
  blank: createBlankInteriorCleaning(),
  typical: {
    ...createBlankInteriorCleaning(),
    busNumber: "6427",
    date: "08/20/26",
    workOrderNumber: "1786367",
    initials: { floors: "CR", windows: "CR", seats: "CR" },
    foremanInitials: "RV",
    defects: ["Loose seat trim near rear door", ""],
  },
  stress: {
    ...createBlankInteriorCleaning(),
    busNumber: "25540",
    date: "12/31/99",
    workOrderNumber: "999999999999",
    initials: {
      floors: "LONG",
      ceiling: "LONG",
      windows: "LONG",
      walls: "LONG",
      ducts: "LONG",
      graffiti: "LONG",
      seats: "LONG",
      signs: "LONG",
      "driver-foot-area": "LONG",
      "driver-window": "LONG",
      "washer-reservoir": "LONG",
    },
    foremanInitials: "LONG",
    defects: [
      "A long defect description that must stay on its writing line without shifting the rest of the printed form.",
      "Second long defect description for stress coverage.",
    ],
  },
};
