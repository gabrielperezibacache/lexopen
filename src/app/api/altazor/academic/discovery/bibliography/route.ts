import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bibliographyStyleSchema } from "@/lib/altazor/bibliography-types";
import { addBibliography, addBibliographySchema, listBibliography } from "@/lib/altazor/bibliography-service";
export const runtime = "nodejs";
export async function GET(request: Request) { try { return NextResponse.json(await listBibliography(await requireStaff(), undefined, bibliographyStyleSchema.parse(new URL(request.url).searchParams.get("style") || "apa")), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function POST(request: Request) { try { assertCsrf(request); const user = await requireStaff(); if (!(await rateLimitAsync(`altazor:bibliography:${user.id}`, 15, 60_000)).ok) return NextResponse.json({ error: "Espere antes de incorporar otra referencia" }, { status: 429 }); return NextResponse.json(await addBibliography(await parseKnowledgeBody(request, addBibliographySchema, 8192), user, undefined, { signal: request.signal }), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
