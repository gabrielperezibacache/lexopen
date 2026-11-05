import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor,connectorFailure,privateHeaders } from "@/lib/personal-connectors/http";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { startPersonalDriveOAuth } from "@/lib/personal-connectors/google-drive/service";
const schema=z.object({confirmed:z.literal(true),requestId:z.string().regex(/^[A-Za-z0-9-]{10,120}$/)}).strict();
export const runtime="nodejs";
export async function POST(request:NextRequest){try{const actor=await connectorActor(request,true),body=await parseKnowledgeBody(request,schema,2048);return NextResponse.json(await startPersonalDriveOAuth(actor,body,new URL(request.headers.get("origin")||"").origin),{headers:privateHeaders});}catch(error){return connectorFailure(error);}}
