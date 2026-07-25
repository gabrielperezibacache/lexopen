import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  describeObsidianMode,
  exportCausaToObsidian,
  getObsidianConfig,
  obsidianRestConfigured,
  syncAllCausasToObsidian,
} from "@/lib/integrations/obsidian";

const saveSchema = z.object({
  action: z.literal("save-config"),
  enabled: z.boolean().optional(),
  config: z
    .object({
      vaultPath: z.string().min(1).max(500).optional(),
      folderPrefix: z.string().min(1).max(120).optional(),
      syncNotes: z.boolean().optional(),
      syncDocumentos: z.boolean().optional(),
    })
    .optional(),
});

export async function GET() {
  try {
    await requireStaff();
    const row = await prisma.integrationConfig.findUnique({
      where: { provider: "obsidian" },
    });
    const config = await getObsidianConfig();
    const mode = describeObsidianMode();
    return NextResponse.json({
      enabled: row?.enabled ?? false,
      config,
      mode: mode.mode,
      modeLabel: mode.label,
      modeDetail: mode.detail,
      restConfigured: obsidianRestConfigured(),
      honesty:
        mode.mode === "rest"
          ? "Export vía Obsidian Local REST API (sobrescribe notas del vault)."
          : mode.mode === "local+storage"
            ? "Desarrollo: escribe vault local y copia en storage."
            : "Producción sin REST: export a object storage / ./storage (filesystem Render es efímero).",
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const raw = await req.json().catch(() => ({}));

    if (raw?.action === "save-config") {
      const body = saveSchema.parse(raw);
      const current = await getObsidianConfig();
      const next = { ...current, ...(body.config || {}) };
      await prisma.integrationConfig.upsert({
        where: { provider: "obsidian" },
        create: {
          provider: "obsidian",
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify(next),
        },
        update: {
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify(next),
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "obsidian.save-config",
        entityType: "IntegrationConfig",
        entityId: "obsidian",
        after: { enabled: body.enabled ?? true, folderPrefix: next.folderPrefix },
      });
      return NextResponse.json({ ok: true });
    }

    if (raw?.action === "sync-all") {
      const results = await syncAllCausasToObsidian();
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      await writeAudit({
        actorId: user.id,
        action: "obsidian.sync-all",
        entityType: "Causa",
        after: { ok, failed, mode: results[0]?.mode },
      });
      return NextResponse.json({
        ok: failed === 0,
        synced: ok,
        failed,
        results,
        mode: describeObsidianMode(),
      });
    }

    if (raw?.action === "sync-causa" && raw.causaId) {
      const result = await exportCausaToObsidian(String(raw.causaId));
      await writeAudit({
        actorId: user.id,
        action: "obsidian.sync-causa",
        entityType: "Causa",
        entityId: String(raw.causaId),
        after: {
          files: result.files,
          mode: result.mode,
          skipped: result.skippedConfidential,
        },
      });
      return NextResponse.json({
        ok: true,
        result,
        mode: describeObsidianMode(),
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
