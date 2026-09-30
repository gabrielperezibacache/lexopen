"use client";

import type { ReactNode } from "react";

/** Lightweight tooltip via native `title` + visually styled wrapper for a11y hints. */
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" title={label}>
      <span className="sr-only">{label}</span>
      {children}
    </span>
  );
}
