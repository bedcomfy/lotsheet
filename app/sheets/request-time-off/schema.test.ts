import { describe, expect, it } from "vitest";
import {
  createBlankRequestTimeOff,
  REQUEST_LEAVE_TYPES,
  requestTimeOffSchema,
} from "./schema";

describe("Request Time Off sheet", () => {
  it("creates a one-page blank form with every writable field empty", () => {
    expect(createBlankRequestTimeOff()).toEqual({
      version: 1,
      submittedAt: "",
      leaveTypes: {},
      startDate: { month: "", day: "", year: "" },
      endDate: { month: "", day: "", year: "" },
      totalDays: "",
      employeeSignature: "",
      badgeNumber: "",
      employeeDate: "",
      payrollTypes: {},
      coordinatorSignature: "",
      coordinatorDate: "",
      superintendentSignature: "",
      superintendentDate: "",
      approved: false,
      notApproved: false,
    });
  });

  it("keeps all nine leave choices from the source form", () => {
    expect(REQUEST_LEAVE_TYPES.map((item) => item.label)).toEqual([
      "Vacation",
      "Floating holiday",
      "Funeral",
      "Sick elective",
      "Switch",
      "Medical leave",
      "Jury Duty",
      "Leave of absence",
      "Birthday",
    ]);
  });

  it("normalizes older partial records", () => {
    expect(requestTimeOffSchema.parse({ badgeNumber: "105808" })).toMatchObject({
      badgeNumber: "105808",
      leaveTypes: {},
      approved: false,
    });
  });
});
