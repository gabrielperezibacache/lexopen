import { prisma } from "@/lib/db";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { getObject } from "@/lib/storage";
import { buildClienteFolderContext } from "@/lib/integrations/client-folder-context";

function confWhere(role: string) {
  return canSeeConfidential(role) ? {} : { confidencial: false };
}

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
  causaId?: string | null;
  clienteId?: string | null;
  documentoId?: string | null;
  siteId?: string | null;
  extra?: Record<string, unknown>;
}) {
  const parts: unknown[] = [];

  if (opts.clienteId) {
    const folder = await buildClienteFolderContext(opts.clienteId, opts.userRole);
    if (folder) parts.push(JSON.parse(folder.context));
  }

  if (opts.causaId) {
    const causa = await prisma.causa.findUnique({
      where: { id: opts.causaId },
      include: {
        cliente: { select: { id: true, razonSocial: true, rut: true } },
        partes: true,
        tramites: { orderBy: { orden: "asc" }, take: 40 },
        plazos: { orderBy: { fechaLimite: "asc" }, take: 20 },
        minutas: {
          where: confWhere(opts.userRole),
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
          where: confWhere(opts.userRole),
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: { id: true, nombre: true, tipo: true },
        },
      },
    });
    if (causa) parts.push({ causa });
  }

  if (opts.documentoId) {
    const doc = await prisma.documento.findUnique({
      where: { id: opts.documentoId },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        cliente: { select: { id: true, razonSocial: true } },
      },
    });
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
    const site = await prisma.site.findUnique({
      where: { id: opts.siteId },
      select: {
        id: true,
        name: true,
        tipo: true,
        description: true,
        causa: { select: { id: true, titulo: true, rit: true, materia: true } },
        cliente: { select: { id: true, razonSocial: true } },
      },
    });
    if (site) parts.push({ site });
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
