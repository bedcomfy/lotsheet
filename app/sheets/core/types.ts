import type { ComponentType, ReactNode } from "react";

export type PaperOrientation = "portrait" | "landscape";
export type PaperSizeId = "letter-portrait" | "letter-landscape" | "legal-portrait" | "legal-landscape" | "custom";

export interface PaperInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PaperProfile {
  id: PaperSizeId;
  label: string;
  widthIn: number;
  heightIn: number;
  orientation: PaperOrientation;
  safeAreaIn: PaperInsets;
  version: number;
}

export type PrintVariant = "current" | "blank" | "flags" | "north-south";

export interface SheetPaperProps<T> {
  data: T;
  variant: PrintVariant;
}

export interface SheetEditorProps<T> {
  value: T;
  onChange: (next: T) => void;
}

export interface SheetDefinition<T = unknown> {
  id: string;
  title: string;
  path: string;
  stateKey?: string;
  dataVersion: number;
  renderVersion: number;
  paper: PaperProfile;
  expectedPages: { min: number; max: number };
  variants: PrintVariant[];
  createBlank?: () => T;
  validate?: (value: unknown) => T;
  Paper?: ComponentType<SheetPaperProps<T>>;
  Editor?: ComponentType<SheetEditorProps<T>>;
  description?: string;
}

export interface PaperViewportProps {
  profile: PaperProfile;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fitOnMobile?: boolean;
  label?: string;
}
