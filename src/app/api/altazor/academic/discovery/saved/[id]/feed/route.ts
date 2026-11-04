import { handleRouteError, requireStaff } from "@/lib/api";
import { altazorId } from "@/lib/altazor/schemas";
import { academicSearchFeed } from "@/lib/altazor/academic-discovery";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { return new Response(await academicSearchFeed(altazorId.parse((await params).id), await requireStaff()), { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return handleRouteError(error); } }
