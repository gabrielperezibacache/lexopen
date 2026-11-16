import { STAFF_ROLES } from "@/lib/auth/roles";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { ListPagination } from "@/components/ui/ListPagination";
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

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();

  const [messageRows, directory] = await Promise.all([
    prisma.message.findMany({
      where: { AND: [{ OR: [{ receiverId: user.id }, { senderId: user.id }] }, listCursorWhere(sp.after, "createdAt")] },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    }),
    (async () => {
      if (isCliente(user.role)) {
        if (!(await clientHasPortalSite(user.id))) return [];
        return prisma.user.findMany({
          where: { role: { in: [...STAFF_ROLES] } },
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
            role: { in: [...STAFF_ROLES] },
            id: { not: user.id },
          },
          select: publicUserSelect,
          orderBy: { name: "asc" },
        }),
      ]);
      return [...staff, ...clients];
    })(),
  ]);

  const { items: messages, next } = listWindow(messageRows, 50, "createdAt");
  return (
    <div><MessagesClient pagination={<ListPagination path="/mensajes" after={sp.after} next={next} count={messages.length} />}
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
    /></div>
  );
}
