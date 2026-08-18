import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { syncMailboxForUser } from "@/lib/mail/ingest";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { prisma } from "@/lib/db";
import { isStaff } from "@/lib/auth/rbac";

/** Cron or staff-triggered mailbox sync (Gmail / Microsoft / IMAP). */
export async function POST(req: NextRequest) {
  try {
    const cronOk = verifyCronSecret(req.headers.get("x-cron-secret"));
    if (cronOk) {
      const staff = await prisma.user.findMany({
        where: { role: { in: ["admin", "abogado", "asistente"] } },
        select: { id: true, role: true },
      });
      let total = 0;
      let users = 0;
      for (const user of staff) {
        if (!isStaff(user.role)) continue;
        const r = await syncMailboxForUser(user, { fromCron: true });
        if (!r.skipped) users += 1;
        total += r.inserted;
      }
      return NextResponse.json({ ok: true, users, inserted: total });
    }
    assertCsrf(req);
    const user = await requireStaff();
    const result = await syncMailboxForUser(user);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return handleRouteError(e);
  }
}
