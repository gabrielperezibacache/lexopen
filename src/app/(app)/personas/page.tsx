import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { requireStaff } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import { PeopleManager } from "@/components/PeopleManager";

export default async function PeoplePage() {
  const me = await requireStaff();
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
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <ModuleHeader
        eyebrow="Directorio del estudio"
        title="Personas"
        subtitle="Crear, editar y administrar usuarios, roles y grupos con acceso a espacios."
      />
      <PeopleManager
        canManage={isAdmin(me.role)}
        currentUserId={me.id}
        initialUsers={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          title: u.title,
          avatarColor: u.avatarColor,
          siteMemberships: u.siteMemberships.map((m) => ({
            site: { id: m.site.id, name: m.site.name },
          })),
          groupMembers: u.groupMembers.map((m) => ({
            group: { id: m.group.id, name: m.group.name },
          })),
        }))}
        initialGroups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          members: g.members.map((m) => ({
            user: { id: m.user.id, name: m.user.name },
          })),
        }))}
      />
    </div>
  );
}
