import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { MessagesClient } from "@/components/MessagesClient";

async function clientHasPortalSite(userId: string) {
  return (
    (await prisma.site.count({
      where: {
        isClientVisible: true,
        members: { some: { userId } },
      },
    })) > 0
  );
}

export default async function MessagesPage() {
  const user = await requireUser();

  const [messages, directory] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ receiverId: user.id }, { senderId: user.id }] },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    (async () => {
      if (isCliente(user.role)) {
        if (!(await clientHasPortalSite(user.id))) return [];
        return prisma.user.findMany({
          where: { role: { in: ["admin", "abogado", "asistente"] } },
          select: publicUserSelect,
          orderBy: { name: "asc" },
        });
      }
      if (!isStaff(user.role)) return [];
      const [clients, staff] = await Promise.all([
        prisma.user.findMany({
          where: {
            role: "cliente",
            siteMemberships: {
              some: { site: { isClientVisible: true } },
            },
          },
          select: publicUserSelect,
          orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
          where: {
            role: { in: ["admin", "abogado", "asistente"] },
            id: { not: user.id },
          },
          select: publicUserSelect,
          orderBy: { name: "asc" },
        }),
      ]);
      return [...staff, ...clients];
    })(),
  ]);

  return (
    <MessagesClient
      initialMessages={messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        sender: { id: m.sender.id, name: m.sender.name },
        receiver: { id: m.receiver.id, name: m.receiver.name },
      }))}
      directory={directory.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }))}
    />
  );
}
