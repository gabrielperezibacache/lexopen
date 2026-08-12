import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { clienteUpdateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        abogado: { select: { id: true, name: true, email: true } },
        documentos: {
          orderBy: { updatedAt: "desc" },
          include: { autor: { select: { id: true, name: true } } },
        },
        causas: {
          orderBy: { updatedAt: "desc" },
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

    const tramitesPendientes = cliente.causas.reduce(
      (n, c) =>
        n + c.tramites.filter((t) => TRAMITES_ABIERTOS.includes(t.estado as "pendiente" | "en_curso")).length,
      0
    );
    const tramitesHechos = cliente.causas.reduce(
      (n, c) => n + c.tramites.filter((t) => t.estado === "hecho").length,
      0
    );

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
    const body = await parseBody(req, clienteUpdateSchema);
    const existing = await prisma.cliente.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const email =
      body.email === undefined
        ? undefined
        : body.email === "" || body.email == null
          ? null
          : body.email;

    const cliente = await prisma.cliente.update({
      where: { id },
      data: {
        ...(body.razonSocial !== undefined
          ? { razonSocial: body.razonSocial.trim() }
          : {}),
        ...(body.rut !== undefined ? { rut: body.rut || null } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(body.telefono !== undefined
          ? { telefono: body.telefono || null }
          : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
        ...(body.notas !== undefined ? { notas: body.notas || null } : {}),
        ...(body.abogadoId !== undefined
          ? { abogadoId: body.abogadoId || null }
          : {}),
      },
    });

    await writeAudit({
      actorId: user.id,
      action: "cliente.update",
      entityType: "Cliente",
      entityId: id,
      before: existing,
      after: cliente,
    });

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
    const existing = await prisma.cliente.findUnique({
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
    await prisma.cliente.delete({ where: { id } });
    await writeAudit({
      actorId: user.id,
      action: "cliente.delete",
      entityType: "Cliente",
      entityId: id,
      before: existing,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
