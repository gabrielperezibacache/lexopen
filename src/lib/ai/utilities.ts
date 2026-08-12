/**
 * Utilidades de IA jurídica (inspiradas en Julia.cl / copiloto legal).
 * Todas producen borradores/ayudas operativas — no asesoría automática.
 */

export type AiUtilityId =
  | "copilot"
  | "briefing"
  | "doc_qa"
  | "draft"
  | "plazos"
  | "research"
  | "similar";

export type AiUtilityInfo = {
  id: AiUtilityId;
  label: string;
  short: string;
  /** Prompt sugerido en la UI */
  starter: string;
  /** Instrucciones extra al system prompt */
  systemHint: string;
};

export const AI_UTILITIES: AiUtilityInfo[] = [
  {
    id: "copilot",
    label: "Copiloto",
    short:
      "Habla como a un colega; usa la carpeta investigativa, plazos y VDR vinculados a la causa.",
    starter:
      "¿Qué debo priorizar hoy en esta causa y qué riesgos veo en los próximos 7 días?",
    systemHint:
      "Actúa como copiloto del estudio: prioriza con base en CARPETA_INVESTIGATIVA, DOCUMENTOS_INDEXADOS, plazos y VDR. Señala incertidumbre y documentos sin OCR.",
  },
  {
    id: "briefing",
    label: "Briefing de causa",
    short: "Resumen estructurado: etapa, plazos, movimientos, carpeta investigativa y alertas.",
    starter: "Elabora un briefing ejecutivo del estado procesal y próximos pasos.",
    systemHint:
      "Entrega un briefing estructurado (estado, hechos clave, plazos, mapa de carpetas investigativas, riesgos, próximos pasos). Cita solo datos del contexto.",
  },
  {
    id: "doc_qa",
    label: "Preguntar a documentos",
    short:
      "Responde solo con Markdown extraído de la carpeta investigativa / documentos seleccionados.",
    starter:
      "Según los documentos indexados de la causa, ¿qué dice sobre los montos reclamados?",
    systemHint:
      "Responde ÚNICAMENTE con extractos de DOCUMENTOS_INDEXADOS (y VDR si aplica). Cita relativePath. Si falta texto/OCR, dilo y no inventes.",
  },
  {
    id: "draft",
    label: "Borrador de escrito",
    short: "Memorial, escrito o minuta como borrador sujeto a revisión humana.",
    starter:
      "Redacta un borrador de escrito de contestación con hechos, derecho y petitorio (borrador).",
    systemHint:
      "Produce un BORRADOR etiquetado anclado a documentos indexados (relativePath). No firmes ni asegures que es presentable. Marca [REVISAR] donde falten hechos.",
  },
  {
    id: "plazos",
    label: "Plazos y urgencias",
    short: "Analiza plazos de la causa; el cómputo LexOpen es estimación interna.",
    starter:
      "Revisa los plazos abiertos, destaca fatales/críticos y sugiere calendario de trabajo.",
    systemHint:
      "Usa los plazos del contexto. Recuerda que el motor LexOpen es estimación interna, no cómputo oficial del tribunal.",
  },
  {
    id: "research",
    label: "Investigación",
    short: "Cruza jurisprudencia/wiki del estudio; cita fuentes del corpus local.",
    starter:
      "Busca doctrina o roles útiles en el corpus LexOpen para la materia de esta causa.",
    systemHint:
      "Cita solo fuentes presentes en el contexto (jurisprudencia/wiki). Si no hay hits, no inventes roles ni sentencias.",
  },
  {
    id: "similar",
    label: "Casos similares",
    short: "Compara con otras causas del estudio (materia/tribunal/etapa).",
    starter:
      "¿Hay causas similares en el estudio? Resume estrategias o patrones observables en los datos.",
    systemHint:
      "Compara solo con causas listadas en el contexto. No inventes RITs externos. Señala que la similitud es heurística.",
  },
];

export function getAiUtility(id?: string | null): AiUtilityInfo {
  const found = AI_UTILITIES.find((u) => u.id === id);
  return found || AI_UTILITIES[0];
}

export function inferAiUtility(prompt: string): AiUtilityId {
  const p = prompt.toLowerCase();
  if (
    /documento|pdf|extracto|qu[eé] dice|seg[uú]n el escrito|carpeta investigativ|expediente digital|ocr/.test(
      p
    )
  ) {
    return "doc_qa";
  }
  if (/plazo|fatal|vencim|d[ií]as h[aá]biles|urgencia/.test(p)) {
    return "plazos";
  }
  if (/borrador|redact|memorial|escrito|contestaci[oó]n|demanda/.test(p)) {
    return "draft";
  }
  if (/jurisprud|doctrina|legislaci|c[oó]digo|art[ií]culo/.test(p)) {
    return "research";
  }
  if (/similar|parecid|otras causas|estrategia previa/.test(p)) {
    return "similar";
  }
  if (/briefing|resumen|estado procesal|qu[eé] hay de nuevo/.test(p)) {
    return "briefing";
  }
  return "copilot";
}

/** Extrae términos útiles para contains() sobre corpus local (wiki/juris). */
const SEARCH_STOPWORDS = new Set([
  "para",
  "como",
  "esta",
  "este",
  "esto",
  "estos",
  "estas",
  "sobre",
  "desde",
  "hasta",
  "entre",
  "donde",
  "cuando",
  "tiene",
  "tengo",
  "debe",
  "puedo",
  "puede",
  "quiero",
  "busca",
  "buscar",
  "segun",
  "según",
  "cual",
  "cuál",
  "que",
  "qué",
  "una",
  "uno",
  "unos",
  "unas",
  "los",
  "las",
  "del",
  "con",
  "por",
  "sin",
  "the",
  "and",
  "causa",
  "causas",
  "favor",
  "necesito",
  "revisa",
  "revisar",
  "dame",
  "hazme",
  "elabore",
  "elabora",
]);

export function extractSearchNeedles(prompt: string, max = 4): string[] {
  const tokens = (prompt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !SEARCH_STOPWORDS.has(t));
  const unique: string[] = [];
  for (const t of tokens) {
    if (!unique.includes(t)) unique.push(t);
    if (unique.length >= max) break;
  }
  return unique;
}
