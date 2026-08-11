import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET() {
  try {
    await requireStaff();
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
    const user = await requireStaff();
    const body = await req.json();
    const fee = await prisma.feeArrangement.create({
      data: {
        name: body.name,
        tipo: body.tipo || "hourly",
        currency: body.currency || "CLP",
        rateHourlyClp: body.rateHourlyClp != null ? Number(body.rateHourlyClp) : null,
        rateHourlyUf: body.rateHourlyUf != null ? Number(body.rateHourlyUf) : null,
        flatFeeClp: body.flatFeeClp != null ? Number(body.flatFeeClp) : null,
        retainerClp: body.retainerClp != null ? Number(body.retainerClp) : null,
        cuotaLitisPct: body.cuotaLitisPct != null ? Number(body.cuotaLitisPct) : null,
        billingCapClp: body.billingCapClp != null ? Number(body.billingCapClp) : null,
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
