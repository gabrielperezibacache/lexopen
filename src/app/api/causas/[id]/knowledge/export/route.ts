import { NextRequest } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { exportCaseKnowledge } from "@/lib/knowledge/export";
import { downloadResponseHeaders } from "@/lib/security/download";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff();
    const { id } = await context.params;
    const query = req.nextUrl.searchParams;
    const format = query.get("format") || "markdown";
    if (format !== "markdown" && format !== "csv") throw httpError("Formato de exportación inválido", 400);
    const content = await exportCaseKnowledge(id, user, { q: query.get("q") || undefined, status: query.get("status") || undefined, after: query.get("after") || undefined }, format);
    const filename = format === "csv" ? "lexopen-cronologia.csv" : "lexopen-preparacion.md";
    return new Response(content, { headers: { ...downloadResponseHeaders(filename, format === "csv" ? "text/csv" : "text/markdown"), "Content-Disposition": `attachment; filename="${filename}"`, Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
