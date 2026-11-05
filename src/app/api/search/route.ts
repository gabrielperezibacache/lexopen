import {
  confidentialWhere,
  handleRouteError,
  minutaConfidentialWhere,
  requireUser,
} from "@/lib/api";
import { clientSiteWhere, confidentialFileWhere } from "@/lib/auth/access";
import { causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere, requiredCausaWhere as scopedrequiredCausaWhere, siteAccessWhere as scopedsiteAccessWhere, siteFileReadWhere as scopedsiteFileReadWhere, siteRelatedWhere as scopedsiteRelatedWhere, taskAccessWhere as scopedtaskAccessWhere } from "@/lib/auth/causa-access";
import { clientSharedTagPrismaWhere } from "@/lib/auth/client-tags";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { ftsCausaIds, ftsDocumentoIds, ftsWikiIds } from "@/lib/search";
import {
  documentoListSelect,
  siteFileListSelect,
} from "@/lib/sites/file-select";
import { NextRequest, NextResponse } from "next/server";

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
  site: { select: { id: true, name: true } },
};

const clienteSearchSelect = {
  id: true,
  razonSocial: true,
  rut: true,
  email: true,
  tipo: true,
  estado: true,
  _count: { select: { sites: true } },
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (q.length > 200) {
      return NextResponse.json({ error: "La búsqueda no puede superar 200 caracteres" }, { status: 400 });
    }
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

    const confFilter = confidentialFileWhere(user);
    const docFilter = confidentialWhere(user);
    const minutaFilter = minutaConfidentialWhere(user);

    if (isCliente(user.role)) {
      const [sites, files, tasks] = await Promise.all([
        prisma.site.findMany({
          where: { AND: [scopedsiteAccessWhere(user), {
            AND: [
              clientSiteWhere(user.id),
              {
                OR: [
                  { name: textMatch(q) },
                  { description: textMatch(q) },
                ],
              },
            ],
          }] },
          select: {
            id: true,
            name: true,
            slug: true,
            tipo: true,
            description: true,
          },
          take: 10,
        }),
        prisma.siteFile.findMany({
          where: { AND: [scopedsiteFileReadWhere(user), {
            AND: [
              { site: clientSiteWhere(user.id) },
              { confidencial: false, privilegio: false },
              clientSharedTagPrismaWhere(),
              {
                OR: [
                  { name: textMatch(q) },
                  { tags: textMatch(q) },
                  { contenido: textMatch(q) },
                ],
              },
            ],
          }] },
          select: {
            ...siteFileListSelect,
            site: { select: { id: true, name: true, slug: true } },
          },
          take: 10,
        }),
        prisma.task.findMany({
          where: { AND: [scopedtaskAccessWhere(user), {
            AND: [
              { site: clientSiteWhere(user.id) },
              { assigneeId: user.id },
              {
                OR: [{ title: textMatch(q) }, { description: textMatch(q) }],
              },
            ],
          }] },
          select: {
            id: true,
            title: true,
            status: true,
            siteId: true,
            site: { select: { id: true, name: true } },
          },
          take: 10,
        }),
      ]);
      return NextResponse.json({
        sites,
        causas: [],
        clientes: [],
        tramites: [],
        files,
        documentos: [],
        tasks,
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

    const causaScope = scopedcausaAccessWhere(user);
    const documentoScope = { AND: [scopeddocumentReadWhere(user), docFilter] };
    const wikiScope = scopedsiteRelatedWhere(user);
    const [ftsIds, docFtsIds, wikiFtsIds] = await Promise.all([
      ftsCausaIds(prisma, q, ids => prisma.causa.findMany({
        where: { AND: [causaScope, { id: { in: ids } }] }, select: { id: true },
      }), 10),
      ftsDocumentoIds(prisma, q, ids => prisma.documento.findMany({
        where: { AND: [documentoScope, { id: { in: ids } }] }, select: { id: true },
      }), 10),
      ftsWikiIds(prisma, q, ids => prisma.wikiPage.findMany({
        where: { AND: [wikiScope, { id: { in: ids } }] }, select: { id: true },
      }), 10),
    ]);

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
          where: { AND: [scopedsiteAccessWhere(user), {
            OR: [
              { name: textMatch(q) },
              { description: textMatch(q) },
              { slug: textMatch(q) },
            ],
          }] },
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
          where: { AND: [
            causaScope,
            ftsIds?.length
              ? { id: { in: ftsIds } }
              : {
                  OR: [
                    { titulo: textMatch(q) },
                    { rit: textMatch(q) },
                    { caratula: textMatch(q) },
                    { tribunal: textMatch(q) },
                  ],
                },
          ] },
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
          where: { AND: [scopedrequiredCausaWhere(user), {
            OR: [{ titulo: textMatch(q) }, { detalle: textMatch(q) }],
          }] },
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
          where: { AND: [scopedsiteFileReadWhere(user), {
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
          }] },
          select: {
            ...siteFileListSelect,
            site: { select: { id: true, name: true, slug: true } },
          },
          take: 10,
        }),
        prisma.documento.findMany({
          where: { AND: [
            documentoScope,
            docFtsIds?.length
              ? { id: { in: docFtsIds } }
              : {
                  OR: [
                    { nombre: textMatch(q) },
                    { ruta: textMatch(q) },
                    { tipo: textMatch(q) },
                    { extractedMarkdown: textMatch(q) },
                    { contenido: textMatch(q) },
                  ],
                },
          ] },
          select: {
            ...documentoListSelect,
            causa: { select: { id: true, rit: true, titulo: true } },
            cliente: { select: { id: true, razonSocial: true } },
          },
          take: 10,
        }),
        prisma.task.findMany({
          where: { AND: [scopedtaskAccessWhere(user), {
            OR: [{ title: textMatch(q) }, { description: textMatch(q) }],
          }] },
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
          where: { AND: [wikiScope, wikiFtsIds?.length
            ? { id: { in: wikiFtsIds } }
            : {
                OR: [{ title: textMatch(q) }, { content: textMatch(q) }],
              }] },
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
          where: { AND: [scopedrequiredCausaWhere(user), {
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
          }] },
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
