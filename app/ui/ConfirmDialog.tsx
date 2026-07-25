"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { ResponsiveDialog } from "./ResponsiveDialog";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
  isPending?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  isPending = false,
}: ConfirmDialogProps) {
  async function confirm(close: () => void) {
    await onConfirm();
    close();
  }

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={(close) => (
        <>
          <Button
            variant="quiet"
            onPress={close}
            isDisabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onPress={() => confirm(close)}
            isDisabled={isPending}
          >
            {isPending ? "Working..." : confirmLabel}
          </Button>
        </>
      )}
    >
      <div className={styles.content} data-tone={tone}>
        <span className={styles.icon} aria-hidden="true">
          <AlertTriangle />
        </span>
        <p>{description}</p>
      </div>
    </ResponsiveDialog>
  );
}
