/**
 * Empaqueta contexto anclado del estudio para el copiloto (estilo Julia:
 * busca en causas/documentos del estudio, no inventa fuentes).
 */

import { prisma } from "@/lib/db";
import { confidentialWhere } from "@/lib/api";
import { confidentialFileWhere } from "@/lib/auth/access";
import { clasificarUrgencia, diasRestantes } from "@/lib/plazos";
import { extractSearchNeedles, type AiUtilityId } from "@/lib/ai/utilities";
import {
  buildFolderIndex,
  documentExtractionAlerts,
  excerptBudgetForUtility,
  filterDocumentsByScope,
  rankDocumentsForAi,
  type AiDocumentCandidate,
} from "@/lib/ai/document-context";

export type AiSourceRef = {
  type:
    | "causa"
    | "documento"
    | "plazo"
    | "movimiento"
    | "jurisprudencia"
    | "wiki"
    | "minuta"
    | "vdr";
  id: string;
  label: string;
  href?: string;
  /** Optional secondary download (e.g. extracted markdown). */
  downloadHref?: string;
};

export type AiContextPack = {
  text: string;
  sources: AiSourceRef[];
  alerts: string[];
  folderIndex: Array<{
    carpeta: string;
    count: number;
    withText: number;
    needsOcr: number;
  }>;
};

function utilitiesWantDocuments(utility: AiUtilityId) {
  return (
    utility === "doc_qa" ||
    utility === "draft" ||
    utility === "copilot" ||
    utility === "briefing" ||
    utility === "research" ||
    utility === "similar" ||
    utility === "plazos"
  );
}

