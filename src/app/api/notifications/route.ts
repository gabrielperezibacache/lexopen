import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireUser } from "@/lib/api";
import { notificationInbox, visibleNotifications, visibleUnreadNotifications } from "@/lib/notify/read";
import { canReceiveNotification } from "@/lib/notify/access";
import { notificationTransaction } from "@/lib/notify/transaction";
const privateHeaders = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const view = req.nextUrl.searchParams.get("view");
    if (view === "count") return NextResponse.json({ unreadCount: await visibleUnreadNotifications(user.id, prisma) }, { headers: privateHeaders });
    if (view === "preview") {
      const inbox = await prisma.$transaction(tx => notificationInbox(user.id, tx, 8), { isolationLevel: "RepeatableRead" });
      return NextResponse.json(inbox, { headers: privateHeaders });
    }
    return NextResponse.json(await visibleNotifications(user.id, prisma), { headers: privateHeaders });
  } catch (error) { return handleRouteError(error); }
}
const schema = z.object({ action: z.literal("read-all").optional(), id: z.string().min(1).max(128).optional() })
  .refine(body => body.action || body.id, { message: "Indique un aviso o marque todos como leídos" });
export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const body = await parseBody(req, schema);
    const result = await notificationTransaction(prisma, async tx => {
      if (body.action === "read-all") {
        const notices = await visibleNotifications(user.id, tx, Number.MAX_SAFE_INTEGER, { unreadOnly: true });
        for (let index = 0; index < notices.length; index += 250) {
          await tx.notification.updateMany({ where: { userId: user.id, id: { in: notices.slice(index, index + 250).map(n => n.id) }, read: false }, data: { read: true } });
        }
        return { unreadCount: 0 };
      }
      const notice = await tx.notification.findFirst({ where: { id: body.id, userId: user.id } });
      if (!notice || !await canReceiveNotification(user.id, notice, tx)) return false;
      await tx.notification.updateMany({ where: { id: notice.id, userId: user.id }, data: { read: true } });
      return { unreadCount: await visibleUnreadNotifications(user.id, tx) };
    });
    return result ? NextResponse.json({ ok: true, ...result }, { headers: privateHeaders }) : NextResponse.json({ error: "Aviso no encontrado" }, { status: 404, headers: privateHeaders });
  } catch (error) { return handleRouteError(error); }
}
