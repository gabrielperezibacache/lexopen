import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";

type Fact = { id: string; statement: string; status: string; revision: number; citations: {kind:"document"|"legal";fragmentId:string;quote:string;documentId:string|null;pageNumber:number|null}[] };
async function main() {
  if (process.env.NODE_ENV !== "production" || process.env.LEXOPEN_E2E === "1" || process.env.LEXOPEN_RELAX_CSRF === "1") throw new Error("Production mode with normal controls required");
  const base = process.env.PROD_TEST_BASE_URL;
  if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Explicit loopback URL required");
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  if (url !== process.env.DATABASE_URL || !process.env.STORAGE_PATH) throw new Error("Matching disposable database and explicit storage required");
  const db = new PrismaClient({datasources:{db:{url}}}), tag=randomUUID(), password=`Fixture-${randomUUID()}`;
  const api=await request.newContext({baseURL:base}), portal=await request.newContext({baseURL:base});
  const keys=new Set<string>(), userIds:string[]=[], documentIds:string[]=[];
  let caseId="", siteId="", organizationId="", collectionId="";
  const textA="📄 El 12 de mayo de 2025 se pagaron CLP 25000 por el contrato A. La firma figura el 03/04/2025.";
  const textB="El 13 de mayo de 2025 se pagaron CLP 45000 por el contrato A.";
  try {
    const org=await db.organization.create({data:{name:`F3 fixture ${tag}`,settings:{create:{assistantLlmMode:"local_only",require2faPrivileged:true}}}});organizationId=org.id;
    for(const role of ["abogado","abogado","cliente"]) { const user=await db.user.create({data:{email:`${randomUUID()}@knowledge-fixture.invalid`,name:`Profesional ficticio ${role}`,role,password:await hash(password,10)}});userIds.push(user.id); }
    const [ownerId,otherId,portalId]=userIds;
    const owner=await db.user.findUniqueOrThrow({where:{id:ownerId}});
    const login=await api.post("/api/auth/login",{headers:{Origin:base},data:{email:owner.email,password}});assert.equal(login.status(),200,await login.text());
    const state=await api.storageState(),csrf=state.cookies.find(c=>c.name==="lexopen_csrf")?.value;assert.ok(csrf);
    const headers={Origin:base,"x-csrf-token":csrf!};
    const cause=await db.causa.create({data:{titulo:`Expediente ficticio F3 ${tag}`,tribunal:"Fixture",materia:"civil",acceso:"equipo",abogadoId:ownerId}});caseId=cause.id;
    const knowledge=`/api/causas/${caseId}/knowledge`;
    for(const [index,text] of [textA,textB].entries()) {
      const key=`knowledge-production-${tag}/${index}.txt`;keys.add(key);await putObject({key,body:text,contentType:"text/plain"});
      const doc=await db.documento.create({data:{nombre:`Declaración ficticia ${index}.txt`,contenido:text,extractedMarkdown:text,mimeType:"text/plain",extractionStatus:"completed",storageKey:key,causaId:caseId,autorId:ownerId}});documentIds.push(doc.id);
      const capture=await api.post(`/api/documentos/${doc.id}/evidence`,{headers});assert.equal(capture.status(),201,await capture.text());
    }
    const site=await db.site.create({data:{name:`Espacio F3 ${tag}`,slug:`f3-${tag}`,causaId:caseId}});siteId=site.id;
    const pdf=await readFile(path.join(process.cwd(),"src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
    const pdfKey=`knowledge-production-${tag}/evidence.pdf`;keys.add(pdfKey);await putObject({key:pdfKey,body:pdf,contentType:"application/pdf"});
    const file=await db.siteFile.create({data:{siteId,name:"PDF ficticio de tres páginas.pdf",mimeType:"application/pdf",storageKey:pdfKey,sizeBytes:pdf.length}});
    const capturedPdf=await api.post(`/api/sites/${siteId}/files/${file.id}/evidence`,{headers});assert.equal(capturedPdf.status(),201,await capturedPdf.text());const pdfVersion=await capturedPdf.json();
    const pdfPage=await api.get(`/api/sites/${siteId}/files/${file.id}/evidence?version=${pdfVersion.id}&page=2`);assert.equal(pdfPage.status(),200);const pdfEvidence=await pdfPage.json();assert.equal(pdfEvidence.fragments[0].pageNumber,2);
    const pdfImage=await api.get(`/api/evidence/versions/${pdfVersion.id}/pages/2`);assert.equal(pdfImage.status(),200);assert.match(pdfImage.headers()["cache-control"],/no-store/);
    const analyze=await api.post(`${knowledge}/analyze`,{headers,data:{}});assert.equal(analyze.status(),200,await analyze.text());const proposed=await analyze.json();assert.equal(proposed.networkRequests,0);assert.equal(proposed.modelUsed,false);
    const listed=await api.get(knowledge);assert.equal(listed.status(),200);const view=await listed.json();const facts=view.facts as Fact[];
    const first=facts.find(f=>f.citations.some(c=>c.documentId===documentIds[0])&&/25000/.test(f.statement));const second=facts.find(f=>f.citations.some(c=>c.documentId===documentIds[1]));assert.ok(first&&second);
    assert.ok(view.chronology.undated.some((f:{datePrecision:string})=>f.datePrecision==="ambiguous"));
    const edited="Pago revisado por el profesional: CLP 25000 por el contrato A.";
    const review=await api.patch(`${knowledge}/facts/${first!.id}`,{headers,data:{revision:first!.revision,statement:edited,status:"accepted",comparisonKey:"pago-contrato-a",reason:"Contraste con el pasaje original ficticio"}});assert.equal(review.status(),200,await review.text());const reviewed=await review.json();
    assert.equal((await api.patch(`${knowledge}/facts/${first!.id}`,{headers,data:{revision:first!.revision,status:"rejected",reason:"Intento con revisión anterior"}})).status(),409);
    const history=await api.get(`${knowledge}/facts/${first!.id}`);assert.equal(history.status(),200);const historyView=await history.json();assert.equal(historyView.history[0].before.status,"proposed");assert.equal(historyView.history[0].after.status,"accepted");assert.equal(historyView.history[0].actorName,owner.name);
    const conflict=await api.post(`${knowledge}/conflicts`,{headers,data:{leftFactId:first!.id,rightFactId:second!.id,kind:"money",reason:"Las dos declaraciones atribuyen montos diferentes al mismo pago identificado."}});assert.ok([200,201].includes(conflict.status()),await conflict.text());const discrepancy=(await conflict.json()).conflict;
    const decision=await api.patch(`${knowledge}/conflicts/${discrepancy.id}`,{headers,data:{revision:discrepancy.revision,status:"apparent",reason:discrepancy.reason,reviewReason:"Revisar si describen prestaciones o períodos distintos"}});assert.equal(decision.status(),200,await decision.text());
    const created=await api.post("/api/knowledge/collections",{headers,data:{requestId:randomUUID(),name:"Fuentes elegidas del expediente",causaId:caseId,instructions:"Notas manuales de la revisión; no son instrucciones ejecutadas por un modelo."}});assert.equal(created.status(),201,await created.text());let collection=(await created.json()).collection;collectionId=collection.id;
    const cite=first!.citations.find(c=>c.documentId===documentIds[0])!;
    const anchor={kind:cite.kind,fragmentId:cite.fragmentId,quote:cite.quote};
    const saved=await api.post(`/api/knowledge/collections/${collectionId}/items`,{headers,data:{citation:anchor,expectedRevision:collection.revision}});assert.equal(saved.status(),201,await saved.text());const save=await saved.json();collection=save.collection;
    const pdfSaved=await api.post(`/api/knowledge/collections/${collectionId}/items`,{headers,data:{citation:{kind:"document",fragmentId:pdfEvidence.fragments[0].id,quote:pdfEvidence.fragments[0].text},expectedRevision:collection.revision}});assert.equal(pdfSaved.status(),201,await pdfSaved.text());collection=(await pdfSaved.json()).collection;
    const searchInput={query:"contrato pago",causaId:caseId,libraryCollectionIds:[collectionId],libraryOnly:true,sourceKinds:[]};
    const searched=await api.post("/api/research",{headers,data:searchInput});assert.equal(searched.status(),201,await searched.text());const run=await searched.json();assert.equal(run.coverage.networkRequests,0);assert.equal(run.coverage.modelUsed,false);assert.ok(run.results.some((c:{pageNumber:number})=>c.pageNumber===2));assert.ok(run.results.some((c:{fragmentId:string})=>c.fragmentId===anchor.fragmentId));
    const v1=run.results.find((c:{fragmentId:string})=>c.fragmentId===anchor.fragmentId).versionId;
    const v2Text="El 14 de mayo de 2025 se informa un pago de CLP 99999 por el contrato A.";
    const v2Key=`knowledge-production-${tag}/v2.txt`;keys.add(v2Key);await putObject({key:v2Key,body:v2Text,contentType:"text/plain"});await db.documento.update({where:{id:documentIds[0]},data:{storageKey:v2Key,contenido:v2Text,extractedMarkdown:v2Text,version:2}});
    const secondCapture=await api.post(`/api/documentos/${documentIds[0]}/evidence`,{headers});assert.equal(secondCapture.status(),201);const v2=(await secondCapture.json()).id;assert.notEqual(v1,v2);
    const pinned=await api.post("/api/research",{headers,data:searchInput});assert.equal(pinned.status(),201);const pinnedResult=await pinned.json();assert.ok(pinnedResult.results.some((c:{versionId:string})=>c.versionId===v1));assert.ok(!pinnedResult.results.some((c:{versionId:string})=>c.versionId===v2));assert.equal((await api.get(`/api/research/${run.id}`)).status(),200);
    await db.documento.update({where:{id:documentIds[0]},data:{storageKey:`knowledge-production-${tag}/0.txt`,contenido:textA,extractedMarkdown:textA,version:3}});
    assert.equal((await api.post(`/api/documentos/${documentIds[0]}/evidence`,{headers})).status(),201);assert.equal((await api.post(`${knowledge}/analyze`,{headers,data:{}})).status(),200);
    const retained=await (await api.get(`${knowledge}/facts/${first!.id}`)).json();assert.equal(retained.statement,edited);assert.equal(retained.status,"accepted");assert.equal(retained.revision,reviewed.revision);assert.ok(retained.citationCount>=2);
    const sourceProof=await api.post("/api/knowledge/citations/verify",{headers,data:{citation:anchor,causaId:caseId}});assert.equal(sourceProof.status(),200);assert.equal((await sourceProof.json()).verified,true);
    // All these requests are streamed without Content-Length; rejection must precede domain writes.
    const cookie=state.cookies.map(c=>`${c.name}=${c.value}`).join("; ");
    for(const [method,route] of [["POST","/api/knowledge/citations/verify"],["POST","/api/knowledge/collections"],["PATCH",`/api/knowledge/collections/${collectionId}`],["POST",`/api/knowledge/collections/${collectionId}/items`],["DELETE",`/api/knowledge/collections/${collectionId}/items/${save.item.id}`],["DELETE",`/api/knowledge/collections/${collectionId}`]]) {
      const bytes=new TextEncoder().encode(JSON.stringify({padding:"x".repeat(300_000)}));
      const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});
      const response: Response=await fetch(`${base}${route}`,{method,headers:{...headers,Cookie:cookie,"Content-Type":"application/json"},body,duplex:"half"} as RequestInit & {duplex:"half"});assert.equal(response.status,413,`${method} ${route}: ${await response.text()}`);
    }
    assert.equal((await api.post(`${knowledge}/analyze`,{headers:{Origin:base},data:{}})).status(),403);
    const removed=await api.delete(`/api/knowledge/collections/${collectionId}/items/${save.item.id}`,{headers,data:{expectedRevision:collection.revision}});assert.equal(removed.status(),200,await removed.text());assert.equal((await api.get(`/api/research/${run.id}`)).status(),404);
    const portalUser=await db.user.findUniqueOrThrow({where:{id:portalId}});assert.equal((await portal.post("/api/auth/login",{headers:{Origin:base},data:{email:portalUser.email,password}})).status(),200);assert.equal((await portal.get(knowledge)).status(),403);assert.equal((await portal.get("/api/knowledge/collections")).status(),403);
    await db.causa.update({where:{id:caseId},data:{abogadoId:otherId}});
    for(const route of [knowledge,`${knowledge}/facts/${first!.id}`,`${knowledge}/conflicts/${discrepancy.id}`,`/api/knowledge/collections/${collectionId}`,`/api/research/${pinnedResult.id}`,`/api/evidence/versions/${pdfVersion.id}/pages/2`]) assert.equal((await api.get(route)).status(),404,route);
    console.log(JSON.stringify({mode:"production",checks:["CSRF real","local source analysis and ambiguous dates","human review and stale CAS","two verified conflict sides and review","PDF page2 OCR and private image","case library and exact pinned version","libraryOnly with no model/network","A-B-A retains human statement/status/revision","six chunked JSON limits reject413","withdrawn pin invalidates history","portal denied","case revocation denies all derivatives"],googleOrLegalNetwork:false,deployment:false}));
  } finally {
    await api.dispose();await portal.dispose();
    if(documentIds.length){const frozen=await db.documentEvidenceVersion.findMany({where:{resource:{documentoId:{in:documentIds}}},select:{sourceStorageKey:true}});for(const row of frozen)if(row.sourceStorageKey)keys.add(row.sourceStorageKey);}
    if(siteId){const frozen=await db.documentEvidenceVersion.findMany({where:{resource:{siteFile:{siteId}}},select:{sourceStorageKey:true}});for(const row of frozen)if(row.sourceStorageKey)keys.add(row.sourceStorageKey);}
    if(collectionId)await db.knowledgeCollection.deleteMany({where:{id:collectionId}});
    await db.researchRun.deleteMany({where:{ownerId:{in:userIds}}});
    if(siteId)await db.site.deleteMany({where:{id:siteId}});
    if(documentIds.length)await db.documento.deleteMany({where:{id:{in:documentIds}}});
    if(caseId)await db.causa.deleteMany({where:{id:caseId}});
    await db.auditEvent.deleteMany({where:{actorId:{in:userIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});if(organizationId)await db.organization.deleteMany({where:{id:organizationId}});
    await Promise.all([...keys].map(key=>rm(path.join(process.env.STORAGE_PATH!,key),{force:true})));await db.$disconnect();
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
