import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Navigation.module.css";
import { cx } from "./utils";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  section?: string;
}

export interface AppNavigationProps {
  activeId: string;
  items: NavigationItem[];
  className?: string;
  label?: string;
  mode?: "sidebar" | "bottom";
  /** Icon-rail mode: labels/sections hidden, links centered, titles as tooltips. */
  collapsed?: boolean;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

function groupNavigationItems(items: NavigationItem[]): NavigationGroup[] {
  const groups = new Map<string, NavigationItem[]>();

  for (const item of items) {
    const section = item.section ?? "";
    const group = groups.get(section) ?? [];
    group.push(item);
    groups.set(section, group);
  }

  return Array.from(groups, ([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

function NavigationLink({
  item,
  isActive,
}: {
  item: NavigationItem;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={styles.link}
      title={item.label}
    >
      {item.icon && (
        <span className={styles.icon} aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className={styles.linkLabel}>{item.label}</span>
    </Link>
  );
}

export function AppNavigation({
  activeId,
  items,
  className,
  label = "Primary navigation",
  mode = "sidebar",
  collapsed = false,
}: AppNavigationProps) {
  const groups = groupNavigationItems(items);

  return (
    <nav
      aria-label={label}
      className={cx(styles.navigation, styles[mode], collapsed && styles.collapsed, className)}
    >
      {groups.map((group) => (
        <div className={styles.group} key={group.label || "primary"}>
          {group.label && <div className={styles.section}>{group.label}</div>}
          <div className={styles.links}>
            {group.items.map((item) => (
              <NavigationLink
                key={item.id}
                item={item}
                isActive={item.id === activeId}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
