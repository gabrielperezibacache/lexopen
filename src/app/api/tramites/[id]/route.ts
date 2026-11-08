import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { tramiteUpdateSchema } from "@/lib/schemas";
import { requestCommandKey } from "@/lib/command-execution";
import { updateTramiteCommand, deleteTramiteCommand } from "@/lib/tramites/commands";
import { NextRequest, NextResponse } from "next/server";
type Params = {params:Promise<{id:string}>};
const headers={"Cache-Control":"private, no-store"};
export async function PATCH(req:NextRequest,{params}:Params){try{assertCsrf(req);const user=await requireStaff(),{id}=await params,body=await parseBody(req,tramiteUpdateSchema);return NextResponse.json(await updateTramiteCommand(user,id,body,requestCommandKey(req,"tramite.update")),{headers});}catch(e){return handleRouteError(e);}}
export async function DELETE(req:NextRequest,{params}:Params){try{assertCsrf(req);const user=await requireStaff(),{id}=await params;await deleteTramiteCommand(user,id,requestCommandKey(req,"tramite.delete"));return NextResponse.json({ok:true},{headers});}catch(e){return handleRouteError(e);}}
