import { NextRequest,NextResponse } from "next/server";
import { connectorActor,connectorFailure,privateHeaders } from "@/lib/personal-connectors/http";
import { disconnectPersonalDrive,personalDriveConnectionStatus } from "@/lib/personal-connectors/google-drive/service";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const actor=await connectorActor(request);return NextResponse.json(await personalDriveConnectionStatus(actor.id),{headers:privateHeaders});}catch(error){return connectorFailure(error);}}
export async function DELETE(request:NextRequest){try{const actor=await connectorActor(request,true);return NextResponse.json(await disconnectPersonalDrive(actor),{headers:privateHeaders});}catch(error){return connectorFailure(error);}}
