import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { readCaseWritingForExport } from "./service";
import type { WritingDraftView } from "./types";
const safeHref = (href: string) => /^\/(?!\/)[^\s<>]*$/.test(href) ? href : "";
const md = (value: string) => value.replace(/\r\n?/g, "\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/[\\`*_{}\[\]()#+!|~]/g, "\\$&")
  .replace(/^(\s*)(-)(?=\s)/gm, "$1\\$2")
  .replace(/^(\s*)([-=]+)(\s*)$/gm, (_match, before: string, marker: string, after: string) => `${before}\\${marker}${after}`)
  .replace(/^(\s*\d+)(\.)(?=\s)/gm, "$1\\$2");
const block = (value: string) => value.replace(/\r\n?/g, "\n").split("\n").map(line => `> ${md(line)}`).join("\n");
const label = { document: "Pasaje del expediente", fact: "Hecho registrado", note: "Nota personal de audiencia", book: "Pasaje de biblioteca" };
function markdownProse(body: string, registered: Set<string>) {
  let out = "", after = 0;
  for (const match of body.matchAll(/\[\^(R[1-9][0-9]*)\]/g)) {
    const start = match.index!, end = start + match[0].length;
    out += md(body.slice(after, start));
    out += registered.has(match[1]) && body[end] !== ":" ? match[0] : md(match[0]); after = end;
  }
  return out + md(body.slice(after));
}
export function renderCaseWriting(draft: WritingDraftView, cause: { id: string; titulo: string; rit: string | null }, format: "markdown" | "text", generatedAt = new Date().toISOString()) {
  const registered = new Set(draft.references.map(ref => ref.id));
  if ([...draft.body.matchAll(/\[\^(R[1-9][0-9]*)\]/g)].some(match => !registered.has(match[1]))) throw Object.assign(httpError("Hay marcadores de cita sin una fuente incorporada; corríjalos antes de exportar", 409), { code: "writing_invalid_references" });
  const scope = ["Borrador de trabajo para revisión profesional.", "El texto de autor y las notas personales no se certifican mediante el cotejo de sus referencias.", "Los enlaces relativos se abren dentro de LexOpen y requieren acceso actual.", ...draft.warnings];
  const identity = `${cause.titulo}${cause.rit ? ` · RIT ${cause.rit}` : ""} · Causa ${cause.id}`;
  if (format === "text") {
    return `${draft.title}\n${identity}\nVersión ${draft.revision} · Generado ${generatedAt}\n\n${draft.body}\n\nREFERENCIAS INCORPORADAS\n\n${draft.references.length ? draft.references.map(ref => {
      const source = ref.source;
      return [`[${ref.id}] ${label[source.kind]}: ${source.title}`, `Contenido incorporado:\n${source.text}`, safeHref(source.href), ...source.warnings, ...source.citations.map((citation, index) => [
        `Respaldo ${index + 1}: ${citation.reference}. ${citation.locator}.`, `Pasaje literal corroborado:\n${citation.quote}`,
        `Cita SHA-256: ${citation.quoteSha256}`, `Texto SHA-256: ${citation.textSha256}`, `Identidad de fuente: ${citation.sourceKey}`,
        citation.verificationBasis === "retained_text" ? `Texto conservado SHA-256: ${citation.retainedSha256}. Original no conservado. Huella del archivo importado sin cotejo actual: ${citation.sourceSha256}` : `Original conservado SHA-256: ${citation.sourceSha256}`,
        safeHref(citation.href), ...citation.warnings,
      ].filter(Boolean).join("\n"))].filter(Boolean).join("\n");
    }).join("\n\n") : "Este escrito no incorpora referencias corroboradas."}\n\nALCANCE\n${[...new Set(scope)].join("\n")}\n`;
  }
  const footnotes = draft.references.map(ref => {
    const source = ref.source;
    const content = [`**${label[source.kind]}: ${md(source.title)}**`, "Contenido incorporado:", block(source.text), ...(safeHref(source.href) ? [`[Volver al origen](${safeHref(source.href)})`] : []), ...source.warnings.map(md), ...source.citations.flatMap((citation, index) => [
      `**Respaldo ${index + 1}.** ${md(citation.reference)}. ${md(citation.locator)}.`, "Pasaje literal corroborado:", block(citation.quote),
      `Cita SHA-256: ${citation.quoteSha256}. Texto SHA-256: ${citation.textSha256}. Identidad de fuente: ${citation.sourceKey}.`,
      citation.verificationBasis === "retained_text" ? `Texto conservado SHA-256: ${citation.retainedSha256}. Original no conservado. Huella del archivo importado sin cotejo actual: ${citation.sourceSha256}.` : `Original conservado SHA-256: ${citation.sourceSha256}.`,
      ...(safeHref(citation.href) ? [`[Abrir el pasaje](${safeHref(citation.href)})`] : []), ...citation.warnings.map(md),
    ])].join("\n\n");
    return `[^${ref.id}]: ${content.split("\n").map((line, index) => `${index ? "    " : ""}${line}`).join("\n")}`;
  }).join("\n\n");
  return `# ${md(draft.title)}\n\n${md(identity)}\n\nVersión ${draft.revision} · Generado ${generatedAt}\n\n${markdownProse(draft.body, registered)}\n\n## Referencias incorporadas\n\n${footnotes || "Este escrito no incorpora referencias corroboradas."}\n\n## Alcance\n\n${[...new Set(scope)].map(md).join("\n\n")}\n`;
}
export async function exportCaseWriting(causaId: string, id: string, format: "markdown" | "text", user: CausaAccessUser, client: PrismaClient = prisma) {
  const { draft, caseIdentity } = await readCaseWritingForExport(causaId, id, user, client);
  return { content: renderCaseWriting(draft, caseIdentity, format), filename: `escrito-${draft.id}-v${draft.revision}.${format === "markdown" ? "md" : "txt"}`, contentType: format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8" };
}
