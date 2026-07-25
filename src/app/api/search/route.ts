import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireUser } from "@/lib/api";
import { canSeeConfidential, isCliente, isStaff } from "@/lib/auth/rbac";

const textMatch = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) {
      return NextResponse.json({
        sites: [],
        causas: [],
        files: [],
        tasks: [],
        jurisprudencia: [],
        wiki: [],
        minutas: [],
      });
    }

    const confFilter = canSeeConfidential(user.role)
      ? {}
      : { confidencial: false };

    if (isCliente(user.role)) {
      const sites = await prisma.site.findMany({
        where: {
          isClientVisible: true,
          OR: [
            { name: textMatch(q) },
            { description: textMatch(q) },
          ],
        },
        take: 10,
      });
      return NextResponse.json({
        sites,
        causas: [],
        files: [],
        tasks: [],
        jurisprudencia: [],
        wiki: [],
        minutas: [],
        q,
        scope: "portal",
      });
    }

    if (!isStaff(user.role)) {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    const [sites, causas, files, tasks, jurisprudencia, wiki, minutas] =
      await Promise.all([
        prisma.site.findMany({
          where: {
            OR: [
              { name: textMatch(q) },
              { description: textMatch(q) },
              { slug: textMatch(q) },
            ],
          },
          take: 10,
        }),
        prisma.causa.findMany({
          where: {
            OR: [
              { titulo: textMatch(q) },
              { rit: textMatch(q) },
              { caratula: textMatch(q) },
              { tribunal: textMatch(q) },
            ],
          },
          take: 10,
        }),
        prisma.siteFile.findMany({
          where: {
            AND: [
              confFilter,
              {
                OR: [
                  { name: textMatch(q) },
                  { tags: textMatch(q) },
                  { contenido: textMatch(q) },
                ],
              },
            ],
          },
          include: { site: true },
          take: 10,
        }),
        prisma.task.findMany({
          where: {
            OR: [{ title: textMatch(q) }, { description: textMatch(q) }],
          },
          include: { site: true },
          take: 10,
        }),
        prisma.jurisprudencia.findMany({
          where: {
            OR: [
              { rol: textMatch(q) },
              { caratula: textMatch(q) },
              { doctrina: textMatch(q) },
              { tags: textMatch(q) },
            ],
          },
          take: 10,
        }),
        prisma.wikiPage.findMany({
          where: {
            OR: [{ title: textMatch(q) }, { content: textMatch(q) }],
          },
          include: { site: true },
          take: 10,
        }),
        prisma.minuta.findMany({
          where: {
            AND: [
              confFilter,
              {
                OR: [
                  { titulo: textMatch(q) },
                  { resumenEjecutivo: textMatch(q) },
                  { hechosRelevantes: textMatch(q) },
                  { acuerdos: textMatch(q) },
                  { participantes: textMatch(q) },
                ],
              },
            ],
          },
          include: {
            causa: { select: { id: true, rit: true, titulo: true } },
          },
          take: 10,
        }),
      ]);

    return NextResponse.json({
      sites,
      causas,
      files,
      tasks,
      jurisprudencia,
      wiki,
      minutas,
      q,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
