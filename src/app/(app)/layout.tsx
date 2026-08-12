import { AppSidebar } from "@/components/AppSidebar";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { enforceAppAccess } from "@/lib/auth/access";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await enforceAppAccess();
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, read: false },
  });
  const showUpdateBanner = isStaff(user.role);
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 h-screen">
        <AppSidebar role={user.role} unreadCount={unreadCount} />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-white/50 px-4 py-3 backdrop-blur md:hidden">
          <div className="display text-lg">LexOpen</div>
          <MobileMenuButton />
        </header>
        <UpdateAvailableBanner enabled={showUpdateBanner} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
