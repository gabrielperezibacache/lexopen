import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  httpError,
  parseBody,
  requireBillingManager,
  requireStaff,
} from "@/lib/api";
import { canManageBilling } from "@/lib/auth/rbac";
import { DEFAULT_HOURLY_CLP } from "@/lib/billing";
import { ufToClp } from "@/lib/uf";
import { timeEntrySchema } from "@/lib/schemas";
import { publicUserSelect } from "@/lib/auth/public-user";
import { downloadResponseHeaders } from "@/lib/security/download";

function minutesBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const unbilled = req.nextUrl.searchParams.get("unbilled");
    const causaId = req.nextUrl.searchParams.get("causaId");
    const entries = await prisma.timeEntry.findMany({
      where: {
        AND: [
          unbilled === "1" ? { billable: true, billed: false } : {},
          causaId ? { causaId } : {},
          canManageBilling(user.role) ? {} : { userId: user.id },
        ],
      },
      include: { user: { select: publicUserSelect }, causa: true, cliente: true },
      orderBy: { date: "desc" },
    });
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const csv = [
        ["fecha", "descripcion", "causa", "cliente", "usuario", "horas", "monto_clp", "facturable", "facturado", "aprobado"].join(","),
        ...entries.map((e) =>
          [
            e.date.toISOString().slice(0, 10),
            e.description,
            e.causa?.rit || e.causa?.titulo || "",
            e.cliente?.razonSocial || "",
            e.user.name,
            e.hours,
            e.amountClp,
            e.billable,
            e.billed,
            e.approved,
          ]
            .map(escape)
            .join(",")
        ),
      ].join("\n");
      return new NextResponse(csv, {
        headers: downloadResponseHeaders("time-entries.csv", "text/csv"),
      });
    }
    return NextResponse.json(entries);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
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
      rateClp =
        fee?.rateHourlyClp ??
        (fee?.rateHourlyUf ? await ufToClp(fee.rateHourlyUf, body.date ? new Date(body.date) : new Date()) : null) ??
        DEFAULT_HOURLY_CLP;
    }
    if (rateClp == null) rateClp = DEFAULT_HOURLY_CLP;

    const amountClp = Math.round(hours * rateClp);
    const targetUserId =
      body.userId && body.userId !== user.id
        ? canManageBilling(user.role)
          ? body.userId
          : null
        : user.id;
    if (body.userId && body.userId !== user.id && !targetUserId) {
      throw httpError("Solo facturación puede cargar horas de otro usuario", 403);
    }
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
        userId: targetUserId || user.id,
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
      },
      include: { user: { select: publicUserSelect }, causa: true, cliente: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const body = await req.json();
    if (body.action === "approve" || body.action === "reject") {
      const user = await requireBillingManager();
      const entry = await prisma.timeEntry.update({
        where: { id: body.id },
        data: {
          approved: body.action === "approve",
          approverId: body.action === "approve" ? user.id : null,
        },
        include: {
          user: { select: publicUserSelect },
          causa: true,
          cliente: true,
          approver: { select: publicUserSelect },
        },
      });
      return NextResponse.json(entry);
    }

    const user = await requireStaff();
    if (body.action === "stop" && body.id) {
      const current = await prisma.timeEntry.findUnique({ where: { id: body.id } });
      if (!current?.startedAt) {
        return NextResponse.json({ error: "Timer no iniciado" }, { status: 400 });
      }
      if (current.userId !== user.id && !canManageBilling(user.role)) {
        return NextResponse.json(
          { error: "Solo puede detener sus propios timers" },
          { status: 403 }
        );
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

    // Marking billed / adjusting amounts is a billing-manager concern.
    if (
      body.billed !== undefined ||
      body.amountClp !== undefined ||
      body.hours !== undefined
    ) {
      await requireBillingManager();
    } else if (body.billable !== undefined || body.description !== undefined) {
      const current = await prisma.timeEntry.findUnique({ where: { id: body.id } });
      if (!current) {
        return NextResponse.json({ error: "Entrada no encontrada" }, { status: 404 });
      }
      if (current.userId !== user.id && !canManageBilling(user.role)) {
        return NextResponse.json({ error: "Prohibido" }, { status: 403 });
      }
    } else {
      await requireBillingManager();
    }

    const current = await prisma.timeEntry.findUnique({ where: { id: body.id } });
    if (!current) {
      return NextResponse.json({ error: "Entrada no encontrada" }, { status: 404 });
    }
    if (current.invoiceId && (body.hours !== undefined || body.amountClp !== undefined)) {
      return NextResponse.json(
        { error: "No se pueden ajustar horas/monto de una entrada ya facturada" },
        { status: 409 }
      );
    }
    if (body.billed === true && !current.invoiceId && body.invoiceId == null) {
      return NextResponse.json(
        { error: "Marcar como facturado requiere una factura asociada" },
        { status: 400 }
      );
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
