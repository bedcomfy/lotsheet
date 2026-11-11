"use client";

import { useState } from "react";
import { useBusMaster } from "../../components/BusMasterProvider";
import KeyedSheetWorkspace from "../../components/KeyedSheetWorkspace";
import { useFlags } from "../../lib/queries";
import { TextField } from "../../ui";
import { customSheetDefinition } from "./definition";
import { CustomSheetPaper } from "./CustomSheetPaper";
import type { CustomSheetData } from "./schema";
import styles from "./CustomSheet.module.css";

const getDate = (value: CustomSheetData) => value.date;
const setDate = (value: CustomSheetData, date: string) => ({ ...value, date });

export default function CustomSheet() {
  const { laneBuses, ready: busReady } = useBusMaster();
  const { data: flags = {}, isFetched: flagsReady } = useFlags();
  const [sheetReady, setSheetReady] = useState(false);
  return <>
    <KeyedSheetWorkspace
      definition={customSheetDefinition} paperLabel="Custom Sheet paper preview"
      marker={false} onReady={setSheetReady} getDate={getDate} setDate={setDate}
      blankPrintLabel="Print blank form"
      renderControls={({ value, onChange, disabled }) => <TextField className={styles.headerField}
        label="Sheet header" placeholder="Type any heading" value={value.header} isDisabled={disabled}
        onChange={(header) => onChange({ ...value, header })} />}
      describeHistory={(value) => ({ title: value.header || "Untitled sheet", meta: `${value.date || "Undated"} · ${Object.keys(value.entries).length} buses filled` })}
      renderPaper={({ value, onChange, blank }) => <CustomSheetPaper data={value} busNumbers={laneBuses()}
        flags={flags} onChange={onChange} blank={blank} />}
    />
    {sheetReady && busReady && flagsReady && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
  </>;
}
