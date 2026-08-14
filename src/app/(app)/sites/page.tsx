import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { isCliente } from "@/lib/auth/rbac";
import { clientSiteWhere } from "@/lib/auth/access";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { NewSiteButton } from "@/components/sites/NewSiteButton";
import { EmptyState } from "@/components/EmptyState";

const tipoLabel: Record<string, string> = {
  matter: "Matter / causa",
  vdr: "VDR / data room",
  client_portal: "Portal cliente",
  project: "Proyecto",
  knowledge: "Knowledge",
};

export default async function SitesPage() {
  const user = await requireUser();
  const sites = await prisma.site.findMany({
    where: isCliente(user.role) ? clientSiteWhere(user.id) : undefined,
    select: {
      id: true,
      name: true,
      description: true,
      tipo: true,
      color: true,
      cliente: { select: { razonSocial: true } },
      causa: { select: { rit: true } },
      _count: { select: { files: true, tasks: true, members: true, isheets: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <ModuleHeader
        eyebrow="Espacios de trabajo"
        title="Espacios"
        subtitle="Matters, VDRs, knowledge y portales cliente — el contenedor central de LexOpen."
        actions={!isCliente(user.role) ? <NewSiteButton /> : undefined}
      />

      {sites.length === 0 ? (
        <EmptyState
          title="Sin espacios aún"
          description="Cree un matter, VDR o portal cliente para organizar archivos, tareas y Q&A."
          action={!isCliente(user.role) ? <NewSiteButton /> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Link
              key={s.id}
              href={
                isCliente(user.role) ? `/sites/${s.id}/archivos` : `/sites/${s.id}`
              }
              className="panel group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="mt-1 h-3 w-3 rounded-full" style={{ background: s.color }} />
                <span className="badge badge-ink">{tipoLabel[s.tipo] || s.tipo}</span>
              </div>
              <h2 className="mt-3 break-words text-xl font-semibold group-hover:text-[var(--sea)]">{s.name}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/75">
                {s.description || "Sin descripción"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]/65">
                {isCliente(user.role) ? (
                  <span>Documentos y Q&A compartidos</span>
                ) : (
                  <>
                    <span>{s._count.files} archivos</span>
                    <span>{s._count.tasks} tareas</span>
                    <span>{s._count.isheets} iSheets</span>
                    <span>{s._count.members} personas</span>
                  </>
                )}
              </div>
              {(s.causa || s.cliente) && (
                <div className="mt-3 text-xs text-[var(--copper)]">
                  {s.causa?.rit || s.cliente?.razonSocial}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
