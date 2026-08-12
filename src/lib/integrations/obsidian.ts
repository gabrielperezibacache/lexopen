import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import {
  fetchSafeOutbound,
  isCloudMetadataHostname,
  isLoopbackHostname,
  isSafeOutboundHttpUrl,
} from "@/lib/net/safe-url";
import { newStorageKey, putObject } from "@/lib/storage";

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

  if (
    isSafeOutboundHttpUrl(restUrl, {
      allowHttp: true,
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
  return { ...defaults, ...(JSON.parse(row.configJson) as Partial<ObsidianConfig>) };
}

function sanitize(name: string) {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim();
}

async function writeExportFile(opts: {
  localPath: string;
  relativePath: string;
  content: string;
  vaultPath?: string | null;
  storageKeys: string[];
}) {
  const restUrl = process.env.OBSIDIAN_REST_URL?.replace(/\/$/, "");
  if (restUrl) {
    assertObsidianRestUrl(restUrl);
    const target = `${restUrl}/vault/${encodeURIComponent(opts.relativePath)}`;
    const allowPrivate =
      process.env.NODE_ENV !== "production" ||
      process.env.OBSIDIAN_ALLOW_PRIVATE_URL === "1";
    const res = await fetchSafeOutbound(target, {
      allowHttp: true,
      allowLoopback: allowPrivate,
      method: "PUT",
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        ...(process.env.OBSIDIAN_REST_TOKEN
          ? { Authorization: `Bearer ${process.env.OBSIDIAN_REST_TOKEN}` }
          : {}),
      },
      body: opts.content,
    });
    if (!res.ok) {
      throw new Error(`Obsidian REST PUT failed: ${res.status}`);
    }
    return;
  }

  if (opts.vaultPath && process.env.NODE_ENV !== "production") {
    await fs.mkdir(path.dirname(opts.localPath), { recursive: true });
    await fs.writeFile(opts.localPath, opts.content, "utf8");
  }
  const stored = await putObject({
    key: newStorageKey("obsidian", opts.relativePath),
    body: opts.content,
    contentType: "text/markdown",
  });
  opts.storageKeys.push(stored.key);
}

export async function exportCausaToObsidian(causaId: string) {
  const config = await getObsidianConfig();
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: {
      partes: true,
      notas: true,
      documentos: { where: { confidencial: false } },
      plazos: true,
      cliente: true,
      abogado: true,
      minutas: {
        where: { confidencial: false },
        include: { acciones: true },
        orderBy: { fecha: "desc" },
      },
    },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const folderName = sanitize(causa.rit || causa.titulo);
  const dir = path.join(config.vaultPath, config.folderPrefix, "Causas", folderName);
  const storageKeys: string[] = [];
  let files = 0;

  const indexMd = `---
rit: ${causa.rit ?? ""}
ruc: ${causa.ruc ?? ""}
tribunal: ${causa.tribunal}
materia: ${causa.materia}
estado: ${causa.estado}
etapa: ${causa.etapa}
google_drive_folder: ${causa.googleDriveFolderId ?? ""}
lexopen_id: ${causa.id}
---

# ${causa.titulo}

**Carátula:** ${causa.caratula ?? "—"}
**Cliente:** ${causa.cliente?.razonSocial ?? "—"}
**Abogado:** ${causa.abogado?.name ?? "—"}
**Drive:** ${causa.googleDriveFolderUrl ?? "—"}

## Resumen
${causa.resumen ?? "_Sin resumen_"}

## Partes
${causa.partes.map((p) => `- **${p.rol}:** ${p.nombre}${p.rut ? ` (${p.rut})` : ""}`).join("\n")}

## Plazos
${causa.plazos.map((p) => `- [ ] ${p.titulo} — ${p.fechaLimite.toISOString().slice(0, 10)} (${p.estado})`).join("\n") || "_Sin plazos_"}

## Minutas
${causa.minutas.map((m) => `- [[Minutas/${sanitize(m.titulo)}|${m.tipo}: ${m.titulo}]] — ${m.fecha.toISOString().slice(0, 10)}`).join("\n") || "_Sin minutas_"}
`;

  await writeExportFile({
    localPath: path.join(dir, "Index.md"),
    relativePath: path.join(config.folderPrefix, "Causas", folderName, "Index.md"),
    content: indexMd,
    vaultPath: config.vaultPath,
    storageKeys,
  });
  files += 1;

  if (config.syncNotes) {
    const notesDir = path.join(dir, "Notas");
    for (const nota of causa.notas) {
      const file = `${sanitize(nota.titulo)}.md`;
      await writeExportFile({
        localPath: path.join(notesDir, file),
        relativePath: path.join(config.folderPrefix, "Causas", folderName, "Notas", file),
        content: `---\ntags: [${nota.tags}]\n---\n\n# ${nota.titulo}\n\n${nota.contenido}\n`,
        vaultPath: config.vaultPath,
        storageKeys,
      });
      files += 1;
    }
  }

  const minutasDir = path.join(dir, "Minutas");
  for (const minuta of causa.minutas) {
    const file = `${sanitize(minuta.titulo)}.md`;
    const acciones = minuta.acciones
      .map(
        (a) =>
          `- [${a.estado === "hecha" ? "x" : " "}] ${a.descripcion}${a.responsable ? ` (@${a.responsable})` : ""}`
      )
      .join("\n");
    await writeExportFile({
      localPath: path.join(minutasDir, file),
      relativePath: path.join(config.folderPrefix, "Causas", folderName, "Minutas", file),
      content: `---\ntipo: ${minuta.tipo}\nfecha: ${minuta.fecha.toISOString()}\n---\n\n# ${minuta.titulo}\n\n## Resumen\n${minuta.resumenEjecutivo}\n\n## Próximos pasos\n${acciones || minuta.proximosPasos || "_Sin acciones_"}\n`,
      vaultPath: config.vaultPath,
      storageKeys,
    });
    files += 1;
  }

  if (config.syncDocumentos) {
    const docsDir = path.join(dir, "Documentos");
    for (const doc of causa.documentos) {
      if (!doc.contenido) continue;
      const file = sanitize(doc.nombre.endsWith(".md") ? doc.nombre : `${doc.nombre}.md`);
      await writeExportFile({
        localPath: path.join(docsDir, file),
        relativePath: path.join(config.folderPrefix, "Causas", folderName, "Documentos", file),
        content: doc.contenido,
        vaultPath: config.vaultPath,
        storageKeys,
      });
      files += 1;
      await prisma.documento.update({
        where: { id: doc.id },
        data: { obsidianPath: path.join(config.folderPrefix, "Causas", folderName, "Documentos", file) },
      });
    }
  }

  return {
    vaultPath: dir,
    storageKeys,
    files,
    mode: process.env.OBSIDIAN_REST_URL ? "rest" : "storage",
  };
}

export async function syncAllCausasToObsidian() {
  const causas = await prisma.causa.findMany({ select: { id: true } });
  const results = [];
  for (const c of causas) {
    results.push(await exportCausaToObsidian(c.id));
  }
  return results;
}
