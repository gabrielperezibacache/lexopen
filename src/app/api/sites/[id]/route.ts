import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      cliente: true,
      causa: { include: { partes: true, plazos: true } },
      members: { include: { user: true } },
      folders: { include: { children: true, files: true } },
      files: { where: { folderId: null }, orderBy: { updatedAt: "desc" }, take: 20 },
      wikiPages: { orderBy: { updatedAt: "desc" }, take: 10 },
      tasks: {
        include: { assignee: true },
        orderBy: { dueDate: "asc" },
        take: 12,
      },
      isheets: { include: { _count: { select: { rows: true, columns: true } } } },
      qaThreads: {
        include: { _count: { select: { posts: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      },
      workflows: { include: { instances: { take: 5, orderBy: { createdAt: "desc" } } } },
      activities: {
        include: { user: true },
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
}

export async function PATCH(req: NextRequest, { params }: Params) {
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
}
