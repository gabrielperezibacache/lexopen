import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const fees = await prisma.feeArrangement.findMany({
    include: { cliente: true, causa: true, owner: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(fees);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
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
      ownerId: user?.id,
    },
    include: { cliente: true, causa: true },
  });
  return NextResponse.json(fee, { status: 201 });
}
