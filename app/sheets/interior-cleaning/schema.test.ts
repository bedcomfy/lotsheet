import { describe, expect, it } from "vitest";
import {
  createBlankInteriorCleaning,
  interiorCleaningSchema,
} from "./schema";

describe("Interior Cleaning schema", () => {
  it("creates a printable blank record", () => {
    expect(createBlankInteriorCleaning()).toMatchObject({
      version: 1,
      busNumber: "",
      date: "",
      initials: {},
      defects: ["", ""],
    });
  });

  it("keeps older partial records readable", () => {
    expect(interiorCleaningSchema.parse({ busNumber: "6427" })).toMatchObject({
      busNumber: "6427",
      workOrderNumber: "",
      foremanInitials: "",
    });
  });
});
