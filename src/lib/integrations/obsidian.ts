import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import {
  fetchSafeOutbound,
  isCloudMetadataHostname,
  isLoopbackHostname,
  isSafeOutboundHttpUrl,
} from "@/lib/net/safe-url";
import { putObject } from "@/lib/storage";
import { resolveDocumentoExport } from "@/lib/integrations/obsidian-docs";
import {
  assertAllowedVaultPath,
  defaultObsidianVaultRoot,
  resolveUnderVault,
  sanitizeVaultFolderPrefix,
} from "@/lib/integrations/obsidian-path";

/** Never export confidential or privileged matter into the Obsidian vault. */
const VAULT_SAFE_DOC_WHERE = { confidencial: false, privilegio: false } as const;
const VAULT_SAFE_MINUTA_WHERE = { confidencial: false } as const;

function assertObsidianRestUrl(restUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(restUrl);
  } catch {
    throw new Error("OBSIDIAN_REST_URL inválida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("OBSIDIAN_REST_URL debe ser http(s)");
  }
  if (parsed.username || parsed.password) {
    throw new Error("OBSIDIAN_REST_URL no puede incluir credenciales");
  }
  if (isCloudMetadataHostname(parsed.hostname)) {
    throw new Error("OBSIDIAN_REST_URL apunta a un host de metadata bloqueado");
  }

  const allowPrivate =
    process.env.NODE_ENV !== "production" ||
    process.env.OBSIDIAN_ALLOW_PRIVATE_URL === "1";
  // Production: HTTPS only for non-loopback; loopback may use http when allowed.
  const allowHttp = allowPrivate || process.env.NODE_ENV !== "production";

  if (
    isSafeOutboundHttpUrl(restUrl, {
      allowHttp,
      allowLoopback: allowPrivate,
    })
  ) {
    return;
  }

  // Local Obsidian Local REST API is loopback-only when private is allowed.
  if (allowPrivate && isLoopbackHostname(parsed.hostname)) {
    return;
  }

  throw new Error(
    "OBSIDIAN_REST_URL no permitida (SSRF). Use loopback o active OBSIDIAN_ALLOW_PRIVATE_URL=1 solo en Host local."
  );
}

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
    detail: process.env.OBSIDIAN_VAULT_PATH || defaultObsidianVaultRoot(),
  };
}

export async function getObsidianConfig(): Promise<ObsidianConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "obsidian" },
  });
  const defaults: ObsidianConfig = {
    vaultPath: defaultObsidianVaultRoot(),
    folderPrefix: "LexOpen",
    syncNotes: true,
    syncDocumentos: true,
  };
  if (!row) return defaults;
  const parsed = JSON.parse(row.configJson) as Partial<ObsidianConfig>;
  let vaultPath = defaults.vaultPath;
  try {
    vaultPath = assertAllowedVaultPath(
      String(parsed.vaultPath || defaults.vaultPath)
    );
  } catch {
    vaultPath = defaults.vaultPath;
  }
  let folderPrefix = defaults.folderPrefix;
  try {
    folderPrefix = sanitizeVaultFolderPrefix(
      String(parsed.folderPrefix || defaults.folderPrefix)
    );
  } catch {
    folderPrefix = defaults.folderPrefix;
  }
  return {
    ...defaults,
    ...parsed,
    vaultPath,
    folderPrefix,
  };
}

