/** Personal content authorization. Tokens stay in this server boundary, never in chats or VM connectors. */
import { createHash, randomUUID } from "node:crypto";
import type { PersonalConnectorAccount, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { altazorActor } from "@/lib/altazor/access";
import { isAdmin } from "@/lib/auth/rbac";
import type { GoogleConfig } from "@/lib/integrations/google";
import type { ConnectorActor } from "../linkedin/account";
import { ConnectorError, constantEqual, digest, randomToken, seal, unseal } from "../core";
import { personalDriveConfig, requirePersonalDriveConfig, driveOrigin, PERSONAL_DRIVE_PROVIDER as provider, PERSONAL_DRIVE_SCOPES as scopes, PERSONAL_DRIVE_CALLBACK, type DriveOptions } from "./config";
import { driveProviderJson, driveIdentity, driveToken, driveExpiry, exactDriveScopes } from "./transport";
type Db=Prisma.TransactionClient;
type Binding={state:string;verifier:string;nonce:string;configurationBinding:string;accountVersion:string|null};
type Grant={version:1;generation:string;configurationBinding:string;actorSessionVersion:number;accessToken:string;refreshToken:string;expiresAt:number;refreshExpiresAt:number|null;subject:string};
const accountWhere=(ownerId:string)=>({ownerId_provider:{ownerId,provider}}),accountContext=(ownerId:string,id:string)=>`google-drive:content:account:${ownerId}:${id}`,attemptContext=(ownerId:string,id:string)=>`google-drive:content:attempt:${ownerId}:${id}`;
const unavailable=()=>new ConnectorError("drive_reconnect_required","Conecte de nuevo su cuenta de Google para leer documentos de Drive.",409);
const operator=(actor:{role:string;capabilityGrants?:string|null;capabilityRevokes?:string|null})=>actor.role==="admin"&&isAdmin(actor);
async function actorFor(ownerId:string,db:Db=prisma){return altazorActor({id:ownerId,role:"abogado"},db);}
async function sessionActor(actor:ConnectorActor,db:Db=prisma){const current=await actorFor(actor.id,db);if(current.sessionVersion!==actor.sessionVersion||!/^[a-f0-9]{64}$/.test(actor.sessionHash))throw new ConnectorError("session_required","Vuelva a iniciar sesión en LexOpen.",401);return current;}
/** Lock the exact session observed above; a concurrent logout must abort the transaction. */
async function reserveSession(actor:ConnectorActor,db:Db){await sessionActor(actor,db);const reserved=await db.user.updateMany({where:{id:actor.id,sessionVersion:actor.sessionVersion},data:{sessionVersion:actor.sessionVersion}});if(reserved.count!==1)throw new ConnectorError("session_required","La sesión cambió. Vuelva a iniciar sesión en LexOpen.",401);}
function grantFor(row:PersonalConnectorAccount,config:Awaited<ReturnType<typeof personalDriveConfig>>,sessionVersion:number){
  if(!row.credentialsEnc||row.clientId!==config.clientId||!["connected","refreshing"].includes(row.status)||row.grantedScopesJson!==JSON.stringify(scopes))throw unavailable();
  const grant=unseal<Grant>(row.credentialsEnc,accountContext(row.ownerId,row.id));
  if(grant.version!==1||grant.configurationBinding!==config.binding||grant.actorSessionVersion!==sessionVersion||!grant.generation||grant.subject!==row.externalSubject||!Number.isSafeInteger(grant.expiresAt)||!grant.refreshToken||grant.refreshExpiresAt!==null&&grant.refreshExpiresAt<=Date.now())throw unavailable();
  driveToken(grant.accessToken);driveToken(grant.refreshToken);return grant;
}
const connectionId=(row:PersonalConnectorAccount,grant:Grant)=>digest(`${provider}:${row.id}:${grant.generation}`);
function accountVersion(row:PersonalConnectorAccount|null){if(!row)return null;try{const grant=unseal<Grant>(row.credentialsEnc||"",accountContext(row.ownerId,row.id));return digest(`${row.id}:${grant.generation}:${["connected","refreshing"].includes(row.status)?"authorized":row.status}`);}catch{return digest(`${row.id}:${row.credentialsEnc}:${row.status}`);}}
function bindingFor(row:{ownerId:string;id:string;resultEnc:string|null}){if(!row.resultEnc)throw unavailable();return unseal<Binding>(row.resultEnc,attemptContext(row.ownerId,row.id));}

export async function personalDriveConnectionStatus(ownerId:string,options:DriveOptions={}){
  const db=options.client||prisma,actor=await actorFor(ownerId,db),config=await personalDriveConfig(options,db),row=await db.personalConnectorAccount.findUnique({where:accountWhere(ownerId)});
  let connected=false,id:string|null=null,reason=config.reason;
  if(config.configured&&row)try{const grant=grantFor(row,config,actor.sessionVersion);connected=row.status==="connected"||row.status==="refreshing"&&Date.now()-row.updatedAt.getTime()<30_000;id=connected?connectionId(row,grant):null;if(!connected)reason="La renovación no se completó. Vuelva a conectar su cuenta.";}catch{reason="Vuelva a conectar su cuenta para renovar el permiso de lectura.";}
  return{connected,configured:config.configured,label:connected?row?.name||"Mi cuenta de Google":"Mi cuenta de Google",email:connected?row?.email||null:null,connectionId:id,scopes:connected?[...scopes]:[],reason:connected?null:reason,lastVerifiedAt:connected?row?.lastVerifiedAt?.toISOString()||null:null,canAdmin:operator(actor)};
}
export async function personalDriveSetupStatus(actor:ConnectorActor,options:DriveOptions={}){
  const current=await sessionActor(actor,options.client||prisma);if(!operator(current))throw new ConnectorError("forbidden","La aplicación de Google la prepara el administrador una sola vez.",403);
  const config=await personalDriveConfig(options);return{configured:config.configured,source:config.source,canEdit:config.source!=="environment",callbackUri:config.redirectUri||null,callbackPath:PERSONAL_DRIVE_CALLBACK,reason:config.reason,registrationUrl:"https://console.cloud.google.com/auth/clients"};
}
export async function savePersonalDriveSetup(actor:ConnectorActor,input:{useAltazorApp:boolean;clientId?:string;clientSecret?:string;confirmed:true},origin:string,options:DriveOptions={}){
  const db=options.client||prisma,current=await sessionActor(actor,db),appUrl=driveOrigin(origin);if(!operator(current))throw new ConnectorError("forbidden","Sólo el administrador puede preparar la aplicación de Google.",403);
  const previous=await personalDriveConfig(options);if(previous.source==="environment")throw new ConnectorError("drive_managed_environment","Esta aplicación está administrada por la configuración del Host.",409);
  if(input.confirmed!==true)throw new ConnectorError("confirmation_required","Confirme la aplicación y su dirección de retorno.");
  if(!input.useAltazorApp&&(!input.clientId?.trim()||!input.clientSecret?.trim()||input.clientId.length>1000||input.clientSecret.length>4000||/[\r\n]/.test(input.clientId+input.clientSecret)))throw new ConnectorError("setup_invalid","Complete los datos de la aplicación de Google.");
  const value=input.useAltazorApp?{useAltazorApp:true,appUrl}:{credentialsEnc:seal({clientId:input.clientId!.trim(),clientSecret:input.clientSecret!.trim(),appUrl},"google-drive:operator:v1")};
  await db.$transaction(async tx=>{const live=await sessionActor(actor,tx);if(!operator(live))throw new ConnectorError("forbidden","Sus permisos cambiaron.",403);await tx.integrationConfig.upsert({where:{provider:"personal-drive-oauth"},create:{provider:"personal-drive-oauth",enabled:true,configJson:JSON.stringify(value)},update:{enabled:true,configJson:JSON.stringify(value)}});await tx.personalOAuthAttempt.updateMany({where:{provider,phase:{in:["pending","exchanging","ready"]}},data:{phase:"cancelled",resultEnc:null,errorCode:"configuration_changed"}});});
  return personalDriveSetupStatus(actor,options);
}
export async function startPersonalDriveOAuth(actor:ConnectorActor,input:{confirmed:true;requestId:string},origin:string,options:DriveOptions={}){
  const db=options.client||prisma;await sessionActor(actor,db);const config=requirePersonalDriveConfig(await personalDriveConfig(options)),id=digest(`${provider}:${actor.id}:${input.requestId}`);
  if(input.confirmed!==true||origin!==config.origin||!/^[A-Za-z0-9-]{10,120}$/.test(input.requestId))throw new ConnectorError("drive_confirmation_required","Confirme el permiso de lectura y abra LexOpen en su dirección configurada.",409);
  let binding:Binding={state:randomToken(),verifier:randomToken(),nonce:randomToken(),configurationBinding:config.binding,accountVersion:null};
  const expiresAt=new Date(Date.now()+10*60_000);
  const attempt=await db.$transaction(async tx=>{
    await reserveSession(actor,tx);
    const old=await tx.personalOAuthAttempt.findUnique({where:{id}});
    if(old){if(old.ownerId!==actor.id||old.provider!==provider||old.phase!=="pending"||old.sessionVersion!==actor.sessionVersion||!constantEqual(old.sessionHash,actor.sessionHash)||old.expiresAt<=new Date())throw new ConnectorError("attempt_consumed","Inicie una conexión nueva.",409);binding=bindingFor(old);if(binding.configurationBinding!==config.binding)throw unavailable();return old;}
    const account=await tx.personalConnectorAccount.findUnique({where:accountWhere(actor.id)});binding.accountVersion=accountVersion(account);
    await tx.personalOAuthAttempt.updateMany({where:{ownerId:actor.id,provider,phase:{in:["pending","exchanging","ready"]}},data:{phase:"cancelled",resultEnc:null}});
    return tx.personalOAuthAttempt.create({data:{id,ownerId:actor.id,provider,stateHash:digest(binding.state),sessionHash:actor.sessionHash,sessionVersion:actor.sessionVersion,nonceHash:digest(binding.nonce),requestedScopesJson:JSON.stringify(scopes),redirectUri:config.redirectUri,clientId:config.clientId,resultEnc:seal(binding,attemptContext(actor.id,id)),expiresAt}});
  });
  const params=new URLSearchParams({client_id:config.clientId,response_type:"code",redirect_uri:config.redirectUri,scope:scopes.join(" "),state:binding.state,code_challenge:createHash("sha256").update(binding.verifier).digest("base64url"),code_challenge_method:"S256",access_type:"offline",prompt:"consent select_account",include_granted_scopes:"false"});
  return{attemptId:attempt.id,authUrl:`https://accounts.google.com/o/oauth2/v2/auth?${params}`,expiresAt:attempt.expiresAt.toISOString()};
}
/** The external browser can return without the original LexOpen cookie. Only stage an encrypted grant. */
export async function receivePersonalDriveCallback(input:{state:string;code?:string;denied?:boolean},options:DriveOptions={}){
  const db=options.client||prisma;if(!/^[A-Za-z0-9_-]{43}$/.test(input.state))throw unavailable();
  const attempt=await db.personalOAuthAttempt.findUnique({where:{stateHash:digest(input.state)}});if(!attempt||attempt.provider!==provider||attempt.expiresAt<=new Date()||attempt.phase!=="pending")throw unavailable();
  const binding=bindingFor(attempt),config=requirePersonalDriveConfig(await personalDriveConfig(options)),actor=await actorFor(attempt.ownerId,db);
  if(actor.sessionVersion!==attempt.sessionVersion||binding.configurationBinding!==config.binding||attempt.clientId!==config.clientId||attempt.redirectUri!==config.redirectUri||attempt.requestedScopesJson!==JSON.stringify(scopes)||!constantEqual(attempt.nonceHash,digest(binding.nonce))||binding.state!==input.state)throw unavailable();
  const claimed=await db.personalOAuthAttempt.updateMany({where:{id:attempt.id,phase:"pending",consumedAt:null,expiresAt:{gt:new Date()}},data:{phase:"exchanging",consumedAt:new Date()}});if(!claimed.count)throw unavailable();
  try{
    if(input.denied||!input.code||input.code.length>8000)throw new ConnectorError("authorization_cancelled","La autorización no se completó.",409);
    const token=await driveProviderJson("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code:input.code,code_verifier:binding.verifier,redirect_uri:config.redirectUri,grant_type:"authorization_code"})},options.fetcher);
    if(!exactDriveScopes(token.scope)||String(token.token_type).toLowerCase()!=="bearer")throw new ConnectorError("drive_scope_mismatch","Google debe confirmar exclusivamente el permiso de lectura de Drive solicitado.",409);
    const accessToken=driveToken(token.access_token),refreshToken=driveToken(token.refresh_token),expiresAt=driveExpiry(token.expires_in),identity=await driveIdentity(accessToken,options.fetcher);
    const refreshSeconds=token.refresh_token_expires_in;if(refreshSeconds!==undefined&&(typeof refreshSeconds!=="number"||!Number.isSafeInteger(refreshSeconds)||refreshSeconds<60||refreshSeconds>400*86400))throw unavailable();
    const grant:Grant={version:1,generation:randomToken(),configurationBinding:config.binding,actorSessionVersion:actor.sessionVersion,accessToken,refreshToken,expiresAt,refreshExpiresAt:typeof refreshSeconds==="number"?Date.now()+refreshSeconds*1000:null,subject:digest(identity.subject)};
    if((await personalDriveConfig(options)).binding!==config.binding||(await actorFor(attempt.ownerId,db)).sessionVersion!==attempt.sessionVersion)throw unavailable();
    const changed=await db.personalOAuthAttempt.updateMany({where:{id:attempt.id,phase:"exchanging",expiresAt:{gt:new Date()}},data:{phase:"ready",resultEnc:seal({binding,grant,identity},attemptContext(actor.id,attempt.id))}});if(!changed.count)throw unavailable();
  }catch(error){await db.personalOAuthAttempt.updateMany({where:{id:attempt.id,phase:"exchanging"},data:{phase:"failed",resultEnc:null,errorCode:error instanceof ConnectorError?error.code:"drive_oauth_failed"}});throw error;}
}
export async function completePersonalDriveOAuth(actor:ConnectorActor,attemptId:string,options:DriveOptions={}){
  const db=options.client||prisma,config=requirePersonalDriveConfig(await personalDriveConfig(options));await sessionActor(actor,db);
  const attempt=await db.personalOAuthAttempt.findFirst({where:{id:attemptId,ownerId:actor.id,provider,sessionHash:actor.sessionHash,sessionVersion:actor.sessionVersion,expiresAt:{gt:new Date()}}});
  if(!attempt)throw unavailable();if(attempt.phase==="completed")return{complete:true,...await personalDriveConnectionStatus(actor.id,options)};
  if(["pending","exchanging"].includes(attempt.phase))return{complete:false,pending:true};if(attempt.phase!=="ready"||!attempt.resultEnc)throw new ConnectorError("drive_oauth_failed","La autorización no se completó. Puede iniciar una conexión nueva.",409);
  const staged=unseal<{binding:Binding;grant:Grant;identity:{name:string;email:string|null}}>(attempt.resultEnc,attemptContext(actor.id,attempt.id));
  if(staged.binding.configurationBinding!==config.binding||staged.grant.configurationBinding!==config.binding||staged.grant.actorSessionVersion!==actor.sessionVersion)throw unavailable();
  await db.$transaction(async tx=>{
    await reserveSession(actor,tx);
    if((await personalDriveConfig(options,tx)).binding!==config.binding)throw unavailable();
    const existing=await tx.personalConnectorAccount.findUnique({where:accountWhere(actor.id)}),version=accountVersion(existing);
    if(version!==staged.binding.accountVersion)throw new ConnectorError("drive_account_changed","La cuenta cambió durante la autorización. Inicie una conexión nueva.",409);
    const changed=await tx.personalOAuthAttempt.updateMany({where:{id:attempt.id,phase:"ready",resultEnc:attempt.resultEnc,expiresAt:{gt:new Date()}},data:{phase:"completed",completedAt:new Date(),resultEnc:null}});if(!changed.count)throw unavailable();
    const id=existing?.id||randomUUID(),data={clientId:config.clientId,externalSubject:staged.grant.subject,name:staged.identity.name,email:staged.identity.email,status:"connected",grantedScopesJson:JSON.stringify(scopes),credentialsEnc:seal(staged.grant,accountContext(actor.id,id)),expiresAt:new Date(staged.grant.expiresAt),lastVerifiedAt:new Date(),lastErrorCode:null};
    await tx.personalConnectorAccount.upsert({where:accountWhere(actor.id),create:{id,ownerId:actor.id,provider,...data},update:data});
    await tx.driveSyncSubscription.updateMany({where:{ownerId:actor.id,account:"personal"},data:{enabled:false,nextRunAt:null,leaseToken:null,leaseExpiresAt:null,generation:{increment:1},status:"paused",note:"La cuenta de Google cambió. Elija y active de nuevo las carpetas que desea actualizar."}});
  });
  return{complete:true,...await personalDriveConnectionStatus(actor.id,options)};
}
export async function assertPersonalDriveConnection(ownerId:string,expectedConnectionId:string,db:Db=prisma,options:DriveOptions={}){
  const actor=await actorFor(ownerId,db),config=requirePersonalDriveConfig(await personalDriveConfig(options,db)),row=await db.personalConnectorAccount.findUnique({where:accountWhere(ownerId)});if(!row)throw unavailable();const grant=grantFor(row,config,actor.sessionVersion);if(connectionId(row,grant)!==expectedConnectionId||row.status==="refreshing"&&Date.now()-row.updatedAt.getTime()>30_000)throw unavailable();
}
export async function requirePersonalDriveSession(ownerId:string,options:DriveOptions={}):Promise<GoogleConfig&{connectionId:string}>{
  const db=options.client||prisma,actor=await actorFor(ownerId,db),config=requirePersonalDriveConfig(await personalDriveConfig(options)),row=await db.personalConnectorAccount.findUnique({where:accountWhere(ownerId)});if(!row)throw unavailable();let grant=grantFor(row,config,actor.sessionVersion);
  if(row.status==="refreshing"){if(Date.now()-row.updatedAt.getTime()>30_000){await db.personalConnectorAccount.updateMany({where:{id:row.id,status:"refreshing",credentialsEnc:row.credentialsEnc,updatedAt:row.updatedAt},data:{status:"reconnect_required",credentialsEnc:null,lastVerifiedAt:null,lastErrorCode:"refresh_interrupted"}});throw unavailable();}throw new ConnectorError("drive_refresh_busy","Google está renovando el acceso. Vuelva a intentarlo en un momento.",409);}
  if(grant.expiresAt<=Date.now()+60_000){
    const claimed=await db.personalConnectorAccount.updateMany({where:{id:row.id,status:"connected",credentialsEnc:row.credentialsEnc},data:{status:"refreshing"}});if(!claimed.count)throw unavailable();
    try{
      const token=await driveProviderJson("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:grant.refreshToken,grant_type:"refresh_token"})},options.fetcher);
      if(token.scope!==undefined&&!exactDriveScopes(token.scope)||String(token.token_type).toLowerCase()!=="bearer")throw unavailable();
      const accessToken=driveToken(token.access_token),expiresAt=driveExpiry(token.expires_in),identity=await driveIdentity(accessToken,options.fetcher);if(digest(identity.subject)!==grant.subject)throw unavailable();
      const next={...grant,accessToken,expiresAt,refreshToken:token.refresh_token===undefined?grant.refreshToken:driveToken(token.refresh_token)};
      await db.$transaction(async tx=>{const current=await actorFor(ownerId,tx);if(current.sessionVersion!==grant.actorSessionVersion||(await personalDriveConfig(options,tx)).binding!==config.binding)throw unavailable();const updated=await tx.personalConnectorAccount.updateMany({where:{id:row.id,status:"refreshing",credentialsEnc:row.credentialsEnc},data:{status:"connected",credentialsEnc:seal(next,accountContext(ownerId,row.id)),expiresAt:new Date(expiresAt),lastVerifiedAt:new Date(),lastErrorCode:null}});if(!updated.count)throw unavailable();});grant=next;
    }catch(error){await db.personalConnectorAccount.updateMany({where:{id:row.id,status:"refreshing",credentialsEnc:row.credentialsEnc},data:{status:"reconnect_required",credentialsEnc:null,lastVerifiedAt:null,lastErrorCode:"refresh_failed"}});throw error;}
  }
  const id=connectionId(row,grant);await assertPersonalDriveConnection(ownerId,id,db,options);
  return{accessToken:grant.accessToken,connectedEmail:row.email||undefined,tokenExpiresAt:grant.expiresAt,scopes:[...scopes],syncDrive:true,syncCalendar:false,connectionId:id};
}
export async function disconnectPersonalDrive(actor:ConnectorActor,options:DriveOptions={}){
  const db=options.client||prisma;await sessionActor(actor,db);
  await db.$transaction(async tx=>{await reserveSession(actor,tx);await tx.personalConnectorAccount.updateMany({where:{ownerId:actor.id,provider},data:{status:"disconnected",credentialsEnc:null,grantedScopesJson:null,expiresAt:null,lastVerifiedAt:null,lastErrorCode:null}});await tx.personalOAuthAttempt.updateMany({where:{ownerId:actor.id,provider,phase:{in:["pending","exchanging","ready"]}},data:{phase:"cancelled",resultEnc:null}});await tx.driveSyncSubscription.updateMany({where:{ownerId:actor.id,account:"personal"},data:{enabled:false,nextRunAt:null,leaseToken:null,leaseExpiresAt:null,generation:{increment:1},status:"paused",note:"Cuenta personal desconectada. Las copias conservadas siguen disponibles."}});});
  return personalDriveConnectionStatus(actor.id,options);
}
