export const CHICAGO_TIME_ZONE = "America/Chicago";

export interface ChicagoParts {
  month: string;
  day: string;
  year: string;
  hour24: string;
  minute: string;
}

export function chicagoParts(now = new Date()): ChicagoParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    month: get("month"),
    day: get("day"),
    year: get("year"),
    hour24: get("hour"),
    minute: get("minute"),
  };
}

export function chicagoDateFull(now = new Date()): string {
  const p = chicagoParts(now);
  return `${p.month}/${p.day}/${p.year}`;
}

export function chicagoDateShort(now = new Date()): string {
  const p = chicagoParts(now);
  return `${p.month}/${p.day}/${p.year.slice(-2)}`;
}

export function chicagoLotStamp(now = new Date()): { date: string; time: string } {
  const p = chicagoParts(now);
  const h24 = Number(p.hour24);
  const h12 = h24 % 12 || 12;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return {
    date: `${p.month}/${p.day}/${p.year}`,
    time: `${h12}:${p.minute} ${ampm} / ${p.hour24}${p.minute}`,
  };
}

export function chicagoMinuteKey(now = new Date()): string {
  const p = chicagoParts(now);
  return `${p.year}-${p.month}-${p.day}T${p.hour24}:${p.minute}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Day of week in Chicago: 0 = Sunday … 6 = Saturday (matches the Work Pick's
// Sunday-first columns).
export function chicagoWeekday(now = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    weekday: "short",
  }).format(now);
  return WEEKDAY_INDEX[short.slice(0, 3)] ?? 0;
}

// Minutes since Chicago midnight (0–1439), so a clock time can be compared to a
// shift's start/end.
export function chicagoNowMinutes(now = new Date()): number {
  const p = chicagoParts(now);
  return Number(p.hour24) * 60 + Number(p.minute);
}
