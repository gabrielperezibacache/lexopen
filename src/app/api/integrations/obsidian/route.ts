import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { exportCausaToObsidian, syncAllCausasToObsidian, getObsidianConfig } from "@/lib/integrations/obsidian";

export async function GET() {
  try {
    await requireStaff();
    const row = await prisma.integrationConfig.findUnique({ where: { provider: "obsidian" } });
    const config = await getObsidianConfig();
    return NextResponse.json({
      enabled: row?.enabled ?? false,
      config,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    await requireStaff();
    const body = await req.json().catch(() => ({}));
    if (body.action === "sync-all") {
      const results = await syncAllCausasToObsidian();
      return NextResponse.json({ ok: true, synced: results.length, results });
    }
    if (body.action === "sync-causa" && body.causaId) {
      const result = await exportCausaToObsidian(body.causaId);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "save-config") {
      const user = await requireStaff();
      if (user.role !== "admin") {
        return NextResponse.json(
          { error: "Solo admin puede configurar Obsidian" },
          { status: 403 }
        );
      }
      const cfg = body.config || {};
      const vaultPath = String(cfg.vaultPath || "").trim().slice(0, 500);
      const folderPrefix = String(cfg.folderPrefix || "LexOpen")
        .trim()
        .slice(0, 80);
      if (!vaultPath) {
        return NextResponse.json(
          { error: "vaultPath es requerido" },
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
            folderPrefix: folderPrefix || "LexOpen",
            syncNotes: Boolean(cfg.syncNotes ?? true),
            syncDocumentos: Boolean(cfg.syncDocumentos ?? true),
          }),
        },
        update: {
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify({
            vaultPath,
            folderPrefix: folderPrefix || "LexOpen",
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
