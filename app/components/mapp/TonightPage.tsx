"use client";

// The Tonight board — the phone-shell home. Same live numbers as the desktop
// dashboard (shared fleetStats), presented for a glance on the floor.

import { useRouter } from "next/navigation";
import MTonight from "./MTonight";
import { AppPage } from "../../ui";
import styles from "./MApp.module.css";

export default function TonightPage() {
  const router = useRouter();
  return (
    <AppPage className={styles.page}>
      <MTonight
        onGo={(tab) => {
          const paths: Record<string, string> = {
            lot: "/",
            buses: "/buses",
            service: "/service",
          };
          router.push(paths[tab] || "/home");
        }}
        onOpenBus={(bus) => router.push(`/buses?bus=${encodeURIComponent(bus)}`)}
      />
    </AppPage>
  );
}
