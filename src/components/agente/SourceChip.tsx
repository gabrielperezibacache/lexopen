"use client";

import Link from "next/link";
import type { SourceRef } from "@/components/agente/types";
import { isSafeAppHref } from "@/components/agente/types";

export function SourceChip({
  s,
  className,
}: {
  s: SourceRef;
  className: string;
}) {
  const label = `${s.type}: ${s.label}`;
  if (!s.href || !isSafeAppHref(s.href)) {
    return <span className={className}>{label}</span>;
  }
  if (s.href.startsWith("/api/")) {
    return (
      <a href={s.href} className={className} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link href={s.href} className={className}>
      {label}
    </Link>
  );
}
