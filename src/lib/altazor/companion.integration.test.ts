/** Explicit disposable PostgreSQL. No model/network, personal account or live Host. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { readAltazorCompanion, patchAltazorCompanion } from "./companion";
import { createAltazorConversation, createAltazorTurn, executeAltazorTurn, readAltazorConversation } from "./conversations";
import { runQueuedAltazorTurns, ALTAZOR_QUEUE_TTL_MS } from "./worker";
import { sha256 } from "@/lib/evidence/fragments";
import type { AltazorDestination, AltazorServiceOptions } from "./types";
const status = (expected: number) => (error: unknown) => (error as {status?:number}).status === expected;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url,new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({datasources:{db:{url}}}), tag = randomUUID(), owners: string[] = [];
  const destination: AltazorDestination = {provider:"fixture",model:"fixture",endpoint:"Local ficticio",endpointHash:sha256("fixture"),remote:false,permitted:true,key:sha256("fixture-key")};
  let calls = 0, network = 0; const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { network++; throw Error("No external calls permitted in fixture"); }) as typeof fetch;
  const options: AltazorServiceOptions = {destination:async()=>destination, execute:async input => { calls++; await input.authorizeContext?.(); assert(input.now instanceof Date,"relative dates are anchored to submission"); return {planId:null,previewSteps:[],autoResults:[{toolId:"respuesta.libre",result:{ok:true,message:"Respuesta ficticia"}}],streamEvents:[],classification:{source:"rule",toolIds:["respuesta.libre"],prompt:"fixture"}}; }};
  try {
    const owner = await db.user.create({data:{name:"Companion ficticio",email:`${tag}@companion.invalid`,role:"abogado",password:"not-a-login"}}); owners.push(owner.id);
    const other = await db.user.create({data:{name:"Otro ficticio",email:`${tag}-other@companion.invalid`,role:"abogado",password:"not-a-login"}}); owners.push(other.id);
    const create = async () => (await createAltazorConversation({requestId:randomUUID(),title:"Privado ficticio"},owner,db)).conversation.id;
    const chat = await create(), strangerChat = (await createAltazorConversation({requestId:randomUUID(),title:"Ajeno ficticio"},other,db)).conversation.id;
    assert.deepEqual(await readAltazorCompanion(owner,db),{activeConversationId:null,selectionUnavailable:false,memoryEnabled:true,backgroundEnabled:true,revision:0});
    let pref = await patchAltazorCompanion({expectedRevision:0,activeConversationId:chat},owner,db);
    assert.equal(pref.activeConversationId,chat); assert.equal((await readAltazorCompanion(other,db)).activeConversationId,null);
    await assert.rejects(patchAltazorCompanion({expectedRevision:pref.revision,activeConversationId:strangerChat},owner,db),status(404));
    await assert.rejects(patchAltazorCompanion({expectedRevision:0,memoryEnabled:false},owner,db),status(409));
    pref = await patchAltazorCompanion({expectedRevision:pref.revision,memoryEnabled:false,backgroundEnabled:false},owner,db);
    const queue = async (id=chat) => { const row = await db.altazorConversation.findUniqueOrThrow({where:{id}}); return (await createAltazorTurn(id,{requestId:randomUUID(),expectedRevision:row.revision,text:"Encargo ficticio",destinationKey:destination.key},owner,db,options)).turnId; };
    const turn = await queue(); assert.equal((await runQueuedAltazorTurns(db,options)).considered,0); assert.equal(calls,0);
    pref = await patchAltazorCompanion({expectedRevision:pref.revision,backgroundEnabled:true},owner,db);
    // Browser and worker race through the same CAS; one execution, no duplicate.
    await Promise.all([runQueuedAltazorTurns(db,options),executeAltazorTurn(chat,turn,owner,db,options)]);
    assert.equal(calls,1); assert.equal((await db.altazorTurn.findUniqueOrThrow({where:{id:turn}})).status,"completed");
    const staleChat = await create(), staleTurn = await queue(staleChat);
    await db.user.update({where:{id:owner.id},data:{sessionVersion:{increment:1}}});
    assert.equal((await runQueuedAltazorTurns(db,options)).blocked,1); assert.equal(calls,1); assert.equal((await db.altazorTurn.findUniqueOrThrow({where:{id:staleTurn}})).status,"blocked");
    const legacyChat = await create(), legacyTurn = await queue(legacyChat);
    await db.altazorTurn.update({where:{id:legacyTurn},data:{actorSessionVersion:null}});
    assert.equal((await runQueuedAltazorTurns(db,options)).considered,0); assert.equal(calls,1);
    const lostChat = await create(), lost = await queue(lostChat);
    await db.altazorTurn.update({where:{id:lost},data:{status:"running",leaseToken:"expired-fixture",leaseExpiresAt:new Date(0)}});
    await runQueuedAltazorTurns(db,options); assert.equal(calls,1);
    assert.equal((await readAltazorConversation(lostChat,owner,db,{},options)).turns[0].status,"interrupted");
    const expiredChat = await create(), expired = await queue(expiredChat);
    await db.altazorTurn.update({where:{id:expired},data:{createdAt:new Date(Date.now()-ALTAZOR_QUEUE_TTL_MS-1000)}});
    assert.equal((await runQueuedAltazorTurns(db,options)).expired,1); assert.equal(calls,1);
    const revokedChat = await create(); await queue(revokedChat);
    await db.user.update({where:{id:owner.id},data:{capabilityRevokes:"assistant.use"}});
    assert.equal((await runQueuedAltazorTurns(db,options)).blocked,1); assert.equal(calls,1);
    await db.user.update({where:{id:owner.id},data:{capabilityRevokes:""}});
    // A tampered cross-owner pointer cannot reveal or reopen the foreign chat.
    await db.altazorCompanion.update({where:{ownerId:owner.id},data:{activeConversationId:strangerChat}});
    assert.equal((await readAltazorCompanion(owner,db)).activeConversationId,null); assert.equal((await readAltazorCompanion(owner,db)).selectionUnavailable,true);
    assert.equal(network,0);
    console.log("Companion integration passed: private selection/preferences, stale revision, browser/worker CAS, anchored dates, background opt-out, session/capability revocation, no legacy/expired-running replay, queue expiry and foreign pointer rejection; zero network.");
  } finally { globalThis.fetch = originalFetch; await db.user.deleteMany({where:{id:{in:owners}}}); await db.$disconnect(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
