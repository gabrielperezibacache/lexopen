/** Personal OAuth + refresh + folder import with an entirely fictitious Google provider. */
import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { configureDriveSync,processDueDriveSyncSubscriptions,listPersonalDriveFolders,linkPersonalDriveFolder,driveImportDependenciesForActor } from "@/lib/integrations/drive-sync";
import { listDriveImportCandidates } from "@/lib/integrations/drive-import";
import { seal,sessionHash,unseal } from "../core";
import { PERSONAL_DRIVE_PROVIDER as provider,PERSONAL_DRIVE_SCOPES as scopes } from "./config";
import { startPersonalDriveOAuth,receivePersonalDriveCallback,completePersonalDriveOAuth,personalDriveConnectionStatus,requirePersonalDriveSession,assertPersonalDriveConnection,disconnectPersonalDrive,personalDriveSetupStatus,savePersonalDriveSetup } from "./service";
const status=(expected:number)=>(error:unknown)=>(error as {status?:number}).status===expected;
async function main(){
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());assert.ok(!process.env.S3_BUCKET);
  const priorEnv={...process.env},root=await mkdtemp(path.join(tmpdir(),"lexopen-personal-drive-")),originalFetch=globalThis.fetch,tag=randomUUID().replaceAll("-","");
  Object.assign(process.env,{SESSION_SECRET:"fictitious-personal-drive-session-secret-64-characters-valid",APP_URL:"http://127.0.0.1:9999",PERSONAL_DRIVE_GOOGLE_CLIENT_ID:"fixture-personal-drive-client",PERSONAL_DRIVE_GOOGLE_CLIENT_SECRET:"fixture-personal-drive-secret",STORAGE_PATH:root});
  const priorOperator=await prisma.integrationConfig.findUnique({where:{provider:"personal-drive-oauth"}});
  const priorWorkspace=await prisma.integrationConfig.findUnique({where:{provider:"altazor-oauth-google"}});
  const users:string[]=[];let causaId="",wrongScope=false,refreshes=0,exchanges=0,downloads=0,providerCalls=0;
  const folderId=`Folder_${tag}`,fileId=`File_${tag}`,bytes=Buffer.from("Un documento completamente ficticio de Drive para conservar su original."),meta={id:fileId,name:"fixture.txt",mimeType:"text/plain",version:"1",size:String(bytes.length),parents:[folderId],trashed:false,md5Checksum:createHash("md5").update(bytes).digest("hex"),capabilities:{canDownload:true}};
  const fixtureFetch:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));providerCalls++;
    if(url.href==="https://oauth2.googleapis.com/token"){
      const body=new URLSearchParams(String(init?.body));assert.equal(body.get("client_id"),process.env.PERSONAL_DRIVE_GOOGLE_CLIENT_ID);assert.equal(body.get("client_secret"),"fixture-personal-drive-secret");
      if(body.get("grant_type")==="refresh_token"){refreshes++;assert.match(body.get("refresh_token")||"",/^fixture-refresh/);}else{exchanges++;assert.equal(body.get("grant_type"),"authorization_code");assert.match(body.get("code_verifier")||"",/^[A-Za-z0-9_-]{43}$/);}
      return Response.json({access_token:`fixture-access-${providerCalls}`,refresh_token:`fixture-refresh-${providerCalls}`,expires_in:3600,token_type:"Bearer",scope:wrongScope?"https://www.googleapis.com/auth/drive.metadata.readonly":scopes.join(" ")});
    }
    assert.equal(url.hostname,"www.googleapis.com","no requests leave the fictitious Google adapter");
    const headers=new Headers(init?.headers);assert.match(headers.get("authorization")||"",/^Bearer fixture-access-/);
    if(url.pathname==="/drive/v3/about")return Response.json({user:{permissionId:"fixture-google-owner",displayName:"Cuenta ficticia",emailAddress:"fixture@drive.invalid"}});
    if(url.pathname.endsWith(`/${folderId}`))return Response.json({id:folderId,name:"Carpeta ficticia",mimeType:"application/vnd.google-apps.folder",trashed:false,parents:[]});
    if(url.pathname==="/drive/v3/files")return Response.json({files:url.searchParams.get("q")?.includes("mimeType=")?[{id:folderId,name:"Carpeta ficticia",mimeType:"application/vnd.google-apps.folder",trashed:false}]:[meta],incompleteSearch:false});
    assert.equal(url.pathname,`/drive/v3/files/${fileId}`);if(url.searchParams.get("alt")==="media"){downloads++;return new Response(new Uint8Array(bytes));}return Response.json(meta);
  };globalThis.fetch=fixtureFetch;
  try{
    const owner=await prisma.user.create({data:{email:`${tag}@personal-drive.invalid`,name:"Titular ficticio",role:"abogado",password:"not-a-login"}});users.push(owner.id);
    const other=await prisma.user.create({data:{email:`${tag}-other@personal-drive.invalid`,name:"Otro ficticio",role:"abogado",password:"not-a-login"}});users.push(other.id);
    const actor={id:owner.id,sessionVersion:owner.sessionVersion,sessionHash:sessionHash("fixture-session")},stranger={id:other.id,sessionVersion:other.sessionVersion,sessionHash:sessionHash("other-fixture-session")};
    await prisma.user.update({where:{id:other.id},data:{role:"socio",capabilityGrants:"host.admin"}});assert.equal((await personalDriveConnectionStatus(other.id)).canAdmin,false);await assert.rejects(personalDriveSetupStatus(stranger),status(403));
    await prisma.user.update({where:{id:other.id},data:{role:"admin",capabilityGrants:""}});
    const origin = process.env.APP_URL!;
    const localSetup = { env: { APP_URL: origin } };
    await prisma.integrationConfig.deleteMany({ where: { provider: "altazor-oauth-google" } });
    assert.equal((await personalDriveSetupStatus(stranger, localSetup, origin)).canReuseAltazorApp, false);
    const previousSetup = await prisma.integrationConfig.findUnique({ where: { provider: "personal-drive-oauth" } });
    await assert.rejects(savePersonalDriveSetup(stranger, { useAltazorApp: true, confirmed: true }, origin, localSetup), status(409));
    assert.deepEqual(await prisma.integrationConfig.findUnique({ where: { provider: "personal-drive-oauth" } }), previousSetup);

    const standalone = await savePersonalDriveSetup(stranger, {
      useAltazorApp: false, confirmed: true, clientId: "fixture-standalone-app", clientSecret: "fixture-standalone-secret",
    }, origin, localSetup);
    assert.equal(standalone.source, "saved");
    const sharedCredentials = seal({
      clientId: "fixture-saved-workspace-app", clientSecret: "fixture-saved-workspace-secret", appUrl: origin,
    }, "altazor:desktop:oauth:operator:google");
    await prisma.integrationConfig.create({
      data: { provider: "altazor-oauth-google", enabled: true, configJson: JSON.stringify({ credentialsEnc: sharedCredentials }) },
    });
    const reuseStatus = await personalDriveSetupStatus(stranger, localSetup, origin);
    assert.equal(reuseStatus.canReuseAltazorApp, true);
    assert.equal(reuseStatus.source, "saved", "discovering a reusable app keeps the separate preparation");
    assert.doesNotMatch(JSON.stringify(reuseStatus), /fixture-(?:saved-workspace|standalone)|credentialsEnc/);
    assert.equal((await personalDriveSetupStatus(stranger, localSetup, "http://localhost:9999")).canReuseAltazorApp, false);
    assert.equal((await personalDriveSetupStatus(stranger, { env: { APP_URL: origin, ALTAZOR_GOOGLE_CLIENT_ID: "fixture-incomplete" } }, origin)).canReuseAltazorApp, false);

    const savedAlias = await savePersonalDriveSetup(stranger, { useAltazorApp: true, confirmed: true }, origin, localSetup);
    assert.equal(savedAlias.source, "altazor");
    assert.equal(savedAlias.canReuseAltazorApp, true);
    const reusable = await startPersonalDriveOAuth(actor, { requestId: randomUUID(), confirmed: true }, origin, localSetup);
    const reuseUrl = new URL(reusable.authUrl);
    assert.equal(reuseUrl.searchParams.get("client_id"), "fixture-saved-workspace-app");
    assert.equal(reuseUrl.searchParams.get("scope"), scopes[0]);
    assert.equal(reuseUrl.searchParams.get("redirect_uri"), `${origin}/api/personal-connectors/google-drive/oauth/callback`);
    assert.equal((await personalDriveConnectionStatus(owner.id, localSetup)).connected, false, "shared app is not consent");

    const prepared=await savePersonalDriveSetup(stranger,{useAltazorApp:true,confirmed:true},process.env.APP_URL!,{env:{APP_URL:process.env.APP_URL,ALTAZOR_GOOGLE_CLIENT_ID:"fixture-shared-app",ALTAZOR_GOOGLE_CLIENT_SECRET:"fixture-shared-secret"}});assert.equal(prepared.configured,true);assert.equal(prepared.source,"altazor");const storedSetup=await prisma.integrationConfig.findUniqueOrThrow({where:{provider:"personal-drive-oauth"}});assert.ok(!storedSetup.configJson.includes("fixture-shared-secret"),"an operator alias never copies tokens or secret material");
    assert.equal((await personalDriveConnectionStatus(owner.id)).connected,false);
    async function start(){const value=await startPersonalDriveOAuth(actor,{requestId:randomUUID(),confirmed:true},process.env.APP_URL!),url=new URL(value.authUrl);assert.equal(url.searchParams.get("access_type"),"offline");assert.equal(url.searchParams.get("scope"),scopes[0]);assert.equal(url.searchParams.get("include_granted_scopes"),"false");const attempt=await prisma.personalOAuthAttempt.findUniqueOrThrow({where:{id:value.attemptId}}),binding=unseal<{verifier:string}>(attempt.resultEnc!,`google-drive:content:attempt:${owner.id}:${attempt.id}`);assert.equal(url.searchParams.get("code_challenge"),createHash("sha256").update(binding.verifier).digest("base64url"));assert.ok(!value.authUrl.includes("fixture-personal-drive-secret"));return{...value,state:url.searchParams.get("state")!};}
    wrongScope=true;const denied=await start();await assert.rejects(receivePersonalDriveCallback({state:denied.state,code:"fixture-code"}),status(409));assert.equal(await prisma.personalConnectorAccount.count({where:{ownerId:owner.id,provider}}),0);wrongScope=false;
    const wrongPurpose=await start(),beforePurpose=exchanges;await prisma.personalOAuthAttempt.update({where:{id:wrongPurpose.attemptId},data:{provider:"altazor-desktop:google"}});await assert.rejects(receivePersonalDriveCallback({state:wrongPurpose.state,code:"fixture-code"}),status(409));assert.equal(exchanges,beforePurpose);
    const wrongNonce=await start();await prisma.personalOAuthAttempt.update({where:{id:wrongNonce.attemptId},data:{nonceHash:"0".repeat(64)}});await assert.rejects(receivePersonalDriveCallback({state:wrongNonce.state,code:"fixture-code"}),status(409));assert.equal(exchanges,beforePurpose);
    const first=await start();await receivePersonalDriveCallback({state:first.state,code:"fixture-code"});await assert.rejects(receivePersonalDriveCallback({state:first.state,code:"fixture-code"}),status(409));await assert.rejects(completePersonalDriveOAuth(stranger,first.attemptId),status(409));
    const connected=await completePersonalDriveOAuth(actor,first.attemptId);assert.equal(connected.complete,true);const safe=await personalDriveConnectionStatus(owner.id);assert.equal(safe.connected,true);assert.ok(!JSON.stringify(safe).includes("fixture-access"));assert.ok(!JSON.stringify(safe).includes("fixture-refresh"));
    const connection=safe.connectionId!,session=await requirePersonalDriveSession(owner.id);assert.equal(session.connectionId,connection);assert.ok(!("refreshToken" in session));
    const account=await prisma.personalConnectorAccount.findUniqueOrThrow({where:{ownerId_provider:{ownerId:owner.id,provider}}}),context=`google-drive:content:account:${owner.id}:${account.id}`;
    assert.ok(!account.credentialsEnc?.includes("fixture-access"));const grant=unseal<Record<string,unknown>>(account.credentialsEnc!,context);grant.expiresAt=Date.now()-1;await prisma.personalConnectorAccount.update({where:{id:account.id},data:{credentialsEnc:seal(grant,context),expiresAt:new Date(0)}});
    const refreshed=await Promise.allSettled([requirePersonalDriveSession(owner.id),requirePersonalDriveSession(owner.id)]);assert.equal(refreshed.filter(value=>value.status==="fulfilled").length,1);assert.equal(refreshes,1);assert.equal((await requirePersonalDriveSession(owner.id)).connectionId,connection);
    causaId=(await prisma.causa.create({data:{titulo:"Causa ficticia con Drive personal",tribunal:"Tribunal ficticio",materia:"civil",acceso:"equipo",abogadoId:owner.id}})).id;
    const folders=await listPersonalDriveFolders(causaId,owner,{}, {fetch:fixtureFetch});assert.equal(folders.folders[0].name,"Carpeta ficticia");assert.equal(folders.connectionId,connection);assert.equal(downloads,0,"folder browsing is metadata only");
    await assert.rejects(listPersonalDriveFolders(causaId,other,{}, {fetch:fixtureFetch}),status(404));
    await linkPersonalDriveFolder(causaId,owner,folders.folders[0].id,{connectionId:folders.connectionId,fetch:fixtureFetch});
    const chosen=await prisma.driveSyncSubscription.findUniqueOrThrow({where:{causaId}});assert.equal(chosen.account,"personal");assert.equal(chosen.enabled,false);assert.equal((await prisma.causa.findUniqueOrThrow({where:{id:causaId}})).googleDriveFolderId,folderId);assert.equal(downloads,0,"choosing a folder never downloads its contents before activation");
    await assert.rejects(linkPersonalDriveFolder(causaId,owner,folderId,{connectionId:"0".repeat(64),fetch:fixtureFetch}),status(409));
    const importDeps=await driveImportDependenciesForActor(causaId,owner);const manualList=await listDriveImportCandidates(causaId,owner,null,{...importDeps,fetch:fixtureFetch});assert.equal(manualList.files[0].id,fileId);assert.equal(downloads,0);
    const beforeAcl=providerCalls;await prisma.causa.update({where:{id:causaId},data:{abogadoId:other.id}});await assert.rejects(listPersonalDriveFolders(causaId,owner,{}, {fetch:fixtureFetch}),status(404));await assert.rejects(linkPersonalDriveFolder(causaId,owner,folderId,{connectionId:connection,fetch:fixtureFetch}),status(404));assert.equal(providerCalls,beforeAcl,"revoked cause access is rejected before using Google credentials");await prisma.causa.update({where:{id:causaId},data:{abogadoId:owner.id}});
    await configureDriveSync(causaId,owner,{enabled:true,intervalMinutes:60,account:"personal"});const settings=await prisma.driveSyncSubscription.findUniqueOrThrow({where:{causaId}});assert.equal(settings.connectionId,connection);
    const imported=await processDueDriveSyncSubscriptions({causaId,fetch:fixtureFetch,enqueue:()=>true});assert.equal(imported[0].imported,1);assert.equal(downloads,1);assert.equal(await prisma.documento.count({where:{causaId}}),1);
    const refreshedAccount=await prisma.personalConnectorAccount.findUniqueOrThrow({where:{id:account.id}}),newGrant=unseal<Record<string,unknown>>(refreshedAccount.credentialsEnc!,context);newGrant.generation="fixture-new-generation";await prisma.personalConnectorAccount.update({where:{id:account.id},data:{credentialsEnc:seal(newGrant,context)}});
    const beforeStalePicker=providerCalls;await assert.rejects(listPersonalDriveFolders(causaId,owner,{connectionId:connection}, {fetch:fixtureFetch}),status(409));await assert.rejects(linkPersonalDriveFolder(causaId,owner,folderId,{connectionId:connection,fetch:fixtureFetch}),status(409));assert.equal(providerCalls,beforeStalePicker,"a stale picker binding cannot read or choose a folder after reconnect");
    await assert.rejects(assertPersonalDriveConnection(owner.id,connection),status(409));await prisma.driveSyncSubscription.update({where:{causaId},data:{nextRunAt:new Date(0)}});const before=providerCalls;await processDueDriveSyncSubscriptions({causaId,fetch:fixtureFetch,enqueue:()=>true});assert.equal(providerCalls,before);assert.equal((await prisma.driveSyncSubscription.findUniqueOrThrow({where:{causaId}})).enabled,false);
    const pending=await start();await disconnectPersonalDrive(actor);await assert.rejects(receivePersonalDriveCallback({state:pending.state,code:"fixture-code"}),status(409));assert.equal((await personalDriveConnectionStatus(owner.id)).connected,false);assert.equal((await prisma.personalConnectorAccount.findUniqueOrThrow({where:{id:account.id}})).credentialsEnc,null);
    const stale=await start();await prisma.user.update({where:{id:owner.id},data:{sessionVersion:{increment:1}}});await assert.rejects(receivePersonalDriveCallback({state:stale.state,code:"fixture-code"}),status(409));assert.equal(exchanges,2,"cancelled/stale returns cannot exchange another code");
    console.log("Personal Drive passed: exact content/offline consent, PKCE/state, metadata-only denial, private encrypted tokens, replay/session ownership, refresh CAS, native metadata folder picker/selection, stale picker/ACL denial, real folder-worker integration, identity generation pause, disconnect and stale-session denial (fictitious provider only).");
  }finally{globalThis.fetch=originalFetch;if(causaId){await prisma.documento.deleteMany({where:{causaId}});await prisma.causa.deleteMany({where:{id:causaId}});}await prisma.auditEvent.deleteMany({where:{actorId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});for(const [name,prior] of [["personal-drive-oauth",priorOperator],["altazor-oauth-google",priorWorkspace]] as const){if(prior)await prisma.integrationConfig.upsert({where:{provider:name},create:prior,update:{enabled:prior.enabled,configJson:prior.configJson}});else await prisma.integrationConfig.deleteMany({where:{provider:name}});}await prisma.$disconnect();await rm(root,{recursive:true,force:true});for(const key of Object.keys(process.env))if(!(key in priorEnv))delete process.env[key];Object.assign(process.env,priorEnv);}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
