import { causaAccessWhere, documentReadWhere, plazoAccessWhere, siteAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { minutaConfidentialWhere } from "@/lib/api";
import { getObject } from "@/lib/storage";
import { buildClienteFolderContext } from "@/lib/integrations/client-folder-context";
import { readCaseStatus } from "@/lib/causas/status-service";

async function textFromDoc(doc: {
  nombre: string;
  mimeType: string | null;
  contenido: string | null;
  extractedMarkdown?: string | null;
  storageKey: string | null;
}) {
  if (doc.extractedMarkdown?.trim()) {
    return doc.extractedMarkdown.trim().slice(0, 8000);
  }
  if (doc.contenido?.trim()) return doc.contenido.trim().slice(0, 8000);
  if (!doc.storageKey) return "";
  const mime = doc.mimeType || "";
  if (!/^text\//i.test(mime) && !/\.(txt|md|csv|json)$/i.test(doc.nombre)) {
    return `[Binario: ${doc.nombre}]`;
  }
  try {
    const buf = await getObject(doc.storageKey);
    return buf ? buf.toString("utf8").slice(0, 8000) : "";
  } catch {
    return "";
  }
}

export async function buildActionContext(opts: {
  action: string;
  userRole: string;
  user: CausaAccessUser;
  causaId?: string | null;
  clienteId?: string | null;
  documentoId?: string | null;
  siteId?: string | null;
  extra?: Record<string, unknown>;
}) {
  if (opts.action === "causa.estado") {
    if (!opts.causaId) throw httpError("Seleccione una causa para conocer su estado", 400);
    return JSON.stringify({ caseStatus: await readCaseStatus(opts.causaId, opts.user) });
  }
  const parts: unknown[] = [];

  if (opts.clienteId) {
    const folder = await buildClienteFolderContext(opts.clienteId, opts.user);
    if (folder) parts.push(JSON.parse(folder.context));
  }

  if (opts.causaId) {
    const causa = await prisma.causa.findFirst({
      where: { id: opts.causaId, ...causaAccessWhere(opts.user) },
      include: {
        cliente: { select: { id: true, razonSocial: true, rut: true } },
        partes: true,
        tramites: { orderBy: { orden: "asc" }, take: 40 },
        plazos: { where: plazoAccessWhere(opts.user), orderBy: { fechaLimite: "asc" }, take: 20 },
        minutas: {
          where: minutaConfidentialWhere(opts.user),
          orderBy: { fecha: "desc" },
          take: 5,
          select: {
            titulo: true,
            tipo: true,
            resumenEjecutivo: true,
            fecha: true,
          },
        },
        documentos: {
          where: documentReadWhere(opts.user),
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: { id: true, nombre: true, tipo: true },
        },
      },
    });
    if (!causa) throw httpError("Causa no encontrada o sin acceso", 404);
    parts.push({ causa });
  }

  if (opts.documentoId) {
    const doc = await prisma.documento.findFirst({
      where: {
        id: opts.documentoId,
        ...documentReadWhere(opts.user),
      },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        cliente: { select: { id: true, razonSocial: true } },
      },
    });
    if (!doc) throw httpError("Documento no encontrado o sin acceso", 404);
    if (doc) {
      const extracto = await textFromDoc(doc);
      parts.push({
        documento: {
          id: doc.id,
          nombre: doc.nombre,
          tipo: doc.tipo,
          confidencial: doc.confidencial,
          causa: doc.causa,
          cliente: doc.cliente,
          extracto,
        },
      });
    }
  }

  if (opts.siteId) {
    const site = await prisma.site.findFirst({
      where: { id: opts.siteId, ...siteAccessWhere(opts.user) },
      select: {
        id: true,
        name: true,
        tipo: true,
        description: true,
        causa: { select: { id: true, titulo: true, rit: true, materia: true } },
        cliente: { select: { id: true, razonSocial: true } },
      },
    });
    if (!site) throw httpError("Espacio no encontrado o sin acceso", 404);
    parts.push({ site });
  }

  if (opts.action === "jurisprudencia.brief") {
    const q = String(opts.extra?.query || "").trim();
    const rows = await prisma.jurisprudencia.findMany({
      where: q
        ? {
            OR: [
              { rol: { contains: q, mode: "insensitive" } },
              { caratula: { contains: q, mode: "insensitive" } },
              { doctrina: { contains: q, mode: "insensitive" } },
              { tags: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      take: 8,
      orderBy: { fecha: "desc" },
    });
    parts.push({
      jurisprudencia: rows.map((j) => ({
        rol: j.rol,
        tribunal: j.tribunal,
        caratula: j.caratula,
        doctrina: j.doctrina?.slice(0, 800),
        tags: j.tags,
      })),
    });
  }

  if (opts.action === "factura.glosa" && opts.extra) {
    parts.push({ facturacion: opts.extra });
  }

  if (opts.extra && opts.action !== "factura.glosa") {
    parts.push({ input: opts.extra });
  }

  return JSON.stringify(parts, null, 2).slice(0, 24000);
}
