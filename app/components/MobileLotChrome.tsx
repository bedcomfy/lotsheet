"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Eraser,
  FileDown,
  Flag,
  History,
  LayoutGrid,
  ListChecks,
  ListX,
  Share2,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import {
  Button,
  Checkbox,
  Chip,
  ResponsiveDialog,
  SearchField,
} from "../ui";
import styles from "./MobileLotChrome.module.css";

export interface MobileLotChromeProps {
  zoom: "pan" | "fit";
  onZoom: (zoom: "pan" | "fit") => void;
  searchRequest: number;
  onFill: () => void;
  onFlags: () => void;
  onShop: () => void;
  onPrint: () => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  onPrev: () => void;
  onShare: () => void;
  onPrintBlank: () => void;
  onClearGrid: () => void;
  onClearLots: () => void;
  showMaint: boolean;
  onShowMaint: (value: boolean) => void;
  usableCount: number;
  outCount: number;
  missingCount: number;
  onUsable: () => void;
  onOut: () => void;
  onMissing: () => void;
  findVal: string;
  onFind: (value: string) => void;
  foundWhere: string;
  foundBus: string;
}

export default function MobileLotChrome(props: MobileLotChromeProps) {
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    if (props.searchRequest) setToolsOpen(true);
  }, [props.searchRequest]);

  function run(action: () => void) {
    setToolsOpen(false);
    action();
  }

  const actions = [
    { id: "fill", label: "Fill", icon: LayoutGrid, action: props.onFill, primary: true },
    { id: "flags", label: "Flags", icon: Flag, action: props.onFlags },
    { id: "shop", label: "Shop", icon: Wrench, action: props.onShop },
    { id: "print", label: "Print", icon: FileDown, action: props.onPrint },
    {
      id: "tools",
      label: "Tools",
      icon: SlidersHorizontal,
      action: () => setToolsOpen(true),
    },
  ];

  return (
    <>
      <Chip
        className={`${styles.zoom} no-print`}
        onPress={() => props.onZoom(props.zoom === "fit" ? "pan" : "fit")}
        aria-label={
          props.zoom === "fit"
            ? "View sheet at 100 percent"
            : "Fit whole sheet"
        }
      >
        {props.zoom === "fit" ? "100%" : "Fit"}
      </Chip>

      <nav
        className={`${styles.actionBar} no-print`}
        aria-label="Lot Sheet actions"
        data-suppressed={props.selectMode ? "true" : undefined}
      >
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              className={styles.action}
              variant={item.primary ? "primary" : "quiet"}
              onPress={item.action}
              data-open={item.id === "tools" && toolsOpen ? "true" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </nav>

      <ResponsiveDialog
        isOpen={toolsOpen}
        onOpenChange={setToolsOpen}
        title="Lot Sheet tools"
        description="Find a bus, review status, or use a sheet action."
        size="lg"
        bodyClassName={styles.dialogBody}
        footer={(close) => (
          <Button variant="primary" onPress={close}>
            Done
          </Button>
        )}
      >
        <section className={styles.section}>
          <SearchField
            label="Find bus"
            placeholder="Enter a bus number"
            inputMode="numeric"
            value={props.findVal}
            onChange={props.onFind}
            autoFocus={!!props.searchRequest}
          />
          {props.findVal && (
            <p
              className={styles.findMessage}
              data-found={!!props.foundBus || undefined}
            >
              {props.foundBus
                ? props.foundWhere || "Not on the sheet"
                : "Enter a four-digit bus number"}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h3>Status</h3>
          <div className={styles.statuses}>
            <Chip tone="success" onPress={() => run(props.onUsable)}>
              {props.usableCount} usable
            </Chip>
            <Chip tone="danger" onPress={() => run(props.onOut)}>
              {props.outCount} out of service
            </Chip>
            <Chip
              tone={props.missingCount ? "warning" : "neutral"}
              onPress={() => run(props.onMissing)}
            >
              {props.missingCount} missing
            </Chip>
          </div>
        </section>

        <section className={styles.section}>
          <h3>Actions</h3>
          <div className={styles.actionGrid}>
            <Button
              variant="secondary"
              onPress={() => run(props.onToggleSelect)}
            >
              <ListChecks aria-hidden="true" />{" "}
              {props.selectMode ? "Exit select" : "Select buses"}
            </Button>
            <Button variant="secondary" onPress={() => run(props.onPrev)}>
              <History aria-hidden="true" /> Previous sheets
            </Button>
            <Button variant="secondary" onPress={() => run(props.onShare)}>
              <Share2 aria-hidden="true" /> Share as text
            </Button>
            <Button
              variant="secondary"
              onPress={() => run(props.onPrintBlank)}
            >
              <ClipboardList aria-hidden="true" /> Print blank
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <Checkbox
            isSelected={props.showMaint}
            onChange={props.onShowMaint}
            description="Include bus types and maintenance details on the printout."
          >
            Maintenance info
          </Checkbox>
        </section>

        <section className={`${styles.section} ${styles.danger}`}>
          <h3>Danger zone</h3>
          <div className={styles.actionGrid}>
            <Button variant="danger" onPress={() => run(props.onClearGrid)}>
              <Eraser aria-hidden="true" /> Clear grid
            </Button>
            <Button variant="danger" onPress={() => run(props.onClearLots)}>
              <ListX aria-hidden="true" /> Clear lots
            </Button>
          </div>
        </section>
      </ResponsiveDialog>
    </>
  );
}
