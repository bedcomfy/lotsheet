import type { Employee } from "./types";

export const EMPLOYEE_ROSTER_VERSION = 1;

export const EMPLOYEE_ROSTER: Employee[] = [
  { firstName: "Peter", lastName: "Katona", classification: "Master Mechanic", startDate: "1987-12-21", hireDate: "", badge: "4310" },
  { firstName: "Eddie", lastName: "Gwin", classification: "Mechanic", startDate: "1988-09-20", hireDate: "", badge: "4308" },
  { firstName: "Richard", lastName: "Noeller", classification: "Utility", startDate: "1992-06-09", hireDate: "1985-11-25", badge: "4356" },
  { firstName: "Mohammed", lastName: "Aman", classification: "Mechanic", startDate: "1998-04-13", hireDate: "", badge: "4365" },
  { firstName: "Raymundo", lastName: "Puente", classification: "Mechanic", startDate: "1999-02-08", hireDate: "", badge: "4367" },
  { firstName: "E. Ron", lastName: "Acosta", classification: "Mech. Helper *", startDate: "2005-05-09", hireDate: "", badge: "4387" },
  { firstName: "Jose", lastName: "Rivera", classification: "Cleaner", startDate: "2006-04-24", hireDate: "", badge: "4392" },
  { firstName: "Kimxuyen", lastName: "Dang", classification: "Mechanic", startDate: "2007-04-23", hireDate: "", badge: "4397" },
  { firstName: "Jacob", lastName: "Togba", classification: "Custodian", startDate: "2007-05-14", hireDate: "", badge: "4395" },
  { firstName: "Emilio \"Papo\"", lastName: "Quinones", classification: "Mechanic", startDate: "2009-05-11", hireDate: "", badge: "43178" },
  { firstName: "Marc", lastName: "Tate", classification: "Mechanic", startDate: "2012-10-01", hireDate: "", badge: "43187" },
  { firstName: "Billy", lastName: "Holcomb", classification: "Mechanic", startDate: "2014-03-31", hireDate: "", badge: "43191" },
  { firstName: "Wilson", lastName: "Quinones", classification: "Mechanic", startDate: "2014-05-12", hireDate: "", badge: "102774" },
  { firstName: "David", lastName: "Szymkowiak", classification: "Building Maint", startDate: "2014-10-20", hireDate: "", badge: "102901" },
  { firstName: "Andrew", lastName: "Jozwik", classification: "Mechanic", startDate: "2015-10-12", hireDate: "", badge: "103130" },
  { firstName: "Gus", lastName: "Vervilas", classification: "Servicer", startDate: "2017-06-05", hireDate: "", badge: "103662" },
  { firstName: "Joseph", lastName: "LaPaglia", classification: "Mechanic", startDate: "2017-12-29", hireDate: "", badge: "103832" },
  { firstName: "Stephanie", lastName: "Klamer", classification: "Servicer", startDate: "2018-09-24", hireDate: "", badge: "104002" },
  { firstName: "David", lastName: "De La Pena", classification: "Mechanic", startDate: "2019-01-28", hireDate: "", badge: "104061" },
  { firstName: "Jonathan", lastName: "Wright", classification: "Mechanic", startDate: "2019-09-30", hireDate: "", badge: "104241" },
  { firstName: "William \"Colton\"", lastName: "Ulrey", classification: "Mechanic", startDate: "2019-12-02", hireDate: "", badge: "104278" },
  { firstName: "Selvin", lastName: "Zambrano", classification: "Mechanic", startDate: "2020-10-20", hireDate: "", badge: "104396" },
  { firstName: "Sohail", lastName: "Malekzadeh", classification: "Mechanic", startDate: "2021-01-04", hireDate: "", badge: "104427" },
  { firstName: "Artur", lastName: "Ferens", classification: "Mechanic", startDate: "2021-08-02", hireDate: "", badge: "104499" },
  { firstName: "Matthew", lastName: "Kosikowski", classification: "Servicer", startDate: "2022-07-11", hireDate: "", badge: "104647" },
  { firstName: "Ahmad", lastName: "Omar", classification: "Mech. Helper", startDate: "2022-09-12", hireDate: "", badge: "104682" },
  { firstName: "Roberto", lastName: "Velasco", classification: "Mech. Helper", startDate: "2022-12-19", hireDate: "", badge: "104753" },
  { firstName: "Jessie", lastName: "Kong", classification: "Servicer", startDate: "2023-03-20", hireDate: "", badge: "104851" },
  { firstName: "Julian", lastName: "Jimenez", classification: "Mech. Helper", startDate: "2023-03-27", hireDate: "", badge: "104856" },
  { firstName: "Gerardo", lastName: "Garduno", classification: "Mech. Helper", startDate: "2023-04-10", hireDate: "", badge: "104889" },
  { firstName: "Francisco \"Frank\"", lastName: "Valdez", classification: "Servicer", startDate: "2023-09-05", hireDate: "", badge: "105162" },
  { firstName: "Angel", lastName: "Carrillo", classification: "Mech. Helper", startDate: "2024-01-22", hireDate: "", badge: "105361" },
  { firstName: "Eric", lastName: "Esparza", classification: "Mech. Helper", startDate: "2024-03-25", hireDate: "", badge: "105455" },
  { firstName: "Jovany", lastName: "Fragoso", classification: "Servicer", startDate: "2024-05-06", hireDate: "", badge: "105551" },
  { firstName: "Robert", lastName: "Randall", classification: "Servicer", startDate: "2024-06-10", hireDate: "", badge: "105647" },
  { firstName: "Cristian", lastName: "Rosado", classification: "Servicer", startDate: "2024-09-30", hireDate: "", badge: "105808" },
  { firstName: "Angel", lastName: "Aldape", classification: "Servicer", startDate: "2024-11-04", hireDate: "", badge: "105872" },
  { firstName: "Stivenson", lastName: "Polynice Dor", classification: "Mech. Helper", startDate: "2024-11-11", hireDate: "", badge: "105913" },
  { firstName: "Luis", lastName: "Macias", classification: "Mech. Helper", startDate: "2024-12-16", hireDate: "", badge: "105973" },
  { firstName: "Ashur \"George\"", lastName: "Georges", classification: "Servicer", startDate: "2024-12-23", hireDate: "", badge: "105977" },
  { firstName: "Kaylin \"K\"", lastName: "Wilson", classification: "Servicer", startDate: "2025-02-10", hireDate: "", badge: "106077" },
  { firstName: "Brendan", lastName: "Wilson", classification: "Servicer", startDate: "2025-02-24", hireDate: "", badge: "106104" },
  { firstName: "Jimmie", lastName: "Wilson", classification: "Servicer", startDate: "2025-04-14", hireDate: "", badge: "106173" },
];

export function mergeEmployeeRoster(existing: Employee[]): Employee[] {
  const byBadge = new Map(existing.filter((employee) => employee.badge).map((employee) => [employee.badge, employee]));
  const imported = EMPLOYEE_ROSTER.map((employee) => {
    const saved = byBadge.get(employee.badge);
    if (!saved) return { ...employee };
    return {
      firstName: saved.firstName || employee.firstName,
      lastName: saved.lastName || employee.lastName,
      badge: employee.badge,
      startDate: saved.startDate || employee.startDate,
      hireDate: saved.hireDate || employee.hireDate,
      classification: saved.classification || employee.classification,
      availability: saved.availability || "",
    };
  });
  const importedBadges = new Set(EMPLOYEE_ROSTER.map((employee) => employee.badge));
  return [...imported, ...existing.filter((employee) => !employee.badge || !importedBadges.has(employee.badge))];
}
