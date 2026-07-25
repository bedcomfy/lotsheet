import type { PaperProfile } from "./types";

const SAFE_QUARTER = { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 };

export const LETTER_PORTRAIT: PaperProfile = {
  id: "letter-portrait",
  label: "US Letter portrait",
  widthIn: 8.5,
  heightIn: 11,
  orientation: "portrait",
  safeAreaIn: SAFE_QUARTER,
  version: 1,
};

export const LETTER_LANDSCAPE: PaperProfile = {
  id: "letter-landscape",
  label: "US Letter landscape",
  widthIn: 11,
  heightIn: 8.5,
  orientation: "landscape",
  safeAreaIn: SAFE_QUARTER,
  version: 1,
};

export const LEGAL_PORTRAIT: PaperProfile = {
  id: "legal-portrait",
  label: "US Legal portrait",
  widthIn: 8.5,
  heightIn: 14,
  orientation: "portrait",
  safeAreaIn: SAFE_QUARTER,
  version: 1,
};

export const LEGAL_LANDSCAPE: PaperProfile = {
  id: "legal-landscape",
  label: "US Legal landscape",
  widthIn: 14,
  heightIn: 8.5,
  orientation: "landscape",
  safeAreaIn: SAFE_QUARTER,
  version: 1,
};

export const PAPER_PROFILES = {
  letter: LETTER_PORTRAIT,
  letterLandscape: LETTER_LANDSCAPE,
  legal: LEGAL_PORTRAIT,
  legalLandscape: LEGAL_LANDSCAPE,
} as const;
