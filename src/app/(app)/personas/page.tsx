import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { requireStaff } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import { siteAccessWhere } from "@/lib/auth/causa-access";
import { PeopleManager } from "@/components/PeopleManager";
import { getI18n } from "@/lib/i18n/server";

export default async function PeoplePage() {
  const me = await requireStaff();
  const canManage = isAdmin(me);
  const { dict } = await getI18n();
  const h = dict.hubs.personas;
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      include: {
        siteMemberships: { where: { site: siteAccessWhere(me) }, include: { site: true } },
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
      <ModuleHeader artwork="people" eyebrow={h.eyebrow} title={h.title} subtitle={h.subtitle} />
      <PeopleManager
        canManage={canManage}
        currentUserId={me.id}
        initialUsers={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          title: u.title,
          avatarColor: u.avatarColor,
          ...(canManage ? { capabilityGrants: u.capabilityGrants, capabilityRevokes: u.capabilityRevokes } : {}),
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
