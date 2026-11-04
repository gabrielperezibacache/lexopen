import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evidenceResourceReadWhere } from "@/lib/evidence/service";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { writingActor, type WritingClient } from "@/lib/writings/access";
import { verifyWritingSource } from "@/lib/writings/sources";
import type { StoredWritingSource } from "@/lib/writings/source-types";
import { sha256 } from "@/lib/evidence/fragments";
import { httpError } from "@/lib/auth/access";

export async function workbenchSourceCatalog(causaId: string, user: CausaAccessUser, after?: string, client: WritingClient = prisma) {
  const { actor } = await writingActor(causaId, user, client);
  const scope: Prisma.DocumentEvidenceFragmentWhereInput = { version: { resource: { AND: [evidenceResourceReadWhere(actor), { OR: [{ documento: { causaId } }, { siteFile: { site: { causaId } } }] }] } } };
  if (after && !await client.documentEvidenceFragment.findFirst({ where: { AND: [scope, { id: after }] }, select: { id: true } })) throw httpError("La ventana de fuentes ya no está disponible", 404);
  const rows = await client.documentEvidenceFragment.findMany({ where: scope, orderBy: { id: "asc" }, ...(after ? { cursor: { id: after }, skip: 1 } : {}), take: 21, select: { id: true, versionId: true, text: true, ordinal: true, page: { select: { pageNumber: true } }, version: { select: { sourceName: true, sourceSha256: true, createdAt: true, resource: { select: { documentoId: true, siteFileId: true, siteFile: { select: { siteId: true } } } } } } } });
  return { sources: rows.slice(0, 20).map(row => {
    const quote = row.text.slice(0, 3_000).replace(/[\uD800-\uDBFF]$/, ""), resource = row.version.resource;
    const href = resource.documentoId ? `/documentos/${resource.documentoId}/fuentes?version=${row.versionId}#fragment-${row.ordinal}` : `/sites/${resource.siteFile?.siteId}/archivos/${resource.siteFileId}/fuentes?version=${row.versionId}#fragment-${row.ordinal}`;
    return { fragmentId: row.id, versionId: row.versionId, quote, title: row.version.sourceName, sourceSha256: row.version.sourceSha256, pageNumber: row.page?.pageNumber || null, createdAt: row.version.createdAt.toISOString(), href, partial: quote.length < row.text.length };
  }), nextAfter: rows.length > 20 ? rows[19].id : null, coverage: "Veinte pasajes por página de versiones conservadas accesibles. Sólo se usarán los que seleccione; el fragmento elegido puede estar abreviado a 3.000 caracteres." };
}
export async function verifyWorkbenchInputs(causaId: string, snapshots: { sourceJson: string; sourceSha256: string }[], user: CausaAccessUser, client: WritingClient = prisma) {
  if (!snapshots.length || snapshots.length > 8) throw httpError("Selección de fuentes inválida", 409);
  const sources: StoredWritingSource[] = [], cache = new Map<string, unknown>();
  for (const snapshot of snapshots) {
    if (sha256(snapshot.sourceJson) !== snapshot.sourceSha256) throw httpError("La copia de fuentes no coincide con su registro", 409);
    let source: StoredWritingSource; try { source = JSON.parse(snapshot.sourceJson); } catch { throw httpError("La copia de fuentes está incompleta", 409); }
    if (source.kind !== "document" || source.citations.length !== 1) throw httpError("Fuente no admitida en esta receta", 409);
    sources.push(await verifyWritingSource(causaId, source, user, client, cache));
  }
  return sources;
}
