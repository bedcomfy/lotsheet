"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A text field that auto-saves, so you never lose what you typed. It commits:
//   • a short beat after you stop typing (debounced),
//   • on blur (tabbing/clicking to another field), and
//   • on UNMOUNT — which is the important one: React does NOT fire onBlur when a
//     focused input is removed from the DOM, so when a dialog closes on "Done" or
//     a tap outside, a blur-only save is silently lost. That's the bug this fixes.
//
// onSave is read through a ref so the unmount/blur commit always uses the latest
// callback (and therefore the latest surrounding state), never a stale closure.
export function useAutoSaveText(value: string | undefined, onSave: (v: string) => void) {
  const [text, setText] = useState(value ?? "");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const textRef = useRef(text);
  textRef.current = text;
  const savedRef = useRef(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback((next: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (next !== savedRef.current) {
      savedRef.current = next;
      onSaveRef.current(next);
    }
  }, []);

  // Debounced auto-save while typing.
  const onChange = useCallback(
    (next: string) => {
      setText(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(next), 500);
    },
    [commit]
  );

  // Save immediately (blur).
  const flush = useCallback(() => commit(textRef.current), [commit]);
  // Set and save immediately (e.g. a clear button).
  const saveNow = useCallback((next: string) => { setText(next); commit(next); }, [commit]);

  // Save the latest value when the field unmounts (menu closed / "Done" tapped).
  useEffect(() => () => commit(textRef.current), [commit]);

  return { text, onChange, flush, saveNow };
}
