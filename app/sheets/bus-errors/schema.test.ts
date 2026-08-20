import { describe, expect, it } from "vitest";
import {
  BUS_ERROR_ROW_COUNT,
  busErrorsSchema,
  createBlankBusErrors,
} from "./schema";

describe("Bus Errors schema", () => {
  it("creates the approved number of blank writing rows", () => {
    const blank = createBlankBusErrors();
    expect(blank.rows).toHaveLength(BUS_ERROR_ROW_COUNT);
    expect(blank.rows[0]).toEqual({
      bus: "",
      fuel: "",
      oil: "",
      description: "",
      servicer: "",
    });
  });

  it("defaults missing row fields for old records", () => {
    expect(busErrorsSchema.parse({ rows: [{ bus: "6427" }] }).rows[0]).toEqual({
      bus: "6427",
      fuel: "",
      oil: "",
      description: "",
      servicer: "",
    });
  });
});
