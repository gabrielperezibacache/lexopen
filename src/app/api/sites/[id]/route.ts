import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireStaff, requireUser } from "@/lib/api";
import { clientVisibleFileWhere } from "@/lib/auth/access";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { siteFileListSelect } from "@/lib/sites/file-select";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const fileWhere = clientVisibleFileWhere(user.role);
    const clientView = isCliente(user.role);
    const site = await prisma.site.findUnique({
      where: { id },
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
            files: { where: fileWhere, select: siteFileListSelect },
          },
        },
        files: {
          where: { folderId: null, ...fileWhere },
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
          where: clientView ? { assigneeId: user.id } : undefined,
          include: { assignee: { select: publicUserSelect } },
          orderBy: { dueDate: "asc" },
          take: 12,
        },
        isheets: clientView
          ? { where: { id: "__client_hidden__" } }
          : { include: { _count: { select: { rows: true, columns: true } } } },
        qaThreads: {
          where: clientView ? { status: "open" } : undefined,
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
        where: { siteId: id, ...fileWhere },
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
    await requireSiteAccess(id, actor);
    const body = await req.json();
    if (body.isClientVisible !== undefined && !isAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Solo admin puede cambiar la visibilidad del portal cliente" },
        { status: 403 }
      );
    }
    const site = await prisma.site.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        tipo: body.tipo,
        status: body.status,
        color: body.color,
        ...(body.isClientVisible !== undefined
          ? { isClientVisible: Boolean(body.isClientVisible) }
          : {}),
      },
    });
    return NextResponse.json(site);
  } catch (e) {
    return handleRouteError(e);
  }
}
