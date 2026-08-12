import { prisma } from "@/lib/db";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { getObject } from "@/lib/storage";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";

function confidentialWhere(role: string) {
  if (canSeeConfidential(role)) return {};
  return { confidencial: false };
}

const MAX_CHARS = 16000;
const TEXT_MIME = /^(text\/|application\/(json|xml)|.*\+(json|xml))/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|xml|html?|log)$/i;

async function extractDocText(doc: {
  nombre: string;
  mimeType: string | null;
  contenido: string | null;
  extractedMarkdown?: string | null;
  storageKey: string | null;
}): Promise<string> {
  if (doc.extractedMarkdown?.trim()) return doc.extractedMarkdown.trim();
  if (doc.contenido?.trim()) return doc.contenido.trim();
  if (!doc.storageKey) return "";
  const mime = doc.mimeType || "";
  if (!TEXT_MIME.test(mime) && !TEXT_EXT.test(doc.nombre)) {
    return `[Archivo binario: ${doc.nombre}${mime ? ` (${mime})` : ""} — sin extracción de texto]`;
  }
  try {
    const buf = await getObject(doc.storageKey);
    if (!buf) return "";
    const text = buf.toString("utf8");
    if (!text.trim()) return "";
    return text.slice(0, 6000);
  } catch {
    return `[No se pudo leer: ${doc.nombre}]`;
  }
}

export async function buildClienteFolderContext(
  clienteId: string,
  userRole: string
) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      abogado: { select: { name: true } },
      documentos: {
        where: confidentialWhere(userRole),
        orderBy: { updatedAt: "desc" },
        take: 20,
      },
      causas: {
        orderBy: { updatedAt: "desc" },
        include: {
          tramites: {
            orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
          },
          plazos: {
            where: { estado: { in: ["pendiente", "vencido"] } },
            orderBy: { fechaLimite: "asc" },
            take: 10,
          },
        },
      },
    },
  });
  if (!cliente) return null;

  const resumen = {
    cliente: {
      razonSocial: cliente.razonSocial,
      rut: cliente.rut,
      tipo: cliente.tipo,
      estado: cliente.estado,
      notas: cliente.notas,
      abogado: cliente.abogado?.name || null,
    },
    causas: cliente.causas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      rit: c.rit,
      tribunal: c.tribunal,
      materia: c.materia,
      etapa: c.etapa,
      estado: c.estado,
      tramitesPendientes: c.tramites
        .filter((t) =>
          TRAMITES_ABIERTOS.includes(t.estado as "pendiente" | "en_curso")
        )
        .map((t) => ({
          titulo: t.titulo,
          estado: t.estado,
          fechaLimite: t.fechaLimite,
          detalle: t.detalle,
        })),
      tramitesHechos: c.tramites
        .filter((t) => t.estado === "hecho")
        .map((t) => ({
          titulo: t.titulo,
          fechaHecho: t.fechaHecho,
        })),
      plazos: c.plazos.map((p) => ({
        titulo: p.titulo,
        fechaLimite: p.fechaLimite,
        estado: p.estado,
      })),
    })),
    documentosCarpeta: [] as Array<{ nombre: string; tipo: string; extracto: string }>,
  };

  let budget = MAX_CHARS;
  const meta = JSON.stringify(resumen, null, 2);
  budget -= meta.length;

  for (const doc of cliente.documentos) {
    if (budget <= 500) break;
    const text = await extractDocText(doc);
    const extracto = text.slice(0, Math.min(4000, budget));
    resumen.documentosCarpeta.push({
      nombre: doc.nombre,
      tipo: doc.tipo,
      extracto,
    });
    budget -= extracto.length + 80;
  }

  return {
    cliente,
    context: JSON.stringify(resumen, null, 2),
  };
}
