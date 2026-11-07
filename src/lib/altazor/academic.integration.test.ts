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
import { emptyAcademicBrief, emptyAcademicMatrix, emptyAcademicSyllabus } from "./academic-schemas";
import { createAcademicWorkspace, saveAcademicWorkspace, readAcademicWorkspace, prepareAcademicArtifact, executeAcademicArtifact, readAcademicArtifact, saveAcademicArtifact, incorporateAcademicWriting, cancelAcademicArtifact, saveAcademicProfile, academicArtifactHistory, readAcademicArtifactVersion, readAcademicArtifactDownload, restoreAcademicArtifactVersion, createAcademicDraft } from "./academic";
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
    // Older workspaces may still use the database default of an empty object.
    await db.altazorAcademicWorkspace.update({ where: { id: workspace.id }, data: { matrixJson: "{}" } });
    const legacy = await readAcademicWorkspace(workspace.id, owner, db);
    assert.deepEqual(legacy.matrix, emptyAcademicMatrix);
    const change={expectedRevision:legacy.revision,title:create.title,brief:emptyAcademicBrief,matrix:legacy.matrix};
    const concurrency=await Promise.allSettled([saveAcademicWorkspace(workspace.id,change,owner,db),saveAcademicWorkspace(workspace.id,{...change,title:"Título concurrente ficticio"},owner,db)]);
    assert.equal(concurrency.filter(result=>result.status==="fulfilled").length,1);
    const w=await readAcademicWorkspace(workspace.id,owner,db);
    const bytes=Buffer.from("La investigación jurídica debe distinguir fuentes, inferencias y límites. Material completamente ficticio para esta prueba.");
    const imported=await importBook({...bookMetadataSchema.parse({title:"Lectura ficticia del titular",author:"Autor ficticio",year:"2026"}),requestId:randomUUID(),name:"ficticio.txt",bytes},owner,db);
    const detail=await readBook(imported.book.id,owner,{},db),source={kind:"book" as const,bookId:imported.book.id,fragmentId:detail.fragments[0].id,quote:detail.fragments[0].text};
    const destination=await workbenchDestination(owner.id,"assisted_draft");
    const input={requestId:randomUUID(),expectedRevision:w.revision,mode:"synthesis",instruction:"Ordena este pasaje ficticio para una revisión humana",sources:[source],destinationKey:destination.key,allowRemote:true};
    const prepared=await prepareAcademicArtifact(workspace.id,input,owner,db),artifactId=prepared.artifact.id;
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 1 },db),status(409));
    assert.equal((await prepareAcademicArtifact(workspace.id,input,owner,db)).artifact.id,artifactId);
    await assert.rejects(prepareAcademicArtifact(workspace.id,{...input,instruction:"Otro encargo"},owner,db),status(409));
    const model:Parameters<typeof executeAcademicArtifact>[4]=async request=>{modelCalls++;assert.match(JSON.stringify(request.messages),/fuentes, inferencias/);return{source:"llm",content:JSON.stringify({sections:[{heading:"Lectura",text:"Propuesta ficticia para evaluar los límites de la investigación.",referenceIds:["R1"]}]}),provider:"custom" as const,model:destination.model,requireApproval:true};};
    const result=await executeAcademicArtifact(workspace.id,artifactId,owner,db,model);assert.equal(result.status,"proposed");assert.match(result.body,/\[R1\]/);
    assert.deepEqual(await readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 1 },db), { id: artifactId, revision: 1, body: result.body });
    assert.equal(await db.altazorAcademicArtifactVersion.count({ where: { artifactId } }),0);
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
    // Autosave retains the generated original and each CAS revision. Recovery
    // produces a new, unreviewed revision, preserving the source snapshots.
    const history=await academicArtifactHistory(workspace.id,artifactId,owner,undefined,db);
    assert.deepEqual(history.versions.map(item=>item.revision),[3,2,1]);
    assert.equal((await readAcademicArtifactVersion(workspace.id,artifactId,1,owner,db)).body,result.body);
    assert.equal((await readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 1 },db)).body,result.body);
    const bibliography = await readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 1, referencesOnly: true },db);
    assert.match(bibliography.body,/^# Fuentes de la versión 1\b/);
    assert.match(bibliography.body,/\[R1\] Lectura ficticia del titular/);
    assert.ok(bibliography.body.includes(source.quote));
    assert.doesNotMatch(bibliography.body,/Nueva revisión ficticia/);
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 500 },db),status(404));
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,other,{ revision: 1, referencesOnly: true },db),status(404));
    await assert.rejects(academicArtifactHistory(workspace.id,artifactId,other,undefined,db),status(404));
    await assert.rejects(readAcademicArtifactVersion(workspace.id,artifactId,1,other,db),status(404));
    const originalSources=(await db.altazorAcademicArtifact.findUniqueOrThrow({where:{id:artifactId}})).sourceSnapshotsJson;
    const restored=await restoreAcademicArtifactVersion(workspace.id,artifactId,{expectedRevision:3,revision:1},owner,db);
    assert.equal(restored.revision,4);assert.equal(restored.body,result.body);assert.equal(restored.reviewed,false);
    assert.equal((await db.altazorAcademicArtifact.findUniqueOrThrow({where:{id:artifactId}})).sourceSnapshotsJson,originalSources);
    await assert.rejects(restoreAcademicArtifactVersion(workspace.id,artifactId,{expectedRevision:3,revision:1},owner,db),status(409));
    const races=await Promise.allSettled([saveAcademicArtifact(workspace.id,artifactId,{expectedRevision:4,body:result.body+"\nEdición A",reviewed:false},owner,db),saveAcademicArtifact(workspace.id,artifactId,{expectedRevision:4,body:result.body+"\nEdición B",reviewed:false},owner,db)]);
    assert.equal(races.filter(item=>item.status==="fulfilled").length,1);
    const afterRace=await readAcademicArtifact(workspace.id,artifactId,owner,db),versionCount=await db.altazorAcademicArtifactVersion.count({where:{artifactId}});
    assert.equal((await saveAcademicArtifact(workspace.id,artifactId,{expectedRevision:afterRace.revision,body:afterRace.body,reviewed:false},owner,db)).revision,afterRace.revision);
    assert.equal(await db.altazorAcademicArtifactVersion.count({where:{artifactId}}),versionCount);
    // A revoked matrix row is hidden yet retained. Saving surrounding metadata
    // or regranting access cannot turn that hidden row into unbacked manual text.
    const shared=await importBook({...bookMetadataSchema.parse({title:"Libro compartido ficticio"}),requestId:randomUUID(),name:"compartido.txt",bytes},other,db),sharedDetail=await readBook(shared.book.id,other,{},db);
    const collection=(await createBookCollection({name:"Colección ficticia académica"},other,db)).collection;
    let grant=(await updateBookCollection(collection.id,{revision:collection.revision,bookIds:[shared.book.id],memberIds:[owner.id]},other,db)).collection;
    const matrixSource = { kind: "book" as const, bookId: shared.book.id, fragmentId: sharedDetail.fragments[0].id, quote: sharedDetail.fragments[0].text };
    const current=await readAcademicWorkspace(workspace.id,owner,db),matrix={dimensions:emptyAcademicMatrix.dimensions,rows:[{id:"row-1",title:"Fuente compartida ficticia",included:true,cells:{finding:{value:"Hallazgo ficticio",source:matrixSource}}}]};
    const matrixRevision = await saveAcademicWorkspace(workspace.id,{expectedRevision:current.revision,title:current.title,brief:current.brief,matrix},owner,db);
    // An included, verified matrix passage contributes to the same preparation
    // as direct sources, without counting the same document twice.
    const matrixOnly = { ...input, requestId: randomUUID(), expectedRevision: matrixRevision.revision, sources: [] };
    const matrixSynthesis = await prepareAcademicArtifact(workspace.id, matrixOnly, owner, db);
    const synthesis = await readAcademicArtifact(workspace.id, matrixSynthesis.artifact.id, owner, db);
    assert.deepEqual(synthesis.sources.map(ref => ref.title), ["Libro compartido ficticio"]);
    const comparison = { ...matrixOnly, requestId: randomUUID(), mode: "comparison", sources: [source] };
    const mixed = await prepareAcademicArtifact(workspace.id, comparison, owner, db);
    const compared = await readAcademicArtifact(workspace.id, mixed.artifact.id, owner, db);
    assert.deepEqual(compared.sources.map(ref => ref.title), ["Lectura ficticia del titular", "Libro compartido ficticio"]);
    await assert.rejects(prepareAcademicArtifact(workspace.id, { ...comparison, requestId: randomUUID(), sources: [matrixSource] }, owner, db), status(400));
    const original=JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({where:{id:workspace.id}})).matrixJson).rows[0];
    grant=(await updateBookCollection(collection.id,{revision:grant.revision,memberIds:[]},other,db)).collection;
    const hidden=await readAcademicWorkspace(workspace.id,owner,db);assert.equal(hidden.matrix.rows[0].available,false);assert.deepEqual(hidden.matrix.rows[0].cells,{});
    await assert.rejects(prepareAcademicArtifact(workspace.id, { ...matrixOnly, requestId: randomUUID() }, owner, db), status(404));
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
    await db.altazorAcademicArtifactVersion.update({where:{artifactId_revision:{artifactId,revision:1}},data:{body:"Alteración ficticia sin hash"}});
    await assert.rejects(readAcademicArtifactVersion(workspace.id,artifactId,1,owner,db),status(409));
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 1, referencesOnly: true },db),status(409));
    await assert.rejects(restoreAcademicArtifactVersion(workspace.id,artifactId,{expectedRevision:afterRace.revision,revision:1},owner,db),status(409));
    const currentVersion = { artifactId, revision: afterRace.revision };
    await db.altazorAcademicArtifactVersion.update({ where: { artifactId_revision: currentVersion }, data: { reviewed: true } });
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: currentVersion.revision },db),status(409));
    await db.altazorAcademicArtifactVersion.update({ where: { artifactId_revision: currentVersion }, data: { reviewed: false } });
    await db.altazorAcademicArtifact.update({ where: { id: artifactId }, data: { body: "" } });
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{},db),status(409));
    await db.altazorAcademicArtifact.update({ where: { id: artifactId }, data: { body: afterRace.body } });
    await db.libraryBook.update({where:{id:imported.book.id},data:{deletedAt:new Date()}});
    await assert.rejects(academicArtifactHistory(workspace.id,artifactId,owner,undefined,db),status(404));
    await assert.rejects(readAcademicArtifactVersion(workspace.id,artifactId,2,owner,db),status(404));
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 2 },db),status(404));
    await assert.rejects(readAcademicArtifactDownload(workspace.id,artifactId,owner,{ revision: 2, referencesOnly: true },db),status(404));

    const course = await createAcademicWorkspace({ requestId: randomUUID(), kind: "course", title: "Curso ficticio" }, owner, db);
    const foreignCourse = await createAcademicWorkspace({ requestId: randomUUID(), kind: "course", title: "Otro curso ficticio" }, other, db);
    workspaces.push(course.id, foreignCourse.id);
    const courseSession = (title: string, startsAt: Date, workspaceId = course.id) =>
      ({ workspaceId, title, startsAt, requestId: randomUUID() });
    const content = {
      readings: [{ title: "Lectura pactada", href: "/biblioteca/libro-ficticio" }],
      materials: [{ title: "Guía práctica", href: "https://example.org/guia" }],
      outcomes: ["Argumentar a partir de las fuentes"],
      speakers: ["Ponente ficticia"],
      moderators: ["Moderador ficticio"],
      location: "Aula ficticia 204",
    };
    const [early, late, ignored, foreign] = await Promise.all([
      db.altazorTeachingSession.create({ data: {
        ...courseSession("Primera sesión", new Date("2026-11-10T01:00:00Z")), endsAt: new Date("2026-11-10T02:00:00Z"),
        reminderLeadMinutes: 10080, contentJson: JSON.stringify(content),
      } }),
      db.altazorTeachingSession.create({ data: courseSession("Segunda sesión", new Date("2026-11-15T16:00:00Z")) }),
      db.altazorTeachingSession.create({ data: courseSession("Sesión excluida", new Date("2026-11-12T16:00:00Z")) }),
      db.altazorTeachingSession.create({ data: courseSession("Sesión ajena", new Date("2026-11-11T16:00:00Z"), foreignCourse.id) }),
    ]);
    async function saveSessions(sessionIds: string[]) {
      const current = await readAcademicWorkspace(course.id, owner, db);
      return saveAcademicWorkspace(course.id, {
        expectedRevision: current.revision, title: current.title, matrix: emptyAcademicMatrix,
        brief: { ...emptyAcademicBrief, syllabus: { ...emptyAcademicSyllabus, sessionIds } },
      }, owner, db);
    }
    const selected = [late.id, early.id];
    const selection = await saveSessions(selected);
    const persisted = await readAcademicWorkspace(course.id, owner, db);
    assert.deepEqual(persisted.brief.syllabus.sessionIds, selected);
    const syllabusInput = { requestId: randomUUID(), expectedRevision: selection.revision, template: "course" };
    const syllabus = await createAcademicDraft(course.id, syllabusInput, owner, db);
    const { body } = await readAcademicArtifact(course.id, syllabus.id, owner, db);
    const sessionsBlock = body.split("## Unidades y sesiones\n\n")[1]?.split("\n\n## Evaluación")[0];
    assert.ok(sessionsBlock);
    assert.match(sessionsBlock, /^### Primera sesión\n\n09-11-2026, 22:00 – 23:00 \(Santiago\)/);
    assert.ok(sessionsBlock.indexOf("Primera sesión") < sessionsBlock.indexOf("Segunda sesión"));
    assert.match(sessionsBlock, /\*\*Resultados de aprendizaje\*\*\n\n- Argumentar a partir de las fuentes/);
    assert.match(sessionsBlock, /- Lectura pactada — \/biblioteca\/libro-ficticio/);
    assert.match(sessionsBlock, /- Guía práctica — https:\/\/example.org\/guia/);
    for (const value of [...content.speakers, ...content.moderators, content.location]) assert.ok(sessionsBlock.includes(value));
    assert.doesNotMatch(body, /Sesión excluida|Sesión ajena|10080/);
    for (const session of [early, late, ignored, foreign]) assert.ok(!body.includes(session.id));

    await db.altazorTeachingSession.update({ where: { id: early.id }, data: {
      title: "Sesión revisada", contentJson: JSON.stringify({ ...content, outcomes: ["Resultado revisado"] }),
    } });
    const replaySyllabus = await createAcademicDraft(course.id, syllabusInput, owner, db);
    assert.deepEqual(replaySyllabus, { id: syllabus.id, reused: true });
    assert.equal((await readAcademicArtifactVersion(course.id, syllabus.id, 1, owner, db)).body, body);
    const revisedSyllabus = await createAcademicDraft(course.id, { ...syllabusInput, requestId: randomUUID() }, owner, db);
    const revisedBody = (await readAcademicArtifact(course.id, revisedSyllabus.id, owner, db)).body;
    assert.match(revisedBody, /Sesión revisada/);
    assert.match(revisedBody, /Resultado revisado/);

    await db.altazorTeachingSession.delete({ where: { id: late.id } });
    await assert.rejects(createAcademicDraft(course.id, { ...syllabusInput, requestId: randomUUID() }, owner, db), status(409));
    const foreignSelection = await saveSessions([foreign.id]);
    await assert.rejects(createAcademicDraft(course.id, { ...syllabusInput, requestId: randomUUID(), expectedRevision: foreignSelection.revision }, owner, db), status(409));

    const extensiveResources = Array.from({ length: 12 }, (_, index) => ({
      title: `Recurso ${index} ${"x".repeat(185)}`, href: `https://example.org/${"x".repeat(980)}`,
    }));
    const extensiveContent = JSON.stringify({
      readings: extensiveResources, materials: extensiveResources, outcomes: Array(12).fill("x".repeat(500)),
    });
    const longSessions = await Promise.all([1, 2, 3].map(index => db.altazorTeachingSession.create({ data: {
      ...courseSession(`Sesión extensa ${index}`, new Date("2026-11-16T16:00:00Z")), contentJson: extensiveContent,
    } })));
    const longSelection = await saveSessions(longSessions.map(session => session.id));
    await assert.rejects(createAcademicDraft(course.id, { ...syllabusInput, requestId: randomUUID(), expectedRevision: longSelection.revision }, owner, db), status(413));
    assert.equal(await db.altazorAcademicArtifact.count({ where: { workspaceId: course.id } }), 2);
    assert.equal((await readAcademicArtifact(course.id, syllabus.id, owner, db)).body, body);

    const congress = await createAcademicWorkspace({ requestId: randomUUID(), kind: "congress", title: "Congreso ficticio" }, owner, db);
    workspaces.push(congress.id);
    const table = await db.altazorTeachingSession.create({ data: {
      ...courseSession("Mesa de trabajo", new Date("2026-11-17T16:00:00Z"), congress.id),
      contentJson: JSON.stringify(content),
    } });
    async function saveProgramSessionIds(programSessionIds: string[]) {
      const current = await readAcademicWorkspace(congress.id, owner, db);
      return saveAcademicWorkspace(congress.id, {
        expectedRevision: current.revision, title: current.title, matrix: emptyAcademicMatrix,
        brief: { ...current.brief, programSessionIds },
      }, owner, db);
    }
    const programSelection = await saveProgramSessionIds([table.id]);
    assert.deepEqual((await readAcademicWorkspace(congress.id, owner, db)).brief.programSessionIds, [table.id]);
    const programInput = { requestId: randomUUID(), expectedRevision: programSelection.revision, template: "congress" };
    const program = await createAcademicDraft(congress.id, programInput, owner, db);
    const programBody = (await readAcademicArtifact(congress.id, program.id, owner, db)).body;
    assert.match(programBody, /## Programa y mesas\n\n### Mesa de trabajo\n\n17-11-2026, 13:00 \(Santiago\)/);
    assert.match(programBody, /Lectura pactada|Guía práctica|Argumentar a partir de las fuentes/);
    for (const value of [...content.speakers, ...content.moderators, content.location]) assert.ok(programBody.includes(value));

    await db.altazorTeachingSession.update({ where: { id: table.id }, data: {
      contentJson: JSON.stringify({ ...content, speakers: ["Nueva ponente"], moderators: ["Nueva moderación"], location: "Nueva sala" }),
    } });
    const updatedProgram = await createAcademicDraft(congress.id, { ...programInput, requestId: randomUUID() }, owner, db);
    const updatedProgramBody = (await readAcademicArtifact(congress.id, updatedProgram.id, owner, db)).body;
    for (const value of ["Nueva ponente", "Nueva moderación", "Nueva sala"]) assert.ok(updatedProgramBody.includes(value));
    assert.doesNotMatch(updatedProgramBody, /Ponente ficticia|Moderador ficticio|Aula ficticia 204/);
    assert.deepEqual(await createAcademicDraft(congress.id, programInput, owner, db), { id: program.id, reused: true });
    assert.equal((await readAcademicArtifactVersion(congress.id, program.id, 1, owner, db)).body, programBody);

    const genericProgram = await createAcademicDraft(congress.id, { ...programInput, requestId: randomUUID(), template: "workshop" }, owner, db);
    const genericProgramBody = (await readAcademicArtifact(congress.id, genericProgram.id, owner, db)).body;
    assert.match(genericProgramBody, /## Actividades y tiempos/);
    assert.doesNotMatch(genericProgramBody, /Mesa de trabajo/);

    const assisted = await prepareAcademicArtifact(congress.id, {
      ...input, requestId: randomUUID(), expectedRevision: programSelection.revision, mode: "teaching_material", sources: [],
    }, owner, db);
    const assistedRecord = await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: assisted.artifact.id } });
    assert.doesNotMatch(assistedRecord.destinationJson, /programSessionIds|Mesa de trabajo/);
    assert.ok(!assistedRecord.destinationJson.includes(table.id));

    await db.altazorTeachingSession.delete({ where: { id: table.id } });
    await assert.rejects(createAcademicDraft(congress.id, { ...programInput, requestId: randomUUID() }, owner, db), status(409));
    assert.deepEqual(await createAcademicDraft(congress.id, programInput, owner, db), { id: program.id, reused: true });
    assert.equal((await readAcademicArtifactVersion(congress.id, program.id, 1, owner, db)).body, programBody);
    for (const outside of [early.id, foreign.id]) {
      const invalid = await saveProgramSessionIds([outside]);
      await assert.rejects(createAcademicDraft(congress.id, { ...programInput, requestId: randomUUID(), expectedRevision: invalid.revision }, owner, db), status(409));
    }
    const cleared = await saveProgramSessionIds([]);
    const emptyProgram = await createAcademicDraft(congress.id, { ...programInput, requestId: randomUUID(), expectedRevision: cleared.revision }, owner, db);
    assert.doesNotMatch((await readAcademicArtifact(congress.id, emptyProgram.id, owner, db)).body, /Mesa de trabajo/);
    assert.equal(network,0);
    console.log("ALTAZOR academic disposable integration passed: owner isolation, source-backed proposals, original/version history, CAS save races, idempotent save, recovery as unreviewed revision, tamper/source-revocation denial, native writing replay, LinkedIn origin/revision, legacy matrix, matrix-backed preparation and retention, profile CAS and cancellation, selected teaching sessions and retained snapshots; zero provider traffic.");
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
