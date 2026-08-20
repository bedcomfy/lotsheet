"use client";

import { Sparkles } from "lucide-react";
import InteriorCleaningSheet from "../sheets/interior-cleaning/InteriorCleaningSheet";
import { AppPage, PageHeader, TabBar } from "../ui";
import styles from "./OtherSheets.module.css";

export default function OtherSheets() {
  return (
    <AppPage className={styles.page}>
      <PageHeader
        title="Other Sheets"
        description="Cleaning and supporting garage forms."
      />
      <TabBar
        label="Other sheets"
        selectedKey="interior-cleaning"
        items={[
          {
            id: "interior-cleaning",
            label: "Interior Cleaning",
            icon: <Sparkles aria-hidden="true" />,
          },
        ]}
      />
      <InteriorCleaningSheet />
    </AppPage>
  );
}
