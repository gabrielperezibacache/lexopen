import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import Link from "next/link";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { EmptyState } from "@/components/EmptyState";
import { publicUserSelect } from "@/lib/auth/public-user";
import { DocumentProcessingAction } from "@/components/DocumentProcessingAction";
import { DocumentOcrStatus } from "@/components/DocumentOcrStatus";
import { DocumentDriveAction } from "@/components/DocumentDriveAction";
import { requireStaff } from "@/lib/auth/session";
import { confidentialWhere } from "@/lib/api";

export default async function DocumentosPage() {
  const user = await requireStaff();
  const [documentos, causas] = await Promise.all([
    prisma.documento.findMany({
      where: confidentialWhere(user.role),
      include: { causa: true, autor: { select: publicUserSelect } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.causa.findMany({
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Repositorio por causa
        </p>
        <h1 className="display mt-2 text-4xl">Documentos</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Incorporación de escritos, carpetas investigativas y memos vinculados a causas —
          con extracción Markdown/OCR para el copiloto IA, Obsidian y Google Drive. El VDR
          por espacio está en Espacios → Archivos.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/agente" className="text-[var(--sea)]">
            Preguntar al copiloto sobre estos documentos →
          </Link>
        </p>
      </div>

      <DocumentOcrStatus />
      <DocumentoIngestForm causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))} />

      {documentos.length === 0 ? (
        <EmptyState
          title="Sin documentos por causa"
          description="Incorpore un escrito o una carpeta investigativa vinculada a una causa. Para el VDR del matter use Espacios → Archivos."
          actionLabel="Ver espacios"
          actionHref="/sites"
        />
      ) : (
        <div className="panel overflow-hidden rounded-3xl">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--ink)] text-white/90">
              <tr>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Causa</th>
                <th className="px-4 py-3 font-medium">Autor</th>
                <th className="px-4 py-3 font-medium">Procesamiento</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.nombre}</div>
                    {d.ruta && (
                      <div className="text-xs text-[var(--ink-soft)]/60">{d.ruta}/</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <a
                        href={`/api/documentos/${d.id}/content`}
                        className="text-xs text-[var(--sea)]"
                      >
                        Descargar
                      </a>
                      <DocumentDriveAction
                        documentId={d.id}
                        googleDriveId={d.googleDriveId}
                      />
                    </div>
                    {d.obsidianPath && (
                      <div className="text-xs text-[var(--ink-soft)]/60">
                        Obsidian: {d.obsidianPath}
                      </div>
                    )}
                    {d.googleDriveId && (
                      <div className="text-xs text-[var(--ink-soft)]/60">
                        Drive: {d.googleDriveId}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{d.tipo}</td>
                  <td className="px-4 py-3">
                    {d.causa ? (
                      <Link href={`/causas/${d.causa.id}`} className="text-[var(--sea)]">
                        {d.causa.rit || d.causa.titulo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{d.autor?.name || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {d.extractionStatus === "pending" || d.extractionStatus === "processing" ? (
                      <span className="text-[var(--ink-soft)]/65">Procesando…</span>
                    ) : d.extractionStatus === "completed" && d.extractedMarkdown ? (
                      <a
                        href={`/api/documentos/${d.id}/markdown`}
                        className="text-[var(--sea)]"
                      >
                        Markdown listo
                      </a>
                    ) : d.extractionStatus === "needs_ocr" ? (
                      <span className="text-[var(--copper)]">
                        Requiere OCR{" "}
                        <DocumentProcessingAction documentId={d.id} />
                      </span>
                    ) : d.extractionStatus === "unsupported" ? (
                      <span className="text-[var(--ink-soft)]/65">
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
                  <td className="px-4 py-3">{formatDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
