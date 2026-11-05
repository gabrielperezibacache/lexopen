import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicArtifactRestoreSchema } from "@/lib/altazor/academic-schemas";
import { academicArtifactHistory, readAcademicArtifactVersion, restoreAcademicArtifactVersion } from "@/lib/altazor/academic";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
type Params = { params: Promise<{ id: string; artifactId: string }> };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function revision(value: string | null) {
  if (value === null) return undefined;
  if (!/^[1-9][0-9]{0,8}$/.test(value)) throw httpError("La versión solicitada no es válida", 400);
  return Number(value);
}
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff(), { id, artifactId } = await params, selected = revision(req.nextUrl.searchParams.get("revision"));
    return NextResponse.json(selected ? await readAcademicArtifactVersion(id, artifactId, selected, user) : await academicArtifactHistory(id, artifactId, user, revision(req.nextUrl.searchParams.get("before"))), { headers });
  } catch (error) { return handleRouteError(error); }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req); const user = await requireStaff(), { id, artifactId } = await params;
    if (!(await rateLimitAsync(`academic-restore:${user.id}`, 20, 60000)).ok) return NextResponse.json({ error: "Espera un momento antes de recuperar otra versión." }, { status: 429 });
    return NextResponse.json(await restoreAcademicArtifactVersion(id, artifactId, await parseKnowledgeBody(req, academicArtifactRestoreSchema), user), { headers });
  } catch (error) { return handleRouteError(error); }
}
