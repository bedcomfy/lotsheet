// Zod schemas for API request payloads — one canonical, validated shape per
// endpoint. Routes parse untrusted request bodies through these so malformed
// input is rejected with a clear 400 instead of reaching the data layer. The
// inferred types are a single source of truth the client can import too.

import { z } from "zod";
import { NextResponse } from "next/server";

// ---------- flags ----------
// POST /api/flags — set one bus's flags. Field-level shape is well defined.
export const flagPayloadSchema = z.object({
  bus: z.string().trim().min(1),
  flags: z.array(z.string()).default([]),
  note: z.string().catch("").default(""),
  holdReason: z.string().catch("").default(""),
  cardsReason: z.string().catch("").default(""),
  retorqueTires: z.array(z.string()).default([]),
  inspOption: z.string().catch("").default(""),
  inspMiles: z.union([z.number(), z.null()]).optional(),
  actor: z.string().catch("").default(""),
});
export type FlagPayload = z.infer<typeof flagPayloadSchema>;

// ---------- employees ----------
// PUT /api/employees — the full roster. Fields are coerced leniently (legacy
// {name}-only records are migrated downstream), we only guarantee the envelope
// is an object with an `employees` array of record-shaped entries.
const employeeInputSchema = z.object({
  firstName: z.string().catch(""),
  lastName: z.string().catch(""),
  badge: z.string().catch(""),
  startDate: z.string().catch(""),
  hireDate: z.string().catch(""),
  classification: z.string().catch(""),
  availability: z.string().catch(""),
  name: z.string().optional(),
});
export const employeesPayloadSchema = z.object({
  employees: z.array(employeeInputSchema).default([]),
});
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

// ---------- PM mileage ----------
// PUT /api/pm-mileage — patch one bus. Miles arrive as numbers or typed text.
const milesField = z.union([z.number(), z.string(), z.null()]).optional();
export const pmMileagePatchSchema = z.object({
  bus: z.string().trim().min(1),
  odometer: milesField,
  odometerDate: z.union([z.string(), z.null()]).optional(),
  lastPmMiles: milesField,
  lastPmDate: z.union([z.string(), z.null()]).optional(),
  interval: milesField,
  note: z.string().optional(),
  actor: z.string().catch("").default(""),
});
export type PmMileagePatch = z.infer<typeof pmMileagePatchSchema>;

// POST /api/pm-mileage/readings — a reviewed batch of odometer readings.
export const pmReadingsPayloadSchema = z.object({
  readings: z
    .array(
      z.object({
        bus: z.string().trim().min(1),
        odometer: z.number().int().nonnegative(),
        readAt: z.union([z.string(), z.null()]).optional(),
      }),
    )
    .min(1)
    .max(2000),
  source: z.string().catch("pdf").default("pdf"),
  actor: z.string().catch("").default(""),
});

// PUT /api/pm-mileage/settings
export const pmSettingsPayloadSchema = z.object({
  defaultInterval: z.union([z.number(), z.string()]),
  dueSoonMiles: z.union([z.number(), z.string()]).optional(),
  actor: z.string().catch("").default(""),
});

// ---------- keyed state ----------
// PUT /api/state/[key] — arbitrary per-sheet JSON; validate only the envelope.
export const statePayloadSchema = z.object({
  value: z.unknown().optional(),
});

// Parse a request body against a schema, returning either the typed data or a
// ready-to-return 400 response.
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  const raw = await req.json().catch(() => undefined);
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Invalid request", issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 }
      ),
    };
  }
  return { data: result.data, error: null };
}
