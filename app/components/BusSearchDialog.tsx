"use client";

// Phone-side fleet search: the magnifier in the top bar on every page. Typing a
// known bus number opens its Bus Card straight away.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusFront } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { EmptyState, ResponsiveDialog, SearchField } from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import BusCard from "./BusCard";
import styles from "./BusSearchDialog.module.css";

export default function BusSearchDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { isKnown } = useBusMaster();
  const [query, setQuery] = useState("");
  const [bus, setBus] = useState("");

  function close() {
    setBus("");
    setQuery("");
    onOpenChange(false);
  }

  return (
    <>
      <ResponsiveDialog
        isOpen={isOpen && !bus}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title="Find a bus"
        description="Type a bus number to open its card."
        size="sm"
      >
        <SearchField
          className={styles.field}
          label="Bus number"
          labelHidden
          placeholder="Bus number…"
          inputMode="numeric"
          autoFocus
          value={query}
          onChange={(value) => {
            const next = sanitizeBus(value);
            setQuery(next);
            if (isKnown(next)) setBus(next);
          }}
        />
        {query.length >= 4 && !isKnown(query) && (
          <EmptyState
            icon={<BusFront />}
            title="No matching bus"
            description={`${query} is not in the active bus list.`}
          />
        )}
      </ResponsiveDialog>

      {bus && (
        <BusCard
          bus={bus}
          onClose={close}
          onOpenLotSheet={(target) => {
            close();
            router.push(`/?find=${encodeURIComponent(target)}`);
          }}
        />
      )}
    </>
  );
}
