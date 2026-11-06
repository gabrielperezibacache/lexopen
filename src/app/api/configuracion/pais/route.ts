import { z } from "zod";
import { assertCsrf, handleRouteError, requireRole, requireStaff } from "@/lib/api";
import { isWorkCountry, type WorkCountry } from "@/lib/config/countries";
import { getWorkCountry, updateWorkCountry } from "@/lib/config/work-country";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const schema = z.object({ country: z.custom<WorkCountry>(isWorkCountry, "Selecciona un país válido.").nullable() }).strict();

function failure(error: unknown) {
  const response = handleRouteError(error);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export async function GET() {
  try {
    await requireStaff();
    return Response.json({ country: await getWorkCountry() }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const actor = await requireRole("admin");
    const input = await parseKnowledgeBody(request, schema, 512);
    return Response.json(await updateWorkCountry(input.country, actor), { headers });
  } catch (error) {
    return failure(error);
  }
}
