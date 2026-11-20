import { DocumentDownloads } from "@/components/DocumentDownloads";
import { documentDownloadOptions } from "@/lib/sites/document-download-options";
import { ContextDisclosure } from "@/components/ui/ContextDisclosure";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { ListPagination } from "@/components/ui/ListPagination";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { confidentialWhere } from "@/lib/api";
import { writableCausaWhere, documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { uploadDestinations } from "@/lib/causas/upload-destination";
import { canSome } from "@/lib/auth/permissions";
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
        id: true, nombre: true, updatedAt: true, extractionStatus: true,
        causa: { select: { id: true, rit: true, titulo: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: LIST_TAKE + 1,
    }),
    prisma.causa.findMany({ where: writableCausaWhere(user),
      select: { id: true, rit: true, titulo: true, clienteId: true, googleDriveFolderId: true, googleDriveFolderName: true, cliente: { select: { razonSocial: true } }, driveSyncSubscription: { select: { account: true, connectionId: true, folderId: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const { items: rawDocumentos, next } = listWindow(documentRows, LIST_TAKE, "updatedAt");
  const [downloads, { destinations }] = await Promise.all([
    documentDownloadOptions(rawDocumentos.map(document => document.id)), uploadDestinations(causas),
  ]);
  const documentos = rawDocumentos.map(document => ({ ...document, downloads: downloads.get(document.id) }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={h.eyebrow}
        title={h.title}
        artwork="casefiles"
        actions={<><a className="btn btn-primary" href="#document-upload">Añadir archivos</a>{canSome(user, "assistant.use") && <Link className="btn btn-ghost" href="/agente?utility=doc_qa">Consultar con Altazor</Link>}</>}
      />

      <form role="search" className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-0 flex-1">Buscar documentos o causas<input className="input" name="q" defaultValue={q} maxLength={200} /></label>
        <button className="btn btn-secondary" type="submit">Buscar</button>
      </form>
      <ContextDisclosure id="document-upload" title="Añadir archivos"><DocumentoIngestForm causas={destinations}/></ContextDisclosure>

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
                    <div className="document-row-actions">
                      <DocumentDownloads primary id={d.id} options={d.downloads} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline" />
                    </div>
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
