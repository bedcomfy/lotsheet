"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BusFront } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import {
  Button,
  EmptyState,
  ResponsiveDialog,
  SearchField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import BusCard from "./BusCard";
import styles from "./GlobalBusSearch.module.css";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export default function GlobalBusSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const { isKnown } = useBusMaster();
  const [query, setQuery] = useState("");
  const [selectedBus, setSelectedBus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" or Ctrl/Cmd+K from anywhere focuses the fleet search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditable(event.target);
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!slash && !combo) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bus = sanitizeBus(query);
    if (bus) setSelectedBus(bus);
  }

  function close() {
    setSelectedBus("");
    setQuery("");
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <SearchField
          className={styles.field}
          inputRef={inputRef}
          label="Search fleet"
          labelHidden
          placeholder="Search fleet by bus number"
          inputMode="numeric"
          value={query}
          onChange={(value) => {
            const bus = sanitizeBus(value).slice(0, 5);
            setQuery(bus);
            if (isKnown(bus)) setSelectedBus(bus);
          }}
        />
      </form>

      {selectedBus && isKnown(selectedBus) ? (
        <BusCard
          bus={selectedBus}
          onOpenLotSheet={(bus) => {
            close();
            if (pathname === "/") {
              window.dispatchEvent(new CustomEvent("pace:lot-find", { detail: bus }));
            } else {
              router.push(`/?find=${encodeURIComponent(bus)}`);
            }
          }}
          onClose={close}
        />
      ) : (
        <ResponsiveDialog
          isOpen={!!selectedBus}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Bus not found"
          description={`${selectedBus} is not in the active bus list.`}
          size="sm"
          footer={(requestClose) => (
            <Button variant="quiet" onPress={requestClose}>
              Done
            </Button>
          )}
        >
          <EmptyState
            icon={<BusFront />}
            title="No matching bus"
            description="Check the bus number and try again."
          />
        </ResponsiveDialog>
      )}
    </>
  );
}
