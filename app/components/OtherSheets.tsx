"use client";

import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { BusFront, CalendarDays, CalendarRange, Sparkles } from "lucide-react";
import HybridDailySheet from "../sheets/hybrid-daily/HybridDailySheet";
import HybridWeeklySheet from "../sheets/hybrid-weekly/HybridWeeklySheet";
import InteriorCleaningSheet from "../sheets/interior-cleaning/InteriorCleaningSheet";
import MonthlyCleaningSheet from "../sheets/monthly-cleaning/MonthlyCleaningSheet";
import { AppPage, PageHeader, TabBar } from "../ui";
import styles from "./OtherSheets.module.css";

const TAB_IDS = ["interior-cleaning", "hybrid-weekly", "hybrid-daily", "monthly-cleaning"] as const;
type TabId = (typeof TAB_IDS)[number];
function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}

export default function OtherSheets() {
  const [selected, setSelected] = useState<Key>("interior-cleaning");

  // `/other?tab=hybrid-daily` opens straight on that tab, and switching tabs
  // updates the address so a reload (or a shared link) lands on the same one.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isTabId(tab)) setSelected(tab);
  }, []);
  function selectTab(key: Key) {
    setSelected(key);
    const url = new URL(window.location.href);
    if (key === "interior-cleaning") url.searchParams.delete("tab");
    else url.searchParams.set("tab", String(key));
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <AppPage className={styles.page}>
      <PageHeader
        title="Other Sheets"
        description="Cleaning and supporting garage forms."
      />
      <TabBar
        label="Other sheets"
        selectedKey={selected}
        onSelectionChange={selectTab}
        items={[
          {
            id: "interior-cleaning",
            label: "Interior Cleaning",
            icon: <Sparkles aria-hidden="true" />,
          },
          {
            id: "hybrid-weekly",
            label: "Hybrid Weekly Log",
            icon: <BusFront aria-hidden="true" />,
          },
          {
            id: "hybrid-daily",
            label: "Hybrid Daily Log",
            icon: <CalendarDays aria-hidden="true" />,
          },
          {
            id: "monthly-cleaning",
            label: "Monthly Bus Cleaning",
            icon: <CalendarRange aria-hidden="true" />,
          },
        ]}
      />
      {selected === "interior-cleaning" ? (
        <InteriorCleaningSheet />
      ) : selected === "hybrid-weekly" ? (
        <HybridWeeklySheet />
      ) : selected === "hybrid-daily" ? (
        <HybridDailySheet />
      ) : (
        <MonthlyCleaningSheet />
      )}
    </AppPage>
  );
}
