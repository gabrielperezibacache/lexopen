/**
 * Selección y ranking de documentos / carpetas investigativas para el copiloto.
 */

import type { AiUtilityId } from "@/lib/ai/utilities";

export type AiDocumentCandidate = {
  id: string;
  nombre: string;
  tipo?: string | null;
  ruta?: string | null;
  extractedMarkdown?: string | null;
  extractionStatus?: string | null;
  updatedAt?: Date | string | null;
};

export type RankedAiDocument = AiDocumentCandidate & {
  score: number;
  relativePath: string;
  hasText: boolean;
};

const STOP = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "en",
  "por",
  "para",
  "con",
  "que",
  "qué",
  "como",
  "según",
  "segun",
  "sobre",
  "esta",
  "este",
  "causa",
  "documento",
  "documentos",
  "carpeta",
  "pdf",
  "the",
  "a",
]);

export function documentRelativePath(doc: {
  nombre: string;
  ruta?: string | null;
}): string {
  const ruta = (doc.ruta || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return ruta ? `${ruta}/${doc.nombre}` : doc.nombre;
}

export function tokenizeAiQuery(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .slice(0, 24);
}

function scoreDocument(doc: AiDocumentCandidate, tokens: string[]): number {
  const path = documentRelativePath(doc).toLowerCase();
  const tipo = (doc.tipo || "").toLowerCase();
  const md = (doc.extractedMarkdown || "").toLowerCase();
  const status = (doc.extractionStatus || "").toLowerCase();
  let score = 0;

  if (md.trim()) score += 40;
  else if (status === "needs_ocr" || status === "pending" || status === "processing") {
    score -= 5;
  } else {
    score -= 15;
  }

  if (status === "completed") score += 8;

  for (const token of tokens) {
    if (path.includes(token)) score += 18;
    if (tipo.includes(token)) score += 8;
    if (md.includes(token)) score += 6;
  }

  // Prefer recently touched when scores tie-break later.
  if (doc.updatedAt) {
    const ts = new Date(doc.updatedAt).getTime();
    if (!Number.isNaN(ts)) {
      // Tiny recency bump (max ~5).
      const ageDays = Math.max(0, (Date.now() - ts) / 86_400_000);
      score += Math.max(0, 5 - Math.min(5, ageDays / 30));
    }
  }

  return score;
}

export function rankDocumentsForAi(
  docs: AiDocumentCandidate[],
  prompt: string
): RankedAiDocument[] {
  const tokens = tokenizeAiQuery(prompt);
  return docs
    .map((doc) => {
      const relativePath = documentRelativePath(doc);
      const hasText = Boolean((doc.extractedMarkdown || "").trim());
      return {
        ...doc,
        relativePath,
        hasText,
        score: scoreDocument(doc, tokens),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
}

export function filterDocumentsByScope(
  docs: AiDocumentCandidate[],
  opts?: {
    documentoIds?: string[] | null;
    rutaPrefix?: string | null;
  }
): AiDocumentCandidate[] {
  let out = docs;
  const ids = (opts?.documentoIds || []).filter(Boolean);
  if (ids.length) {
    const set = new Set(ids);
    out = out.filter((d) => set.has(d.id));
  }
  const prefix = (opts?.rutaPrefix || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (prefix) {
    const needle = prefix.toLowerCase();
    out = out.filter((d) => {
      const path = documentRelativePath(d).toLowerCase();
      const ruta = (d.ruta || "").toLowerCase();
      return ruta === needle || ruta.startsWith(`${needle}/`) || path.startsWith(`${needle}/`);
    });
  }
  return out;
}

export function excerptBudgetForUtility(utility: AiUtilityId): {
  maxDocs: number;
  excerptChars: number;
  includeEmptyInIndex: boolean;
  includeExcerpts: boolean;
} {
  switch (utility) {
    case "doc_qa":
      return { maxDocs: 14, excerptChars: 7000, includeEmptyInIndex: true, includeExcerpts: true };
    case "draft":
      return { maxDocs: 12, excerptChars: 5000, includeEmptyInIndex: true, includeExcerpts: true };
    case "copilot":
      return { maxDocs: 10, excerptChars: 4000, includeEmptyInIndex: true, includeExcerpts: true };
    case "briefing":
      return { maxDocs: 16, excerptChars: 1200, includeEmptyInIndex: true, includeExcerpts: true };
    case "research":
      return { maxDocs: 8, excerptChars: 2000, includeEmptyInIndex: true, includeExcerpts: true };
    case "similar":
      return { maxDocs: 6, excerptChars: 800, includeEmptyInIndex: true, includeExcerpts: false };
    case "plazos":
      return { maxDocs: 6, excerptChars: 600, includeEmptyInIndex: true, includeExcerpts: false };
    default:
      return { maxDocs: 8, excerptChars: 4000, includeEmptyInIndex: true, includeExcerpts: true };
  }
}

/** Group docs by top-level investigative folder for an index block. */
export function buildFolderIndex(
  docs: Array<{ nombre: string; ruta?: string | null; extractionStatus?: string | null; hasText?: boolean }>
): Record<string, { count: number; withText: number; needsOcr: number; samples: string[] }> {
  const index: Record<
    string,
    { count: number; withText: number; needsOcr: number; samples: string[] }
  > = {};
  for (const doc of docs) {
    const ruta = (doc.ruta || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const top = ruta ? ruta.split("/")[0]! : "(raíz)";
    const bucket = index[top] || { count: 0, withText: 0, needsOcr: 0, samples: [] };
    bucket.count += 1;
    if (doc.hasText) bucket.withText += 1;
    if (doc.extractionStatus === "needs_ocr" || doc.extractionStatus === "pending") {
      bucket.needsOcr += 1;
    }
    if (bucket.samples.length < 4) bucket.samples.push(doc.nombre);
    index[top] = bucket;
  }
  return index;
}

export function documentExtractionAlerts(
  docs: Array<{
    nombre: string;
    relativePath?: string;
    extractionStatus?: string | null;
    hasText?: boolean;
    extractedMarkdown?: string | null;
  }>,
  utility: AiUtilityId
): string[] {
  const alerts: string[] = [];
  const unlabeled = docs.filter((d) => !(d.extractedMarkdown || "").trim() && !d.hasText);
  const needsOcr = docs.filter((d) => d.extractionStatus === "needs_ocr");
  const pending = docs.filter(
    (d) => d.extractionStatus === "pending" || d.extractionStatus === "processing"
  );
  const failed = docs.filter((d) => d.extractionStatus === "failed");

  if (unlabeled.length && (utility === "doc_qa" || utility === "draft" || utility === "copilot" || utility === "briefing")) {
    alerts.push(
      `${unlabeled.length} documento(s) sin texto indexado (OCR/extracción pendiente o fallida).`
    );
  }
  if (needsOcr.length) {
    alerts.push(
      `${needsOcr.length} documento(s) requieren OCR (p. ej. «${needsOcr[0]!.nombre}»).`
    );
  }
  if (pending.length) {
    alerts.push(`${pending.length} documento(s) aún en cola de procesamiento.`);
  }
  if (failed.length && utility === "doc_qa") {
    alerts.push(`${failed.length} documento(s) con error de extracción.`);
  }
  return alerts;
}
