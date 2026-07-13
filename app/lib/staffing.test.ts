import { describe, expect, it } from "vitest";
import {
  availableNow,
  parseHHMM,
  roleBucket,
  shiftInterval,
  type PickShift,
  type WorkPick,
} from "./staffing";

describe("parseHHMM", () => {
  it("parses HH:MM to minutes", () => {
    expect(parseHHMM("06:30")).toBe(390);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(1439);
  });
});

describe("roleBucket", () => {
  it("maps mechanic-side roles to mech, everything else to service", () => {
    expect(roleBucket("Master Mechanic")).toBe("mech");
    expect(roleBucket("Mechanic")).toBe("mech");
    expect(roleBucket("Mechanic's Helper")).toBe("mech");
    expect(roleBucket("Cleaner/Janitor/Servicer")).toBe("service");
    expect(roleBucket("Utility Person")).toBe("service");
    expect(roleBucket("Custodian")).toBe("service");
  });
});

describe("shiftInterval (day attribution)", () => {
  it("attributes a day shift to its clock-in day", () => {
    expect(shiftInterval({ start: "06:30", end: "15:00" })).toEqual({ startMin: 390, duration: 510, dayOffset: 0 });
  });
  it("attributes an overnight shift (mostly after midnight) to the MORNING day", () => {
    // 3rd shift 22:30-07:00: most hours are after midnight, so it starts the day BEFORE its column day.
    expect(shiftInterval({ start: "22:30", end: "07:00" }).dayOffset).toBe(-1);
  });
  it("keeps an evening shift (mostly before midnight) on its start day", () => {
    // Service lane 17:30-02:00: most hours before midnight.
    expect(shiftInterval({ start: "17:30", end: "02:00" }).dayOffset).toBe(0);
  });
});

// Days: 0=Sun 1=Mon ... 6=Sat. offDays = days OFF.
function pick(shifts: PickShift[]): WorkPick {
  return { effective: "2026-05-31", shifts };
}
const firstShift: PickShift = {
  id: "first",
  name: "1st Shift",
  start: "06:30",
  end: "15:00",
  breaks: [],
  rows: [{ id: "a", role: "Mechanic", employeeId: "1", name: "A", offDays: [0, 6] }], // works Mon
};
const thirdShift: PickShift = {
  id: "third",
  name: "3rd Shift",
  start: "22:30",
  end: "07:00",
  breaks: [],
  rows: [
    { id: "b", role: "Mechanic", employeeId: "2", name: "B", offDays: [0, 6] }, // works Mon column
    { id: "c", role: "Mechanic", employeeId: "3", name: "C", offDays: [1, 2] }, // OFF Mon, works Sun column
  ],
};

describe("availableNow", () => {
  const wp = pick([firstShift, thirdShift]);

  it("at Monday 04:00, only the overnight worker whose MONDAY shift is in progress is on", () => {
    // Monday=1, 04:00 = 240 min. 3rd shift's Monday column ran from Sun 22:30 to Mon 07:00.
    const people = availableNow(wp, 1, 240);
    const names = people.map((p) => p.name).sort();
    expect(names).toEqual(["B"]); // B works the Monday column; C is off Monday
  });

  it("at Monday noon, the day-shift worker is on and the overnight one is not", () => {
    const people = availableNow(wp, 1, 720);
    expect(people.map((p) => p.name)).toEqual(["A"]);
  });

  it("excludes employees in the unavailable set", () => {
    const people = availableNow(wp, 1, 240, new Set(["2"])); // B out of service
    expect(people).toHaveLength(0);
  });

  it("returns nobody when no shift covers the moment", () => {
    // Monday 16:00 = 960: 1st ended (15:00), 3rd not started (22:30).
    expect(availableNow(wp, 1, 960)).toHaveLength(0);
  });

  it("is empty for a null pick", () => {
    expect(availableNow(null, 1, 240)).toHaveLength(0);
  });
});
