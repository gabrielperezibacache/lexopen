import type { AiUtilityId } from "@/lib/ai/utilities";

export type AiSuggestedAction = { label: string; href: string };

/** Acciones de handoff según utilidad y causa (copiloto). */
export function buildAiSuggestedActions(opts: {
  utility: AiUtilityId;
  causaId?: string | null;
}): AiSuggestedAction[] {
  const causaId = opts.causaId || "";
  const actions: AiSuggestedAction[] = [];

  if (causaId) {
    actions.push({ label: "Abrir causa", href: `/causas/${causaId}` });
  }

  if (opts.utility === "plazos") {
    actions.push({
      label: "Crear plazo",
      href: causaId
        ? `/plazos?causaId=${encodeURIComponent(causaId)}`
        : "/plazos",
    });
  } else if (opts.utility === "doc_qa" || opts.utility === "briefing") {
    actions.push({
      label: "Documentos",
      href: causaId
        ? `/documentos?causaId=${encodeURIComponent(causaId)}`
        : "/documentos",
    });
  } else if (opts.utility === "research" || opts.utility === "similar") {
    actions.push({ label: "Jurisprudencia", href: "/jurisprudencia" });
  } else if (opts.utility === "draft" && causaId) {
    actions.push({
      label: "Nueva minuta",
      href: `/causas/${causaId}/minuta/nueva`,
    });
  } else if (causaId) {
    actions.push({
      label: "Nueva minuta",
      href: `/causas/${causaId}/minuta/nueva`,
    });
  }

  if (opts.utility === "copilot" || opts.utility === "briefing") {
    actions.push({ label: "Monitoreo PJUD", href: "/causas/monitoreo" });
  }

  if (
    opts.utility !== "research" &&
    opts.utility !== "similar" &&
    (opts.utility === "copilot" || opts.utility === "draft")
  ) {
    actions.push({ label: "Jurisprudencia", href: "/jurisprudencia" });
  }

  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });
}
