"use client";

import { useState } from "react";
import type { Key } from "react-aria-components";
import { BusFront, CalendarDays, CalendarRange, Sparkles } from "lucide-react";
import HybridDailySheet from "../sheets/hybrid-daily/HybridDailySheet";
import HybridWeeklySheet from "../sheets/hybrid-weekly/HybridWeeklySheet";
import InteriorCleaningSheet from "../sheets/interior-cleaning/InteriorCleaningSheet";
import MonthlyCleaningSheet from "../sheets/monthly-cleaning/MonthlyCleaningSheet";
import { AppPage, PageHeader, TabBar } from "../ui";
import styles from "./OtherSheets.module.css";

export default function OtherSheets() {
  const [selected, setSelected] = useState<Key>("interior-cleaning");

  return (
    <AppPage className={styles.page}>
      <PageHeader
        title="Other Sheets"
        description="Cleaning and supporting garage forms."
      />
      <TabBar
        label="Other sheets"
        selectedKey={selected}
        onSelectionChange={setSelected}
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
