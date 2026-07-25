"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bus, Flag } from "lucide-react";
import AdminGate from "./AdminGate";
import { AppPage, PageHeader, TabBar } from "../ui";
import styles from "./SectionShell.module.css";

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
      <AppPage className={styles.page}>
        <PageHeader
          eyebrow="Admin Tools"
          title="Sheet Configuration"
          description="Protected controls for shared fleet data and display rules."
        />

        <TabBar
          label="Admin sections"
          selectedKey={
            TABS.find(
              (tab) =>
                pathname === tab.path ||
                (pathname ? pathname.startsWith(`${tab.path}/`) : false),
            )?.id ?? "flags"
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
    </AdminGate>
  );
}
