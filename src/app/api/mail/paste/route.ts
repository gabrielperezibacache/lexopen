import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { ingestPasteMail } from "@/lib/mail/ingest";
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
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
