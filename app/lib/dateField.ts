export function dateValueToIso(value: string | null | undefined): string {
  const clean = String(value || "").trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (isoMatch) return validIso(isoMatch[1], isoMatch[2], isoMatch[3]);
  const displayMatch = /^(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{2}|\d{4})$/.exec(clean);
  if (!displayMatch) return "";
  const year = displayMatch[3].length === 2 ? `20${displayMatch[3]}` : displayMatch[3];
  return validIso(year, displayMatch[1].padStart(2, "0"), displayMatch[2].padStart(2, "0"));
}

function validIso(year: string, month: string, day: string): string {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
}

export function isoToDisplayDate(iso: string, shortYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  return `${match[2]}/${match[3]}/${shortYear ? match[1].slice(-2) : match[1]}`;
}
