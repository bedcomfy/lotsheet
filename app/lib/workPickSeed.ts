// The current Work Pick, transcribed from the printed schedule (Effective
// 5/31/2026) so the site is useful on day one. It's editable in the app; this is
// just the initial seed loaded when no pick has been saved yet.
//
// Day indices: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat. offDays = days OFF.

import type { PickRow, PickShift, WorkPick } from "./staffing";

export const WORK_PICK_VERSION = 1;

// Compact row builder. Stable ids (no randomness) keyed by shift + index.
function rows(
  shiftId: string,
  list: [role: string, name: string, employeeId: string, offDays: number[]][]
): PickRow[] {
  return list.map(([role, name, employeeId, offDays], i) => ({
    id: `${shiftId}-r${i}`,
    role,
    name,
    employeeId,
    offDays,
  }));
}

const MASTER = "Master Mechanic";
const MECH = "Mechanic";
const HELPER = "Mechanic's Helper";
const CJS = "Cleaner/Janitor/Servicer";
const UTIL = "Utility Person";

const SHIFTS: PickShift[] = [
  {
    id: "first",
    name: "1st Shift",
    start: "06:30",
    end: "15:00",
    breaks: [
      { label: "First Break", time: "08:00 - 08:15" },
      { label: "Second Break", time: "10:00 - 10:15" },
      { label: "Lunch", time: "12:00 - 12:30" },
    ],
    rows: rows("first", [
      [MASTER, "P. Katona", "4310", [0, 6]],
      [MECH, "M. Aman", "4365", [0, 6]],
      [MECH, "P. Quinones", "43178", [0, 6]],
      [MECH, "M. Tate", "43187", [0, 6]],
      [MECH, "W. Quinones", "102774", [0, 6]],
      [MECH, "E. Gwin", "4308", [5, 6]],
      [MECH, "A. Jozwik", "103130", [0, 1]],
      [MECH, "D. De La Pena", "104061", [0, 4]],
      [MECH, "J. LaPaglia", "103832", [3, 6]],
      [CJS, "J. Rivera", "4392", [0, 6]],
      [CJS, "S. Klamer", "104002", [0, 6]],
      [CJS, "M. Kosikowski", "104647", [0, 1]],
      [CJS, "J. Kong", "104851", [5, 6]],
    ]),
  },
  {
    id: "mid",
    name: "Mid",
    start: "10:30",
    end: "19:00",
    breaks: [
      { label: "First Break", time: "12:00 - 12:15" },
      { label: "Lunch", time: "14:00 - 14:30" },
      { label: "Second Break", time: "17:00 - 17:15" },
    ],
    rows: rows("mid", [
      [CJS, "J. Fragoso", "105551", [5, 6]],
      [CJS, "G. Vervilas", "103662", [0, 1]],
    ]),
  },
  {
    id: "second",
    name: "2nd Shift",
    start: "14:30",
    end: "23:00",
    breaks: [
      { label: "First Break", time: "17:00 - 17:15" },
      { label: "Lunch", time: "19:00 - 19:30" },
      { label: "Second Break", time: "21:00 - 21:15" },
    ],
    rows: rows("second", [
      [MECH, "B. Holcomb", "43191", [0, 6]],
      [MECH, "C. Ulrey", "104278", [0, 6]],
      [MECH, "R. Puente", "4367", [5, 6]],
      [MECH, "K. Dang", "4397", [0, 1]],
      [HELPER, "A. Omar", "104682", [0, 6]],
      [HELPER, "G. Garduno", "104889", [0, 1]],
      [HELPER, "L. Macias", "105973", [0, 4]],
      [HELPER, "E. Esparza", "105455", [3, 6]],
      [CJS, "F. Valdez", "105162", [5, 6]],
    ]),
  },
  {
    id: "third",
    name: "3rd Shift",
    start: "22:30",
    end: "07:00",
    breaks: [
      { label: "First Break", time: "00:00 - 00:15" },
      { label: "Lunch", time: "02:30 - 03:00" },
      { label: "Second Break", time: "05:00 - 05:15" },
    ],
    rows: rows("third", [
      [MECH, "S. Zambrano", "104396", [0, 6]],
      [MECH, "J. Wright", "104241", [2, 3]],
      [MECH, "S. Malekzadeh", "104427", [0, 6]],
      [MECH, "A. Ferens", "104499", [0, 6]],
      [HELPER, "R. Velasco", "104753", [0, 6]],
      [HELPER, "R. Acosta", "4387", [0, 1]],
      [HELPER, "J. Jimenez", "104856", [0, 1]],
      [HELPER, "A. Carrillo", "105361", [5, 6]],
      [HELPER, "S. Polynice", "105913", [5, 6]],
      [CJS, "A. Aldape", "105872", [0, 6]],
    ]),
  },
  {
    id: "lane1",
    name: "Service Lane #1",
    start: "17:30",
    end: "02:00",
    breaks: [
      { label: "First Break", time: "19:30 - 19:45" },
      { label: "Lunch", time: "21:00 - 21:30" },
      { label: "Second Break", time: "23:30 - 23:45" },
    ],
    rows: rows("lane1", [
      [UTIL, "R. Noeller", "4356", [5, 6]],
      [CJS, "J. Togba", "4395", [0, 6]],
      [CJS, "C. Rosado", "105808", [0, 1]],
      [CJS, "K. Wilson", "106077", [2, 6]],
    ]),
  },
  {
    id: "lane2",
    name: "Service Lane #2",
    start: "18:00",
    end: "02:30",
    breaks: [
      { label: "First Break", time: "20:00 - 20:15" },
      { label: "Lunch", time: "22:00 - 22:30" },
      { label: "Second Break", time: "00:00 - 00:15" },
    ],
    rows: rows("lane2", [
      [CJS, "R. Randall", "105647", [0, 6]],
      [CJS, "A. George", "105977", [0, 1]],
      [CJS, "B. Wilson", "106104", [0, 4]],
      [CJS, "J. Wilson", "106173", [3, 6]],
    ]),
  },
];

export const WORK_PICK_SEED: WorkPick = {
  effective: "2026-05-31",
  shifts: SHIFTS,
};
