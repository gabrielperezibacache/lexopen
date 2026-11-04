/** Disposable PostgreSQL and public fictitious texts only. No model/provider traffic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { bookMetadataSchema } from "@/lib/books/ingest";
import { importBook, readBook, createBookCollection, updateBookCollection } from "@/lib/books/service";
import { workbenchDestination } from "@/lib/workbench/policy";
import { emptyAcademicBrief, emptyAcademicMatrix } from "./academic-schemas";
import { createAcademicWorkspace, saveAcademicWorkspace, readAcademicWorkspace, prepareAcademicArtifact, executeAcademicArtifact, readAcademicArtifact, saveAcademicArtifact, incorporateAcademicWriting, cancelAcademicArtifact, saveAcademicProfile } from "./academic";
import { exportCaseWriting } from "@/lib/writings/export";
import { prepareAcademicLinkedInDraft, verifyAltazorShareOrigin } from "./share-origin";
const status=(expected:number)=>(error:unknown)=>(error as {status?:number}).status===expected;
async function main(){
  const url=assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);assert.equal(url,new URL(process.env.DATABASE_URL!).toString());
  if([process.env.S3_BUCKET,process.env.S3_ACCESS_KEY_ID,process.env.S3_SECRET_ACCESS_KEY].some(Boolean))throw Error("This fixture requires local temporary storage");
  const storage=await mkdtemp(path.join(tmpdir(),"lexopen-altazor-academic-test-")),previousStorage=process.env.STORAGE_PATH,originalFetch=globalThis.fetch;
  process.env.STORAGE_PATH=storage;let network=0,modelCalls=0;globalThis.fetch=(async()=>{network++;throw Error("Unexpected network in academic fixture");}) as typeof fetch;
  const db=new PrismaClient({datasources:{db:{url}}}),tag=randomUUID(),users:string[]=[],workspaces:string[]=[],caseIds:string[]=[],draftIds:string[]=[];
  try{
    const owner=await db.user.create({data:{email:`${tag}@academic.invalid`,name:"Profesional ficticio académico",role:"abogado",password:"not-a-login"}}),other=await db.user.create({data:{email:`${tag}-other@academic.invalid`,name:"Otro titular ficticio",role:"abogado",password:"not-a-login"}});users.push(owner.id,other.id);
    const create={requestId:randomUUID(),title:"Investigación enteramente ficticia",kind:"research"};
    const workspace=await createAcademicWorkspace(create,owner,db);workspaces.push(workspace.id);
    assert.equal((await createAcademicWorkspace(create,owner,db)).id,workspace.id);
    await assert.rejects(readAcademicWorkspace(workspace.id,other,db),status(404));
    const change={expectedRevision:1,title:create.title,brief:emptyAcademicBrief,matrix:emptyAcademicMatrix};
    const concurrency=await Promise.allSettled([saveAcademicWorkspace(workspace.id,change,owner,db),saveAcademicWorkspace(workspace.id,{...change,title:"Título concurrente ficticio"},owner,db)]);
    assert.equal(concurrency.filter(result=>result.status==="fulfilled").length,1);
    const w=await readAcademicWorkspace(workspace.id,owner,db);
    const bytes=Buffer.from("La investigación jurídica debe distinguir fuentes, inferencias y límites. Material completamente ficticio para esta prueba.");
    const imported=await importBook({...bookMetadataSchema.parse({title:"Lectura ficticia del titular",author:"Autor ficticio",year:"2026"}),requestId:randomUUID(),name:"ficticio.txt",bytes},owner,db);
    const detail=await readBook(imported.book.id,owner,{},db),source={kind:"book" as const,bookId:imported.book.id,fragmentId:detail.fragments[0].id,quote:detail.fragments[0].text};
    const destination=await workbenchDestination(owner.id,"assisted_draft");
    const input={requestId:randomUUID(),expectedRevision:w.revision,mode:"synthesis",instruction:"Ordena este pasaje ficticio para una revisión humana",sources:[source],destinationKey:destination.key,allowRemote:true};
    const prepared=await prepareAcademicArtifact(workspace.id,input,owner,db),artifactId=prepared.artifact.id;
    assert.equal((await prepareAcademicArtifact(workspace.id,input,owner,db)).artifact.id,artifactId);
    await assert.rejects(prepareAcademicArtifact(workspace.id,{...input,instruction:"Otro encargo"},owner,db),status(409));
    const model:Parameters<typeof executeAcademicArtifact>[4]=async request=>{modelCalls++;assert.match(JSON.stringify(request.messages),/fuentes, inferencias/);return{source:"llm",content:JSON.stringify({sections:[{heading:"Lectura",text:"Propuesta ficticia para evaluar los límites de la investigación.",referenceIds:["R1"]}]}),provider:"custom" as const,model:destination.model,requireApproval:true};};
    const result=await executeAcademicArtifact(workspace.id,artifactId,owner,db,model);assert.equal(result.status,"proposed");assert.match(result.body,/\[R1\]/);
    await executeAcademicArtifact(workspace.id,artifactId,owner,db,model);assert.equal(modelCalls,1);
    await assert.rejects(readAcademicArtifact(workspace.id,artifactId,other,db),status(404));
    const reviewed=await saveAcademicArtifact(workspace.id,artifactId,{expectedRevision:result.revision,body:result.body,reviewed:true},owner,db);
    const causa=await db.causa.create({data:{titulo:`Causa ficticia académica ${tag}`,tribunal:"Tribunal ficticio",materia:"civil",acceso:"equipo",abogadoId:owner.id}});caseIds.push(causa.id);
    const linked=await incorporateAcademicWriting(workspace.id,artifactId,causa.id,reviewed.revision,owner,db);draftIds.push(linked.draftId);
    const writingExport=await exportCaseWriting(causa.id,linked.draftId,"markdown",owner,db);
    assert.match(writingExport.content,/\[\^R1\]/);assert.match(writingExport.content,/\[\^R1\]:/);
    assert.doesNotMatch(writingExport.content,/fuentes incorporadas cuyo marcador no aparece/);

    const replay=await incorporateAcademicWriting(workspace.id,artifactId,causa.id,reviewed.revision,owner,db);assert.equal(replay.draftId,linked.draftId);assert.equal(replay.reused,true);
    await assert.rejects(incorporateAcademicWriting(workspace.id,artifactId,causa.id,reviewed.revision,other,db),status(404));
    const social=await prepareAcademicLinkedInDraft(workspace.id,artifactId,reviewed.revision,owner,db),socialRow=await db.externalShareDraft.findUniqueOrThrow({where:{id:social.draftId}});
    await verifyAltazorShareOrigin(socialRow,owner,db);
    await db.externalShareDraft.update({where:{id:socialRow.id},data:{body:"Edición propia ficticia para compartir",revision:{increment:1}}});
    assert.equal((await prepareAcademicLinkedInDraft(workspace.id,artifactId,reviewed.revision,owner,db)).draftId,socialRow.id);
    assert.equal((await db.externalShareDraft.findUniqueOrThrow({where:{id:socialRow.id}})).body,"Edición propia ficticia para compartir");
    await saveAcademicArtifact(workspace.id,artifactId,{expectedRevision:reviewed.revision,body:result.body+"\nNueva revisión ficticia",reviewed:true},owner,db);
    await assert.rejects(verifyAltazorShareOrigin(socialRow,owner,db),status(409));
    // A revoked matrix row is hidden yet retained. Saving surrounding metadata
    // or regranting access cannot turn that hidden row into unbacked manual text.
    const shared=await importBook({...bookMetadataSchema.parse({title:"Libro compartido ficticio"}),requestId:randomUUID(),name:"compartido.txt",bytes},other,db),sharedDetail=await readBook(shared.book.id,other,{},db);
    const collection=(await createBookCollection({name:"Colección ficticia académica"},other,db)).collection;
    let grant=(await updateBookCollection(collection.id,{revision:collection.revision,bookIds:[shared.book.id],memberIds:[owner.id]},other,db)).collection;
    const current=await readAcademicWorkspace(workspace.id,owner,db),matrix={dimensions:emptyAcademicMatrix.dimensions,rows:[{id:"row-1",title:"Fuente compartida ficticia",included:true,cells:{finding:{value:"Hallazgo ficticio",source:{kind:"book" as const,bookId:shared.book.id,fragmentId:sharedDetail.fragments[0].id,quote:sharedDetail.fragments[0].text}}}}]};
    await saveAcademicWorkspace(workspace.id,{expectedRevision:current.revision,title:current.title,brief:current.brief,matrix},owner,db);
    const original=JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({where:{id:workspace.id}})).matrixJson).rows[0];
    grant=(await updateBookCollection(collection.id,{revision:grant.revision,memberIds:[]},other,db)).collection;
    const hidden=await readAcademicWorkspace(workspace.id,owner,db);assert.equal(hidden.matrix.rows[0].available,false);assert.deepEqual(hidden.matrix.rows[0].cells,{});
    const hiddenMatrix={dimensions:hidden.matrix.dimensions,rows:hidden.matrix.rows.map((row:{id:string;title:string;included:boolean;cells:Record<string,unknown>})=>({id:row.id,title:row.title,included:row.included,cells:row.cells}))};
    await saveAcademicWorkspace(workspace.id,{expectedRevision:hidden.revision,title:"Metadatos renombrados",brief:hidden.brief,matrix:hiddenMatrix},owner,db);
    assert.deepEqual(JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({where:{id:workspace.id}})).matrixJson).rows[0],original);
    let latest=await readAcademicWorkspace(workspace.id,owner,db);
    await assert.rejects(saveAcademicWorkspace(workspace.id,{expectedRevision:latest.revision,title:latest.title,brief:latest.brief,matrix:{...hiddenMatrix,rows:[]}},owner,db),status(409));
    await updateBookCollection(collection.id,{revision:grant.revision,memberIds:[owner.id]},other,db);
    latest=await readAcademicWorkspace(workspace.id,owner,db);
    await saveAcademicWorkspace(workspace.id,{expectedRevision:latest.revision,title:"Guardado después de reautorizar",brief:latest.brief,matrix:hiddenMatrix},owner,db);
    assert.deepEqual(JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({where:{id:workspace.id}})).matrixJson).rows[0],original);
    // Profile CAS and cancellation retain ownership and do not claim a model result.
    const profile={name:"Nombre ficticio",headline:"",orcid:"",biography:"",education:"",experience:"",publications:"",languages:"",interests:""};
    await saveAcademicProfile({expectedRevision:0,profile},owner,db);await assert.rejects(saveAcademicProfile({expectedRevision:0,profile},owner,db),status(409));
    const latestForCancel=await readAcademicWorkspace(workspace.id,owner,db),cancelled=await prepareAcademicArtifact(workspace.id,{...input,requestId:randomUUID(),expectedRevision:latestForCancel.revision},owner,db);
    await cancelAcademicArtifact(workspace.id,cancelled.artifact.id,owner,db);assert.equal((await executeAcademicArtifact(workspace.id,cancelled.artifact.id,owner,db,model)).status,"cancelled");assert.equal(modelCalls,1);
    assert.equal(network,0);
    console.log("ALTAZOR academic disposable integration passed: owner isolation, CAS, source-backed proposals, native writing replay, LinkedIn origin/revision, matrix revocation and regrant retention, profile CAS and cancellation; zero provider traffic.");
  }finally{
    globalThis.fetch=originalFetch;
    await db.externalShareDraft.deleteMany({where:{ownerId:{in:users}}});
    await db.caseWritingDraft.deleteMany({where:{id:{in:draftIds}}});
    await db.commandExecution.deleteMany({where:{ownerId:{in:users}}});
    await db.altazorAcademicWorkspace.deleteMany({where:{id:{in:workspaces}}});
    await db.bookShelfCollection.deleteMany({where:{ownerId:{in:users}}});
    await db.libraryBook.deleteMany({where:{ownerId:{in:users}}});
    await db.causa.deleteMany({where:{id:{in:caseIds}}});
    await db.auditEvent.deleteMany({where:{actorId:{in:users}}});
    await db.user.deleteMany({where:{id:{in:users}}});
    await db.$disconnect();process.env.STORAGE_PATH=previousStorage;await rm(storage,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
