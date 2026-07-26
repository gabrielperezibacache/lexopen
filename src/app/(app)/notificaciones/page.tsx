import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { NotificationsPanel } from "@/components/NotificationsPanel";

export default async function NotificacionesPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Centro de avisos"
        title="Notificaciones"
        subtitle="Tareas, movimientos, minutas y alertas asignadas a su usuario."
      />
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
