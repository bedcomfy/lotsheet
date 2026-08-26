import { z } from "zod";

export const REQUEST_LEAVE_TYPES = [
  { id: "vacation", label: "Vacation" },
  { id: "floating-holiday", label: "Floating holiday" },
  { id: "funeral", label: "Funeral" },
  { id: "sick-elective", label: "Sick elective" },
  { id: "switch", label: "Switch" },
  { id: "medical-leave", label: "Medical leave" },
  { id: "jury-duty", label: "Jury Duty" },
  { id: "leave-of-absence", label: "Leave of absence" },
  { id: "birthday", label: "Birthday" },
] as const;

export const PAYROLL_LEAVE_TYPES = [
  { id: "vacation", label: "Vacation" },
  { id: "floating-holiday", label: "Floating Holiday" },
  { id: "sick-elective", label: "Sick elective" },
] as const;

const datePartsSchema = z
  .object({
    month: z.string().default(""),
    day: z.string().default(""),
    year: z.string().default(""),
  })
  .passthrough();

export const requestTimeOffSchema = z
  .object({
    version: z.literal(1).default(1),
    submittedAt: z.string().default(""),
    leaveTypes: z.record(z.string(), z.boolean()).default({}),
    startDate: datePartsSchema.default({ month: "", day: "", year: "" }),
    endDate: datePartsSchema.default({ month: "", day: "", year: "" }),
    totalDays: z.string().default(""),
    employeeSignature: z.string().default(""),
    badgeNumber: z.string().default(""),
    employeeDate: z.string().default(""),
    payrollTypes: z.record(z.string(), z.boolean()).default({}),
    coordinatorSignature: z.string().default(""),
    coordinatorDate: z.string().default(""),
    superintendentSignature: z.string().default(""),
    superintendentDate: z.string().default(""),
    approved: z.boolean().default(false),
    notApproved: z.boolean().default(false),
  })
  .passthrough();

export type RequestTimeOffData = z.infer<typeof requestTimeOffSchema>;
export type RequestDateParts = z.infer<typeof datePartsSchema>;

export function createBlankRequestTimeOff(): RequestTimeOffData {
  return requestTimeOffSchema.parse({});
}
