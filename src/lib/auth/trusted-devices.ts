import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { isStrongSessionSecret } from "@/lib/security/production-env";
export const TRUSTED_DEVICE_COOKIE="lexopen_trusted_device";
export const TRUSTED_DEVICE_MAX_AGE=30*24*60*60;
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
type AuthUser=Pick<User,"id"|"sessionVersion"|"password"|"totpSecretEnc">;
function binding(user:AuthUser & {trustedDeviceVersion:number}){
  const key=process.env.SESSION_SECRET;
  if(!isStrongSessionSecret(key))throw httpError("No se pudo comprobar el equipo",500);
  return createHmac("sha256",key!).update("lexopen-trusted-device.v1:").update(JSON.stringify([user.id,user.trustedDeviceVersion,user.password,user.totpSecretEnc])).digest("hex");
}
export function trustedDeviceLabel(agent:string){
  const browser=/Edg\//.test(agent)?"Edge":/Firefox\//.test(agent)?"Firefox":/Chrome\//.test(agent)?"Chrome":/Safari\//.test(agent)?"Safari":"Navegador";
  const os=/Android/.test(agent)?"Android":/iPhone|iPad/.test(agent)?"iOS":/Windows/.test(agent)?"Windows":/Macintosh|Mac OS X/.test(agent)?"macOS":/Linux/.test(agent)?"Linux":"Equipo";
  return `${browser} · ${os}`;
}
async function lockedUser(tx:Prisma.TransactionClient,id:string){
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id}});if(!user)throw httpError("Sesión expirada",401);return user;
}
/** Called only inside the transaction accepting the current user's second factor. */
export async function issueTrustedDevice(expected:AuthUser,agent:string,tx:Prisma.TransactionClient){
  const user=await lockedUser(tx,expected.id);
  if(!user.totpEnabled||!user.totpSecretEnc||user.sessionVersion!==expected.sessionVersion||user.password!==expected.password||user.totpSecretEnc!==expected.totpSecretEnc)throw httpError("La seguridad de la cuenta cambió. Inicie sesión de nuevo.",409);
  const token=randomBytes(32).toString("base64url"), label=trustedDeviceLabel(agent.slice(0,1024));
  const row=await tx.trustedDevice.create({data:{userId:user.id,tokenHash:hash(token),credentialBinding:binding(user),securityVersion:user.trustedDeviceVersion,label,expiresAt:new Date(Date.now()+TRUSTED_DEVICE_MAX_AGE*1000)}});
  await writeAuditStrict({actorId:user.id,action:"auth.device_remembered",entityType:"TrustedDevice",entityId:row.id,after:{label,expiresAt:row.expiresAt.toISOString()}},tx);
  return {token,maxAge:TRUSTED_DEVICE_MAX_AGE};
}
/** Password must already have been checked; this substitutes only the second factor. */
export async function acceptTrustedDevice(userId:string,version:number,token:string|undefined){
  if(!token||!tokenPattern.test(token))return false;
  return prisma.$transaction(async tx=>{
    const user=await lockedUser(tx,userId);
    if(!user.totpEnabled||!user.totpSecretEnc||user.sessionVersion!==version)return false;
    const where={userId,tokenHash:hash(token),securityVersion:user.trustedDeviceVersion,credentialBinding:binding(user),revokedAt:null,expiresAt:{gt:new Date()}};
    const row=await tx.trustedDevice.findFirst({where,select:{id:true,label:true}});if(!row)return false;
    const changed=await tx.trustedDevice.updateMany({where:{...where,id:row.id},data:{lastUsedAt:new Date()}});if(!changed.count)return false;
    await writeAuditStrict({actorId:userId,action:"auth.device_used",entityType:"TrustedDevice",entityId:row.id},tx);return true;
  });
}
export async function listTrustedDevices(userId:string,token?:string){
  return prisma.$transaction(async tx=>{
    const user=await lockedUser(tx,userId);
    const rows=user.totpEnabled?await tx.trustedDevice.findMany({where:{userId,revokedAt:null,expiresAt:{gt:new Date()},securityVersion:user.trustedDeviceVersion,credentialBinding:binding(user)},select:{id:true,label:true,createdAt:true,lastUsedAt:true,expiresAt:true,tokenHash:true},orderBy:{lastUsedAt:"desc"},take:101}):[];
    await writeAuditStrict({actorId:userId,action:"auth.devices_read",entityType:"User",entityId:userId,after:{count:Math.min(rows.length,100)}},tx);
    return {devices:rows.slice(0,100).map(row=>({id:row.id,label:row.label,createdAt:row.createdAt.toISOString(),lastUsedAt:row.lastUsedAt.toISOString(),expiresAt:row.expiresAt.toISOString(),current:Boolean(token&&tokenPattern.test(token)&&row.tokenHash===hash(token))})),limited:rows.length>100};
  });
}
export async function revokeTrustedDevices(userId:string,id?:string){
  return prisma.$transaction(async tx=>{
    await lockedUser(tx,userId);
    if(id&&!await tx.trustedDevice.findFirst({where:{id,userId},select:{id:true}}))throw httpError("Equipo no encontrado",404);
    const changed=await tx.trustedDevice.updateMany({where:{userId,...(id?{id}:{}),revokedAt:null},data:{revokedAt:new Date()}});
    await writeAuditStrict({actorId:userId,action:id?"auth.device_revoked":"auth.devices_revoked",entityType:id?"TrustedDevice":"User",entityId:id??userId,after:{count:changed.count}},tx);
    return {revoked:changed.count};
  });
}
