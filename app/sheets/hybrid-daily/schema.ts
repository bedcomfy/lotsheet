import { z } from "zod";
import { chicagoParts } from "../../lib/chicagoTime";

export const hybridDailySchema = z
  .object({
    version: z.literal(1).default(1),
    date: z.string().default(""),
  })
  .passthrough();

export type HybridDailyData = z.infer<typeof hybridDailySchema>;

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

export function currentHybridDailyDate(now = new Date()): string {
  const parts = chicagoParts(now);
  return `${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}/${parts.year}`;
}

export function hybridDailyDayLabel(value: string): string {
  const date = parseDisplayDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  })
    .format(date)
    .toUpperCase();
}

export function createBlankHybridDaily(
  now = new Date(),
): HybridDailyData {
  return hybridDailySchema.parse({ date: currentHybridDailyDate(now) });
}
