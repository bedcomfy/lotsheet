"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, ListOrdered } from "lucide-react";

const TABS = [
  { id: "seniority", label: "Seniority", icon: ListOrdered, path: "/staffing/seniority" },
  { id: "workpick", label: "Work Pick", icon: CalendarClock, path: "/staffing/workpick" },
] as const;

// Shared frame for the Staffing pages. Unlike Admin Tools there is NO gate here —
// anyone can VIEW the seniority list and work pick; editing each page is unlocked
// with the admin password inside the page itself.
export default function StaffingShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <main className="adminpage">
      <section className="adminhero">
        <div>
          <span className="adminhero__eyebrow">Staffing</span>
          <h1>Roster &amp; Schedule</h1>
          <p>The seniority list and the current work pick. Everyone can view; editing is unlocked with the admin password.</p>
        </div>
      </section>

      <nav className="admintabs" aria-label="Staffing sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.path || (pathname ? pathname.startsWith(`${tab.path}/`) : false);
          return (
            <button
              key={tab.id}
              className={`admintab ${active ? "admintab--active" : ""}`}
              onClick={() => router.push(tab.path)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {children}
    </main>
  );
}
