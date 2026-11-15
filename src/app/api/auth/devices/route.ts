import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { httpError } from "@/lib/auth/access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, assertCsrf, parseBody, handleRouteError } from "@/lib/api";
import { listTrustedDevices, revokeTrustedDevices, TRUSTED_DEVICE_COOKIE } from "@/lib/auth/trusted-devices";
import { privateHeaders } from "@/lib/personal-connectors/http";
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("revoke"),id:z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/)}).strict(),z.object({action:z.literal("revoke-all")}).strict()]);
function failure(error:unknown){const response=handleRouteError(error);for(const[key,value]of Object.entries(privateHeaders))response.headers.set(key,value);return response;}
async function actor(){const user=await requireUser();if(!(await rateLimitAsync(`auth-devices:${user.id}`,60,60_000)).ok)throw httpError("Espere antes de repetir la consulta",429);return user;}
export async function GET(req:NextRequest){try{const user=await actor();return NextResponse.json(await listTrustedDevices(user.id,req.cookies.get(TRUSTED_DEVICE_COOKIE)?.value),{headers:privateHeaders});}catch(error){return failure(error);}}
export async function POST(req:NextRequest){try{assertCsrf(req);const user=await actor(),body=await parseBody(req,schema);return NextResponse.json(await revokeTrustedDevices(user.id,body.action==="revoke"?body.id:undefined),{headers:privateHeaders});}catch(error){return failure(error);}}
