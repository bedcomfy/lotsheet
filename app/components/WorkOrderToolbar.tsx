"use client";

import { Eraser, FileDown, FileText, FolderOpen, Save } from "lucide-react";
import { Button, Toolbar, ToolbarGroup } from "../ui";
import styles from "./SheetChrome.module.css";

export interface WorkOrderToolbarProps {
  savedFlash: boolean;
  onOpenSaved: () => void;
  onSave: () => void;
  onClear: () => void;
  onPrintBlank: () => void;
  onPrintPdf: () => void;
}

export default function WorkOrderToolbar({ savedFlash, onOpenSaved, onSave, onClear, onPrintBlank, onPrintPdf }: WorkOrderToolbarProps) {
  return (
    <Toolbar className={`${styles.toolbar} no-print`}>
      <ToolbarGroup className={styles.actions}>
        <Button onPress={onOpenSaved}><FolderOpen aria-hidden="true" /> Saved</Button>
        <Button onPress={onSave}><Save aria-hidden="true" /> {savedFlash ? "Saved ✓" : "Save"}</Button>
        <Button onPress={onClear}><Eraser aria-hidden="true" /> Clear</Button>
        <Button onPress={onPrintBlank}><FileText aria-hidden="true" /> Print blank</Button>
        <Button variant="primary" onPress={onPrintPdf}><FileDown aria-hidden="true" /> Print PDF</Button>
      </ToolbarGroup>
    </Toolbar>
  );
}
