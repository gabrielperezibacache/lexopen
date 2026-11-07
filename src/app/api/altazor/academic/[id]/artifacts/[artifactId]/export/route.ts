import { NextRequest } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { academicRevisionParam, readAcademicArtifactDownload } from "@/lib/altazor/academic";
import { exportAcademicDocx } from "@/lib/altazor/document-export";
import { httpError } from "@/lib/auth/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  try {
    const user = await requireStaff();
    const { id, artifactId } = await params;
    const query = req.nextUrl.searchParams;
    const format = query.get("format") || "md";
    if (!["md", "docx", "references"].includes(format)) throw httpError("Formato de descarga no admitido", 400);
    if (query.getAll("revision").length > 1) throw httpError("Indique una sola versión para descargar", 400);
    const revision = academicRevisionParam(query.get("revision"));
    const referencesOnly = format === "references";
    const download = await readAcademicArtifactDownload(id, artifactId, user, { revision, referencesOnly });
    const word = format === "docx";
    const bytes = word ? exportAcademicDocx(download.body) : Buffer.from(download.body, "utf8");
    const versionSuffix = revision !== undefined || referencesOnly ? `-v${download.revision}` : "";
    const filename = encodeURIComponent(`altazor-${download.id}${versionSuffix}${referencesOnly ? "-fuentes" : ""}.${word ? "docx" : "md"}`);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": word ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    } });
  } catch (error) {
    return handleRouteError(error);
  }
}
