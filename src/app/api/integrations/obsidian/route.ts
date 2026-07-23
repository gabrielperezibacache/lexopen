import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exportCausaToObsidian, syncAllCausasToObsidian, getObsidianConfig } from "@/lib/integrations/obsidian";

export async function GET() {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "obsidian" } });
  const config = await getObsidianConfig();
  return NextResponse.json({
    enabled: row?.enabled ?? false,
    config,
  });
}

export async function POST(req: Request) {
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
    await prisma.integrationConfig.upsert({
      where: { provider: "obsidian" },
      create: {
        provider: "obsidian",
        enabled: Boolean(body.enabled ?? true),
        configJson: JSON.stringify(body.config || {}),
      },
      update: {
        enabled: Boolean(body.enabled ?? true),
        configJson: JSON.stringify(body.config || {}),
      },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
