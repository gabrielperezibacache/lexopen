import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { ingestPasteMail } from "@/lib/mail/ingest";
import { publicMailboxMessages } from "@/lib/mail/access";
import { z } from "zod";

const pasteSchema = z.object({
  subject: z.string().max(500),
  body: z.string().max(120_000),
  fromAddress: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = pasteSchema.parse(await req.json());
    const result = await ingestPasteMail(user, body);
    const message = result.message;
    const visible = message ? (await publicMailboxMessages([message], user))[0] : null;
    return NextResponse.json({ ...result, message: message ? { ...message, causaId: visible?.causaId || null } : null });
  } catch (e) {
    return handleRouteError(e);
  }
}
