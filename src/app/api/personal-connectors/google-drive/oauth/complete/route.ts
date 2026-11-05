import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor,connectorFailure,privateHeaders } from "@/lib/personal-connectors/http";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { completePersonalDriveOAuth } from "@/lib/personal-connectors/google-drive/service";
const schema=z.object({attemptId:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const runtime="nodejs";
export async function POST(request:NextRequest){try{const actor=await connectorActor(request,true),body=await parseKnowledgeBody(request,schema,2048);return NextResponse.json(await completePersonalDriveOAuth(actor,body.attemptId),{headers:privateHeaders});}catch(error){return connectorFailure(error);}}
