"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eraser,
  FileDown,
  FileText,
  History,
  MoreHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { openSheetPdf } from "../lib/pdf";
import {
  createKeyedStateAdapter,
  PaperViewport,
  validatedValue,
} from "../sheets/core";
import type { SheetDefinition } from "../sheets/core";
import {
  ActionMenu,
  ConfirmDialog,
  SplitButton,
  Toolbar,
  ToolbarGroup,
} from "../ui";
import DatePickerField from "./DatePickerField";
import SheetHistory from "./SheetHistory";
import chromeStyles from "./SheetChrome.module.css";

type Flush = () => Promise<unknown>;

interface PaperRenderArgs<T> {
  value: T;
  onChange?: (next: T) => void;
  blank: boolean;
  dateOverride: string;
}

interface KeyedSheetWorkspaceProps<T> {
  definition: SheetDefinition<T>;
  paperLabel: string;
  renderPaper: (args: PaperRenderArgs<T>) => ReactNode;
  embedded?: boolean;
  marker?: boolean;
  dateOverride?: string;
  dateLabel?: string;
  dateShortYear?: boolean;
  getDate?: (value: T) => string;
  setDate?: (value: T, date: string) => T;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: Flush | null) => void;
  describeHistory?: (value: T) => { title: string; meta: string };
}

function queryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export default function KeyedSheetWorkspace<T>({
  definition,
  paperLabel,
  renderPaper,
  embedded = false,
  marker = true,
  dateOverride = "",
  dateLabel,
  dateShortYear = true,
  getDate,
  setDate,
  onReady,
  onRegisterFlush,
  describeHistory,
}: KeyedSheetWorkspaceProps<T>) {
  const adapter = useMemo(
    () => createKeyedStateAdapter(definition),
    [definition],
  );
  const blankValue = useCallback(
    () => validatedValue(definition, definition.createBlank?.()),
    [definition],
  );
  const [value, setValue] = useState<T>(blankValue);
  const [loaded, setLoaded] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setPrintMode(queryParam("print") === "1");
    setBlankMode(queryParam("blank") === "1");
  }, []);

  useEffect(() => {
    if (queryParam("blank") === "1") {
      setValue(blankValue());
      setLoaded(true);
      return;
    }

    let alive = true;
    adapter
      .load()
      .then((result) => {
        if (alive) setValue(result.value);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [adapter, blankValue]);

  useEffect(() => {
    if (!loaded || printMode || !dateOverride || !setDate) return;
    setValue((current) => {
      if (getDate?.(current) === dateOverride) return current;
      return setDate(current, dateOverride);
    });
  }, [dateOverride, getDate, loaded, printMode, setDate]);

  useEffect(() => {
    if (!loaded || printMode || blankMode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      adapter.save(valueRef.current).catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [adapter, blankMode, loaded, printMode, value]);

  const flush = useCallback(
    () => adapter.save(valueRef.current),
    [adapter],
  );

  useEffect(() => {
    if (!onRegisterFlush) return;
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [flush, onRegisterFlush]);

  useEffect(() => {
    onReady?.(loaded);
  }, [loaded, onReady]);

  async function archiveCurrent() {
    const empty = JSON.stringify(blankValue());
    if (JSON.stringify(valueRef.current) === empty) return;
    await adapter.archive?.(valueRef.current).catch(() => {});
  }

  async function clearSheet() {
    await archiveCurrent();
    setValue(blankValue());
  }

  async function importSheet(imported: unknown, id: string) {
    await archiveCurrent();
    setValue(validatedValue(definition, imported));
    if (definition.stateKey) {
      fetch(
        `/api/state/${definition.stateKey}/history?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ).catch(() => {});
    }
    setHistoryOpen(false);
  }

  function printPdf() {
    openSheetPdf({
      path: definition.path,
      params: {
        ...(dateOverride ? { dateOverride } : {}),
      },
      flush,
    });
  }

  function printBlank() {
    openSheetPdf({
      path: definition.path,
      params: { blank: 1 },
    });
  }

  const editable = loaded && !printMode && !blankMode;
  const displayDate = getDate?.(value) || dateOverride;

  return (
    <div className={chromeStyles.page}>
      {!embedded && (
        <Toolbar className={`${chromeStyles.toolbar} no-print`}>
          {getDate && setDate ? (
            <label className={chromeStyles.dateControl}>
              {dateLabel && (
                <span className={chromeStyles.dateLabel}>{dateLabel}</span>
              )}
              <DatePickerField
                className={chromeStyles.date}
                value={displayDate}
                onValueChange={(date) =>
                  setValue((current) => setDate(current, date))
                }
                shortYear={dateShortYear}
                ariaLabel={
                  dateLabel || `${definition.title} date`
                }
                variant="ui"
              />
            </label>
          ) : (
            <span className={chromeStyles.title}>{definition.title}</span>
          )}
          <ToolbarGroup className={chromeStyles.actions}>
            <ActionMenu
              label={
                <>
                  <MoreHorizontal size={16} /> More
                </>
              }
              items={[
                {
                  id: "history",
                  label: "Previous sheets",
                  icon: <History size={16} />,
                },
                {
                  id: "clear",
                  label: "Clear sheet",
                  icon: <Eraser size={16} />,
                  tone: "danger",
                },
              ]}
              onAction={(key) => {
                if (key === "history") setHistoryOpen(true);
                if (key === "clear") setClearOpen(true);
              }}
            />
            <SplitButton
              variant="primary"
              onPress={printPdf}
              menuLabel="Print options"
              items={[
                {
                  id: "blank",
                  label: "Print blank form",
                  icon: <FileText size={16} />,
                },
              ]}
              onAction={(key) => {
                if (key === "blank") printBlank();
              }}
            >
              <FileDown aria-hidden="true" /> Print PDF
            </SplitButton>
          </ToolbarGroup>
        </Toolbar>
      )}

      <PaperViewport
        profile={definition.paper}
        mobileViewer
        label={paperLabel}
      >
        {renderPaper({
          value,
          onChange: editable ? setValue : undefined,
          blank: blankMode,
          dateOverride,
        })}
      </PaperViewport>

      {historyOpen && definition.stateKey && (
        <SheetHistory
          apiBase={`/api/state/${definition.stateKey}/history`}
          title={`${definition.title} - Previous Sheets`}
          describe={(sheet) =>
            describeHistory
              ? describeHistory(validatedValue(definition, sheet))
              : { title: definition.title, meta: "" }
          }
          onImport={importSheet}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={clearOpen}
        onOpenChange={setClearOpen}
        title={`Clear the ${definition.title}?`}
        description="The current sheet is saved to Previous Sheets before it is cleared."
        confirmLabel="Clear sheet"
        tone="danger"
        onConfirm={clearSheet}
      />

      {marker && loaded && (
        <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />
      )}
    </div>
  );
}
