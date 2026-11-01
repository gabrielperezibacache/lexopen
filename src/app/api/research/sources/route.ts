import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, httpError, parseBody, requireStaff } from "@/lib/api";
import { canSome } from "@/lib/auth/permissions";
import { importLegalSource, listLegalSources } from "@/lib/research/service";
import { describePublicLegalSource, fetchPublicLegalSource } from "@/lib/research/sources";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("url"), url: z.string().min(1).max(2000) }),
  z.object({ mode: z.literal("manual"), url: z.string().min(1).max(2000), title: z.string().trim().min(3).max(1000), text: z.string().trim().min(20).max(500_000), publishedAt: z.string().date().optional() }),
]);
export async function GET() {
  try { const user = await requireStaff(); return NextResponse.json({ sources: await listLegalSources(user) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req); const user = await requireStaff();
    if (!canSome(user, "assistant.use")) throw httpError("No tiene permiso para incorporar fuentes", 403);
    if (Number(req.headers.get("content-length") || 0) > 2_000_000) throw httpError("La solicitud supera el límite de importación", 413);
    const input = await parseBody(req, schema);
    // Both modes acquire only the explicitly selected public URL. Private query/text is never forwarded.
    if (input.mode === "url") return NextResponse.json(await importLegalSource(await fetchPublicLegalSource(input.url, { signal: req.signal }), user), { status: 201 });
    const { canonicalUrl: url, organism, kind } = describePublicLegalSource(input.url);
    return NextResponse.json(await importLegalSource({ canonicalUrl: url, retrievalUrl: url, title: input.title, organism, kind, text: input.text, rawBytes: Buffer.from(input.text, "utf8"), mimeType: "text/plain", retrievedAt: new Date(), publishedAt: input.publishedAt ? new Date(`${input.publishedAt}T00:00:00Z`) : undefined, coverageWarnings: ["El contenido fue aportado por una persona; no se descargó ni se contrastó con el sitio oficial"], acquisitionMethod: "manual" }, user), { status: 201 });
  } catch (error) { return handleRouteError(error); }
}
