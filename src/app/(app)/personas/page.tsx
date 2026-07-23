import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";

export default async function PeoplePage() {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      include: {
        siteMemberships: { include: { site: true } },
        groupMembers: { include: { group: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.group.findMany({
      include: { members: { include: { user: true } } },
    }),
  ]);

  return (
    <div>
      <ModuleHeader
        eyebrow="Users & groups"
        title="People"
        subtitle="Directorio del estudio, roles y grupos con acceso a sites."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Usuarios</h2>
          <div className="mt-4 space-y-3">
            {users.map((u) => (
              <div key={u.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: u.avatarColor }}
                  >
                    {u.name
                      .split(" ")
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-[var(--ink-soft)]/65">
                      {u.email} · {u.role} · {u.title}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[var(--ink-soft)]/70">
                  Sites: {u.siteMemberships.map((m) => m.site.name).join(", ") || "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Grupos</h2>
          <div className="mt-4 space-y-3">
            {groups.map((g) => (
              <div key={g.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <div className="font-medium">{g.name}</div>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{g.description}</p>
                <div className="mt-2 text-xs text-[var(--ink-soft)]/65">
                  {g.members.map((m) => m.user.name).join(", ")}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
