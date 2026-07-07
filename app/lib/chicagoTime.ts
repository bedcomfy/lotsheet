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
