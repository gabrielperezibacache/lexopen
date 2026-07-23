import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get("tipo");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const sites = await prisma.site.findMany({
    where: {
      AND: [
        tipo ? { tipo } : {},
        q
          ? {
              OR: [
                { name: { contains: q } },
                { description: { contains: q } },
                { slug: { contains: q } },
              ],
            }
          : {},
      ],
    },
    include: {
      cliente: true,
      causa: true,
      _count: {
        select: {
          files: true,
          tasks: true,
          members: true,
          isheets: true,
          qaThreads: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json();
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
      members: user
        ? { create: { userId: user.id, role: "admin" } }
        : undefined,
    },
  });

  await prisma.activity.create({
    data: {
      tipo: "sistema",
      mensaje: `Site creado: ${site.name}`,
      siteId: site.id,
      userId: user?.id,
    },
  });

  return NextResponse.json(site, { status: 201 });
}
