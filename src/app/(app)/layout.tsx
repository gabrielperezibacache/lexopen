import { AppShell } from "@/components/AppShell";
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
    <AppShell
      role={user.role}
      unreadCount={unreadCount}
      showUpdateBanner={showUpdateBanner}
    >
      {children}
    </AppShell>
  );
}
