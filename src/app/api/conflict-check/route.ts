import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { checkConflicts } from "@/lib/conflict";

const schema = z.object({
  partes: z.array(
    z.object({
      nombre: z.string(),
      rut: z.string().optional().nullable(),
    })
  ),
  excludeCausaId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    await requireStaff();
    const body = await parseBody(req, schema);
    const conflicts = await checkConflicts(body);
    return NextResponse.json({ conflicts });
  } catch (e) {
    return handleRouteError(e);
  }
}
