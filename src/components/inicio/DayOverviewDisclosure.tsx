"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./DayOverview.module.css";

export function DayOverviewDisclosure({ children, title, summary }: { children: ReactNode; title: string; summary: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div data-expanded={expanded}>
    <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
      <span>{title}<small>{summary}</small></span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div id={id} className={styles.details}>{children}</div>
  </div>;
}
