import { handleRouteError, requireStaff } from "@/lib/api";
import { readBookPage } from "@/lib/books/service";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; page: string }> }) { try { const user = await requireStaff(), { id, page } = await params, bytes = await readBookPage(id, Number(page), user); return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return handleRouteError(error); } }
