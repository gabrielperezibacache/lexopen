import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_HOURLY_CLP } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const unbilled = req.nextUrl.searchParams.get("unbilled");
  const causaId = req.nextUrl.searchParams.get("causaId");
  const entries = await prisma.timeEntry.findMany({
    where: {
      AND: [
        unbilled === "1" ? { billable: true, billed: false } : {},
        causaId ? { causaId } : {},
      ],
    },
    include: { user: true, causa: true, cliente: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json();
  const hours = Number(body.hours);
  let rateClp = body.rateClp != null ? Number(body.rateClp) : null;

  if (rateClp == null && body.causaId) {
    const fee = await prisma.feeArrangement.findFirst({
      where: { causaId: body.causaId, active: true, tipo: { in: ["hourly", "mixed"] } },
      orderBy: { startDate: "desc" },
    });
    rateClp = fee?.rateHourlyClp ?? DEFAULT_HOURLY_CLP;
  }
  if (rateClp == null) rateClp = DEFAULT_HOURLY_CLP;

  const amountClp = Math.round(hours * rateClp);
  const entry = await prisma.timeEntry.create({
    data: {
      date: body.date ? new Date(body.date) : new Date(),
      hours,
      description: body.description,
      billable: body.billable !== false,
      rateClp,
      amountClp,
      activityCode: body.activityCode || "general",
      userId: body.userId || user?.id || (await prisma.user.findFirst())!.id,
      clienteId: body.clienteId || null,
      causaId: body.causaId || null,
    },
    include: { user: true, causa: true, cliente: true },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const entry = await prisma.timeEntry.update({
    where: { id: body.id },
    data: {
      billed: body.billed,
      billable: body.billable,
      description: body.description,
      hours: body.hours,
      amountClp: body.amountClp,
    },
  });
  return NextResponse.json(entry);
}
