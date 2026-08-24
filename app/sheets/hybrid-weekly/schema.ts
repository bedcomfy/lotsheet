import { z } from "zod";
import { chicagoParts } from "../../lib/chicagoTime";

export const HYBRID_WEEKDAYS = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;

export const hybridWeeklySchema = z
  .object({
    version: z.literal(1).default(1),
    weekStarting: z.string().default(""),
  })
  .passthrough();

export type HybridWeeklyData = z.infer<typeof hybridWeeklySchema>;

function parseDisplayDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatHybridDate(date: Date, padded = true): string {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${padded ? String(month).padStart(2, "0") : month}/${
    padded ? String(day).padStart(2, "0") : day
  }/${year}`;
}

export function normalizeHybridWeekStart(value: string): string {
  const date = parseDisplayDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return formatHybridDate(date);
}

export function currentHybridWeekStart(now = new Date()): string {
  const parts = chicagoParts(now);
  return normalizeHybridWeekStart(`${parts.month}/${parts.day}/${parts.year}`);
}

export function hybridWeekDates(weekStarting: string): string[] {
  const sunday = parseDisplayDate(normalizeHybridWeekStart(weekStarting));
  if (!sunday) return Array.from({ length: 7 }, () => "");
  return HYBRID_WEEKDAYS.map((_, index) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + index);
    return formatHybridDate(date, false);
  });
}

export function createBlankHybridWeekly(
  now = new Date(),
): HybridWeeklyData {
  return hybridWeeklySchema.parse({ weekStarting: currentHybridWeekStart(now) });
}
