/** Closed-session history, real disposable PostgreSQL, zero gateway requests. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { listComputerFileHistory, fileHistoryQuery } from "./file-history";
import { normalizeVerifiedFileReceipt } from "./file-receipt";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());
  const tag=randomUUID(), connector="altazor-google-0123456789abcdef", otherConnector="altazor-google-fedcba9876543210";
  const priorFetch=globalThis.fetch; let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error("External requests are forbidden");};
  const owner=await prisma.user.create({data:{email:`${tag}@history.invalid`,name:"Fictitious owner",password:"not-a-login",role:"abogado"}});
  const other=await prisma.user.create({data:{email:`${tag}-other@history.invalid`,name:"Fictitious other",password:"not-a-login",role:"admin"}});
  const causa=await prisma.causa.create({data:{titulo:"Fictitious history",tribunal:"Fixture",materia:"Fixture",acceso:"equipo",abogadoId:owner.id}});
  const workspace=await prisma.altazorComputerWorkspace.create({data:{ownerId:owner.id,causaId:causa.id,scopeKey:`causa:${causa.id}`,endpoint:`http://127.0.0.1:19000/${tag}`,providerName:"fixture",dedicatedDeclaredAt:new Date(),enabled:false}});
  const personal=await prisma.altazorComputerWorkspace.create({data:{ownerId:owner.id,scopeKey:"personal",endpoint:`http://127.0.0.1:19001/${tag}`,providerName:"fixture",dedicatedDeclaredAt:new Date(),enabled:false}});
  const session=await prisma.altazorComputerSession.create({data:{ownerId:owner.id,workspaceId:workspace.id,requestId:tag,kittyName:tag,kittyId:"fictitious-kitty",chatId:"fictitious-chat",state:"closed",expiresAt:new Date(0),connectorNamesJson:JSON.stringify([connector,otherConnector])}});
  const personalSession=await prisma.altazorComputerSession.create({data:{ownerId:owner.id,workspaceId:personal.id,requestId:`personal-${tag}`,kittyName:`personal-${tag}`,kittyId:"fictitious-kitty",chatId:"fictitious-chat",state:"ready",connectorNamesJson:JSON.stringify([connector])}});
  async function stage(outcome:"confirmed"|"failed"|"unknown"|"forged", options:{id?:string;at?:Date;alias?:string;sessionId?:string}={}) {
    const id=options.id??randomUUID(),approvalId=`approval_${randomUUID()}`,at=options.at??new Date("2026-11-01T12:00:00Z");
    const name="Fixture.pdf",alias=options.alias??connector,args={id:`file_${id}`,name};
    const task={kind:"google-workspace" as const,connector:alias,action:"download_file" as const,args};
    await prisma.altazorComputerAction.create({data:{id,ownerId:owner.id,sessionId:options.sessionId??session.id,requestId:`stage_${id}`,kind:"message",inputHash:"a".repeat(64),status:"completed",createdAt:at,resultJson:JSON.stringify({staged:true,accepted:true,state:"pending",requestId:id,approvalId,fileTask:task})}});
    if(outcome!=="unknown") {
      const binding={requestId:id,approvalId,chatId:"fictitious-chat",kittyId:"fictitious-kitty",...task};
      const file=normalizeVerifiedFileReceipt({state:"desktop_verified",request_id:id,approval_id:approvalId,chat_id:binding.chatId,kitty:binding.kittyId,connector:alias,kind:task.kind,action:task.action,target:args,local_path:`/home/kitty/work/imports/${"a".repeat(64)}/${name}`,name,bytes:4200,sha256:"a".repeat(64),first_line:"Private content must never be returned"},binding);
      await prisma.altazorComputerAction.create({data:{ownerId:owner.id,sessionId:options.sessionId??session.id,requestId:`approval_${id}`,kind:"connector_approval",inputHash:"b".repeat(64),status:"completed",createdAt:at,resultJson:JSON.stringify({id:approvalId,status:"approved",canContinue:false,failed:outcome==="failed",error:"/private/machine/path and fictitious-token",verifiedFile:outcome==="forged"?{...file,target:{id:"substituted"}}:file})}});
    }
    return id;
  }
  try {
    const confirmed=await stage("confirmed"),failed=await stage("failed"),unknown=await stage("unknown"),forged=await stage("forged");
    await stage("confirmed",{sessionId:personalSession.id});
    const otherConnection=await stage("confirmed",{alias:otherConnector});
    const result=await listComputerFileHistory(owner,{causaId:causa.id});
    assert.equal(result.items.find(item=>item.id===confirmed)?.status,"confirmed");
    assert.equal(result.items.find(item=>item.id===failed)?.status,"failed");
    assert.equal(result.items.find(item=>item.id===unknown)?.status,"unknown");
    assert.equal(result.items.find(item=>item.id===forged)?.status,"unknown","a substituted target never confirms a historical download");
    assert.equal(result.items.length,5,"personal and case scopes remain separate");
    assert.equal((await listComputerFileHistory(owner,{})).items.length,1);
    await assert.rejects(listComputerFileHistory(other,{causaId:causa.id}),error=>(error as {status?:number}).status===404);
    await prisma.causaMiembro.create({data:{causaId:causa.id,userId:other.id,rol:"supervisor"}});
    assert.deepEqual((await listComputerFileHistory(other,{causaId:causa.id})).items,[],"even an authorized administrator cannot read another owner's receipts");
    assert.equal((await listComputerFileHistory(owner,{causaId:causa.id,status:"failed"})).items.length,1);
    assert.deepEqual((await listComputerFileHistory(owner,{causaId:causa.id,connector:otherConnector})).items.map(item=>item.id),[otherConnection]);
    assert.doesNotMatch(JSON.stringify(result),/\/home\/|\/private\/|fictitious-token|Private content|file_|firstLine|localPath|verifiedFile|sha256/);
    const chileBoundary=await stage("confirmed",{at:new Date("2026-11-02T01:00:00Z")});
    assert.equal((await listComputerFileHistory(owner,{causaId:causa.id,from:"2026-11-02"})).items.length,0,"dates use Chile, not the UTC day");
    assert.ok((await listComputerFileHistory(owner,{causaId:causa.id,to:"2026-11-01"})).items.some(item=>item.id===chileBoundary));
    assert.equal(fileHistoryQuery.safeParse({from:"2026-02-30"}).success,false);
    assert.equal(fileHistoryQuery.safeParse({from:"2026-11-02",to:"2026-11-01"}).success,false);
    await assert.rejects(listComputerFileHistory(owner,{cursor:"invalid"}),/página/);
    for(let i=0;i<26;i++)await stage(i===0?"confirmed":"unknown",{id:`page_${tag.slice(0,8)}_${String(i).padStart(3,"0")}`,at:new Date("2026-10-01T12:00:00Z")});
    const filter={causaId:causa.id,from:"2026-10-01",to:"2026-10-01"};
    const first=await listComputerFileHistory(owner,filter);assert.equal(first.items.length,25);assert.ok(first.nextCursor);
    const next=await listComputerFileHistory(owner,{...filter,cursor:first.nextCursor!});assert.equal(next.items.length,1);assert.equal(next.nextCursor,null);assert.ok(!first.items.some(item=>item.id===next.items[0].id),"equal timestamps use a stable ID cursor");
    const filtered=await listComputerFileHistory(owner,{...filter,status:"confirmed"});assert.equal(filtered.items.length,0);assert.ok(filtered.nextCursor,"an empty filtered page must preserve the next position");
    assert.equal((await listComputerFileHistory(owner,{...filter,status:"confirmed",cursor:filtered.nextCursor!})).items.length,1);
    await prisma.causa.update({where:{id:causa.id},data:{abogadoId:null}});
    await assert.rejects(listComputerFileHistory(owner,{causaId:causa.id}),error=>(error as {status?:number}).status===404 || (error as {status?:number}).status===403);
    await prisma.causa.update({where:{id:causa.id},data:{abogadoId:owner.id}});
    const sessionsRead=prisma.altazorComputerSession.findMany;
    prisma.altazorComputerSession.findMany=(async (args: Parameters<typeof sessionsRead>[0])=>{
      const result=await sessionsRead(args);
      await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:"assistant.use"}});
      return result;
    }) as typeof sessionsRead;
    try { await assert.rejects(listComputerFileHistory(owner,{}),error=>(error as {status?:number}).status===403,"revocation while reading discards already projected rows"); }
    finally { prisma.altazorComputerSession.findMany=sessionsRead; }
    await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:"assistant.use"}});
    await assert.rejects(listComputerFileHistory(owner,{}),error=>(error as {status?:number}).status===403);
    assert.equal(requests,0,"reading history cannot contact a gateway, re-open a session or download a file");
    console.log("File history PostgreSQL: closed/expired/disabled desktop, account/case isolation, current permissions, filters, stable pagination, forged/failed/uncertain receipts, no private fields and zero network passed.");
  } finally {
    globalThis.fetch=priorFetch;
    await prisma.altazorComputerAction.deleteMany({where:{ownerId:owner.id}});
    await prisma.altazorComputerSession.deleteMany({where:{ownerId:owner.id}});
    await prisma.altazorComputerWorkspace.deleteMany({where:{ownerId:owner.id}});
    await prisma.causa.delete({where:{id:causa.id}});
    await prisma.user.deleteMany({where:{id:{in:[owner.id,other.id]}}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
