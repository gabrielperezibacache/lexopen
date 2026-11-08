import Link from "next/link";
import type { ReactNode } from "react";
import { FolioSymbol } from "./FolioSymbol";
import styles from "./EmptyState.module.css";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  action,
  symbol = "collection",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  action?: ReactNode;
  symbol?: "mark" | "collection" | "evidence";
}) {
  return (
    <div className={`panel empty-state ${styles.state}`} role="status">
      <div className={styles.folio}><FolioSymbol variant={symbol} className={styles.symbol} /></div>
      <div className={styles.copy}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
        {(action || (actionLabel && actionHref)) && (
          <div className={styles.action}>
            {action || (
              <Link href={actionHref!} className="btn btn-primary">
                {actionLabel}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
