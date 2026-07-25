import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { putObject } from "@/lib/storage";

export type ObsidianConfig = {
  vaultPath: string;
  folderPrefix: string;
  syncNotes: boolean;
  syncDocumentos: boolean;
};

export type ObsidianExportMode = "rest" | "storage" | "local+storage";

export type ObsidianExportResult = {
  vaultPath: string;
  storageKeys: string[];
  files: number;
  skippedConfidential: { minutas: number; documentos: number };
  mode: ObsidianExportMode;
  restConfigured: boolean;
  warnings: string[];
};

function parseConfigJson(raw: string): Partial<ObsidianConfig> {
  try {
    return JSON.parse(raw) as Partial<ObsidianConfig>;
  } catch {
    return {};
  }
}

export async function getObsidianConfig(): Promise<ObsidianConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "obsidian" },
  });
  const defaults: ObsidianConfig = {
    vaultPath: process.env.OBSIDIAN_VAULT_PATH || "./obsidian-vault",
    folderPrefix: "LexOpen",
    syncNotes: true,
    syncDocumentos: true,
  };
  if (!row) return defaults;
  return { ...defaults, ...parseConfigJson(row.configJson) };
}

export function obsidianRestConfigured() {
  return Boolean(process.env.OBSIDIAN_REST_URL?.trim());
}

export function obsidianRestToken() {
  return (
    process.env.OBSIDIAN_REST_TOKEN ||
    process.env.OBSIDIAN_REST_API_KEY ||
    ""
  );
}

export function sanitizeFilename(name: string) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return cleaned || "sin-titulo";
}

