import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import Link from "next/link";

export default async function DocumentosPage() {
  const documentos = await prisma.documento.findMany({
    include: { causa: true, autor: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Data room
        </p>
        <h1 className="display mt-2 text-4xl">Documentos</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Repositorio colaborativo de escritos, contratos y memos — sincronizable con Obsidian y Google Drive.
        </p>
      </div>

      <div className="panel overflow-hidden rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3 font-medium">Documento</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Causa</th>
              <th className="px-4 py-3 font-medium">Autor</th>
              <th className="px-4 py-3 font-medium">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((d) => (
              <tr key={d.id} className="table-row">
                <td className="px-4 py-3">
                  <div className="font-medium">{d.nombre}</div>
                  {d.obsidianPath && (
                    <div className="text-xs text-[var(--ink-soft)]/60">Obsidian: {d.obsidianPath}</div>
                  )}
                  {d.googleDriveId && (
                    <div className="text-xs text-[var(--ink-soft)]/60">Drive: {d.googleDriveId}</div>
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
                <td className="px-4 py-3">{formatDate(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
