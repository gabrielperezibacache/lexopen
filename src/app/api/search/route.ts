import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireUser } from "@/lib/api";
import { clientSiteWhere } from "@/lib/auth/access";
import { canSeeConfidential, isCliente, isStaff } from "@/lib/auth/rbac";
import { ftsCausaIds } from "@/lib/search";

const textMatch = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) {
      return NextResponse.json({
        sites: [],
        causas: [],
        clientes: [],
        tramites: [],
        documentos: [],
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
          AND: [
            clientSiteWhere(user.id),
            {
              OR: [
                { name: textMatch(q) },
                { description: textMatch(q) },
              ],
            },
          ],
        },
        take: 10,
      });
      return NextResponse.json({
        sites,
        causas: [],
        clientes: [],
        tramites: [],
        documentos: [],
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

    const ftsIds = await ftsCausaIds(prisma, q, 10);

    const [
      sites,
      causas,
      clientes,
      tramites,
      documentos,
      files,
      tasks,
      jurisprudencia,
      wiki,
      minutas,
    ] = await Promise.all([
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
          where: ftsIds
            ? { id: { in: ftsIds } }
            : {
                OR: [
                  { titulo: textMatch(q) },
                  { rit: textMatch(q) },
                  { caratula: textMatch(q) },
                  { tribunal: textMatch(q) },
                ],
              },
          take: 10,
        }),
        prisma.cliente.findMany({
          where: {
            OR: [
              { razonSocial: textMatch(q) },
              { rut: textMatch(q) },
              { email: textMatch(q) },
              { notas: textMatch(q) },
            ],
          },
          take: 10,
        }),
        prisma.tramite.findMany({
          where: {
            OR: [{ titulo: textMatch(q) }, { detalle: textMatch(q) }],
          },
          include: {
            causa: {
              select: {
                id: true,
                rit: true,
                titulo: true,
                clienteId: true,
              },
            },
          },
          take: 10,
        }),
        prisma.documento.findMany({
          where: {
            AND: [
              confFilter,
              {
                OR: [
                  { nombre: textMatch(q) },
                  { contenido: textMatch(q) },
                  { tipo: textMatch(q) },
                ],
              },
            ],
          },
          include: {
            cliente: { select: { id: true, razonSocial: true } },
            causa: { select: { id: true, rit: true, titulo: true } },
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
      clientes,
      tramites,
      documentos,
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
