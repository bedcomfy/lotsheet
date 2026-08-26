import {
  createBlankRequestTimeOff,
  type RequestTimeOffData,
} from "./schema";

export const requestTimeOffFixtures: Record<
  "blank" | "typical" | "stress",
  RequestTimeOffData
> = {
  blank: createBlankRequestTimeOff(),
  typical: {
    ...createBlankRequestTimeOff(),
    submittedAt: "08/25/26 7:15 AM",
    leaveTypes: { vacation: true },
    startDate: { month: "09", day: "14", year: "26" },
    endDate: { month: "09", day: "18", year: "26" },
    totalDays: "5",
    employeeSignature: "Cristian Rosado",
    badgeNumber: "105808",
    employeeDate: "08/25/26",
    payrollTypes: { vacation: true },
    coordinatorSignature: "Reviewed",
    coordinatorDate: "08/26/26",
    approved: true,
  },
  stress: {
    ...createBlankRequestTimeOff(),
    submittedAt: "12/31/2099 11:59 PM",
    leaveTypes: {
      vacation: true,
      "floating-holiday": true,
      funeral: true,
      "sick-elective": true,
      switch: true,
      "medical-leave": true,
      "jury-duty": true,
      "leave-of-absence": true,
      birthday: true,
    },
    startDate: { month: "12", day: "31", year: "2099" },
    endDate: { month: "01", day: "15", year: "2100" },
    totalDays: "999",
    employeeSignature: "Maximum Length Employee Signature",
    badgeNumber: "999999999999",
    employeeDate: "12/31/2099",
    payrollTypes: {
      vacation: true,
      "floating-holiday": true,
      "sick-elective": true,
    },
    coordinatorSignature: "Maximum Length Coordinator Signature",
    coordinatorDate: "12/31/2099",
    superintendentSignature: "Maximum Length Superintendent Signature",
    superintendentDate: "12/31/2099",
    approved: true,
    notApproved: true,
  },
};
