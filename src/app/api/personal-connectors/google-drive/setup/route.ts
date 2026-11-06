import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor,connectorFailure,privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { personalDriveSetupStatus,savePersonalDriveSetup } from "@/lib/personal-connectors/google-drive/service";
const schema=z.object({useAltazorApp:z.boolean(),clientId:z.string().max(1000).optional(),clientSecret:z.string().max(4000).optional(),confirmed:z.literal(true)}).strict();
export const runtime="nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request);
    const displayOrigin = localSetupAllowed(request)
      ? new URL(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`).origin
      : undefined;
    const status = await personalDriveSetupStatus(actor, {}, displayOrigin);
    return NextResponse.json(displayOrigin || !status.canEdit ? status : {
      ...status,
      canEdit: false,
      canReuseAltazorApp: false,
      reason: "Para preparar Google Drive, abre LexOpen en el equipo principal.",
    }, { headers: privateHeaders });
  } catch (error) {
    return connectorFailure(error);
  }
}
export async function PUT(request:NextRequest){try{const actor=await connectorActor(request,true);if(!localSetupAllowed(request))throw new ConnectorError("local_setup_only","Prepara la aplicación de Google desde LexOpen en el equipo del Host.",403);const body=await parseKnowledgeBody(request,schema,8192);return NextResponse.json(await savePersonalDriveSetup(actor,body,new URL(request.headers.get("origin")||"").origin),{headers:privateHeaders});}catch(error){return connectorFailure(error);}}
