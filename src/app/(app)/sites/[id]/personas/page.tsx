import { AddMemberButton } from "@/components/sites/AddMemberButton";
import { SiteNav } from "@/components/sites/SiteNav";
import { assertSitePageAccess } from "@/lib/auth/access";
import { siteAccessWhere as scopedsiteAccessWhere } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import styles from "@/components/config/WorkspaceArea.module.css";

type Params = { params: Promise<{ id: string }> };

export default async function SitePeoplePage({ params }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  // ⚡ Bolt: Fetch site and available users concurrently to save one database round trip per page load
  const [site, allUsers] = await Promise.all([
    prisma.site.findFirst({
      where: { AND: [scopedsiteAccessWhere(user), { id }] },
      include: {
        members: { include: { user: true } },
        groups: { include: { group: { include: { members: { include: { user: true } } } } } },
      },
    }),
    isStaff(user.role)
      ? prisma.user.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  if (!site) notFound();

  return (
    <div className={styles.area}>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/personas" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Miembros, roles del espacio y grupos con acceso (muros éticos / permisos).
        </p>
        {isStaff(user.role) && (
          <AddMemberButton
            siteId={site.id}
            users={allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Miembros</h2>
          <div className="mt-4 space-y-3">
            {site.members.map((m) => (
              <div key={m.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--line)] px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: m.user.avatarColor }}
                >
                  {m.user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{m.user.name}</div>
                  <div className="break-words text-sm text-[var(--ink-soft)]">
                    {m.user.email} · {m.user.title || m.user.role}
                  </div>
                </div>
                <span className="badge badge-sea col-start-2 w-fit sm:col-start-auto">
                  {m.role === "admin"
                    ? "Admin"
                    : m.role === "contributor"
                      ? "Colaborador"
                      : m.role === "viewer"
                        ? "Lectura"
                        : m.role === "client"
                          ? "Cliente"
                          : m.role}
                </span>
              </div>
            ))}
            {site.members.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin miembros. Agregue abogados o clientes del portal.
              </p>
            )}
          </div>
        </section>
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Grupos con acceso</h2>
          <div className="mt-4 space-y-3">
            {site.groups.map((g) => (
              <div key={g.id} className="rounded-2xl border border-[var(--line)] px-3 py-3">
                <div className="font-medium">{g.group.name}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  rol en espacio: {g.role} · {g.group.members.length} personas
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
