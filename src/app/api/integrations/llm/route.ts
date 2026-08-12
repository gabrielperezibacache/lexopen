import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireRole, requireStaff } from "@/lib/api";
import { llmConfigSchema } from "@/lib/schemas";
import {
  getLlmConfig,
  publicLlmConfig,
  saveLlmConfig,
  testLlmConnection,
  LLM_PRESET_CATALOG,
  type LlmConfig,
} from "@/lib/integrations/llm";

export async function GET() {
  try {
    await requireStaff();
    const [llmRow, hermesRow] = await Promise.all([
      prisma.integrationConfig.findUnique({ where: { provider: "llm" } }),
      prisma.integrationConfig.findUnique({ where: { provider: "hermes" } }),
    ]);
    const config = await getLlmConfig();
    return NextResponse.json({
      enabled: llmRow?.enabled ?? hermesRow?.enabled ?? true,
      config: publicLlmConfig(config),
      presets: LLM_PRESET_CATALOG,
      envHints: {
        LLM_API_URL: Boolean(process.env.LLM_API_URL || process.env.HERMES_API_URL),
        LLM_API_KEY: Boolean(process.env.LLM_API_KEY || process.env.HERMES_API_KEY),
        LLM_MODEL: Boolean(process.env.LLM_MODEL || process.env.HERMES_MODEL),
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireRole("admin");
    const body = await req.json();

    if (body.action === "save-config") {
      const parsed = llmConfigSchema.parse(body.config || {});
      const config: Partial<LlmConfig> = {
        ...parsed,
        apiKey:
          parsed.apiKey === null || parsed.apiKey === undefined
            ? undefined
            : parsed.apiKey,
      };
      const saved = await saveLlmConfig({
        enabled: Boolean(body.enabled ?? true),
        config,
      });
      return NextResponse.json({
        ok: true,
        config: publicLlmConfig(saved),
      });
    }

    if (body.action === "test") {
      const result = await testLlmConnection();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
