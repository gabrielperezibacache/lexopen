import { assertCsrf, handleRouteError, parseBody, requireStaff, requireUser } from "@/lib/api";
import { clientSiteWhere, clientVisibleFileWhere } from "@/lib/auth/access";
import { assertCausaCapability, siteAccessWhere as scopedsiteAccessWhere, siteFileReadWhere as scopedsiteFileReadWhere, siteRelatedWhere as scopedsiteRelatedWhere, taskAccessWhere as scopedtaskAccessWhere } from "@/lib/auth/causa-access";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { siteCreateSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const tipo = req.nextUrl.searchParams.get("tipo");
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const where = {
      AND: [
        tipo ? { tipo } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
                { slug: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {},
        isCliente(user.role) ? clientSiteWhere(user.id) : {},
      ],
    };
    const sites = isCliente(user.role)
      ? await prisma.site.findMany({
          where: { AND: [scopedsiteAccessWhere(user), where] },
          select: {
            id: true,
            name: true,
            description: true,
            tipo: true,
            color: true,
            isClientVisible: true,
            updatedAt: true,
            cliente: { select: { razonSocial: true } },
            _count: {
              select: {
                files: { where: clientVisibleFileWhere(user) },
                tasks: { where: { assigneeId: user.id } },
                members: { where: { user: { role: "cliente" } } },
                isheets: { where: { id: "__client_hidden__" } },
                qaThreads: { where: { status: "open" } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : await prisma.site.findMany({
          where: { AND: [scopedsiteAccessWhere(user), where] },
          include: {
            cliente: true,
            causa: true,
            _count: {
              select: {
                files: { where: scopedsiteFileReadWhere(user) },
                tasks: { where: scopedtaskAccessWhere(user) },
                members: true,
                isheets: true,
                qaThreads: { where: scopedsiteRelatedWhere(user) },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        });
    return NextResponse.json(sites);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, siteCreateSchema);
    if (body.isClientVisible && !isAdmin(user)) return NextResponse.json({ error: "Solo un administrador puede abrir el portal" }, { status: 403 });
    if (body.causaId) await assertCausaCapability(body.causaId, user, "causa.write");
    if (body.causaId) {
      const existing = await prisma.site.findFirst({
        where: { AND: [scopedsiteAccessWhere(user), { causaId: body.causaId }] },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Esta causa ya tiene un espacio vinculado" },
          { status: 409 }
        );
      }
    }
    const slug =
      body.slug ||
      String(body.name || "site")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const site = await prisma.site.create({
      data: {
        name: body.name,
        slug: `${slug}-${Date.now().toString(36)}`,
        description: body.description || null,
        tipo: body.tipo || "matter",
        color: body.color || "#1f6f78",
        isClientVisible: Boolean(body.isClientVisible),
        clienteId: body.clienteId || null,
        causaId: body.causaId || null,
        members: { create: { userId: user.id, role: "admin" } },
      },
    });

    await prisma.activity.create({
      data: {
        tipo: "sistema",
        mensaje: `Site creado: ${site.name}`,
        siteId: site.id,
        userId: user.id,
      },
    });

    return NextResponse.json(site, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
