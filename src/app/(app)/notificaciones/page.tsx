import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/components/ui";
import { ModuleHeader } from "@/components/sites/SiteNav";

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
      <div className="space-y-3">
        {notifications.map((n) => (
          <article key={n.id} className="panel rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{n.title}</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{n.body}</p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]/60">
                  {formatDateTime(n.createdAt)} · {n.read ? "leída" : "pendiente"}
                </p>
              </div>
              {n.href && (
                <Link className="btn btn-secondary" href={n.href}>
                  Abrir
                </Link>
              )}
            </div>
          </article>
        ))}
        {notifications.length === 0 && (
          <div className="panel rounded-3xl p-6 text-sm text-[var(--ink-soft)]/65">
            No hay notificaciones.
          </div>
        )}
      </div>
    </div>
  );
}