export function yamlEscape(value: string) {
  if (value === "") return '""';
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function formatLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Stable storage key so re-exports overwrite instead of duplicating. */
export function stableObsidianKey(relativePath: string) {
  const safe = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `obsidian/${safe}`;
}

/** Encode each path segment for Obsidian Local REST API. */
export function encodeVaultPath(relativePath: string) {
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function writeExportFile(opts: {
  localPath: string;
  relativePath: string;
  content: string;
  writeLocal: boolean;
  storageKeys: string[];
  warnings: string[];
}): Promise<"rest" | "storage" | "local+storage"> {
  const restUrl = process.env.OBSIDIAN_REST_URL?.replace(/\/$/, "");
  const relative = opts.relativePath.replace(/\\/g, "/");

  if (restUrl) {
    const token = obsidianRestToken();
    const res = await fetch(`${restUrl}/vault/${encodeVaultPath(relative)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.content,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Obsidian REST PUT failed (${res.status}) ${relative}: ${text.slice(0, 120)}`
      );
    }
    return "rest";
  }

  const key = stableObsidianKey(relative);
  const stored = await putObject({
    key,
    body: opts.content,
    contentType: "text/markdown; charset=utf-8",
  });
  opts.storageKeys.push(stored.key);

  if (opts.writeLocal) {
    try {
      await fs.mkdir(path.dirname(opts.localPath), { recursive: true });
      await fs.writeFile(opts.localPath, opts.content, "utf8");
      return "local+storage";
    } catch (e) {
      opts.warnings.push(
        `No se pudo escribir vault local ${opts.localPath}: ${
          e instanceof Error ? e.message : "error"
        }`
      );
    }
  }

  return "storage";
}

export async function exportCausaToObsidian(
  causaId: string
): Promise<ObsidianExportResult> {
  const config = await getObsidianConfig();
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: {
      partes: true,
      notas: true,
      documentos: true,
      plazos: true,
      cliente: true,
      abogado: true,
      minutas: {
        include: { acciones: true },
        orderBy: { fecha: "desc" },
      },
    },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const publicMinutas = causa.minutas.filter((m) => !m.confidencial);
  const publicDocs = causa.documentos.filter((d) => !d.confidencial);
  const skippedConfidential = {
    minutas: causa.minutas.length - publicMinutas.length,
    documentos: causa.documentos.length - publicDocs.length,
  };

  const folderName = sanitizeFilename(causa.rit || causa.titulo);
  const dir = path.join(config.vaultPath, config.folderPrefix, "Causas", folderName);
  const storageKeys: string[] = [];
  const warnings: string[] = [];
  let files = 0;
  let lastMode: ObsidianExportMode = obsidianRestConfigured() ? "rest" : "storage";
  const writeLocal =
    !obsidianRestConfigured() && process.env.NODE_ENV !== "production";

  const indexMd = `---
rit: ${yamlEscape(causa.rit ?? "")}
ruc: ${yamlEscape(causa.ruc ?? "")}
tribunal: ${yamlEscape(causa.tribunal)}
materia: ${yamlEscape(causa.materia)}
estado: ${yamlEscape(causa.estado)}
etapa: ${yamlEscape(causa.etapa)}
google_drive_folder: ${yamlEscape(causa.googleDriveFolderId ?? "")}
lexopen_id: ${yamlEscape(causa.id)}
exported_at: ${yamlEscape(new Date().toISOString())}
---

# ${causa.titulo}

**Carátula:** ${causa.caratula ?? "—"}
**Cliente:** ${causa.cliente?.razonSocial ?? "—"}
**Abogado:** ${causa.abogado?.name ?? "—"}
**Drive:** ${causa.googleDriveFolderUrl ?? "—"}

## Resumen
${causa.resumen ?? "_Sin resumen_"}

## Partes
${
  causa.partes
    .map((p) => `- **${p.rol}:** ${p.nombre}${p.rut ? ` (${p.rut})` : ""}`)
    .join("\n") || "_Sin partes_"
}

## Plazos
${
  causa.plazos
    .map(
      (p) =>
        `- [ ] ${p.titulo} — ${formatLocalDate(p.fechaLimite)} (${p.estado})${
          p.esFatal ? " · FATAL" : ""
        }`
    )
    .join("\n") || "_Sin plazos_"
}

## Minutas
${
  publicMinutas
    .map(
      (m) =>
        `- [[Minutas/${sanitizeFilename(m.titulo)}|${m.tipo}: ${m.titulo}]] — ${formatLocalDate(m.fecha)}`
    )
    .join("\n") || "_Sin minutas exportables_"
}

${
  skippedConfidential.minutas || skippedConfidential.documentos
    ? `\n> Nota LexOpen: se omitieron ${skippedConfidential.minutas} minuta(s) y ${skippedConfidential.documentos} documento(s) confidenciales.\n`
    : ""
}
`;

  lastMode = await writeExportFile({
    localPath: path.join(dir, "Index.md"),
    relativePath: path.join(config.folderPrefix, "Causas", folderName, "Index.md"),
    content: indexMd,
    writeLocal,
    storageKeys,
    warnings,
  });
  files += 1;

  if (config.syncNotes) {
    for (const nota of causa.notas) {
      const file = `${sanitizeFilename(nota.titulo)}.md`;
      lastMode = await writeExportFile({
        localPath: path.join(dir, "Notas", file),
        relativePath: path.join(
          config.folderPrefix,
          "Causas",
          folderName,
          "Notas",
          file
        ),
        content: `---\ntags: [${nota.tags}]\nlexopen_nota_id: ${yamlEscape(nota.id)}\n---\n\n# ${nota.titulo}\n\n${nota.contenido}\n`,
        writeLocal,
        storageKeys,
        warnings,
      });
      files += 1;
    }
  }

  for (const minuta of publicMinutas) {
    const file = `${sanitizeFilename(minuta.titulo)}.md`;
    const acciones = minuta.acciones
      .map(
        (a) =>
          `- [${a.estado === "hecha" ? "x" : " "}] ${a.descripcion}${
            a.responsable ? ` (@${a.responsable})` : ""
          }${a.fechaLimite ? ` — ${formatLocalDate(a.fechaLimite)}` : ""}`
      )
      .join("\n");
    lastMode = await writeExportFile({
      localPath: path.join(dir, "Minutas", file),
      relativePath: path.join(
        config.folderPrefix,
        "Causas",
        folderName,
        "Minutas",
        file
      ),
      content: `---
tipo: ${yamlEscape(minuta.tipo)}
fecha: ${yamlEscape(formatLocalDate(minuta.fecha))}
lexopen_minuta_id: ${yamlEscape(minuta.id)}
confidencial: false
---

# ${minuta.titulo}

## Resumen
${minuta.resumenEjecutivo}

## Hechos relevantes
${minuta.hechosRelevantes || "_—_"}

## Acuerdos
${minuta.acuerdos || "_—_"}

## Próximos pasos
${acciones || minuta.proximosPasos || "_Sin acciones_"}

## Riesgos
${minuta.riesgosAlertas || "_—_"}
`,
      writeLocal,
      storageKeys,
      warnings,
    });
    files += 1;
  }

  if (config.syncDocumentos) {
    for (const doc of publicDocs) {
      if (!doc.contenido) {
        if (doc.storageKey) {
          warnings.push(
            `Documento binario omitido (sin Markdown): ${doc.nombre}`
          );
        }
        continue;
      }
      const file = sanitizeFilename(
        doc.nombre.endsWith(".md") ? doc.nombre : `${doc.nombre}.md`
      );
      const relative = path.join(
        config.folderPrefix,
        "Causas",
        folderName,
        "Documentos",
        file
      );
      lastMode = await writeExportFile({
        localPath: path.join(dir, "Documentos", file),
        relativePath: relative,
        content: doc.contenido,
        writeLocal,
        storageKeys,
        warnings,
      });
      files += 1;
      await prisma.documento.update({
        where: { id: doc.id },
        data: { obsidianPath: relative.replace(/\\/g, "/") },
      });
    }
  }

  return {
    vaultPath: dir,
    storageKeys,
    files,
    skippedConfidential,
    mode: lastMode,
    restConfigured: obsidianRestConfigured(),
    warnings,
  };
}

export async function syncAllCausasToObsidian() {
  const causas = await prisma.causa.findMany({
    select: { id: true, titulo: true, rit: true },
    orderBy: { updatedAt: "desc" },
  });
  const results: Array<
    ObsidianExportResult & { causaId: string; ok: boolean; error?: string }
  > = [];
  for (const c of causas) {
    try {
      const result = await exportCausaToObsidian(c.id);
      results.push({ ...result, causaId: c.id, ok: true });
    } catch (e) {
      results.push({
        causaId: c.id,
        ok: false,
        error: e instanceof Error ? e.message : "Error",
        vaultPath: "",
        storageKeys: [],
        files: 0,
        skippedConfidential: { minutas: 0, documentos: 0 },
        mode: obsidianRestConfigured() ? "rest" : "storage",
        restConfigured: obsidianRestConfigured(),
        warnings: [],
      });
    }
  }
  return results;
}

export function describeObsidianMode() {
  if (obsidianRestConfigured()) {
    return {
      mode: "rest" as const,
      label: "Obsidian Local REST API",
      detail: process.env.OBSIDIAN_REST_URL,
    };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      mode: "storage" as const,
      label: "Object storage / filesystem efímero",
      detail: "Sin OBSIDIAN_REST_URL — export a storage (S3 o ./storage)",
    };
  }
  return {
    mode: "local+storage" as const,
    label: "Vault local + storage",
    detail: process.env.OBSIDIAN_VAULT_PATH || "./obsidian-vault",
  };
}
