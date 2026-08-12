import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { classifyMovimiento } from "@/lib/pjud/classify";
import { fingerprint } from "@/lib/pjud/provider";
import { parseLocalDateInput } from "@/lib/minutas";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  parsePjudWebhookPayload,
  pjudWebhookConfigured,
  verifyPjudWebhookSignature,
} from "@/lib/pjud/webhook";

const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;

async function findCause(payload: ReturnType<typeof parsePjudWebhookPayload>) {
  if (payload.causaId) {
    return prisma.causa.findUnique({
      where: { id: payload.causaId },
      select: {
        id: true,
        rit: true,
        tribunal: true,
        pjudExternalKey: true,
        abogadoId: true,
        abogado: { select: { role: true } },
      },
    });
  }

  if (payload.externalKey) {
    const byExternalKey = await prisma.causa.findFirst({
      where: { pjudExternalKey: payload.externalKey },
      select: {
        id: true,
        rit: true,
        tribunal: true,
        pjudExternalKey: true,
        abogadoId: true,
        abogado: { select: { role: true } },
      },
    });
    if (byExternalKey) return byExternalKey;
  }

  if (payload.rit && payload.tribunal) {
    return prisma.causa.findFirst({
      where: { rit: payload.rit, tribunal: payload.tribunal },
      select: {
        id: true,
        rit: true,
        tribunal: true,
        pjudExternalKey: true,
        abogadoId: true,
        abogado: { select: { role: true } },
      },
    });
  }

  if (payload.ruc && payload.tribunal) {
    return prisma.causa.findFirst({
      where: { ruc: payload.ruc, tribunal: payload.tribunal },
      select: {
        id: true,
        rit: true,
        tribunal: true,
        pjudExternalKey: true,
        abogadoId: true,
        abogado: { select: { role: true } },
      },
    });
  }

  return null;
}

export async function POST(req: NextRequest) {
  if (!pjudWebhookConfigured()) {
    return NextResponse.json(
      { error: "Webhook PJUD no configurado" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: "El webhook PJUD supera el límite permitido" },
      { status: 413 }
    );
  }

  if (
    !verifyPjudWebhookSignature(
      rawBody,
      req.headers.get("x-pjud-timestamp"),
      req.headers.get("x-pjud-signature")
    )
  ) {
    return NextResponse.json({ error: "Firma PJUD inválida" }, { status: 401 });
  }

  try {
    const payload = parsePjudWebhookPayload(JSON.parse(rawBody));
    const causa = await findCause(payload);
    if (!causa) {
      return NextResponse.json(
        { error: "No se encontró una causa para el webhook PJUD" },
        { status: 404 }
      );
    }

    const movimientos = payload.movimientos.map((movement) => {
      const fecha = parseLocalDateInput(movement.fecha);
      if (!fecha) {
        throw new Error(`Fecha PJUD inválida: ${movement.fecha}`);
      }
      const classified = classifyMovimiento(
        movement.titulo,
        movement.detalle
      );
      const providerId = movement.externalId || movement.id;
      return {
        externalId: providerId
          ? `pjud:${providerId}`
          : `pjud:${fingerprint(
              movement.titulo,
              fecha,
              movement.referencia
            )}`,
        titulo: movement.titulo,
        detalle: movement.detalle || null,
        fecha,
        referencia: movement.referencia || null,
        tipo: classified.tipo,
        relevante: classified.relevante,
      };
    });

    const inserted = await prisma.$transaction(async (tx) => {
      const created = await tx.causaMovimiento.createMany({
        data: movimientos.map((movement) => ({
          causaId: causa.id,
          ...movement,
          fuente: "pjud",
        })),
        skipDuplicates: true,
      });
      const status = payload.status === "error" ? "error" : payload.status === "partial" ? "partial" : "ok";
      const note = `Webhook PJUD${payload.operationId ? ` ${payload.operationId}` : ""}: ${created.count} movimiento(s) nuevo(s).`;
      await tx.causa.update({
        where: { id: causa.id },
        data: {
          pjudMonitoreoActivo: true,
          pjudLastSyncAt: new Date(),
          pjudLastSyncStatus: status,
          pjudLastSyncNote: note,
          pjudExternalKey:
            causa.pjudExternalKey ||
            payload.externalKey ||
            `${causa.rit || payload.rit || payload.ruc || ""}|${causa.tribunal}`,
        },
      });

      const relevant = movimientos
        .filter((movement) => movement.relevante)
        .map((movement) => movement.titulo);
      if (
        created.count > 0 &&
        relevant.length > 0 &&
        causa.abogadoId &&
        causa.abogado?.role !== "cliente"
      ) {
        await tx.notification.create({
          data: {
            title: `Movimiento relevante · ${causa.rit || causa.id}`,
            body: relevant.slice(0, 3).join(" · "),
            href: `/causas/${causa.id}`,
            userId: causa.abogadoId,
          },
        });
      }

      if (created.count > 0) {
        await tx.activity.create({
          data: {
            tipo: "pjud",
            mensaje: `Webhook PJUD: +${created.count} movimiento(s)`,
            causaId: causa.id,
          },
        });
      }
      return created.count;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await writeAudit({
      action: "pjud.webhook",
      entityType: "Causa",
      entityId: causa.id,
      after: {
        operationId: payload.operationId || null,
        inserted,
        received: movimientos.length,
      },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });

    return NextResponse.json({
      ok: true,
      causaId: causa.id,
      inserted,
      skipped: movimientos.length - inserted,
      operationId: payload.operationId || null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON PJUD inválido" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook PJUD inválido" },
      { status: 400 }
    );
  }
}
