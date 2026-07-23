import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { NewSiteButton } from "@/components/sites/NewSiteButton";

const tipoLabel: Record<string, string> = {
  matter: "Matter",
  vdr: "Virtual Data Room",
  client_portal: "Client portal",
  project: "Project",
  knowledge: "Knowledge",
};

export default async function SitesPage() {
  const sites = await prisma.site.findMany({
    include: {
      cliente: true,
      causa: true,
      _count: { select: { files: true, tasks: true, members: true, isheets: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <ModuleHeader
        eyebrow="HighQ workspaces"
        title="Sites"
        subtitle="Matters, VDRs, knowledge bases y portales cliente — el contenedor central de LexOpen."
        actions={<NewSiteButton />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((s) => (
          <Link
            key={s.id}
            href={`/sites/${s.id}`}
            className="panel group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="mt-1 h-3 w-3 rounded-full" style={{ background: s.color }} />
              <span className="badge badge-ink">{tipoLabel[s.tipo] || s.tipo}</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold group-hover:text-[var(--sea)]">{s.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/75">
              {s.description || "Sin descripción"}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]/65">
              <span>{s._count.files} files</span>
              <span>{s._count.tasks} tasks</span>
              <span>{s._count.isheets} iSheets</span>
              <span>{s._count.members} people</span>
            </div>
            {(s.causa || s.cliente) && (
              <div className="mt-3 text-xs text-[var(--copper)]">
                {s.causa?.rit || s.cliente?.razonSocial}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
