import type { AiUtilityId } from "@/lib/ai/utilities";

export type AiSuggestedAction = { label: string; href: string };

/** Acciones de handoff según utilidad y causa (copiloto). */
export function buildAiSuggestedActions(opts: {
  utility: AiUtilityId;
  causaId?: string | null;
}): AiSuggestedAction[] {
  const causaId = opts.causaId || "";
  const actions: Array<AiSuggestedAction | null> = [
    causaId
      ? { label: "Abrir causa", href: `/causas/${causaId}` }
      : null,
    causaId
      ? {
          label: "Nueva minuta",
          href: `/causas/${causaId}/minuta/nueva`,
        }
      : null,
    opts.utility === "plazos"
      ? {
          label: "Crear plazo",
          href: causaId ? `/plazos?causaId=${encodeURIComponent(causaId)}` : "/plazos",
        }
      : null,
    opts.utility === "doc_qa" || opts.utility === "briefing"
      ? {
          label: "Documentos",
          href: causaId
            ? `/documentos?causaId=${encodeURIComponent(causaId)}`
            : "/documentos",
        }
      : null,
    opts.utility === "research" || opts.utility === "similar"
      ? { label: "Jurisprudencia", href: "/jurisprudencia" }
      : { label: "Jurisprudencia", href: "/jurisprudencia" },
    { label: "Monitoreo PJUD", href: "/causas/monitoreo" },
    opts.utility === "draft" && causaId
      ? {
          label: "Wizard minuta",
          href: `/causas/${causaId}/minuta/nueva`,
        }
      : null,
  ];

  const seen = new Set<string>();
  const out: AiSuggestedAction[] = [];
  for (const a of actions) {
    if (!a) continue;
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    out.push(a);
  }
  return out;
}
