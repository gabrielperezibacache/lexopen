import { AppShell } from "@/components/AppShell";
import { AltazorCompanionProvider } from "@/components/altazor/AltazorCompanionProvider";
import { enforceAppAccess } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { buildNavigation } from "@/lib/navigation/catalog";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await enforceAppAccess();
  // ⚡ Bolt: Fetch global unread and mail counts concurrently to save one database round trip per page load
  const [unreadCount, mailPendingCount] = await Promise.all([
    prisma.notification.count({
      where: { userId: user.id, read: false },
    }),
    isStaff(user.role)
      ? prisma.mailboxMessage.count({
          where: {
            userId: user.id,
            status: { in: ["nuevo", "vinculado"] },
          },
        })
      : Promise.resolve(0),
  ]);
  const showUpdateBanner = isStaff(user.role);
  const canSelfUpdate = user.role === "admin";
  return (
    <AppShell
      navigation={buildNavigation(user)}
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor }}
      unreadCount={unreadCount}
      mailPendingCount={mailPendingCount}
      showUpdateBanner={showUpdateBanner}
      canSelfUpdate={canSelfUpdate}
    >
      {isStaff(user.role) && canSome(user, "assistant.use")
        ? <AltazorCompanionProvider userId={user.id}>{children}</AltazorCompanionProvider>
        : children}
    </AppShell>
  );
}
