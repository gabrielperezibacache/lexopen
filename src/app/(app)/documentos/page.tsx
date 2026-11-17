import { ContextDisclosure } from "@/components/ui/ContextDisclosure";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { ListPagination } from "@/components/ui/ListPagination";
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

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 200) || "";
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.documentos;
  const LIST_TAKE = 100;
  const [documentRows, causas] = await Promise.all([
    prisma.documento.findMany({
      where: { AND: [scopeddocumentReadWhere(user), confidentialWhere(user), listCursorWhere(query.after, "updatedAt"), ...(q ? [{ OR: [{ nombre: { contains: q, mode: "insensitive" as const } }, { causa: { titulo: { contains: q, mode: "insensitive" as const } } }, { causa: { rit: { contains: q, mode: "insensitive" as const } } }] }] : [])] },
      select: {
        ...documentoListSelect,
        storageKey: true,
        driveImport: { select: { driveVersion: true, importedAt: true, sourceSha256: true } },
        causa: { select: { id: true, rit: true, titulo: true } },
        autor: { select: publicUserSelect },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: LIST_TAKE + 1,
    }),
    prisma.causa.findMany({ where: scopedcausaAccessWhere(user),
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const { items: rawDocumentos, next } = listWindow(documentRows, LIST_TAKE, "updatedAt");
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
        artwork="casefiles"
        actions={<><a className="btn btn-primary" href="#document-upload">Añadir archivos</a><Link className="btn btn-ghost" href="/agente?utility=doc_qa">Consultar con Altazor</Link></>}
      />

      <form role="search" className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-0 flex-1">Buscar documentos o causas<input className="input" name="q" defaultValue={q} maxLength={200} /></label>
        <button className="btn btn-secondary" type="submit">Buscar</button>
      </form>
      <ContextDisclosure id="document-upload" title="Añadir archivos"><DocumentoIngestForm causas={causas.map(c=>({id:c.id,label:c.rit||c.titulo}))}/></ContextDisclosure>
      {documentos.some(documento => documento.extractionStatus === "needs_ocr") && <DocumentOcrStatus />}

      {documentos.length === 0 ? (
        <EmptyState
          title={q?"Sin resultados":"Sin documentos disponibles"}
          description={q?"Prueba con otro nombre o quita el filtro.":"Añade un archivo a una causa para empezar."}
          actionLabel={q?"Quitar filtros":"Añadir archivos"}
          actionHref={q?"/documentos":"#document-upload"}
        />
      ) : (
        <div className="panel overflow-hidden rounded-[var(--radius-lg)]">
          <div className="overflow-x-auto">
          <table role="table" className="data-table min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr role="row">
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Documento</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Causa</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr role="row" key={d.id} className="table-row">
                  <td role="cell" data-label="Documento" className="data-table-primary px-4 py-3">
                    <Link href={`/documentos/${d.id}/fuentes`} className="font-medium text-[var(--sea)]">{d.nombre}</Link>
                    {["pending", "processing"].includes(d.extractionStatus || "") && <p className="mt-1 text-xs text-[var(--ink-soft)]">Preparando texto…</p>}
                    {["needs_ocr", "failed", "unsupported"].includes(d.extractionStatus || "") && <p className="mt-1 text-xs text-[var(--danger)]">{d.extractionStatus === "needs_ocr" ? "Texto pendiente de reconocer" : d.extractionStatus === "unsupported" ? "Formato pendiente de preparación" : "No se pudo preparar el texto"}</p>}
                    <div className="document-row-actions">                      <a
                        href={`/api/documentos/${d.id}/content`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
                      >
                        Descargar
                      </a>

                    <details className="mt-1 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)]">Detalles y descargas</summary>
                    <p className="text-xs text-[var(--ink-soft)]">{d.tipo} · {d.autor?.name || "Sin autor indicado"}</p>
                    {d.driveImport && <details className="mt-1 text-xs text-[var(--ink-soft)]"><summary className="cursor-pointer">Procedencia: Google Drive</summary><p>Importada el {formatDate(d.driveImport.importedAt)}. Esta copia conserva la revisión {d.driveImport.driveVersion} del archivo.</p><Link className="underline" href="/sincronizacion">Revisar actualizaciones de mis archivos</Link><details className="mt-2"><summary className="cursor-pointer">Identidad del archivo conservado</summary><p className="break-all">SHA-256: {d.driveImport.sourceSha256}</p></details></details>}
                    {d.ruta && (
                      <div className="text-xs text-[var(--muted)]">{d.ruta}/</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {d.causaId && (
                        <Link
                          href={`/agente?causaId=${d.causaId}&utility=doc_qa&documentoId=${d.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
                        >
                          Consultar con ALTAZOR
                        </Link>
                      )}
                      <Link href={`/offline.html?kind=documento&record=${d.id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)]">Sin conexión</Link>
                      <DocumentDriveAction
                        documentId={d.id}
                        googleDriveId={d.googleDriveId}
                        hasText={d.hasText}
                        hasBinary={d.hasBinary}
                      />
                    </div>
                    {(d.obsidianPath || d.googleDriveId) && <details className="mt-2 text-xs text-[var(--muted)]"><summary className="cursor-pointer">Ubicaciones vinculadas</summary>{d.obsidianPath && <p className="break-all">Obsidian: {d.obsidianPath}</p>}{d.googleDriveId && <p className="break-all">{isRealDriveFolderId(d.googleDriveId) ? `Google Drive: ${d.googleDriveId}` : "La ubicación de Google Drive todavía necesita configurarse."}</p>}</details>}
                    {d.extractionStatus === "completed" && d.hasMarkdown && <a className="inline-flex min-h-11 items-center text-[var(--sea)]" href={`/api/documentos/${d.id}/markdown`}>Descargar texto preparado</a>}
                    {["needs_ocr", "unsupported", "failed"].includes(d.extractionStatus || "") && <DocumentProcessingAction documentId={d.id} />}
                    </details></div>
                  </td>
                  <td role="cell" data-label="Causa" className="px-4 py-3">
                    {d.causa ? (
                      <Link href={`/causas/${d.causa.id}`} className="text-[var(--sea)]">
                        {d.causa.rit || d.causa.titulo}
                      </Link>
                    ) : (
                      "—"
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
      {documentos.length>0&&<ListPagination path="/documentos" filters={{q}} after={query.after} next={next} count={rawDocumentos.length}/>}
    </div>
  );
}
