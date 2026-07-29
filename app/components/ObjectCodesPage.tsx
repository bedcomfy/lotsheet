"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { FLAGS, flagName } from "../lib/grid";
import { OBJECT_CODES } from "../lib/objectCodes";
import {
  AppPage,
  Button,
  DataTableFrame,
  EmptyState,SearchField,
  StaticChip,
  Toolbar,
  ToolbarGroup,
} from "../ui";
import styles from "./ObjectCodesPage.module.css";

const FLAG_BY_CODE = FLAGS.reduce<Record<string, string[]>>((acc, flag) => {
  for (const code of flag.objectCodes || []) {
    acc[code] = [...(acc[code] || []), flag.id];
  }
  return acc;
}, {});

export default function ObjectCodesPage() {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return OBJECT_CODES;
    return OBJECT_CODES.filter((item) =>
      `${item.code} ${item.description}`.toLowerCase().includes(q),
    );
  }, [q]);

  return (
    <AppPage className={styles.page}>
      <Toolbar>
        <SearchField
          label="Search object codes"
          labelHidden
          value={query}
          onChange={setQuery}
          placeholder="Search code or description"
          autoComplete="off"
          className={styles.search}
        />
        <ToolbarGroup>
          <span className={styles.count}>
            <strong>{rows.length}</strong> of {OBJECT_CODES.length} codes
          </span>
          {q && (
            <Button variant="quiet" onPress={() => setQuery("")}>
              <X aria-hidden="true" /> Clear
            </Button>
          )}
        </ToolbarGroup>
      </Toolbar>

      <DataTableFrame className={styles.table} aria-label="Object codes">
        <div className={`${styles.row} ${styles.rowHead}`}>
          <span>Object Code</span>
          <span>Description</span>
          <span>Daily Flag Link</span>
        </div>
        {rows.map((item) => {
          const linkedFlags = FLAG_BY_CODE[item.code] || [];
          return (
            <article className={styles.row} key={item.code}>
              <strong className={styles.code}>{item.code}</strong>
              <span className={styles.description}>{item.description}</span>
              <span className={styles.flags}>
                {linkedFlags.length ? (
                  linkedFlags.map((id) => (
                    <StaticChip key={id} tone="accent">
                      {flagName(id)}
                    </StaticChip>
                  ))
                ) : (
                  <span className={styles.objectOnly}>Object flag only</span>
                )}
              </span>
            </article>
          );
        })}
        {!rows.length && (
          <EmptyState
            icon={<BookOpen />}
            title="No matching object codes"
            description="Try a different code number or a broader description."
            action={
              <Button variant="secondary" onPress={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )}
      </DataTableFrame>
    </AppPage>
  );
}
