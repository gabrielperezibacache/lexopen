/** Real PostgreSQL revocation precisely between the actor SELECT and reservation UPDATE. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { seal,sessionHash,unseal } from "../core";
import { PERSONAL_DRIVE_PROVIDER as provider,PERSONAL_DRIVE_SCOPES as scopes } from "./config";
import { startPersonalDriveOAuth,receivePersonalDriveCallback,completePersonalDriveOAuth,disconnectPersonalDrive } from "./service";
async function main(){
  const url=assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);assert.equal(url,new URL(process.env.DATABASE_URL!).toString());
  const revoker=new PrismaClient({datasources:{db:{url}}}),originalEnv={...process.env},tag=randomUUID();let ownerId="",armed=false,races=0;
  Object.assign(process.env,{SESSION_SECRET:"fictitious-drive-session-race-secret-strong-enough-123456789",APP_URL:"http://127.0.0.1:9999",PERSONAL_DRIVE_GOOGLE_CLIENT_ID:"fixture-race-client",PERSONAL_DRIVE_GOOGLE_CLIENT_SECRET:"fixture-race-secret"});
  prisma.$use(async(params,next)=>{
    if(armed&&params.model==="User"&&params.action==="updateMany"&&params.args?.where?.id===ownerId&&typeof params.args.where.sessionVersion==="number"){
      armed=false;races++;await revoker.user.update({where:{id:ownerId},data:{sessionVersion:{increment:1}}});
    }
    return next(params);
  });
  try{
    const user=await prisma.user.create({data:{email:`${tag}@drive-session-race.invalid`,name:"Sesión ficticia",role:"abogado",password:"not-a-login"}});ownerId=user.id;
    const actor={id:user.id,sessionVersion:user.sessionVersion,sessionHash:sessionHash("fictitious-session")},sessionRequired=(error:unknown)=>(error as {status?:number;code?:string}).status===401&&(error as {code?:string}).code==="session_required";
    const start=()=>startPersonalDriveOAuth(actor,{confirmed:true,requestId:randomUUID()},process.env.APP_URL!);
    armed=true;await assert.rejects(start(),sessionRequired);assert.equal(await prisma.personalOAuthAttempt.count({where:{ownerId,provider}}),0,"a stale reservation cannot create or cancel an OAuth attempt");
    actor.sessionVersion=(await prisma.user.findUniqueOrThrow({where:{id:ownerId}})).sessionVersion;
    const attempt=await start(),state=new URL(attempt.authUrl).searchParams.get("state")!;
    const fixtureFetch:typeof fetch=async input=>String(input)==="https://oauth2.googleapis.com/token"?Response.json({access_token:"fixture-race-access",refresh_token:"fixture-race-refresh",expires_in:3600,token_type:"Bearer",scope:scopes[0]}):Response.json({user:{permissionId:"fixture-race-Google",displayName:"Cuenta de prueba"}});
    await receivePersonalDriveCallback({state,code:"fictitious-code"},{fetcher:fixtureFetch});
    armed=true;await assert.rejects(completePersonalDriveOAuth(actor,attempt.attemptId),sessionRequired);
    const ready=await prisma.personalOAuthAttempt.findUniqueOrThrow({where:{id:attempt.attemptId}});assert.equal(ready.phase,"ready");assert.equal(await prisma.personalConnectorAccount.count({where:{ownerId,provider}}),0,"revocation before the reservation cannot activate staged credentials");
    actor.sessionVersion=(await prisma.user.findUniqueOrThrow({where:{id:ownerId}})).sessionVersion;
    const staged=unseal<{grant:Record<string,unknown>}>(ready.resultEnc!,`google-drive:content:attempt:${ownerId}:${ready.id}`),accountId=randomUUID();staged.grant.actorSessionVersion=actor.sessionVersion;
    const credentialsEnc=seal(staged.grant,`google-drive:content:account:${ownerId}:${accountId}`);
    await prisma.personalConnectorAccount.create({data:{id:accountId,ownerId,provider,clientId:"fixture-race-client",externalSubject:String(staged.grant.subject),name:"Conexión que debe conservarse",status:"connected",credentialsEnc,grantedScopesJson:JSON.stringify(scopes),expiresAt:new Date(Number(staged.grant.expiresAt))}});
    armed=true;await assert.rejects(disconnectPersonalDrive(actor),sessionRequired);
    const preserved=await prisma.personalConnectorAccount.findUniqueOrThrow({where:{id:accountId}});assert.equal(preserved.credentialsEnc,credentialsEnc);assert.equal(preserved.status,"connected");assert.equal((await prisma.personalOAuthAttempt.findUniqueOrThrow({where:{id:ready.id}})).phase,"ready","a stale disconnect cannot cancel a current authorization");
    assert.equal(races,3);console.log("Personal Drive session reservation: concurrent logout before UPDATE blocks start, activation and disconnect; no attempt or stored connection is overwritten.");
  }finally{armed=false;if(ownerId)await prisma.user.deleteMany({where:{id:ownerId}});await prisma.$disconnect();await revoker.$disconnect();for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
