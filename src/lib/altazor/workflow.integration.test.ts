/** Fictitious cause → private hearing → cited response → private writing. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { bookMetadataSchema } from "@/lib/books/ingest";
import { importBook, readBook } from "@/lib/books/service";
import { readCaseWriting, listCaseWritingHistory } from "@/lib/writings/service";
import { storePlan } from "@/lib/assistant/plan-store";
import { getTool } from "@/lib/assistant/tools/registry";
import { resolveWorkflowToolInput } from "@/lib/assistant/tools/workflow";
import { resolveLibrarySyncInput } from "@/lib/assistant/tools/library-sync";
import type { AssistantIntentId, ToolContext } from "@/lib/assistant/types";
import { sha256 } from "@/lib/evidence/fragments";
import { createAltazorConversation, createAltazorTurn, executeAltazorTurn, confirmAltazorTurn, readAltazorConversation } from "./conversations";
import type { AltazorDestination, AltazorServiceOptions } from "./types";
import type { AltazorSourceInput } from "./resource-input";

async function main() {
  const url=assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);assert.equal(url,new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET,process.env.S3_ACCESS_KEY_ID,process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fictitious storage");
  const storage=await mkdtemp(path.join(tmpdir(),"lexopen-altazor-flow-")),priorStorage=process.env.STORAGE_PATH; process.env.STORAGE_PATH=storage;
  const db=new PrismaClient({datasources:{db:{url}}}),tag=randomUUID(),users:string[]=[],cases:string[]=[],plans:string[]=[];
  const originalFetch=globalThis.fetch;let network=0; globalThis.fetch=(async()=>{network++;throw Error("No provider allowed in fixture");}) as typeof fetch;
  const destination:AltazorDestination={provider:"fixture",model:"fixture",endpoint:"Local ficticio",endpointHash:sha256("fixture"),remote:false,permitted:true,key:sha256("fixture")};
  const base:AltazorServiceOptions={destination:async()=>destination};
  try {
    const owner=await db.user.create({data:{email:`${tag}@flow.invalid`,name:"Titular ficticio",role:"abogado",password:"not-a-login"}});users.push(owner.id);
    const colleague=await db.user.create({data:{email:`${tag}-other@flow.invalid`,name:"Colega ficticio",role:"abogado",password:"not-a-login"}});users.push(colleague.id);
    const cause=await db.causa.create({data:{titulo:"Causa ficticia ALTAZOR",tribunal:"Tribunal ficticio",materia:"civil",acceso:"equipo",abogadoId:owner.id}});cases.push(cause.id);
    await db.causaMiembro.create({data:{causaId:cause.id,userId:colleague.id,rol:"colaborador"}});
    const chat=(await createAltazorConversation({requestId:randomUUID(),title:"Audiencia de prueba",causaId:cause.id},owner,db)).conversation.id;
    async function queue(text:string,sources:AltazorSourceInput[]=[]){const row=await db.altazorConversation.findUniqueOrThrow({where:{id:chat}});return (await createAltazorTurn(chat,{text,sources,requestId:randomUUID(),expectedRevision:row.revision,destinationKey:destination.key},owner,db,base)).turnId;}
    async function prepare(text:string,toolId:AssistantIntentId,input:Record<string,unknown>) {
      const id=await queue(text),result=await executeAltazorTurn(chat,id,owner,db,{...base,execute:async turn=>{
        const ctx:ToolContext={userId:owner.id,role:"abogado",chatId:chat,nativeTurnId:turn.nativeTurnId,scope:turn.scope,authorizeContext:turn.authorizeContext};
        const parsed=getTool(toolId).inputSchema.parse(await resolveWorkflowToolInput(toolId,input,ctx));
        const steps=[{toolId,input:parsed as Record<string,unknown>,preview:await getTool(toolId).preview(parsed,ctx)}];
        await storePlan({id:turn.planId!,steps,intents:[],needsConfirm:true},owner.id);plans.push(turn.planId!);
        return {planId:turn.planId!,previewSteps:steps,streamEvents:[],classification:{source:"rule",toolIds:[toolId],prompt:"fixture"}};
      }});
      assert.equal(result.turns.at(-1)?.status,"awaiting_confirmation"); assert.ok(result.turns.at(-1)?.plan?.steps[0].preview);
      return id;
    }
    const create=await prepare("Prepara audiencia ficticia","audiencia.crear",{titulo:"Mesa de audiencia ficticia",fecha:null});
    assert.equal(await db.hearingWorkspace.count({where:{causaId:cause.id}}),0);
    await assert.rejects(confirmAltazorTurn(chat,create,true,colleague,db,base),error=>(error as {status?:number}).status===404);
    await confirmAltazorTurn(chat,create,true,owner,db,base); await confirmAltazorTurn(chat,create,true,owner,db,base);
    const hearing=await db.hearingWorkspace.findFirstOrThrow({where:{causaId:cause.id,ownerId:owner.id}});assert.equal(await db.hearingWorkspace.count({where:{causaId:cause.id}}),1);
    const note=await prepare("Guarda esta observación ficticia","audiencia.nota",{titulo:"Nota de prueba",texto:"Observación personal sin prueba."});
    assert.equal(await db.hearingNote.count({where:{workspaceId:hearing.id}}),0);
    await confirmAltazorTurn(chat,note,true,owner,db,base); const hearingNote=await db.hearingNote.findFirstOrThrow({where:{workspaceId:hearing.id}});
    const book=(await importBook({...bookMetadataSchema.parse({title:"Texto ficticio",author:"Autora ficticia"}),requestId:randomUUID(),name:"fuente.txt",bytes:Buffer.from("La fuente ficticia conserva una comprobación documental íntegra.")},owner,db)).book;
    const fragment=(await readBook(book.id,owner,{},db)).fragments[0];
    const personal=(await createAltazorConversation({requestId:randomUUID(),title:"Biblioteca ficticia"},owner,db)).conversation.id;
    const personalCtx:ToolContext={userId:owner.id,role:"abogado",chatId:personal,scope:{causaId:null}};
    const libraryInput=await resolveLibrarySyncInput("biblioteca.listar",{},personalCtx),metadata=await getTool("biblioteca.listar").execute(libraryInput,personalCtx);
    assert.match(metadata.message,/Texto ficticio/);assert.ok(!metadata.message.includes(fragment.text),"catalogue metadata is not document content");
    const caseCtx:ToolContext={...personalCtx,chatId:chat,scope:{causaId:cause.id}};
    await assert.rejects(getTool("biblioteca.listar").execute(libraryInput,caseCtx),error=>(error as {status?:number}).status===409);
    await db.causa.update({where:{id:cause.id},data:{pjudMonitoreoActivo:true,pjudLastSyncStatus:"partial",pjudLastSyncNote:"PRIVATE_PORTAL_URL_AND_SESSION"}});
    await db.driveSyncSubscription.create({data:{causaId:cause.id,ownerId:owner.id,folderId:"PRIVATE_FOLDER",enabled:true,note:"PRIVATE_PROVIDER_DIAGNOSTIC"}});
    const sync=await getTool("sincronizacion.estado").execute({},caseCtx);assert.match(sync.message,/parcial/);assert.ok(!JSON.stringify(sync).includes("PRIVATE_"));
    const response=await queue("Prepara texto con mis fuentes",[{kind:"book",bookId:book.id,fragmentId:fragment.id,quote:fragment.text},{kind:"note",workspaceId:hearing.id,noteId:hearingNote.id,revision:hearingNote.revision}]);
    await executeAltazorTurn(chat,response,owner,db,{...base,execute:async input=>{assert.deepEqual(input.validatedReferences?.map(item=>item.marker),["R1"]);return{planId:null,previewSteps:[],autoResults:[{toolId:"respuesta.libre",result:{ok:true,message:"Borrador de prueba con respaldo [R1]. La observación permanece como nota personal."}}],streamEvents:[],classification:{source:"rule",toolIds:["respuesta.libre"],prompt:"fixture"}};}});
    const save=await prepare("Guarda la respuesta como escrito","escrito.guardar",{titulo:"Escrito ficticio con cita"});
    assert.equal(await db.caseWritingDraft.count({where:{causaId:cause.id}}),0);
    const saved=await confirmAltazorTurn(chat,save,true,owner,db,base);assert.equal(saved.turns.at(-1)?.status,"completed");
    const row=await db.caseWritingDraft.findFirstOrThrow({where:{causaId:cause.id,ownerId:owner.id}}),draft=await readCaseWriting(cause.id,row.id,owner,db);
    assert.match(draft.body,/\[\^R1\]/);assert.equal(draft.references[0].source.citations[0].quote,fragment.text);assert.equal(draft.references[1].source.citations.length,0);
    assert.equal((await listCaseWritingHistory(cause.id,row.id,owner,undefined,db)).revisions.length,1);
    await assert.rejects(readCaseWriting(cause.id,row.id,colleague,db),error=>(error as {status?:number}).status===404);
    await db.libraryBook.update({where:{id:book.id},data:{deletedAt:new Date()}});
    await assert.rejects(getTool("biblioteca.listar").execute(libraryInput,personalCtx),error=>(error as {status?:number}).status===409);
    await assert.rejects(readCaseWriting(cause.id,row.id,owner,db),error=>(error as {status?:number}).status===409);
    assert.equal((await readAltazorConversation(chat,owner,db,{},base)).turns.at(-1)?.status,"blocked");
    assert.equal(network,0);
    console.log("ALTAZOR workflow passed: private case hearing and notes confirmed once, cited answer → versioned private writing, real footnote/source proof, colleague denial and source revocation; no network/model.");
  }finally{
    globalThis.fetch=originalFetch; await db.assistantPlanRecord.deleteMany({where:{id:{in:plans}}});await db.commandExecution.deleteMany({where:{ownerId:{in:users}}});await db.auditEvent.deleteMany({where:{actorId:{in:users}}});await db.hearingWorkspace.deleteMany({where:{causaId:{in:cases}}});await db.caseWritingDraft.deleteMany({where:{causaId:{in:cases}}});await db.altazorConversation.deleteMany({where:{causaId:{in:cases}}});await db.causa.deleteMany({where:{id:{in:cases}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();await rm(storage,{recursive:true,force:true});if(priorStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=priorStorage;
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
