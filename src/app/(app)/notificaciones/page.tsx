import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { getI18n } from "@/lib/i18n/server";

export default async function NotificacionesPage() {
  const user = await requireUser();
  const { dict } = await getI18n();
  const h = dict.hubs.notificaciones;
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-6">
      <ModuleHeader eyebrow={h.eyebrow} title={h.title} subtitle={h.subtitle} />
      <NotificationsPanel
        initial={notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          read: n.read,
          href: n.href,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