async function writeExportFile(opts: {
  localPath: string;
  relativePath: string;
  content: string;
  vaultPath?: string | null;
  storageKeys: string[];
  warnings: string[];
}): Promise<ObsidianExportMode> {
  const restUrl = process.env.OBSIDIAN_REST_URL?.replace(/\/$/, "");
  const relative = opts.relativePath.replace(/\\/g, "/");

  if (restUrl) {
    assertObsidianRestUrl(restUrl);
    const target = `${restUrl}/vault/${encodeVaultPath(relative)}`;
    const allowPrivate =
      process.env.NODE_ENV !== "production" ||
      process.env.OBSIDIAN_ALLOW_PRIVATE_URL === "1";
    const token = obsidianRestToken();
    const res = await fetchSafeOutbound(target, {
      allowHttp: true,
      allowLoopback: allowPrivate,
      method: "PUT",
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.content,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Obsidian REST PUT failed (${res.status}) ${relative}: ${text.slice(0, 120)}`
      );
    }
    return "rest";
  }

  if (opts.vaultPath && process.env.NODE_ENV !== "production") {
    // localPath must already be confined via resolveUnderVault by callers.
    const confined = resolveUnderVault(
      opts.vaultPath,
      path.relative(path.resolve(opts.vaultPath), opts.localPath)
    );
    try {
      await fs.mkdir(path.dirname(confined), { recursive: true });
      await fs.writeFile(confined, opts.content, "utf8");
      const stored = await putObject({
        key: stableObsidianKey(relative),
        body: opts.content,
        contentType: "text/markdown; charset=utf-8",
      });
      opts.storageKeys.push(stored.key);
      return "local+storage";
    } catch (e) {
      opts.warnings.push(
        `No se pudo escribir vault local ${opts.localPath}: ${
          e instanceof Error ? e.message : "error"
        }`
      );
    }
  }

  const stored = await putObject({
    key: stableObsidianKey(relative),
    body: opts.content,
    contentType: "text/markdown; charset=utf-8",
  });
  opts.storageKeys.push(stored.key);
  return "storage";
}

export async function exportCausaToObsidian(
  causaId: string
): Promise<ObsidianExportResult> {
  const config = await getObsidianConfig();
  const [causa, skippedMinutas, skippedDocs] = await Promise.all([
    prisma.causa.findUnique({
      where: { id: causaId },
      include: {
        partes: true,
        notas: true,
        documentos: { where: VAULT_SAFE_DOC_WHERE },
        plazos: true,
        cliente: true,
        abogado: true,
        minutas: {
          where: VAULT_SAFE_MINUTA_WHERE,
          include: { acciones: true },
          orderBy: { fecha: "desc" },
        },
      },
    }),
    prisma.minuta.count({ where: { causaId, confidencial: true } }),
    prisma.documento.count({
      where: {
        causaId,
        OR: [{ confidencial: true }, { privilegio: true }],
      },
    }),
  ]);
  if (!causa) throw new Error("Causa no encontrada");

  const skippedConfidential = {
    minutas: skippedMinutas,
    documentos: skippedDocs,
  };

  const folderName = sanitizeFilename(causa.rit || causa.titulo);
  const vaultRoot = assertAllowedVaultPath(config.vaultPath);
  const folderPrefix = sanitizeVaultFolderPrefix(config.folderPrefix);
  const dir = resolveUnderVault(vaultRoot, folderPrefix, "Causas", folderName);
  const storageKeys: string[] = [];
  const warnings: string[] = [];
  let files = 0;
  let lastMode: ObsidianExportMode = obsidianRestConfigured()
    ? "rest"
    : "storage";

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
  causa.minutas
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
    relativePath: path.posix.join(folderPrefix, "Causas", folderName, "Index.md"),
    content: indexMd,
    vaultPath: vaultRoot,
    storageKeys,
    warnings,
  });
  files += 1;

  if (config.syncNotes) {
    const notesDir = resolveUnderVault(
      vaultRoot,
      folderPrefix,
      "Causas",
      folderName,
      "Notas"
    );
    for (const nota of causa.notas) {
      const file = `${sanitizeFilename(nota.titulo)}.md`;
      lastMode = await writeExportFile({
        localPath: path.join(notesDir, file),
        relativePath: path.posix.join(
          folderPrefix,
          "Causas",
          folderName,
          "Notas",
          file
        ),
        content: `---\ntags: [${nota.tags}]\nlexopen_nota_id: ${yamlEscape(nota.id)}\n---\n\n# ${nota.titulo}\n\n${nota.contenido}\n`,
        vaultPath: vaultRoot,
        storageKeys,
        warnings,
      });
      files += 1;
    }
  }

  const minutasDir = resolveUnderVault(
    vaultRoot,
    folderPrefix,
    "Causas",
    folderName,
    "Minutas"
  );
  for (const minuta of causa.minutas) {
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
      localPath: path.join(minutasDir, file),
      relativePath: path.posix.join(
        folderPrefix,
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
      vaultPath: vaultRoot,
      storageKeys,
      warnings,
    });
    files += 1;
  }

  if (config.syncDocumentos) {
    for (const doc of causa.documentos) {
      const resolved = resolveDocumentoExport(doc);
      if (!resolved) {
        if (doc.storageKey) {
          warnings.push(
            `Documento binario omitido (sin Markdown): ${doc.nombre}`
          );
        }
        continue;
      }
      const relativeFile = resolved.relativeFile.replace(/\\/g, "/");
      if (relativeFile.split("/").some((seg) => seg === "." || seg === "..")) {
        continue;
      }
      const localPath = resolveUnderVault(
        vaultRoot,
        folderPrefix,
        "Causas",
        folderName,
        "Documentos",
        ...relativeFile.split("/")
      );
      const relativePath = path.posix.join(
        folderPrefix,
        "Causas",
        folderName,
        "Documentos",
        relativeFile
      );
      lastMode = await writeExportFile({
        localPath,
        relativePath,
        content: resolved.body,
        vaultPath: vaultRoot,
        storageKeys,
        warnings,
      });
      files += 1;
      await prisma.documento.update({
        where: { id: doc.id },
        data: { obsidianPath: relativePath },
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
