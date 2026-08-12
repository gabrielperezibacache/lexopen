import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { feeArrangementCreateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    await requireBillingManager();
    const fees = await prisma.feeArrangement.findMany({
      include: { cliente: true, causa: true, owner: { select: publicUserSelect } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(fees);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, feeArrangementCreateSchema);
    if (body.causaId && body.clienteId) {
      const causa = await prisma.causa.findUnique({
        where: { id: body.causaId },
        select: { clienteId: true },
      });
      if (!causa) {
        return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
      }
      if (causa.clienteId && causa.clienteId !== body.clienteId) {
        return NextResponse.json(
          { error: "La causa no pertenece al cliente indicado" },
          { status: 400 }
        );
      }
    }
    const fee = await prisma.feeArrangement.create({
      data: {
        name: body.name,
        tipo: body.tipo || "hourly",
        currency: body.currency || "CLP",
        rateHourlyClp: body.rateHourlyClp ?? null,
        rateHourlyUf: body.rateHourlyUf ?? null,
        flatFeeClp: body.flatFeeClp ?? null,
        retainerClp: body.retainerClp ?? null,
        cuotaLitisPct: body.cuotaLitisPct ?? null,
        billingCapClp: body.billingCapClp ?? null,
        notes: body.notes || null,
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
        ownerId: user.id,
      },
      include: { cliente: true, causa: true },
    });
    return NextResponse.json(fee, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
