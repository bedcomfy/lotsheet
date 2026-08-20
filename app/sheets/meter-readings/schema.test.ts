import { describe, expect, it } from "vitest";
import { createBlankMeterReadings, meterReadingsSchema } from "./schema";

describe("Fuel Meter Readings schema", () => {
  it("creates mutually empty wash choices", () => {
    expect(createBlankMeterReadings()).toMatchObject({
      version: 1,
      busesWashed: false,
      busesNotWashed: false,
      probeNorth: "",
      probeSouth: "",
    });
  });

  it("preserves meter values from saved records", () => {
    expect(
      meterReadingsSchema.parse({
        fuelBeginningNorth: "124550.2",
        fuelEndingNorth: "125290.6",
      }),
    ).toMatchObject({
      fuelBeginningNorth: "124550.2",
      fuelEndingNorth: "125290.6",
    });
  });
});
