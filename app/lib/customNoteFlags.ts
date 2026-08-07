import type { FlagEntry } from "./types";

// Freeform notes are stored as ordinary flag ids so one bus can carry several
// independently removable notes without a database migration. URI encoding
// keeps commas out of the id because the existing database stores flag ids as
// a comma-separated value.
export const CUSTOM_NOTE_FLAG_PREFIX = "custom-note:";
export const LEGACY_CUSTOM_NOTE_ID = "__legacy-custom-note";

export interface CustomNoteItem {
  id: string;
  text: string;
  legacy: boolean;
}

function comparableNote(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function customNoteFlagId(value: string): string {
  const text = value.trim();
  return text ? `${CUSTOM_NOTE_FLAG_PREFIX}${encodeURIComponent(text)}` : "";
}

export function isCustomNoteFlag(id: string | null | undefined): boolean {
  return !!id && id.startsWith(CUSTOM_NOTE_FLAG_PREFIX);
}

export function customNoteText(id: string | null | undefined): string {
  if (!isCustomNoteFlag(id)) return "";
  const encoded = String(id).slice(CUSTOM_NOTE_FLAG_PREFIX.length);
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return encoded.trim();
  }
}

export function customNoteItems(entry: FlagEntry | null | undefined): CustomNoteItem[] {
  if (!entry) return [];
  const items: CustomNoteItem[] = [];
  const seen = new Set<string>();

  for (const id of entry.flags || []) {
    const text = customNoteText(id);
    const comparable = comparableNote(text);
    if (!text || seen.has(comparable)) continue;
    seen.add(comparable);
    items.push({ id, text, legacy: false });
  }

  const legacyText = (entry.note || "").trim();
  const legacyComparable = comparableNote(legacyText);
  if (legacyText && !seen.has(legacyComparable)) {
    items.push({ id: LEGACY_CUSTOM_NOTE_ID, text: legacyText, legacy: true });
  }
  return items;
}

export function hasCustomNotes(entry: FlagEntry | null | undefined): boolean {
  return customNoteItems(entry).length > 0;
}

export function operationalFlagIds(ids: string[] | null | undefined): string[] {
  return (ids || []).filter((id) => !isCustomNoteFlag(id));
}

export function addCustomNote(entry: FlagEntry, value: string): FlagEntry {
  const id = customNoteFlagId(value);
  if (!id) return entry;
  const text = customNoteText(id);
  const comparable = comparableNote(text);
  if (customNoteItems(entry).some((item) => comparableNote(item.text) === comparable)) return entry;
  return { ...entry, flags: [...(entry.flags || []), id] };
}

export function removeCustomNote(entry: FlagEntry, id: string): FlagEntry {
  if (id === LEGACY_CUSTOM_NOTE_ID) return { ...entry, note: "" };
  const target = comparableNote(customNoteText(id));
  if (!target) return entry;
  return {
    ...entry,
    flags: (entry.flags || []).filter(
      (flagId) => !isCustomNoteFlag(flagId) || comparableNote(customNoteText(flagId)) !== target,
    ),
    note: comparableNote(entry.note || "") === target ? "" : entry.note,
  };
}

export function removeAllCustomNotes(entry: FlagEntry): FlagEntry {
  return {
    ...entry,
    flags: operationalFlagIds(entry.flags),
    note: "",
  };
}