export async function buildAiContextPack(opts: {
  causaId?: string | null;
  documentoId?: string | null;
  utility: AiUtilityId;
  prompt: string;
  role: string;
  documentoIds?: string[] | null;
  rutaPrefix?: string | null;
}): Promise<AiContextPack> {
  const sources: AiSourceRef[] = [];
  const alerts: string[] = [];
  const blocks: string[] = [];
  let folderIndexRows: AiContextPack["folderIndex"] = [];
  const conf = confidentialWhere(opts.role);
  const fileConf = confidentialFileWhere(opts.role);
  const budget = excerptBudgetForUtility(opts.utility);

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
          where: conf,
          orderBy: { updatedAt: "desc" },
          take: 80,
          select: {
            id: true,
            nombre: true,
            tipo: true,
            ruta: true,
            extractedMarkdown: true,
            extractionStatus: true,
            confidencial: true,
            privilegio: true,
            updatedAt: true,
          },
        },
        minutas: {
          where: conf,
          include: { acciones: true },
          orderBy: { fecha: "desc" },
          take: 5,
        },
        cliente: { select: { id: true, razonSocial: true, rut: true } },
        site: {
          select: {
            id: true,
            name: true,
            folders: {
              select: {
                id: true,
                name: true,
                parentId: true,
                files: {
                  where: fileConf,
                  select: {
                    id: true,
                    name: true,
                    mimeType: true,
                    tags: true,
                    contenido: true,
                    folderId: true,
                    updatedAt: true,
                  },
                  take: 40,
                  orderBy: { updatedAt: "desc" },
                },
              },
            },
            files: {
              where: { folderId: null, ...fileConf },
              select: {
                id: true,
                name: true,
                mimeType: true,
                tags: true,
                contenido: true,
                folderId: true,
                updatedAt: true,
              },
              take: 20,
              orderBy: { updatedAt: "desc" },
            },
          },
        },
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

      if (utilitiesWantDocuments(opts.utility)) {
        let docsList: AiDocumentCandidate[] = [...causa.documentos];
        if (opts.documentoId && !docsList.some((d) => d.id === opts.documentoId)) {
          const extra = await prisma.documento.findFirst({
            where: {
              id: opts.documentoId,
              causaId: causa.id,
              ...conf,
            },
            select: {
              id: true,
              nombre: true,
              tipo: true,
              ruta: true,
              extractedMarkdown: true,
              extractionStatus: true,
              updatedAt: true,
            },
          });
          if (extra) docsList = [extra, ...docsList];
          else if (opts.utility === "doc_qa") {
            alerts.push(
              "El documento indicado no está disponible o no pertenece a esta causa."
            );
          }
        }

        const scoped = filterDocumentsByScope(docsList, {
          documentoIds: opts.documentoIds,
          rutaPrefix: opts.rutaPrefix,
        });
        const ranked = rankDocumentsForAi(scoped, opts.prompt);

        // El documento anclado explícitamente siempre queda primero y visible.
        let selected = ranked.slice(0, budget.maxDocs);
        if (opts.documentoId && !selected.some((d) => d.id === opts.documentoId)) {
          const pinned = ranked.find((d) => d.id === opts.documentoId);
          if (pinned) {
            selected = [pinned, ...selected.slice(0, Math.max(0, budget.maxDocs - 1))];
          }
        }

        const folderIndex = buildFolderIndex(ranked);
        folderIndexRows = Object.entries(folderIndex)
          .map(([carpeta, info]) => ({
            carpeta,
            count: info.count,
            withText: info.withText,
            needsOcr: info.needsOcr,
          }))
          .sort((a, b) => b.count - a.count);

        if (Object.keys(folderIndex).length) {
          blocks.push(
            `CARPETA_INVESTIGATIVA:\n${JSON.stringify(
              {
                total: ranked.length,
                seleccionados: selected.length,
                alcance: {
                  rutaPrefix: opts.rutaPrefix || null,
                  documentoIds: opts.documentoIds?.length ? opts.documentoIds : null,
                  documentoId: opts.documentoId || null,
                },
                carpetas: folderIndex,
              },
              null,
              2
            )}`
          );
        }

        alerts.push(...documentExtractionAlerts(selected, opts.utility));

        const docsPayload = selected.map((d) => {
          const md = (d.extractedMarkdown || "").trim();
          const pinned = opts.documentoId === d.id;
          if (md || budget.includeEmptyInIndex) {
            if (md) {
              sources.push({
                type: "documento",
                id: d.id,
                label: pinned ? `★ ${d.relativePath}` : d.relativePath,
                href: opts.causaId ? `/causas/${opts.causaId}` : "/documentos",
                downloadHref: `/api/documentos/${d.id}/markdown`,
              });
            }
          }
          return {
            id: d.id,
            nombre: d.nombre,
            pinned,
            ruta: d.ruta || null,
            relativePath: d.relativePath,
            tipo: d.tipo || "otro",
            extractionStatus: d.extractionStatus,
            score: d.score,
            excerpt:
              budget.includeExcerpts && md
                ? md.slice(0, pinned ? Math.max(budget.excerptChars, 14_000) : budget.excerptChars)
                : null,
          };
        });

        if (docsPayload.length) {
          blocks.push(`DOCUMENTOS_INDEXADOS:\n${JSON.stringify(docsPayload, null, 2)}`);
        } else if (opts.utility === "doc_qa") {
          alerts.push(
            "No hay documentos en el alcance seleccionado. Incorpore una carpeta investigativa o amplíe el filtro."
          );
        } else if (causa.documentos.length === 0) {
          alerts.push(
            "La causa no tiene documentos incorporados. Use Documentos → Incorporar al expediente."
          );
        }

        if (opts.rutaPrefix && !scoped.length && causa.documentos.length) {
          alerts.push(
            `Ningún documento coincide con la carpeta «${opts.rutaPrefix}». Revise el prefijo de ruta.`
          );
        }
      }

      // VDR vinculado a la causa (índice liviano + snippets de texto)
      const site = causa.site;
      if (
        site &&
        (opts.utility === "copilot" ||
          opts.utility === "briefing" ||
          opts.utility === "doc_qa" ||
          opts.utility === "draft" ||
          opts.utility === "research")
      ) {
        const folderNameById = new Map(site.folders.map((f) => [f.id, f.name]));
        const folderParentById = new Map(site.folders.map((f) => [f.id, f.parentId]));
        function folderPath(folderId: string | null | undefined): string {
          if (!folderId) return "";
          const parts: string[] = [];
          let cur: string | null | undefined = folderId;
          const guard = new Set<string>();
          while (cur && !guard.has(cur)) {
            guard.add(cur);
            parts.unshift(folderNameById.get(cur) || cur);
            cur = folderParentById.get(cur) || null;
          }
          return parts.join("/");
        }
        const vdrFiles = [
          ...site.files.map((f) => ({ ...f, folderId: null as string | null })),
          ...site.folders.flatMap((folder) =>
            folder.files.map((f) => ({ ...f, folderId: folder.id as string | null }))
          ),
        ].slice(0, 30);

        if (vdrFiles.length) {
          const vdrPayload = vdrFiles.map((f) => {
            const path = folderPath(f.folderId);
            const relative = path ? `${path}/${f.name}` : f.name;
            const text = (f.contenido || "").trim();
            sources.push({
              type: "vdr",
              id: f.id,
              label: relative,
              href: `/sites/${site.id}/archivos`,
            });
            return {
              id: f.id,
              relativePath: relative,
              mimeType: f.mimeType,
              tags: f.tags || "",
              excerpt: text ? text.slice(0, 1500) : null,
            };
          });
          blocks.push(
            `VDR_ESPACIO_VINCULADO:\n${JSON.stringify(
              { siteId: site.id, siteName: site.name, files: vdrPayload },
              null,
              2
            )}`
          );
        }
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

      // Wiki del site vinculado (si research/copilot)
      if (
        site &&
        (opts.utility === "research" || opts.utility === "copilot")
      ) {
        const wiki = await prisma.wikiPage.findMany({
          where: { siteId: site.id },
          take: 6,
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, content: true },
        });
        if (wiki.length) {
          blocks.push(
            `WIKI_ESPACIO:\n${JSON.stringify(
              wiki.map((w) => ({
                id: w.id,
                title: w.title,
                excerpt: (w.content || "").slice(0, 1200),
              })),
              null,
              2
            )}`
          );
          for (const w of wiki) {
            sources.push({
              type: "wiki",
              id: w.id,
              label: w.title,
              href: `/sites/${site.id}/wiki`,
            });
          }
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

  return { text, sources, alerts, folderIndex: folderIndexRows };
}
