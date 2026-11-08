import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { fileId, fileKind } from "@/lib/offline/file-schemas";
import { loadFileSource, authorizeHistoricalFlags } from "@/lib/offline/file-sources";
import { serializable } from "@/lib/command-execution";
import { httpError } from "@/lib/auth/access";
import { getObjectBounded } from "@/lib/storage";
import { downloadResponseHeaders } from "@/lib/security/download";
export async function GET(req: Request) {
  try {
    const user = await requireStaff(), q = new URL(req.url).searchParams, kind = fileKind.parse(q.get("kind")), id = fileId.parse(q.get("id"));
    const result = await serializable(async tx => {
      const actor = await currentStaffActor(user, tx); await loadFileSource(kind, id, actor, tx);
      const version = Number(q.get("version")), before = Number(q.get("before")); if (q.has("version") && (!Number.isSafeInteger(version) || version < 1) || q.has("before") && (!Number.isSafeInteger(before) || before < 1)) throw httpError("Versión inválida", 400);
      const filter = q.has("version") ? { version } : q.has("before") ? { version: { lt: before } } : {};
      const rows = kind === "documento" ? await tx.offlineDocumentRevision.findMany({ where: { documentoId: id, ...filter }, orderBy: { version: "desc" }, take: 100 }) : await tx.fileVersion.findMany({ where: { fileId: id, snapshotJson: { not: null }, ...filter }, orderBy: { version: "desc" }, take: 100 });
      const allowed = [];
      for (const row of rows) { const saved = JSON.parse(row.snapshotJson!); try { await authorizeHistoricalFlags(actor, saved, tx); allowed.push({ row, saved }); } catch (e) { if (![403,404].includes((e as { status?: number }).status || 0)) throw e; } }
      if (!q.has("version")) return { items: allowed.map(({ row }) => ({ version: row.version, createdAt: row.createdAt })), nextBefore: rows.length === 100 ? rows.at(-1)!.version : null };
      const selected = allowed.find(({ row }) => row.version === Number(q.get("version"))); if (!selected) throw httpError("Revisión no disponible", 404);
      const { row, saved } = selected;
      const bytes = row.storageKey ? await getObjectBounded(row.storageKey) : Buffer.from(row.contenido || ""); if (!bytes) throw httpError("Original no disponible", 409);
      return { bytes, name: saved.nombre || saved.name, mimeType: row.mimeType };
    });
    if ("items" in result) return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    return new NextResponse(result.bytes as BodyInit, { headers: { ...downloadResponseHeaders(result.name, result.mimeType), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}` } });
  } catch (e) { return handleRouteError(e); }
}
