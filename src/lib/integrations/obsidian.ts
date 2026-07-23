import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";

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

export async function exportCausaToObsidian(causaId: string) {
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
    },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const folderName = sanitize(causa.rit || causa.titulo);
  const dir = path.join(config.vaultPath, config.folderPrefix, "Causas", folderName);
  await fs.mkdir(dir, { recursive: true });

  const indexMd = `---
rit: ${causa.rit ?? ""}
ruc: ${causa.ruc ?? ""}
tribunal: ${causa.tribunal}
materia: ${causa.materia}
estado: ${causa.estado}
etapa: ${causa.etapa}
lexopen_id: ${causa.id}
---

# ${causa.titulo}

**Carátula:** ${causa.caratula ?? "—"}
**Cliente:** ${causa.cliente?.razonSocial ?? "—"}
**Abogado:** ${causa.abogado?.name ?? "—"}

## Resumen
${causa.resumen ?? "_Sin resumen_"}

## Partes
${causa.partes.map((p) => `- **${p.rol}:** ${p.nombre}${p.rut ? ` (${p.rut})` : ""}`).join("\n")}

## Plazos
${causa.plazos.map((p) => `- [ ] ${p.titulo} — ${p.fechaLimite.toISOString().slice(0, 10)} (${p.estado})`).join("\n") || "_Sin plazos_"}
`;

  await fs.writeFile(path.join(dir, "Index.md"), indexMd, "utf8");

  if (config.syncNotes) {
    const notesDir = path.join(dir, "Notas");
    await fs.mkdir(notesDir, { recursive: true });
    for (const nota of causa.notas) {
      const file = `${sanitize(nota.titulo)}.md`;
      await fs.writeFile(
        path.join(notesDir, file),
        `---\ntags: [${nota.tags}]\n---\n\n# ${nota.titulo}\n\n${nota.contenido}\n`,
        "utf8"
      );
    }
  }

  if (config.syncDocumentos) {
    const docsDir = path.join(dir, "Documentos");
    await fs.mkdir(docsDir, { recursive: true });
    for (const doc of causa.documentos) {
      if (!doc.contenido) continue;
      const file = sanitize(doc.nombre.endsWith(".md") ? doc.nombre : `${doc.nombre}.md`);
      await fs.writeFile(path.join(docsDir, file), doc.contenido, "utf8");
      await prisma.documento.update({
        where: { id: doc.id },
        data: { obsidianPath: path.join(config.folderPrefix, "Causas", folderName, "Documentos", file) },
      });
    }
  }

  return { vaultPath: dir, files: causa.notas.length + causa.documentos.length + 1 };
}

export async function syncAllCausasToObsidian() {
  const causas = await prisma.causa.findMany({ select: { id: true } });
  const results = [];
  for (const c of causas) {
    results.push(await exportCausaToObsidian(c.id));
  }
  return results;
}
