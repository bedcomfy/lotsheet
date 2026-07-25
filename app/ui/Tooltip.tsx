"use client";

import {
  Tooltip as AriaTooltip,
  TooltipTrigger,
} from "react-aria-components";
import type { ReactNode } from "react";
import type { TooltipProps as AriaTooltipProps } from "react-aria-components";
import styles from "./Tooltip.module.css";

export interface TooltipProps
  extends Omit<AriaTooltipProps, "children" | "className"> {
  children: ReactNode;
  content: ReactNode;
}

export function Tooltip({
  children,
  content,
  placement = "top",
  ...props
}: TooltipProps) {
  return (
    <TooltipTrigger delay={450} closeDelay={80}>
      {children}
      <AriaTooltip
        {...props}
        placement={placement}
        className={styles.tooltip}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
