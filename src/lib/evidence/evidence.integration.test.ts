import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { captureDocumentEvidence, readDocumentEvidence, authorizedEvidenceFragment, authorizedEvidenceOriginal, storeEvidenceSnapshot } from "./service";
import { verifyEvidenceQuote } from "./fragments";
import { putObject } from "@/lib/storage";

assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),new URL(process.env.DATABASE_URL!).toString());

const prefix=randomUUID(); const users:string[]=[]; let causaId=''; let docId='';
async function main() {
 const previousStorage = process.env.STORAGE_PATH;
 const storage = await mkdtemp(path.join(tmpdir(), 'lexopen-evidence-'));
 process.env.STORAGE_PATH = storage;
 try {
  const owner=await prisma.user.create({data:{name:'Evidence fixture',email:`${prefix}@evidence.invalid`,password:'fixture-only',role:'abogado'}});users.push(owner.id);
  const excluded=await prisma.user.create({data:{name:'Excluded fixture',email:`${prefix}-excluded@evidence.invalid`,password:'fixture-only',role:'abogado'}});users.push(excluded.id);
  const causa=await prisma.causa.create({data:{titulo:prefix,tribunal:'Fixture',materia:'civil',acceso:'equipo',abogadoId:owner.id}});causaId=causa.id;
  const text=Array.from({length:120},(_,i)=>`Hecho documental ${i}. ${'Texto ficticio con acentos. '.repeat(65)}`).join('\n\n');
  const doc=await prisma.documento.create({data:{nombre:'evidence-fixture.txt',contenido:text,extractedMarkdown:text,extractionStatus:'completed',causaId:causa.id,autorId:owner.id}});docId=doc.id;
  const captures=await Promise.all([captureDocumentEvidence(doc.id,owner),captureDocumentEvidence(doc.id,owner)]);
  assert.equal(captures[0].id,captures[1].id,'Identical snapshots are idempotent under concurrency');
  const first=await readDocumentEvidence(doc.id,owner); assert.equal(first.fragments.length,50); assert.ok(first.nextAfter);
  const next=await readDocumentEvidence(doc.id,owner,{after:first.nextAfter!});assert.ok(next.fragments[0].ordinal>first.fragments.at(-1)!.ordinal);
  const f=await authorizedEvidenceFragment(first.fragments[0].id,owner);assert.ok(verifyEvidenceQuote(f,f.text)); assert.equal(verifyEvidenceQuote(f,'invento'),false);
  const original=await authorizedEvidenceOriginal(captures[0].id,owner); assert.equal(original.bytes.toString(),text);
  await assert.rejects(readDocumentEvidence(doc.id,excluded),(e:unknown)=>(e as {status?:number}).status===404);
  await assert.rejects(authorizedEvidenceFragment(f.id,excluded),(e:unknown)=>(e as {status?:number}).status===404);
  await assert.rejects(authorizedEvidenceOriginal(captures[0].id,excluded),(e:unknown)=>(e as {status?:number}).status===404);
  await prisma.documento.update({where:{id:doc.id},data:{confidencial:true}});
  const revoked={...owner,capabilityRevokes:'doc.confidential.read'};
  await assert.rejects(readDocumentEvidence(doc.id,revoked),(e:unknown)=>(e as {status?:number}).status===404);
  await prisma.documento.update({where:{id:doc.id},data:{confidencial:false}});
  await prisma.causa.update({where:{id:causa.id},data:{acceso:'estudio'}});
  await prisma.documento.update({where:{id:doc.id},data:{privilegio:true}});
  await assert.rejects(readDocumentEvidence(doc.id,excluded),(e:unknown)=>(e as {status?:number}).status===404);
  await prisma.documento.update({where:{id:doc.id},data:{privilegio:false}});
  await prisma.causa.update({where:{id:causa.id},data:{acceso:'equipo'}});
  for (let i=0;i<101;i++) await prisma.$transaction(tx=>storeEvidenceSnapshot(tx,{documentoId:doc.id,name:'version.txt',bytes:Buffer.from(String(i)),text:`Nueva versión ${i}`,status:'completed'}));
  const old=await readDocumentEvidence(doc.id,owner,{versionId:captures[0].id});assert.equal(old.selectedVersionId,captures[0].id);assert.ok(old.fragments.length);assert.equal(old.versionHistoryLimited,true);
  const saved=await prisma.documentEvidenceVersion.findUniqueOrThrow({where:{id:captures[0].id}});
  await putObject({key:saved.sourceStorageKey!,body:'tampered source'});
  await assert.rejects(authorizedEvidenceOriginal(saved.id,owner),/no coincide/);
  console.log('evidence integration OK: concurrent idempotency, pagination, exact quotes, current ACL, original hash, old citation beyond 100 versions');
 } finally {
  if(docId)await prisma.documento.deleteMany({where:{id:docId}});
  if(causaId)await prisma.causa.deleteMany({where:{id:causaId}});
  await prisma.auditEvent.deleteMany({where:{actorId:{in:users}}});
  await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect();
  await rm(storage,{recursive:true,force:true});
  if(previousStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=previousStorage;
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1});
