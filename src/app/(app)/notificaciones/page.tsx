import { prisma } from "@/lib/db";
import { notificationInbox } from "@/lib/notify/read";
import { requireUser } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { getI18n } from "@/lib/i18n/server";

export default async function NotificacionesPage() {
  const user = await requireUser();
  const { dict } = await getI18n();
  const h = dict.hubs.notificaciones;
  const inbox = await prisma.$transaction(tx => notificationInbox(user.id, tx, 100), { isolationLevel: "RepeatableRead" });
  return (
    <div className="space-y-6">
      <ModuleHeader eyebrow={h.eyebrow} title={h.title} subtitle={h.subtitle} />
      <NotificationsPanel initial={inbox} />
    </div>
  );
}
