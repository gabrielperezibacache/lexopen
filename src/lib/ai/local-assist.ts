/**
 * Ayudas determinísticas (sin LLM) — briefing / plazos.
 */

import { calcularVencimiento, clasificarUrgencia, diasRestantes } from "@/lib/plazos";

export function formatPlazoEstimate(opts: {
  desde: string;
  dias: number;
  tipoComputo?: "habiles" | "corridos";
}) {
  const desde = new Date(opts.desde);
  if (Number.isNaN(desde.getTime())) {
    return { error: "Fecha 'desde' inválida" as const };
  }
  const vencimiento = calcularVencimiento({
    desde,
    dias: opts.dias,
    tipoComputo: opts.tipoComputo || "habiles",
  });
  return {
    vencimiento: vencimiento.toISOString().slice(0, 10),
    urgencia: clasificarUrgencia(vencimiento),
    diasRestantes: diasRestantes(vencimiento),
    disclaimer:
      "Estimación interna LexOpen (días hábiles/corridos simplificados). No reemplaza el cómputo oficial del tribunal ni la revisión de un abogado.",
  };
}

export type FolderBriefingRow = {
  carpeta: string;
  count: number;
  withText: number;
  needsOcr: number;
};

export function buildLocalBriefingMarkdown(opts: {
  causaLabel: string;
  alerts: string[];
  sourcesCount: number;
  folderIndex?: FolderBriefingRow[] | null;
  documentScope?: { rutaPrefix?: string | null; selectedCount?: number | null } | null;
}) {
  const alertBlock =
    opts.alerts.length > 0
      ? opts.alerts.map((a) => `- ⚠ ${a}`).join("\n")
      : "- Sin alertas automáticas de plazos críticos en el paquete de contexto.";

  const folderRows = (opts.folderIndex || []).filter((r) => r.count > 0);
  const folderBlock =
    folderRows.length > 0
      ? folderRows
          .map(
            (r) =>
              `- **${r.carpeta}/** — ${r.count} doc(s), ${r.withText} con texto` +
              (r.needsOcr ? `, ${r.needsOcr} OCR/pendiente` : "")
          )
          .join("\n")
      : "- Sin carpeta investigativa indexada en este paquete.";

  const scopeBits = [
    opts.documentScope?.rutaPrefix
      ? `carpeta \`${opts.documentScope.rutaPrefix}/\``
      : null,
    opts.documentScope?.selectedCount
      ? `${opts.documentScope.selectedCount} documento(s) seleccionados`
      : null,
  ].filter(Boolean);
  const scopeLine = scopeBits.length
    ? `\n**Alcance documental:** ${scopeBits.join(" · ")}`
    : "";

  return `## Briefing operativo (datos LexOpen)

**Causa:** ${opts.causaLabel}
**Fuentes ancladas:** ${opts.sourcesCount}${scopeLine}

### Carpeta investigativa
${folderBlock}

### Alertas
${alertBlock}

### Nota
Este briefing se basa en datos del host LexOpen (cartera, plazos, documentos indexados).
Es una ayuda operativa; no constituye asesoría legal automática ni cómputo oficial de plazos.
`;
}
