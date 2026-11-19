"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { researchWorkspaceHref } from "@/lib/research/workspace-navigation";

export function ResearchWorkspaceNavigation() {
  const { dict } = useI18n(), operations = dict.judicialOperations;
  const params = useSearchParams();
  const context = { q: params.get("q") || undefined, materia: params.get("materia") || undefined, investigacion: params.get("investigacion") || undefined };
  return <nav aria-label={operations.researchNavigation} className="grid gap-4 md:grid-cols-3">
    {([
      ["unified", operations.unified, operations.unifiedHint],
      ["sources", operations.studySources, operations.studySourcesHint],
      ["history", operations.researchHistory, operations.researchHistoryHint],
    ] as const).map(([target, title, description]) => <Link key={target} href={researchWorkspaceHref(target, context)} aria-labelledby={`research-nav-${target}`} aria-describedby={`research-nav-${target}-hint`} className="panel min-w-0 space-y-2 rounded-[var(--radius-lg)] p-5">
      <span id={`research-nav-${target}`} className="block font-semibold text-[var(--sea)]">{title}</span><span id={`research-nav-${target}-hint`} className="block text-sm leading-relaxed text-[var(--ink-soft)]">{description}</span>
    </Link>)}
  </nav>;
}
