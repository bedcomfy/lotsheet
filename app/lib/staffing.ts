// Staffing: the Work Pick (the shift schedule that changes each pick) and the
// availability math that reads it. The Seniority list reuses the employee roster
// (see lib/employees.ts + /api/employees); this file owns the Work Pick shape.

// ---------- Days ----------
// Sunday-first to match the printed pick's columns. offDays store these indices.
export const DAYS: { key: string; short: string; long: string }[] = [
  { key: "sun", short: "Sun", long: "Sunday" },
  { key: "mon", short: "Mon", long: "Monday" },
  { key: "tue", short: "Tue", long: "Tuesday" },
  { key: "wed", short: "Wed", long: "Wednesday" },
  { key: "thu", short: "Thu", long: "Thursday" },
  { key: "fri", short: "Fri", long: "Friday" },
  { key: "sat", short: "Sat", long: "Saturday" },
];

// ---------- Defined roles ----------
// The real classifications used on the Work Pick + Seniority pages (a dropdown
// on the pick editor). Not the same as the two Home "Available Now" buckets.
export const STAFF_ROLES: string[] = [
  "Master Mechanic",
  "Mechanic",
  "Mechanic's Helper",
  "Cleaner/Janitor/Servicer",
  "Utility Person",
];

// ---------- Availability buckets (Home only) ----------
// Home collapses every role into two coverage buckets. Everything mechanic-side
// (master, mechanic, helper) is "mech"; cleaners/janitors/servicers/utility/
// custodian/building-maint are "service".
export type Bucket = "mech" | "service";

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "mech", label: "Mechanics" },
  { id: "service", label: "Cleaner / Janitor / Servicer / Utility" },
];

// Map any role/classification string to a coverage bucket. Mechanic-side words
// win; everything else is service-side.
export function roleBucket(role: string): Bucket {
  const r = (role || "").toLowerCase();
  if (r.includes("mechanic") || r.includes("mech")) return "mech";
  return "service";
}

// ---------- Availability status (roster) ----------
// Reasons an employee is temporarily off the schedule. Stored on Employee as
// `availability` ("" = available). Editable in the Seniority roster.
export const UNAVAILABLE_REASONS: string[] = [
  "Time Off",
  "Vacation",
  "Out of Service",
  "Sick",
  "Light Duty",
  "Leave",
];

// ---------- Work Pick data model ----------
// One row = one person's assignment within a shift (role + who + their off days).
export interface PickRow {
  id: string;
  role: string; // one of STAFF_ROLES (free text tolerated)
  employeeId: string; // roster badge when known (links to /api/employees)
  name: string; // display name as it reads on the pick (e.g. "P. Katona")
  offDays: number[]; // 0=Sun … 6=Sat — days this person is OFF
}

export interface PickBreak {
  label: string; // "First Break" | "Lunch" | "Second Break"
  time: string; // "08:00 - 08:15"
}

export interface PickShift {
  id: string;
  name: string; // "1st Shift", "Mid", "Service Lane #1"…
  start: string; // "HH:MM" 24h
  end: string; // "HH:MM" 24h (may be <= start for overnight shifts)
  rows: PickRow[];
  breaks: PickBreak[];
}

export interface WorkPick {
  effective: string; // ISO "YYYY-MM-DD" (the "Effective" date on the sheet)
  shifts: PickShift[];
}

// ---------- Availability ----------
// Parse "HH:MM" → minutes since midnight (NaN-safe → 0).
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return 0;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

const WEEK_MINUTES = 7 * 1440;

// A shift's real clock interval, expressed relative to its COLUMN day. The
// schedule labels each shift with the day that holds MOST of its hours (its
// midpoint), not necessarily the calendar day it clocks in:
//   • Day / evening shifts (incl. 17:30–02:00 lanes, mostly before midnight) are
//     labeled with the day they clock IN → dayOffset 0.
//   • An overnight shift whose hours fall mostly AFTER midnight (e.g. 3rd shift
//     22:30–07:00) is labeled with the MORNING day — it actually clocks in the
//     previous evening → dayOffset -1 (starts columnDay − 1).
// dayOffset = how many days before the column day the shift physically starts.
export function shiftInterval(shift: { start: string; end: string }): {
  startMin: number;
  duration: number;
  dayOffset: number;
} {
  const startMin = parseHHMM(shift.start);
  const endMin = parseHHMM(shift.end);
  const duration = ((endMin - startMin + 1440) % 1440) || 1440;
  const midpoint = startMin + duration / 2; // minutes from the clock-in day's midnight
  const dayOffset = midpoint >= 1440 ? -1 : 0;
  return { startMin, duration, dayOffset };
}

// Is a person who works the given COLUMN days on the clock at (today, nowMin)?
// For each worked column day we place the real interval [start, start+duration)
// on the physical start day (columnDay + dayOffset) and test membership modulo
// the week — so an overnight shift labeled "Monday" is correctly in progress from
// Sunday 22:30 through Monday 07:00.
function personOnNow(
  shift: { start: string; end: string },
  worksDay: (columnDay: number) => boolean,
  today: number,
  nowMin: number
): boolean {
  const { startMin, duration, dayOffset } = shiftInterval(shift);
  const nowAbs = today * 1440 + nowMin;
  for (let columnDay = 0; columnDay < 7; columnDay++) {
    if (!worksDay(columnDay)) continue;
    const startDay = (((columnDay + dayOffset) % 7) + 7) % 7;
    const startAbs = startDay * 1440 + startMin;
    const rel = (((nowAbs - startAbs) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
    if (rel < duration) return true;
  }
  return false;
}

export interface AvailablePerson {
  name: string;
  employeeId: string;
  role: string;
  bucket: Bucket;
  shift: string;
  hours: string; // "06:30 - 15:00"
}

// Everyone scheduled to be on the clock at (today, nowMin) across all shifts.
// A person is "working column day D" when D is NOT in their offDays. Employees in
// `unavailable` (by badge — time off, vacation, out of service…) are skipped.
export function availableNow(
  pick: WorkPick | null | undefined,
  today: number,
  nowMin: number,
  unavailable?: Set<string>
): AvailablePerson[] {
  if (!pick || !Array.isArray(pick.shifts)) return [];
  const out: AvailablePerson[] = [];
  for (const shift of pick.shifts) {
    for (const row of shift.rows || []) {
      if (!row.name && !row.employeeId) continue;
      if (unavailable && row.employeeId && unavailable.has(row.employeeId)) continue;
      const off = new Set(row.offDays || []);
      const worksDay = (day: number) => !off.has(day);
      if (personOnNow(shift, worksDay, today, nowMin)) {
        out.push({
          name: row.name,
          employeeId: row.employeeId,
          role: row.role,
          bucket: roleBucket(row.role),
          shift: shift.name,
          hours: `${shift.start} - ${shift.end}`,
        });
      }
    }
  }
  return out;
}

// Count + list available people per Home bucket.
export function availabilityByBucket(
  people: AvailablePerson[]
): Record<Bucket, AvailablePerson[]> {
  const map: Record<Bucket, AvailablePerson[]> = { mech: [], service: [] };
  for (const p of people) map[p.bucket].push(p);
  return map;
}
