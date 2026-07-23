import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { AddMemberButton } from "@/components/sites/AddMemberButton";

type Params = { params: Promise<{ id: string }> };

export default async function SitePeoplePage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      members: { include: { user: true } },
      groups: { include: { group: { include: { members: { include: { user: true } } } } } },
    },
  });
  if (!site) notFound();
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/personas" />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Usuarios, roles del site y grupos (ethical walls / permisos HighQ-style).
        </p>
        <AddMemberButton
          siteId={site.id}
          users={allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Miembros</h2>
          <div className="mt-4 space-y-3">
            {site.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] px-3 py-2">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: m.user.avatarColor }}
                >
                  {m.user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.user.name}</div>
                  <div className="truncate text-xs text-[var(--ink-soft)]/65">
                    {m.user.email} · {m.user.title || m.user.role}
                  </div>
                </div>
                <span className="badge badge-sea">{m.role}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Grupos con acceso</h2>
          <div className="mt-4 space-y-3">
            {site.groups.map((g) => (
              <div key={g.id} className="rounded-2xl border border-[var(--line)] px-3 py-3">
                <div className="font-medium">{g.group.name}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  rol site: {g.role} · {g.group.members.length} personas
                </div>
              </div>
            ))}
            {site.groups.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">Sin grupos vinculados.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
