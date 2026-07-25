"use client";

// The Buses tool (phone shell): search or tap a recent bus → the Bus Card
// (live location, flags, tonight's service) with Flags and Move. Reached from
// the tab bar; /buses?bus=1234 deep-links straight to a card (used by the
// Tonight board's missing-bus banner).

import { useEffect, useState } from "react";
import MBuses, { pushRecent } from "./MBuses";
import MBusCard from "./MBusCard";
import { AppPage } from "../../ui";
import styles from "./MApp.module.css";

export default function BusesPage() {
  const [openBus, setOpenBus] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get("bus");
    if (b) setOpenBus(b);
  }, []);

  function toast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2100);
  }
  function open(bus: string) {
    (document.activeElement as HTMLElement | null)?.blur?.(); // keyboard never blocks the card
    pushRecent(bus);
    setOpenBus(bus);
  }

  return (
    <AppPage className={styles.page}>
      <MBuses onOpenBus={open} />
      {openBus && <MBusCard bus={openBus} onClose={() => setOpenBus(null)} toast={toast} />}
      {toastMsg && (
        <div className={styles.toast} role="status">
          <b>✓</b>&nbsp;{toastMsg}
        </div>
      )}
    </AppPage>
  );
}
