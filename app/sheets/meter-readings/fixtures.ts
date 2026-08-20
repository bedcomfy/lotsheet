import {
  createBlankMeterReadings,
  type MeterReadingsData,
} from "./schema";

export const meterReadingsFixtures: Record<
  "blank" | "typical" | "stress",
  MeterReadingsData
> = {
  blank: createBlankMeterReadings(),
  typical: {
    ...createBlankMeterReadings(),
    date: "08/20/26",
    fuelBeginningNorth: "124550.2",
    fuelBeginningSouth: "88732.1",
    fuelEndingNorth: "125290.6",
    fuelEndingSouth: "89401.8",
    busesWashed: true,
    washStart: "10:30 PM",
    washEnd: "4:15 AM",
    reason: "Wash paused for service lane maintenance.",
    probeNorth: "PN-2408",
    probeSouth: "PS-2411",
  },
  stress: {
    ...createBlankMeterReadings(),
    date: "12/31/99",
    fuelBeginningNorth: "999999999999",
    fuelBeginningSouth: "999999999999",
    fuelEndingNorth: "999999999999",
    fuelEndingSouth: "999999999999",
    busesNotWashed: true,
    washStart: "11:59 PM",
    washEnd: "11:59 AM",
    reason:
      "A long explanation for a partial bus wash that must remain legible across both ruled handwriting lines.",
    probeNorth: "NORTH-LANE-SERIAL-9999",
    probeSouth: "SOUTH-LANE-SERIAL-9999",
  },
};
