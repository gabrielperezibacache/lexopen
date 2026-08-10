import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import Link from "next/link";
import { DocumentoUploadForm } from "@/components/DocumentoUploadForm";
import { DocumentoAiActions } from "@/components/ai/DocumentoAiActions";
import { EmptyState } from "@/components/EmptyState";

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string; causaId?: string }>;
}) {
  const sp = await searchParams;
  const clienteId = sp.clienteId?.trim() || "";
  const causaId = sp.causaId?.trim() || "";

  const [documentos, causas, clientes] = await Promise.all([
    prisma.documento.findMany({
      where: {
        ...(clienteId ? { clienteId } : {}),
        ...(causaId ? { causaId } : {}),
      },
      include: { causa: true, cliente: true, autor: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.causa.findMany({
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.cliente.findMany({
      where: { estado: "activo" },
      select: { id: true, razonSocial: true, rut: true },
      orderBy: { razonSocial: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Repositorio
        </p>
        <h1 className="display mt-2 text-4xl">Documentos</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Escritos y memos por causa o carpeta de cliente. El VDR por espacio está
          en Espacios → Archivos.
        </p>
      </div>

      <form className="flex flex-wrap gap-2">
        <select className="select max-w-xs" name="clienteId" defaultValue={clienteId}>
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razonSocial}
              {c.rut ? ` · ${c.rut}` : ""}
            </option>
          ))}
        </select>
        <select className="select max-w-xs" name="causaId" defaultValue={causaId}>
          <option value="">Todas las causas</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rit || c.titulo}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
        {(clienteId || causaId) && (
          <Link href="/documentos" className="btn btn-ghost">
            Limpiar
          </Link>
        )}
      </form>

      <DocumentoUploadForm
        causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
        clienteId={clienteId || undefined}
      />

      {documentos.length === 0 ? (
        <EmptyState
          title="Sin documentos"
          description="Suba un escrito o memo vinculado a una causa o cliente. Para el VDR del matter use Espacios → Archivos."
          actionLabel="Ver clientes"
          actionHref="/clientes"
        />
      ) : (
        <div className="panel overflow-hidden rounded-3xl">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--ink)] text-white/90">
              <tr>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Causa</th>
                <th className="px-4 py-3 font-medium">Autor</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium">IA</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.nombre}</div>
                    <a
                      href={`/api/documentos/${d.id}/content`}
                      className="text-xs text-[var(--sea)]"
                    >
                      Descargar
                    </a>
                  </td>
                  <td className="px-4 py-3">{d.tipo}</td>
                  <td className="px-4 py-3">
                    {d.cliente ? (
                      <Link
                        href={`/clientes/${d.cliente.id}`}
                        className="text-[var(--sea)]"
                      >
                        {d.cliente.razonSocial}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
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
                  <td className="px-4 py-3">{formatDate(d.updatedAt)}</td>
                  <td className="px-4 py-3 align-top">
                    <DocumentoAiActions
                      documentoId={d.id}
                      causaId={d.causaId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
