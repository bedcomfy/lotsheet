"use client";

// The Tonight board — the phone-shell home. Same live numbers as the desktop
// dashboard (shared fleetStats), presented for a glance on the floor.

import { useState } from "react";
import { useRouter } from "next/navigation";
import BusCard from "../BusCard";
import MTonight from "./MTonight";
import { AppPage } from "../../ui";
import styles from "./MApp.module.css";

export default function TonightPage() {
  const router = useRouter();
  const [openBus, setOpenBus] = useState<string | null>(null);
  return (
    <AppPage className={styles.page}>
      <MTonight
        onGo={(tab) => {
          const paths: Record<string, string> = {
            lot: "/",
            buses: "/buses",
            service: "/service",
            setup: "/service?tab=fuel&setup=1",
            turnover: "/turnover",
          };
          router.push(paths[tab] || "/home");
        }}
        onOpenBus={setOpenBus}
      />
      {openBus && (
        <BusCard
          bus={openBus}
          onClose={() => setOpenBus(null)}
          onOpenLotSheet={(bus) => {
            setOpenBus(null);
            router.push(`/?find=${encodeURIComponent(bus)}`);
          }}
        />
      )}
    </AppPage>
  );
}
