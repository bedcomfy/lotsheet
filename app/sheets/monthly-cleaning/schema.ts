import { z } from "zod";
import { chicagoParts } from "../../lib/chicagoTime";

const cleaningEntrySchema = z
  .object({
    date: z.string().default(""),
    serv: z.string().default(""),
  })
  .passthrough();

export const monthlyCleaningSchema = z
  .object({
    version: z.literal(1).default(1),
    month: z.string().default(""),
    entries: z.record(z.string(), cleaningEntrySchema).default({}),
  })
  .passthrough();

export type MonthlyCleaningData = z.infer<typeof monthlyCleaningSchema>;
export type MonthlyCleaningEntry = z.infer<typeof cleaningEntrySchema>;

export function normalizeCleaningMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}`;
}

export function cleaningMonthLabel(value: string): string {
  const normalized = normalizeCleaningMonth(value);
  if (!normalized) return "";
  const [year, month] = normalized.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function currentCleaningMonth(now = new Date()): string {
  const parts = chicagoParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function createBlankMonthlyCleaning(
  now = new Date(),
): MonthlyCleaningData {
  return monthlyCleaningSchema.parse({ month: currentCleaningMonth(now) });
}
