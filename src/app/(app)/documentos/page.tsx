import { DocumentDriveAction } from "@/components/DocumentDriveAction";
import { DocumentOcrStatus } from "@/components/DocumentOcrStatus";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { DocumentProcessingAction } from "@/components/DocumentProcessingAction";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { confidentialWhere } from "@/lib/api";
import { causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { documentoListSelect } from "@/lib/sites/file-select";
import Link from "next/link";

export default async function DocumentosPage() {
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.documentos;
  const LIST_TAKE = 100;
  const [rawDocumentos, causas] = await Promise.all([
    prisma.documento.findMany({
      where: { AND: [scopeddocumentReadWhere(user), confidentialWhere(user)] },
      select: {
        ...documentoListSelect,
        storageKey: true,
        driveImport: { select: { driveVersion: true, importedAt: true, sourceSha256: true } },
        causa: { select: { id: true, rit: true, titulo: true } },
        autor: { select: publicUserSelect },
      },
      orderBy: { updatedAt: "desc" },
      take: LIST_TAKE,
    }),
    prisma.causa.findMany({ where: scopedcausaAccessWhere(user),
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const docIds = rawDocumentos.map(d => d.id);
  const textStatus = docIds.length > 0 ? await prisma.$queryRaw<{id: string, has_text: boolean, has_markdown: boolean}[]>`
    SELECT id,
           (length(trim(coalesce("extractedMarkdown", ''))) + length(trim(coalesce("contenido", '')))) > 0 as has_text,
           length(trim(coalesce("extractedMarkdown", ''))) > 0 as has_markdown
    FROM "Documento"
    WHERE id = ANY(${docIds})
  ` : [];
  const statusMap = new Map(textStatus.map(s => [s.id, s]));

  const documentos = rawDocumentos.map(
    ({ storageKey, ...rest }) => ({
      ...rest,
      hasText: statusMap.get(rest.id)?.has_text ?? false,
      hasMarkdown: statusMap.get(rest.id)?.has_markdown ?? false,
      hasBinary: Boolean(storageKey),
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={h.subtitle}
        actions={
          <Link className="btn btn-secondary" href="/agente?utility=doc_qa">
            Consultar con ALTAZOR
          </Link>
        }
      />

      <DocumentOcrStatus />
      <DocumentoIngestForm causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))} />

      {documentos.length === 0 ? (
        <EmptyState
          title="Sin documentos por causa"
          description="Añade archivos a una causa o reúne los documentos compartidos del equipo en Espacios."
          actionLabel="Ver espacios"
          actionHref="/sites"
        />
      ) : (
        <div className="panel overflow-hidden rounded-[var(--radius-lg)]">
          <div className="overflow-x-auto">
          <table role="table" className="data-table min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr role="row">
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Documento</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Tipo</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Causa</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Autor</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Procesamiento</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr role="row" key={d.id} className="table-row">
                  <td role="cell" data-label="Documento" className="data-table-primary px-4 py-3">
                    <div className="font-medium">{d.nombre}</div>
                    {d.driveImport && <details className="mt-1 text-xs text-[var(--ink-soft)]"><summary className="cursor-pointer">Procedencia: Google Drive</summary><p>Importada el {formatDate(d.driveImport.importedAt)}. Esta copia conserva la revisión {d.driveImport.driveVersion} del archivo.</p><Link className="underline" href="/sincronizacion">Revisar actualizaciones de mis archivos</Link><details className="mt-2"><summary className="cursor-pointer">Identidad del archivo conservado</summary><p className="break-all">SHA-256: {d.driveImport.sourceSha256}</p></details></details>}
                    {d.ruta && (
                      <div className="text-xs text-[var(--muted)]">{d.ruta}/</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <a
                        href={`/api/documentos/${d.id}/content`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
                      >
                        Descargar
                      </a>
                      <Link href={`/documentos/${d.id}/fuentes`} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline">Ver fuentes</Link>
                      {d.causaId && (
                        <Link
                          href={`/agente?causaId=${d.causaId}&utility=doc_qa&documentoId=${d.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
                        >
                          Consultar con ALTAZOR
                        </Link>
                      )}
                      <DocumentDriveAction
                        documentId={d.id}
                        googleDriveId={d.googleDriveId}
                        hasText={d.hasText}
                        hasBinary={d.hasBinary}
                      />
                    </div>
                    {(d.obsidianPath || d.googleDriveId) && <details className="mt-2 text-xs text-[var(--muted)]"><summary className="cursor-pointer">Ubicaciones vinculadas</summary>{d.obsidianPath && <p className="break-all">Obsidian: {d.obsidianPath}</p>}{d.googleDriveId && <p className="break-all">{isRealDriveFolderId(d.googleDriveId) ? `Google Drive: ${d.googleDriveId}` : "La ubicación de Google Drive todavía necesita configurarse."}</p>}</details>}
                  </td>
                  <td role="cell" data-label="Tipo" className="px-4 py-3">{d.tipo}</td>
                  <td role="cell" data-label="Causa" className="px-4 py-3">
                    {d.causa ? (
                      <Link href={`/causas/${d.causa.id}`} className="text-[var(--sea)]">
                        {d.causa.rit || d.causa.titulo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td role="cell" data-label="Autor" className="px-4 py-3">{d.autor?.name || "—"}</td>
                  <td role="cell" data-label="Procesamiento" className="px-4 py-3 text-xs">
                    {d.extractionStatus === "pending" || d.extractionStatus === "processing" ? (
                      <span className="text-[var(--muted)]">Procesando…</span>
                    ) : d.extractionStatus === "completed" && d.hasMarkdown ? (
                      <a
                        href={`/api/documentos/${d.id}/markdown`}
                        className="text-[var(--sea)]"
                      >
                        Descargar texto preparado
                      </a>
                    ) : d.extractionStatus === "needs_ocr" ? (
                      <span className="text-[var(--copper)]">
                        Texto pendiente de reconocer{" "}
                        <DocumentProcessingAction documentId={d.id} />
                      </span>
                    ) : d.extractionStatus === "unsupported" ? (
                      <span className="text-[var(--muted)]">
                        Formato no soportado{" "}
                        <DocumentProcessingAction documentId={d.id} />
                      </span>
                    ) : d.extractionStatus === "failed" ? (
                      <span className="text-red-700">
                        Error de extracción{" "}
                        <DocumentProcessingAction documentId={d.id} />
                      </span>
                    ) : (
                      "No procesado"
                    )}
                  </td>
                  <td role="cell" data-label="Actualizado" className="px-4 py-3">{formatDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
