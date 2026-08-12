/**
 * Empaqueta contexto anclado del estudio para el copiloto (estilo Julia:
 * busca en causas/documentos del estudio, no inventa fuentes).
 */

import { prisma } from "@/lib/db";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { clasificarUrgencia, diasRestantes } from "@/lib/plazos";
import { extractSearchNeedles, type AiUtilityId } from "@/lib/ai/utilities";

export type AiSourceRef = {
  type: "causa" | "documento" | "plazo" | "movimiento" | "jurisprudencia" | "wiki" | "minuta";
  id: string;
  label: string;
  href?: string;
};

export type AiContextPack = {
  text: string;
  sources: AiSourceRef[];
  alerts: string[];
};

export async function buildAiContextPack(opts: {
  causaId?: string | null;
  documentoId?: string | null;
  utility: AiUtilityId;
  prompt: string;
  role: string;
}): Promise<AiContextPack> {
  const sources: AiSourceRef[] = [];
  const alerts: string[] = [];
  const blocks: string[] = [];

  let causaId = opts.causaId || null;
  if (!causaId && opts.documentoId) {
    const doc = await prisma.documento.findUnique({
      where: { id: opts.documentoId },
      select: { causaId: true },
    });
    causaId = doc?.causaId || null;
  }

  if (causaId) {
    const causa = await prisma.causa.findUnique({
      where: { id: causaId },
      include: {
        partes: true,
        plazos: { orderBy: { fechaLimite: "asc" }, take: 20 },
        movimientos: { orderBy: { fecha: "desc" }, take: 15 },
        documentos: {
          where: canSeeConfidential(opts.role)
            ? {}
            : { confidencial: false },
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: {
            id: true,
            nombre: true,
            extractedMarkdown: true,
            extractionStatus: true,
            confidencial: true,
          },
        },
        minutas: {
          where: canSeeConfidential(opts.role) ? {} : { confidencial: false },
          include: { acciones: true },
          orderBy: { fecha: "desc" },
          take: 5,
        },
        cliente: { select: { id: true, razonSocial: true, rut: true } },
      },
    });

    if (causa) {
      sources.push({
        type: "causa",
        id: causa.id,
        label: causa.rit || causa.titulo,
        href: `/causas/${causa.id}`,
      });

      blocks.push(
        JSON.stringify(
          {
            titulo: causa.titulo,
            rit: causa.rit,
            ruc: causa.ruc,
            tribunal: causa.tribunal,
            materia: causa.materia,
            etapa: causa.etapa,
            caratula: causa.caratula,
            resumen: causa.resumen,
            sala: causa.sala,
            semaforo: causa.pjudLastSyncStatus,
            cliente: causa.cliente,
            partes: causa.partes,
          },
          null,
          2
        )
      );

      const plazoLines = causa.plazos.map((p) => {
        const urg = clasificarUrgencia(p.fechaLimite);
        const dias = diasRestantes(p.fechaLimite);
        sources.push({
          type: "plazo",
          id: p.id,
          label: `${p.titulo} (${urg}, ${dias}d)`,
          href: `/plazos?causaId=${encodeURIComponent(causa.id)}`,
        });
        if (p.esFatal && (urg === "critico" || urg === "vencido" || urg === "proximo")) {
          alerts.push(`Plazo${p.esFatal ? " fatal" : ""} «${p.titulo}»: ${urg} (${dias} días).`);
        }
        return {
          id: p.id,
          titulo: p.titulo,
          fechaLimite: p.fechaLimite,
          estado: p.estado,
          esFatal: p.esFatal,
          urgencia: urg,
          diasRestantes: dias,
          tipoComputo: p.tipoComputo,
        };
      });
      blocks.push(`PLAZOS:\n${JSON.stringify(plazoLines, null, 2)}`);

      if (
        opts.utility === "briefing" ||
        opts.utility === "copilot" ||
        opts.utility === "draft" ||
        opts.utility === "plazos"
      ) {
        const movs = causa.movimientos.map((m) => ({
          fecha: m.fecha,
          titulo: m.titulo,
          folio: m.folio,
          cuaderno: m.cuaderno,
          tipo: m.tipo,
          esReceptor: m.esReceptor,
        }));
        for (const m of causa.movimientos.slice(0, 5)) {
          sources.push({
            type: "movimiento",
            id: m.id,
            label: `${m.fecha.toISOString().slice(0, 10)} · ${m.titulo.slice(0, 60)}`,
            href: `/causas/${causa.id}`,
          });
        }
        blocks.push(`MOVIMIENTOS_RECIENTES:\n${JSON.stringify(movs, null, 2)}`);
      }

      if (
        opts.utility === "doc_qa" ||
        opts.utility === "draft" ||
        opts.utility === "copilot" ||
        opts.utility === "briefing"
      ) {
        let docsList = [...causa.documentos];
        if (opts.documentoId) {
          const pinned = docsList.find((d) => d.id === opts.documentoId);
          if (pinned) {
            docsList = [pinned, ...docsList.filter((d) => d.id !== pinned.id)];
          } else {
            const extra = await prisma.documento.findFirst({
              where: {
                id: opts.documentoId,
                causaId: causa.id,
                ...(canSeeConfidential(opts.role)
                  ? {}
                  : { confidencial: false }),
              },
              select: {
                id: true,
                nombre: true,
                extractedMarkdown: true,
                extractionStatus: true,
                confidencial: true,
              },
            });
            if (extra) docsList = [extra, ...docsList];
            else
              alerts.push(
                "El documento indicado no está disponible o no pertenece a esta causa."
              );
          }
        }
        const docs = docsList.map((d) => {
          const md = (d.extractedMarkdown || "").trim();
          const pinned = opts.documentoId === d.id;
          if (md) {
            sources.push({
              type: "documento",
              id: d.id,
              label: pinned ? `★ ${d.nombre}` : d.nombre,
              href: `/api/documentos/${d.id}/markdown`,
            });
          } else if (opts.utility === "doc_qa") {
            alerts.push(
              `Documento «${d.nombre}» sin texto indexado (OCR/extracción pendiente).`
            );
          }
          return {
            id: d.id,
            nombre: d.nombre,
            pinned,
            extractionStatus: d.extractionStatus,
            excerpt: md
              ? md.slice(0, pinned ? 14_000 : 6000)
              : null,
          };
        });
        blocks.push(`DOCUMENTOS_INDEXADOS:\n${JSON.stringify(docs, null, 2)}`);
      }

      if (causa.minutas.length) {
        blocks.push(
          `MINUTAS:\n${JSON.stringify(
            causa.minutas.map((m) => ({
              tipo: m.tipo,
              titulo: m.titulo,
              resumen: m.resumenEjecutivo,
              acciones: m.acciones.map((a) => a.descripcion),
            })),
            null,
            2
          )}`
        );
        for (const m of causa.minutas.slice(0, 3)) {
          sources.push({
            type: "minuta",
            id: m.id,
            label: m.titulo,
            href: `/causas/${causa.id}/minutas/${m.id}`,
          });
        }
      }
    }
  }

  if (opts.utility === "research" || opts.utility === "similar" || opts.utility === "copilot") {
    const needles = extractSearchNeedles(opts.prompt, 4);
    const needleList = needles.length ? needles : ["civil"];
    const textOr = (fields: string[]) =>
      needleList.flatMap((needle) =>
        fields.map((field) => ({
          [field]: { contains: needle, mode: "insensitive" as const },
        }))
      );

    const juris = await prisma.jurisprudencia.findMany({
      where: {
        OR: textOr([
          "rol",
          "tribunal",
          "materia",
          "caratula",
          "doctrina",
          "descripcion",
        ]),
      },
      take: 8,
      orderBy: { fecha: "desc" },
    });
    // Fallback loose if no hits
    const jurisFinal =
      juris.length > 0
        ? juris
        : await prisma.jurisprudencia.findMany({ take: 5, orderBy: { fecha: "desc" } });
    if (jurisFinal.length) {
      blocks.push(
        `JURISPRUDENCIA_CORPUS_LOCAL:\n${JSON.stringify(
          jurisFinal.map((j) => ({
            id: j.id,
            rol: j.rol,
            tribunal: j.tribunal,
            caratula: j.caratula,
            materia: j.materia,
            doctrina: (j.doctrina || j.descripcion || "").slice(0, 800),
          })),
          null,
          2
        )}`
      );
      for (const j of jurisFinal) {
        const q = (j.rol || j.caratula || "").trim();
        sources.push({
          type: "jurisprudencia",
          id: j.id,
          label: j.rol || j.caratula || j.id,
          href: q
            ? `/jurisprudencia?q=${encodeURIComponent(q.slice(0, 80))}`
            : `/jurisprudencia`,
        });
      }
      if (!juris.length && opts.utility === "research") {
        alerts.push(
          "Sin coincidencia exacta de jurisprudencia; se muestran las más recientes del corpus local."
        );
      }
    } else if (opts.utility === "research") {
      alerts.push("Sin hits de jurisprudencia en el corpus local LexOpen.");
    }

    const wikiPages = await prisma.wikiPage.findMany({
      where: {
        published: true,
        OR: textOr(["title", "content"]),
      },
      include: { site: { select: { id: true, name: true } } },
      take: 6,
      orderBy: { updatedAt: "desc" },
    });
    const wikiFinal =
      wikiPages.length > 0
        ? wikiPages
        : opts.utility === "research"
          ? await prisma.wikiPage.findMany({
              where: { published: true },
              include: { site: { select: { id: true, name: true } } },
              take: 4,
              orderBy: { updatedAt: "desc" },
            })
          : [];
    if (wikiFinal.length) {
      blocks.push(
        `WIKI_ESTUDIO:\n${JSON.stringify(
          wikiFinal.map((w) => ({
            id: w.id,
            title: w.title,
            slug: w.slug,
            site: w.site.name,
            excerpt: (w.content || "").slice(0, 1200),
          })),
          null,
          2
        )}`
      );
      for (const w of wikiFinal) {
        sources.push({
          type: "wiki",
          id: w.id,
          label: `${w.site.name}: ${w.title}`,
          href: `/sites/${w.site.id}/wiki#${encodeURIComponent(w.slug)}`,
        });
      }
      if (!wikiPages.length && opts.utility === "research") {
        alerts.push(
          "Sin coincidencia exacta de wiki; se muestran páginas recientes del estudio."
        );
      }
    } else if (opts.utility === "research") {
      alerts.push("Sin hits de wiki del estudio en LexOpen.");
    }
  }

  if (opts.utility === "similar" && opts.causaId) {
    const base = await prisma.causa.findUnique({
      where: { id: opts.causaId },
      select: { materia: true, tribunal: true, etapa: true },
    });
    if (base) {
      const or: object[] = [];
      if (base.materia) or.push({ materia: base.materia });
      if (base.tribunal) or.push({ tribunal: base.tribunal });
      const similars = or.length
        ? await prisma.causa.findMany({
            where: {
              id: { not: opts.causaId },
              OR: or,
              estado: "activa",
            },
            take: 8,
            select: {
              id: true,
              rit: true,
              titulo: true,
              materia: true,
              tribunal: true,
              etapa: true,
            },
          })
        : [];
      blocks.push(`CAUSAS_SIMILARES_ESTUDIO:\n${JSON.stringify(similars, null, 2)}`);
      for (const s of similars) {
        sources.push({
          type: "causa",
          id: s.id,
          label: s.rit || s.titulo,
          href: `/causas/${s.id}`,
        });
      }
      if (!similars.length) {
        alerts.push("No se encontraron causas similares en la cartera del estudio.");
      }
    }
  }

  const text = blocks.length
    ? blocks.join("\n\n")
    : "(Sin causa ni corpus adicional; responde de forma general y señala límites.)";

  return { text, sources, alerts };
}
