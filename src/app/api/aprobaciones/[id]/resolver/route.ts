import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { resolveAprobacion } from "@/lib/auth/aprobacion";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  decision: z.enum(["aprobada", "rechazada", "cancelada"]),
  comentario: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(req, schema);
    const row = await resolveAprobacion({
      id,
      actor: user,
      decision: body.decision,
      comentario: body.comentario,
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleRouteError(e);
  }
}
