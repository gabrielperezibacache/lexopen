import { z } from "zod";
import { assertCsrf, handleRouteError, requireRole, requireStaff } from "@/lib/api";
import { getHostNavigationSections, updateHostNavigationSections, visibleSectionsSchema } from "@/lib/config/host-navigation-sections";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const schema = z.object({ visibleSections: visibleSectionsSchema }).strict();

function failure(error: unknown) {
  const response = handleRouteError(error);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export async function GET() {
  try {
    await requireStaff();
    return Response.json({ visibleSections: await getHostNavigationSections() }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const actor = await requireRole("admin");
    const { visibleSections } = await parseKnowledgeBody(request, schema, 1024);
    return Response.json(await updateHostNavigationSections(visibleSections, actor), { headers });
  } catch (error) {
    return failure(error);
  }
}
