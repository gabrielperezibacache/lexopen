import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q) {
    return NextResponse.json({ sites: [], causas: [], files: [], tasks: [], jurisprudencia: [], wiki: [] });
  }

  const [sites, causas, files, tasks, jurisprudencia, wiki] = await Promise.all([
    prisma.site.findMany({
      where: {
        OR: [{ name: { contains: q } }, { description: { contains: q } }, { slug: { contains: q } }],
      },
      take: 10,
    }),
    prisma.causa.findMany({
      where: {
        OR: [
          { titulo: { contains: q } },
          { rit: { contains: q } },
          { caratula: { contains: q } },
          { tribunal: { contains: q } },
        ],
      },
      take: 10,
    }),
    prisma.siteFile.findMany({
      where: {
        OR: [{ name: { contains: q } }, { tags: { contains: q } }, { contenido: { contains: q } }],
      },
      include: { site: true },
      take: 10,
    }),
    prisma.task.findMany({
      where: {
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      include: { site: true },
      take: 10,
    }),
    prisma.jurisprudencia.findMany({
      where: {
        OR: [
          { rol: { contains: q } },
          { caratula: { contains: q } },
          { doctrina: { contains: q } },
          { tags: { contains: q } },
        ],
      },
      take: 10,
    }),
    prisma.wikiPage.findMany({
      where: {
        OR: [{ title: { contains: q } }, { content: { contains: q } }],
      },
      include: { site: true },
      take: 10,
    }),
  ]);

  return NextResponse.json({ sites, causas, files, tasks, jurisprudencia, wiki, q });
}
