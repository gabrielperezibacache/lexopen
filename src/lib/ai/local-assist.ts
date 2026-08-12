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

export function buildLocalBriefingMarkdown(opts: {
  causaLabel: string;
  alerts: string[];
  sourcesCount: number;
}) {
  const alertBlock =
    opts.alerts.length > 0
      ? opts.alerts.map((a) => `- ⚠ ${a}`).join("\n")
      : "- Sin alertas automáticas de plazos críticos en el paquete de contexto.";
  return `## Briefing operativo (datos LexOpen)

**Causa:** ${opts.causaLabel}
**Fuentes ancladas:** ${opts.sourcesCount}

### Alertas
${alertBlock}

### Nota
Este briefing se basa en datos del host LexOpen (cartera, plazos, documentos indexados).
Es una ayuda operativa; no constituye asesoría legal automática ni cómputo oficial de plazos.
`;
}
