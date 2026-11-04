import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { altazorId } from "@/lib/altazor/schemas";
import { createAltazorAttachment, readAltazorUpload } from "@/lib/altazor/attachments";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertCsrf(request); const user = await requireStaff(); const { id } = await params; const limited = await rateLimitAsync(`altazor:attachment:${user.id}`, 10, 60_000); if (!limited.ok) return NextResponse.json({ error: "Espere antes de adjuntar otro archivo" }, { status: 429 }); const result = await createAltazorAttachment(altazorId.parse(id), await readAltazorUpload(request), user, undefined, request.signal); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
