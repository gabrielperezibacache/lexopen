import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireStaff, requireUser } from "@/lib/api";
import { confidentialFileWhere } from "@/lib/auth/access";
import { isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const fileWhere = confidentialFileWhere(user.role);
    const clientView = isCliente(user.role);
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        cliente: true,
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
        folders: { include: { children: true, files: { where: fileWhere } } },
        files: { where: { folderId: null, ...fileWhere }, orderBy: { updatedAt: "desc" }, take: 20 },
        wikiPages: { orderBy: { updatedAt: "desc" }, take: 10 },
        tasks: {
          where: clientView ? { assigneeId: user.id } : undefined,
          include: { assignee: { select: publicUserSelect } },
          orderBy: { dueDate: "asc" },
          take: 12,
        },
        isheets: { include: { _count: { select: { rows: true, columns: true } } } },
        qaThreads: {
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
        blogPosts: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: {
          select: { files: true, tasks: true, members: true, wikiPages: true },
        },
      },
    });
    if (!site) return NextResponse.json({ error: "Site no encontrado" }, { status: 404 });
    return NextResponse.json(site);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    await requireStaff();
    const { id } = await params;
    const body = await req.json();
    const site = await prisma.site.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        tipo: body.tipo,
        status: body.status,
        color: body.color,
        isClientVisible: body.isClientVisible,
      },
    });
    return NextResponse.json(site);
  } catch (e) {
    return handleRouteError(e);
  }
}
