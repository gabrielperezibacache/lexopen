import Link from "next/link";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { NotificationPreferencesPanel } from "@/components/notify/NotificationPreferencesPanel";
import { TelegramLinkPanel } from "@/components/notify/TelegramLinkPanel";
import { PushSubscribePanel } from "@/components/notify/PushSubscribePanel";
import { requireUser } from "@/lib/auth/session";

export default async function CuentaNotificacionesPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Cuenta"
        title="Notificaciones"
        subtitle="Canales, preferencias y horas de silencio. Los plazos fatales no se apagan."
      />
      <p className="text-sm text-[var(--ink-soft)]/70">
        <Link className="underline" href="/cuenta">
          ← Volver a mi cuenta
        </Link>
        {" · "}
        <Link className="underline" href="/notificaciones">
          Historial in-app
        </Link>
      </p>
      <TelegramLinkPanel />
      <PushSubscribePanel />
      <NotificationPreferencesPanel />
    </div>
  );
}
