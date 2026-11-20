import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { DocumentDriveAction } from "@/components/DocumentDriveAction";
import { DocumentOcrStatus } from "@/components/DocumentOcrStatus";
import { DocumentProcessingAction } from "@/components/DocumentProcessingAction";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { canSome } from "@/lib/auth/permissions";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { DocumentDownloads } from "@/components/DocumentDownloads";
import { documentDownloadOptions } from "@/lib/sites/document-download-options";
import { formatDate } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentEvidenceReader } from "@/components/DocumentEvidenceReader";

export default async function DocumentSourcesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; after?: string; page?: string }> }) {
  const user = await requireStaff(); const { id } = await params; const sp = await searchParams;
  const doc = await prisma.documento.findFirst({
    where: { AND: [{ id }, documentReadWhere(user)] },
    select: {
      id: true, nombre: true, ruta: true, tipo: true, causaId: true, googleDriveId: true, obsidianPath: true,
      extractionStatus: true, storageKey: true, autor: { select: publicUserSelect },
      driveImport: { select: { driveVersion: true, importedAt: true, sourceSha256: true } },
    },
  });
  if (!doc) notFound();
  const downloads = (await documentDownloadOptions([id])).get(id);
  const after = Number(sp.after || 0);
  return <div className="space-y-6">
    <Link href="/documentos" className="text-sm text-[var(--sea)]">Volver a documentos</Link>
    <PageHeader title={doc.nombre} actions={<div className="flex flex-wrap gap-3"><DocumentDownloads id={id} options={downloads} className="btn btn-secondary" /></div>} />
    <DocumentEvidenceReader documentId={id} initialVersion={sp.version || ""} initialAfter={Number.isSafeInteger(after) && after >= 0 ? after : 0} initialPage={sp.page && /^[1-9]\d{0,2}$/.test(sp.page) ? Number(sp.page) : undefined} />
    <details className="panel space-y-2 p-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Procedencia y acciones del documento</summary>
      <p className="text-xs text-[var(--ink-soft)]">{doc.tipo} · {doc.autor?.name || "Sin autor indicado"}</p>
      {doc.driveImport && <details className="mt-1 text-xs text-[var(--ink-soft)]"><summary className="cursor-pointer">Procedencia: Google Drive</summary><p>Importada el {formatDate(doc.driveImport.importedAt)}. Esta copia conserva la revisión {doc.driveImport.driveVersion} del archivo.</p><Link className="underline" href="/sincronizacion">Revisar actualizaciones de mis archivos</Link><details className="mt-2"><summary className="cursor-pointer">Identidad del archivo conservado</summary><p className="break-all">SHA-256: {doc.driveImport.sourceSha256}</p></details></details>}
      {doc.ruta && (
        <div className="text-xs text-[var(--muted)]">{doc.ruta}/</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {canSome(user, "assistant.use") && doc.causaId && (
          <Link
            href={`/agente?causaId=${doc.causaId}&utility=doc_qa&documentoId=${doc.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
          >
            Consultar con ALTAZOR
          </Link>
        )}
        <Link href={`/offline.html?kind=documento&record=${doc.id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)]">Sin conexión</Link>
        <DocumentDriveAction
          documentId={doc.id}
          googleDriveId={doc.googleDriveId}
          hasText={downloads?.hasText ?? false}
          hasBinary={Boolean(doc.storageKey)}
        />
      </div>
      {(doc.obsidianPath || doc.googleDriveId) && <details className="mt-2 text-xs text-[var(--muted)]"><summary className="cursor-pointer">Ubicaciones vinculadas</summary>{doc.obsidianPath && <p className="break-all">Obsidian: {doc.obsidianPath}</p>}{doc.googleDriveId && <p className="break-all">{isRealDriveFolderId(doc.googleDriveId) ? `Google Drive: ${doc.googleDriveId}` : "La ubicación de Google Drive todavía necesita configurarse."}</p>}</details>}
      {["needs_ocr", "unsupported", "failed"].includes(doc.extractionStatus || "") && <DocumentProcessingAction documentId={doc.id} />}
      {doc.extractionStatus === "needs_ocr" && <DocumentOcrStatus />}
    </details>
  </div>;
}
