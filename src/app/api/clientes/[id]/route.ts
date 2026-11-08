import { offlineVersion } from "@/lib/offline/schemas";
import { updateClienteRecord } from "@/lib/clientes/mutations";
import { serializable } from "@/lib/command-execution";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import {
  assertCsrf,
  confidentialWhere,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { causaAccessWhere, documentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { clienteUpdateSchema } from "@/lib/schemas";
import { documentoListSelect } from "@/lib/sites/file-select";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        abogado: { select: { id: true, name: true, email: true } },
        documentos: {
          where: { AND: [documentReadWhere(user), confidentialWhere(user)] },
          orderBy: { updatedAt: "desc" },
          select: {
            ...documentoListSelect,
            autor: { select: { id: true, name: true } },
          },
        },
        causas: {
          where: causaAccessWhere(user),          orderBy: { updatedAt: "desc" },
          include: {
            abogado: { select: { id: true, name: true } },
            tramites: {
              orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
              include: {
                responsable: { select: { id: true, name: true } },
              },
            },
            _count: {
              select: {
                documentos: true,
                plazos: true,
                movimientos: true,
              },
            },
          },
        },
      },
    });
    if (!cliente) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // ⚡ Bolt: Calculate multiple counts in a single O(N) pass to avoid redundant iteration and memory overhead.
    let tramitesPendientes = 0;
    let tramitesHechos = 0;
    for (const c of cliente.causas) {
      for (const t of c.tramites) {
        if (t.estado === "hecho") {
          tramitesHechos++;
        } else if (TRAMITES_ABIERTOS.includes(t.estado as "pendiente" | "en_curso")) {
          tramitesPendientes++;
        }
      }
    }

    return NextResponse.json({
      ...cliente,
      resumen: {
        causas: cliente.causas.length,
        documentos: cliente.documentos.length,
        tramitesPendientes,
        tramitesHechos,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(req, clienteUpdateSchema.extend({ expectedVersion: offlineVersion.optional() }));
    const cliente = await serializable(tx => updateClienteRecord(user, id, body, tx, body.expectedVersion));
    return NextResponse.json(cliente);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    return await serializable(async tx => {
    await currentStaffActor(user, tx);
    const existing = await tx.cliente.findUnique({
      where: { id },
      include: { _count: { select: { causas: true, invoices: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (existing._count.causas > 0 || existing._count.invoices > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: el cliente tiene causas o facturas. Márquelo como inactivo.",
        },
        { status: 409 }
      );
    }
    await tx.cliente.delete({ where: { id } });
    await writeAuditStrict({
      actorId: user.id,
      action: "cliente.delete",
      entityType: "Cliente",
      entityId: id,
      before: existing,
    }, tx);
    return NextResponse.json({ ok: true });
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
