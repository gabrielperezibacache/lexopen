import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, parseBody, requireRole } from "@/lib/api";
import { firmSettingsPatchSchema, updateFirmSettings } from "@/lib/config/firm-settings";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireRole("admin");
    const body = await parseBody(req, firmSettingsPatchSchema);
    return NextResponse.json(await updateFirmSettings(body, user), { headers });
  } catch (e) {
    const response = handleRouteError(e);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
}
