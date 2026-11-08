import type { ReactNode } from "react";
import { pageTitleClass } from "@/components/ui/typography";
import { EditorialHeading, type EditorialArtwork } from "./EditorialHeading";
import styles from "./PageHeader.module.css";

/** Shared page header for app and module routes. */
export function PageHeader({
  title,
  subtitle,
  actions,
  artwork,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  artwork?: EditorialArtwork;
}) {
  const heading = (
    <div className={styles.copy}>
      <h1 className={pageTitleClass}>{title}</h1>
      {subtitle ? (
        <div className={styles.subtitle}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
  return (
    <div className={`page-header ${styles.header}`}>
      {artwork ? <EditorialHeading artwork={artwork}>{heading}</EditorialHeading> : heading}
      {actions ? (
        <div className={styles.actions}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ModuleHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  artwork,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  artwork?: EditorialArtwork;
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
      artwork={artwork}
    />
  );
}
