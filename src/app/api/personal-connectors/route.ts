import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { linkedInStatus } from "@/lib/personal-connectors/linkedin/account";
import { getCaseManagementMode } from "@/lib/causas/management-mode";
import { getWorkCountry } from "@/lib/config/work-country";
import { showCommunications } from "@/lib/config/countries";
import { COMMUNICATIONS_SETTINGS_PATH } from "@/lib/mail/settings-location";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request);
    const [linkedin, country, mode] = await Promise.all([linkedInStatus(actor.id), getWorkCountry(), getCaseManagementMode()]);
    return NextResponse.json({ linkedin, existingConnections: [
      ...(showCommunications(country, mode) ? [{ provider: "mail", label: "Mi correo", href: COMMUNICATIONS_SETTINGS_PATH, status: "check_in_source" }] : []),
      { provider: "codex", label: "ChatGPT / Codex", href: "/integraciones", status: "check_in_source" },
      { provider: "google", label: "Google del estudio", href: "/integraciones", status: "check_in_source", scope: "organization" },
    ] }, { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
