"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface ToolMenuProps {
  label?: string;
  children: ReactNode;
  triggerClassName?: string;
}

// Radix owns positioning, collision handling, keyboard navigation, and the
// data-state hooks used by the open/close animations.
export default function ToolMenu({ label = "More", children, triggerClassName = "" }: ToolMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className={`btn ${triggerClassName}`.trim()} aria-expanded={open} aria-haspopup="menu">
          <MoreHorizontal size={16} /> {label} <ChevronDown size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="toolmenu__panel"
          align="start"
          sideOffset={8}
          collisionPadding={10}
          onClick={() => setOpen(false)}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
