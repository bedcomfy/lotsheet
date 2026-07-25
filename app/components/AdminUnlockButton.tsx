"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button, ResponsiveDialog, TextField } from "../ui";

export default function AdminUnlockButton({
  onSubmit,
  label = "Edit",
}: {
  onSubmit: (password: string) => boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
    setError(false);
  }

  function submit(closeDialog: () => void) {
    if (onSubmit(password)) closeDialog();
    else setError(true);
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        <Lock aria-hidden="true" /> {label}
      </Button>
      <ResponsiveDialog
        isOpen={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
        title="Unlock editing"
        description="Use the Admin Tools password."
        size="sm"
        footer={(closeDialog) => (
          <>
            <Button variant="quiet" onPress={closeDialog}>
              Cancel
            </Button>
            <Button
              data-unlock-submit
              variant="primary"
              onPress={() => submit(closeDialog)}
            >
              Unlock
            </Button>
          </>
        )}
      >
        <TextField
          label="Password"
          type="password"
          placeholder="Enter password"
          value={password}
          autoFocus
          isInvalid={error}
          errorMessage={error ? "Wrong password." : undefined}
          onChange={(value) => {
            setPassword(value);
            setError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const submitButton = event.currentTarget
                .closest("[role='dialog']")
                ?.querySelector("[data-unlock-submit]") as HTMLButtonElement | null;
              submitButton?.click();
            }
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
