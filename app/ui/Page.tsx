import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertCircle,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import styles from "./Page.module.css";
import { cx } from "./utils";

export function AppPage({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <main {...props} className={cx(styles.page, className)} />;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.headerCopy}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
}

export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
  ...props
}: PanelProps) {
  return (
    <section {...props} className={cx(styles.panel, className)}>
      {(title || description || actions) && (
        <header className={styles.panelHeader}>
          <div className={styles.panelCopy}>
            {title && <h2 className={styles.panelTitle}>{title}</h2>}
            {description && (
              <p className={styles.panelDescription}>{description}</p>
            )}
          </div>
          {actions && <div className={styles.panelActions}>{actions}</div>}
        </header>
      )}
      <div className={cx(styles.panelBody, bodyClassName)}>{children}</div>
    </section>
  );
}

export function Toolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.toolbar, className)} />;
}

export function ToolbarGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.toolbarGroup, className)} />;
}

export function DataTableFrame({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.tableFrame, className)} />;
}

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  kind?: "empty" | "loading" | "error";
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  kind = "empty",
  className,
}: EmptyStateProps) {
  const fallbackIcon =
    kind === "loading" ? (
      <LoaderCircle className={styles.spinner} />
    ) : kind === "error" ? (
      <AlertCircle />
    ) : (
      <Inbox />
    );
  return (
    <div className={cx(styles.empty, className)} data-kind={kind}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon ?? fallbackIcon}
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx(styles.skeleton, className)}
      aria-hidden="true"
    />
  );
}
