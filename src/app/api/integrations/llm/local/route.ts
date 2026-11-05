import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, httpError, requireRole } from "@/lib/api";
import { getLlmConfig, publicLlmConfig, selectLocalLlmProfile } from "@/lib/integrations/llm";
import { configuredLocalModel, localModelProfile } from "@/lib/integrations/local-model-profiles";
import { downloadLocalModel, localModelsStatus, testLocalModel } from "@/lib/integrations/local-models";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("download"), model: z.string().max(32), confirmed: z.literal(true), acceptedTerms: z.boolean().optional() }).strict(),
  z.object({ action: z.enum(["test", "activate"]), model: z.string().max(32) }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);

export async function GET(request: Request) {
  try {
    await requireRole("admin");
    const [status, config] = await Promise.all([localModelsStatus(request.signal), getLlmConfig()]);
    return NextResponse.json({ ...status, selected: configuredLocalModel(config)?.id ?? null }, { headers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const actor = await requireRole("admin");
    const input = await parseKnowledgeBody(request, schema, 1024);
    if (input.action === "restore") {
      await selectLocalLlmProfile(null, actor.id);
      const [config, prior] = await Promise.all([
        getLlmConfig(),
        prisma.integrationConfig.findFirst({ where: { provider: { in: ["llm", "hermes"] } }, orderBy: { provider: "desc" }, select: { enabled: true } }),
      ]);
      return NextResponse.json({ ok: true, config: publicLlmConfig(config), enabled: config.localProfile ? true : prior?.enabled ?? true }, { headers });
    }
    const profile = localModelProfile(input.model);
    if (!profile) throw httpError("Elige un modelo del catálogo local.", 400);
    if (input.action === "download") {
      if (profile.licenseUrl && !input.acceptedTerms) throw httpError("Confirma los términos del modelo antes de descargarlo.", 400);
      await downloadLocalModel(profile, request.signal);
      return NextResponse.json({ ok: true }, { headers });
    }
    await testLocalModel(profile, request.signal);
    if (input.action === "test") return NextResponse.json({ ok: true }, { headers });
    request.signal.throwIfAborted();
    await selectLocalLlmProfile(profile.id, actor.id);
    return NextResponse.json({ ok: true, config: publicLlmConfig(await getLlmConfig()) }, { headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
