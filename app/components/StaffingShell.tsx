"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, ListOrdered } from "lucide-react";
import { AppPage, PageHeader, TabBar } from "../ui";
import styles from "./SectionShell.module.css";

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
    <AppPage className={styles.page}>
      <PageHeader
        eyebrow="Staffing"
        title="Roster & Schedule"
        description="View the seniority list and current work pick. Editing requires the admin password."
      />

      <TabBar
        label="Staffing sections"
        selectedKey={
          TABS.find(
            (tab) =>
              pathname === tab.path ||
              (pathname ? pathname.startsWith(`${tab.path}/`) : false),
          )?.id ?? "seniority"
        }
        onSelectionChange={(key) => {
          const next = TABS.find((tab) => tab.id === key);
          if (next) router.push(next.path);
        }}
        items={TABS.map((tab) => {
          const Icon = tab.icon;
          return {
            id: tab.id,
            label: tab.label,
            icon: <Icon aria-hidden="true" />,
          };
        })}
      />

      {children}
    </AppPage>
  );
}
