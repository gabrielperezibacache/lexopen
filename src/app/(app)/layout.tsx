import { AppSidebar } from "@/components/AppSidebar";
import { enforceAppAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { isCliente } from "@/lib/auth/rbac";
import { getI18n } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await enforceAppAccess();
  const { t } = await getI18n();
  const unreadCount =
    user && !isCliente(user.role)
      ? await prisma.notification.count({ where: { userId: user.id, read: false } })
      : 0;
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 h-screen">
        <AppSidebar role={user.role} unreadCount={unreadCount} />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-white/50 px-4 py-3 backdrop-blur md:hidden">
          <div className="display text-lg">LexOpen</div>
          <span className="text-xs text-[var(--ink-soft)]/65">{t("common.menu")}</span>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
