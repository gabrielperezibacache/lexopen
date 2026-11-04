import { handleRouteError, requireStaff } from "@/lib/api";
import { bibliographyStyleSchema } from "@/lib/altazor/bibliography-types";
import { exportBibliography } from "@/lib/altazor/bibliography-service";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const result = await exportBibliography(await requireStaff(), bibliographyStyleSchema.parse(new URL(request.url).searchParams.get("style") || "apa")); return new Response(result.body, { headers: { "Content-Type": result.mimeType, "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="bibliografia.${result.extension}"`, "X-Lexopen-References": String(result.count), "X-Lexopen-Excluded": String(result.excluded), "X-Content-Type-Options": "nosniff" } }); } catch (error) { return handleRouteError(error); } }
