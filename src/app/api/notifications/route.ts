import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireUser } from "@/lib/api";
import { visibleNotifications } from "@/lib/notify/read";
import { canReceiveNotification } from "@/lib/notify/access";
import { notificationTransaction } from "@/lib/notify/transaction";
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await visibleNotifications(user.id, prisma));
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
        const notices = await visibleNotifications(user.id, tx, Number.MAX_SAFE_INTEGER);
        await tx.notification.updateMany({ where: { userId: user.id, id: { in: notices.map(n => n.id) }, read: false }, data: { read: true } });
        return true;
      }
      const notice = await tx.notification.findFirst({ where: { id: body.id, userId: user.id } });
      if (!notice || !await canReceiveNotification(user.id, notice, tx)) return false;
      await tx.notification.updateMany({ where: { id: notice.id, userId: user.id }, data: { read: true } });
      return true;
    });
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Aviso no encontrado" }, { status: 404 });
  } catch (error) { return handleRouteError(error); }
}
