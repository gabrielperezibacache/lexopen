import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confidentialWhere, handleRouteError, requireUser } from "@/lib/api";
import { clientSiteWhere, confidentialFileWhere } from "@/lib/auth/access";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { ftsCausaIds } from "@/lib/search";
import {
  documentoListSelect,
  siteFileListSelect,
} from "@/lib/sites/file-select";

const textMatch = (q: string) => ({ contains: q, mode: "insensitive" as const });

const causaSearchSelect = {
  id: true,
  titulo: true,
  rit: true,
  ruc: true,
  tribunal: true,
  materia: true,
  estado: true,
  etapa: true,
  caratula: true,
  updatedAt: true,
};

const clienteSearchSelect = {
  id: true,
  razonSocial: true,
  rut: true,
  email: true,
  tipo: true,
  estado: true,
};

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
        files: [],
        documentos: [],
        tasks: [],
        jurisprudencia: [],
        wiki: [],
        minutas: [],
      });
    }

    const confFilter = confidentialFileWhere(user.role);
    const minutaFilter = confidentialWhere(user.role);

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
        select: {
          id: true,
          name: true,
          slug: true,
          tipo: true,
          description: true,
        },
        take: 10,
      });
      return NextResponse.json({
        sites,
        causas: [],
        clientes: [],
        tramites: [],
        files: [],
        documentos: [],
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
      files,
      documentos,
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
          select: {
            id: true,
            name: true,
            slug: true,
            tipo: true,
            description: true,
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
          select: causaSearchSelect,
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
          select: clienteSearchSelect,
          take: 10,
        }),
        prisma.tramite.findMany({
          where: {
            OR: [{ titulo: textMatch(q) }, { detalle: textMatch(q) }],
          },
          select: {
            id: true,
            titulo: true,
            estado: true,
            fechaLimite: true,
            causaId: true,
            causa: {
              select: {
                id: true,
                rit: true,
                titulo: true,
                clienteId: true,
                cliente: { select: { id: true, razonSocial: true } },
              },
            },
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
          select: {
            ...siteFileListSelect,
            site: { select: { id: true, name: true, slug: true } },
          },
          take: 10,
        }),
        prisma.documento.findMany({
          where: {
            AND: [
              minutaFilter,
              {
                OR: [
                  { nombre: textMatch(q) },
                  { ruta: textMatch(q) },
                  { tipo: textMatch(q) },
                  { extractedMarkdown: textMatch(q) },
                  { contenido: textMatch(q) },
                ],
              },
            ],
          },
          select: {
            ...documentoListSelect,
            causa: { select: { id: true, rit: true, titulo: true } },
            cliente: { select: { id: true, razonSocial: true } },
          },
          take: 10,
        }),
        prisma.task.findMany({
          where: {
            OR: [{ title: textMatch(q) }, { description: textMatch(q) }],
          },
          select: {
            id: true,
            title: true,
            status: true,
            siteId: true,
            site: { select: { id: true, name: true } },
          },
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
          select: {
            id: true,
            rol: true,
            caratula: true,
            tribunal: true,
            materia: true,
            fecha: true,
            tags: true,
          },
          take: 10,
        }),
        prisma.wikiPage.findMany({
          where: {
            OR: [{ title: textMatch(q) }, { content: textMatch(q) }],
          },
          select: {
            id: true,
            title: true,
            slug: true,
            siteId: true,
            site: { select: { id: true, name: true } },
          },
          take: 10,
        }),
        prisma.minuta.findMany({
          where: {
            AND: [
              minutaFilter,
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
          select: {
            id: true,
            titulo: true,
            tipo: true,
            causaId: true,
            fecha: true,
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
      files,
      documentos,
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
