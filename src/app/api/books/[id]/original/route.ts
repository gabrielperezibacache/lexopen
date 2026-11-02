import { handleRouteError, requireStaff } from "@/lib/api";
import { readBookOriginal } from "@/lib/books/service";
import { downloadResponseHeaders } from "@/lib/security/download";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) { try { const user = await requireStaff(), { id } = await params, result = await readBookOriginal(id, user); return new Response(new Uint8Array(result.bytes), { headers: { ...downloadResponseHeaders(result.name, result.mimeType), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`, "Content-Security-Policy": "sandbox; default-src 'none'" } }); } catch (error) { return handleRouteError(error); } }
