import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { DEFAULT_HOURLY_CLP } from "@/lib/billing";
import { timeEntrySchema } from "@/lib/schemas";

function minutesBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
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
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireStaff();
    const body = await parseBody(req, timeEntrySchema);
    const timerStartedAt = body.timerStartedAt ? new Date(body.timerStartedAt) : null;
    const timerStoppedAt =
      body.timerStoppedAt || body.stoppedAt || body.stopTimer
        ? new Date(body.timerStoppedAt || body.stoppedAt || Date.now())
        : null;
    const timerMinutes =
      timerStartedAt && timerStoppedAt ? minutesBetween(timerStartedAt, timerStoppedAt) : null;
    const hours = body.hours ?? (timerMinutes != null ? timerMinutes / 60 : 0);
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
        startedAt: timerStartedAt && !timerStoppedAt ? timerStartedAt : null,
        userId: body.userId || user.id,
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
      },
      include: { user: true, causa: true, cliente: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireStaff();
    const body = await req.json();
    if (body.action === "approve" || body.action === "reject") {
      const entry = await prisma.timeEntry.update({
        where: { id: body.id },
        data: {
          approved: body.action === "approve",
          approverId: body.action === "approve" ? user.id : null,
        },
        include: { user: true, causa: true, cliente: true, approver: true },
      });
      return NextResponse.json(entry);
    }

    if (body.action === "stop" && body.id) {
      const current = await prisma.timeEntry.findUnique({ where: { id: body.id } });
      if (!current?.startedAt) {
        return NextResponse.json({ error: "Timer no iniciado" }, { status: 400 });
      }
      const stoppedAt = body.stoppedAt ? new Date(body.stoppedAt) : new Date();
      const hours = minutesBetween(current.startedAt, stoppedAt) / 60;
      const rateClp = current.rateClp ?? DEFAULT_HOURLY_CLP;
      const entry = await prisma.timeEntry.update({
        where: { id: body.id },
        data: {
          hours,
          amountClp: Math.round(hours * rateClp),
          startedAt: null,
        },
      });
      return NextResponse.json(entry);
    }

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
  } catch (e) {
    return handleRouteError(e);
  }
}
