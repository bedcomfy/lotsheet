"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bus, Flag } from "lucide-react";
import AdminGate from "./AdminGate";

const TABS = [
  { id: "flags", label: "Flag Editor", icon: Flag, path: "/admin/flags" },
  { id: "buses", label: "Bus Lists", icon: Bus, path: "/admin/buses" },
] as const;

// The shared frame for every Admin Tools page: the password gate, the hero, and
// the tab bar that switches between the tools. Each tool is its own route/page.
export default function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AdminGate>
      <main className="adminpage">
        <section className="adminhero">
          <div>
            <span className="adminhero__eyebrow">Admin Tools</span>
            <h1>Sheet Configuration</h1>
            <p>Protected controls for the data and display rules that affect everyone using the sheets.</p>
          </div>
        </section>

        <nav className="admintabs" aria-label="Admin sections">
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
    </AdminGate>
  );
}
