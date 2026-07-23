"use client";

// The Tonight board — the phone-shell home. Same live numbers as the desktop
// dashboard (shared fleetStats), presented for a glance on the floor.

import { useRouter } from "next/navigation";
import MTonight from "./MTonight";

export default function TonightPage() {
  const router = useRouter();
  return (
    <main className="mpage">
      <MTonight
        onGo={(tab) => router.push(tab === "lot" ? "/" : "/buses")}
        onOpenBus={(bus) => router.push(`/buses?bus=${encodeURIComponent(bus)}`)}
      />
    </main>
  );
}
