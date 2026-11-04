import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { linkedInStatus } from "@/lib/personal-connectors/linkedin/account";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request);
    return NextResponse.json({ linkedin: await linkedInStatus(actor.id), existingConnections: [
      { provider: "mail", label: "Mi correo", href: "/correo", status: "check_in_source" },
      { provider: "codex", label: "ChatGPT / Codex", href: "/integraciones", status: "check_in_source" },
      { provider: "google", label: "Google del estudio", href: "/integraciones", status: "check_in_source", scope: "organization" },
    ] }, { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
