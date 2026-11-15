import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { acceptTrustedDevice,issueTrustedDevice,listTrustedDevices,revokeTrustedDevices,trustedDeviceLabel } from "./trusted-devices";
async function main(){
 assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());
 const prior=process.env.SESSION_SECRET;process.env.SESSION_SECRET="fictitious-trusted-devices-secret-for-disposable-tests-2026";
 const tag=randomUUID(),users:string[]=[];
 try{
  const user=await prisma.user.create({data:{email:`${tag}@devices.invalid`,name:"Fixture",password:"fictitious-hashed-password",totpEnabled:true,totpSecretEnc:"fictitious-encrypted-secret"}});users.push(user.id);
  const other=await prisma.user.create({data:{email:`${tag}-other@devices.invalid`,name:"Other fixture",password:"not-a-login",totpEnabled:true,totpSecretEnc:"other-secret"}});users.push(other.id);
  const issue=async()=>{const current=await prisma.user.findUniqueOrThrow({where:{id:user.id}});return prisma.$transaction(tx=>issueTrustedDevice(current,"Mozilla Chrome/123 Windows secret-raw-agent",tx));};
  await withRejectedAudit(user.id,"auth.device_remembered",async()=>{await assert.rejects(issue());assert.equal(await prisma.trustedDevice.count({where:{userId:user.id}}),0);});
  const first=await issue(),second=await issue();
  let list=await listTrustedDevices(user.id,first.token);assert.equal(list.devices.length,2);assert.equal(list.devices.filter(row=>row.current).length,1);
  assert.equal(trustedDeviceLabel("Firefox/123 Linux private-agent"),"Firefox · Linux");
  assert.doesNotMatch(JSON.stringify(list),new RegExp(`${first.token}|tokenHash|credentialBinding|password|private-agent|secret-raw-agent|location|ipAddress`));
  const stored=await prisma.trustedDevice.findFirstOrThrow({where:{userId:user.id}});assert.notEqual(stored.tokenHash,first.token);
  assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,first.token),true);
  assert.equal(await acceptTrustedDevice(other.id,other.sessionVersion,first.token),false);
  await assert.rejects(revokeTrustedDevices(other.id,list.devices[0].id),error=>(error as {status?:number}).status===404);
  const current=list.devices.find(row=>row.current)!;await revokeTrustedDevices(user.id,current.id);
  assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,first.token),false);
  assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,second.token),true);
  await revokeTrustedDevices(user.id);assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,second.token),false);
  const expired=await issue();await prisma.trustedDevice.updateMany({where:{userId:user.id,revokedAt:null},data:{expiresAt:new Date(0)}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,expired.token),false);
  const changed=await issue();await prisma.user.update({where:{id:user.id},data:{password:"new-password-without-version-bump"}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,changed.token),false,"credential binding also rejects legacy password changes");
  const rotated=await issue();await prisma.user.update({where:{id:user.id},data:{totpSecretEnc:"rotated-secret"}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion,rotated.token),false);
  const version=await issue();await prisma.user.update({where:{id:user.id},data:{sessionVersion:{increment:1}}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion+1,version.token),true,"normal session rotation does not discard trusted devices");await prisma.user.update({where:{id:user.id},data:{trustedDeviceVersion:{increment:1}}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion+1,version.token),false);assert.equal((await listTrustedDevices(user.id)).devices.length,0);
  const disabled=await issue();await prisma.user.update({where:{id:user.id},data:{totpEnabled:false}});assert.equal(await acceptTrustedDevice(user.id,user.sessionVersion+1,disabled.token),false);
  list=await listTrustedDevices(user.id);assert.equal(list.devices.length,0);
  const audit=await prisma.auditEvent.findMany({where:{actorId:user.id}});assert.doesNotMatch(JSON.stringify(audit),new RegExp(`${first.token}|tokenHash|credentialBinding|secret-raw-agent`));
  console.log("Trusted devices: individual/all revocation, account isolation, expiry, password/factor/version changes, audit rollback and minimal metadata passed.");
 }finally{await prisma.auditEvent.deleteMany({where:{actorId:{in:users}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();if(prior===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=prior;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
