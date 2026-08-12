import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import {
  describeObsidianMode,
  exportCausaToObsidian,
  getObsidianConfig,
  syncAllCausasToObsidian,
} from "@/lib/integrations/obsidian";
import {
  assertAllowedVaultPath,
  sanitizeVaultFolderPrefix,
} from "@/lib/integrations/obsidian-path";

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
      mode,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json().catch(() => ({}));
    if (body.action === "sync-all" || body.action === "sync-causa") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede sincronizar Obsidian" },
          { status: 403 }
        );
      }
    }
    if (body.action === "sync-all") {
      const results = await syncAllCausasToObsidian();
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      return NextResponse.json({
        ok: true,
        synced: ok,
        failed,
        results,
        mode: describeObsidianMode(),
      });
    }
    if (body.action === "sync-causa" && body.causaId) {
      const result = await exportCausaToObsidian(body.causaId);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "save-config") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede configurar Obsidian" },
          { status: 403 }
        );
      }
      const cfg = body.config || {};
      const vaultPathRaw = String(cfg.vaultPath || "").trim().slice(0, 500);
      if (!vaultPathRaw) {
        return NextResponse.json(
          { error: "vaultPath es requerido" },
          { status: 400 }
        );
      }
      let vaultPath: string;
      let folderPrefix: string;
      try {
        vaultPath = assertAllowedVaultPath(vaultPathRaw);
        folderPrefix = sanitizeVaultFolderPrefix(
          String(cfg.folderPrefix || "LexOpen").trim().slice(0, 80)
        );
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Configuración Obsidian inválida",
          },
          { status: 400 }
        );
      }
      await prisma.integrationConfig.upsert({
        where: { provider: "obsidian" },
        create: {
          provider: "obsidian",
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify({
            vaultPath,
            folderPrefix,
            syncNotes: Boolean(cfg.syncNotes ?? true),
            syncDocumentos: Boolean(cfg.syncDocumentos ?? true),
          }),
        },
        update: {
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify({
            vaultPath,
            folderPrefix,
            syncNotes: Boolean(cfg.syncNotes ?? true),
            syncDocumentos: Boolean(cfg.syncDocumentos ?? true),
          }),
        },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
