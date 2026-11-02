import { assertCsrf, handleRouteError, parseBody, requireSiteAccess, requireStaff, requireUser } from "@/lib/api";
import { clientVisibleFileWhere, requireSiteMutationAccess } from "@/lib/auth/access";
import { assertCausaCapability, causaAccessWhere as scopedcausaAccessWhere, siteAccessWhere as scopedsiteAccessWhere, siteFileReadWhere as scopedsiteFileReadWhere, siteRelatedWhere as scopedsiteRelatedWhere, taskAccessWhere as scopedtaskAccessWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { siteUpdateSchema } from "@/lib/schemas";
import { siteFileListSelect } from "@/lib/sites/file-select";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const fileWhere = clientVisibleFileWhere(user);
    const clientView = isCliente(user.role);
    const site = await prisma.site.findFirst({
      where: { AND: [scopedsiteAccessWhere(user), { id }] },
      include: {
        cliente: clientView
          ? { select: { id: true, razonSocial: true } }
          : true,
        causa: clientView
          ? {
              select: {
                id: true,
                titulo: true,
                rit: true,
                ruc: true,
                tribunal: true,
                materia: true,
                procedimiento: true,
                estado: true,
                etapa: true,
                caratula: true,
              },
            }
          : { include: { partes: true, plazos: true } },
        members: {
          where: clientView ? { user: { role: "cliente" } } : undefined,
          include: { user: { select: publicUserSelect } },
        },
        folders: {
          include: {
            children: true,
            files: { where: { AND: [scopedsiteFileReadWhere(user), fileWhere] }, select: siteFileListSelect },
          },
        },
        files: {
          where: { AND: [scopedsiteFileReadWhere(user), { folderId: null, ...fileWhere }] },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: siteFileListSelect,
        },
        // Clients must not receive internal knowledge bases via API.
        wikiPages: clientView
          ? { where: { id: "__client_hidden__" } }
          : {
              orderBy: { updatedAt: "desc" },
              take: 10,
              select: {
                id: true,
                title: true,
                slug: true,
                published: true,
                updatedAt: true,
              },
            },
        tasks: {
          where: { AND: [scopedtaskAccessWhere(user), (clientView ? { assigneeId: user.id } : undefined) ?? {}] },
          include: { assignee: { select: publicUserSelect } },
          orderBy: { dueDate: "asc" },
          take: 12,
        },
        isheets: clientView
          ? { where: { id: "__client_hidden__" } }
          : { include: { _count: { select: { rows: true, columns: true } } } },
        qaThreads: {
          where: { AND: [scopedsiteRelatedWhere(user), (clientView ? { status: "open" } : undefined) ?? {}] },
          include: { _count: { select: { posts: true } } },
          orderBy: { updatedAt: "desc" },
          take: 8,
        },
        workflows: clientView
          ? { where: { id: "__client_hidden__" } }
          : { include: { instances: { take: 5, orderBy: { createdAt: "desc" } } } },
        activities: {
          where: clientView ? { id: "__client_hidden__" } : undefined,
          include: { user: { select: publicUserSelect } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        blogPosts: clientView
          ? { where: { id: "__client_hidden__" } }
          : {
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                title: true,
                createdAt: true,
              },
            },
        _count: clientView
          ? {
              select: {
                tasks: true,
                members: true,
              },
            }
          : {
              select: { files: true, tasks: true, members: true, wikiPages: true },
            },
      },
    });
    if (!site) return NextResponse.json({ error: "Site no encontrado" }, { status: 404 });

    if (clientView) {
      const visibleFiles = await prisma.siteFile.count({
        where: { AND: [scopedsiteFileReadWhere(user), { siteId: id, ...fileWhere }] },
      });
      return NextResponse.json({
        ...site,
        _count: {
          ...site._count,
          files: visibleFiles,
          wikiPages: 0,
        },
      });
    }

    return NextResponse.json(site);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const actor = await requireStaff();
    const { id } = await params;
    await requireSiteMutationAccess(id, actor);
    const body = await parseBody(req, siteUpdateSchema);
    if (body.isClientVisible !== undefined && !isAdmin(actor)) {
      return NextResponse.json(
        { error: "Solo admin puede cambiar la visibilidad del portal cliente" },
        { status: 403 }
      );
    }

    let clienteId = body.clienteId;

    if (body.causaId) {
      await assertCausaCapability(body.causaId, actor, "causa.write");
      const existing = await prisma.site.findFirst({
        where: { AND: [scopedsiteAccessWhere(actor), { causaId: body.causaId, NOT: { id } }] },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Esta causa ya tiene un espacio vinculado" },
          { status: 409 }
        );
      }
      const causa = await prisma.causa.findFirst({
        where: { AND: [scopedcausaAccessWhere(actor), { id: body.causaId }] },
        select: { clienteId: true },
      });
      if (!causa) {
        return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
      }
      if (clienteId && causa.clienteId && clienteId !== causa.clienteId) {
        return NextResponse.json(
          { error: "La causa no pertenece al cliente seleccionado" },
          { status: 400 }
        );
      }
      if (clienteId === undefined && causa.clienteId) {
        clienteId = causa.clienteId;
      }
    }

    const site = await prisma.site.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.isClientVisible !== undefined
          ? { isClientVisible: Boolean(body.isClientVisible) }
          : {}),
        ...(body.clienteId !== undefined || clienteId !== undefined
          ? { clienteId: (clienteId ?? body.clienteId) || null }
          : {}),
        ...(body.causaId !== undefined ? { causaId: body.causaId || null } : {}),
      },
    });

    await prisma.activity.create({
      data: {
        tipo: "sistema",
        mensaje: `Espacio actualizado: ${site.name}`,
        siteId: site.id,
        userId: actor.id,
      },
    });

    return NextResponse.json(site);
  } catch (e) {
    return handleRouteError(e);
  }
}
