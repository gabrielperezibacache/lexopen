import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { createDocumentProcessor } from "./document-processing-queue";
import { assertDisposableDatabaseUrl } from "./testing/disposable-db";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const prefix = randomUUID();
const ids: string[] = [];
let clock = new Date('2087-03-10T12:00:00Z');
const processors: ReturnType<typeof createDocumentProcessor>[] = [];
const processText = async (_name: string, bytes: Buffer) => ({ format: 'txt', status: 'completed' as const, markdown: bytes.toString('utf8'), metadata: {} });
async function doc(data: Record<string, unknown> = {}) {
  const d = await db.documento.create({ data: { nombre: `${prefix}.txt`, contenido: 'fixture', extractionStatus: 'pending', ...data } });
  ids.push(d.id); return d;
}
async function main() {
  const rows = await db.documento.createManyAndReturn({ data: Array.from({ length: 201 }, (_, i) => ({ nombre: `${prefix}-${i}.txt`, contenido: `${prefix}:${i}`, extractionStatus: 'pending' })) });
  ids.push(...rows.map(r=>r.id));
  const counts = new Map<string,number>();
  const process = async (name: string, bytes: Buffer) => { const key=bytes.toString(); counts.set(key,(counts.get(key)||0)+1); return processText(name,bytes); };
  const a=createDocumentProcessor({client:db,documentIds:rows.map(r=>r.id),process});
  const b=createDocumentProcessor({client:db,documentIds:rows.map(r=>r.id),process}); processors.push(a,b);
  await Promise.all([a.recover(),b.recover()]);
  assert.equal(await db.documento.count({where:{id:{in:rows.map(r=>r.id)},extractionStatus:'completed'}}),201);
  assert.equal(counts.size,201); assert.ok([...counts.values()].every(n=>n===1),'Concurrent workers must not process a live lease twice');
  const stale=await doc({extractionStatus:'processing',extractionLockedAt:new Date('2000-01-01'),extractionLockToken:'dead-worker'});
  const recovery=createDocumentProcessor({client:db,documentIds:[stale.id],process:processText}); processors.push(recovery); await recovery.recover();
  assert.equal((await db.documento.findUniqueOrThrow({where:{id:stale.id}})).extractionStatus,'completed');
  const retry=await doc({storageKey:'fictitious/transient'}); let reads=0;
  const retryWorker=createDocumentProcessor({client:db,documentIds:[retry.id],now:()=>clock,process:processText,read:async()=>{if(++reads===1)throw new Error('transient-storage');return Buffer.from('recovered');}}); processors.push(retryWorker);
  await retryWorker.recover(); assert.equal((await db.documento.findUniqueOrThrow({where:{id:retry.id}})).extractionStatus,'pending');
  clock=new Date(clock.getTime()+60_000); await retryWorker.recover();
  assert.equal((await db.documento.findUniqueOrThrow({where:{id:retry.id}})).extractedMarkdown,'recovered');
  const replaced=await doc();
  const replacedWorker=createDocumentProcessor({client:db,documentIds:[replaced.id],process:async()=>{await db.documento.update({where:{id:replaced.id},data:{extractionLockToken:'new-owner'}});return {format:'txt',status:'completed',markdown:'obsolete',metadata:{}};}}); processors.push(replacedWorker); await replacedWorker.recover();
  assert.equal((await db.documento.findUniqueOrThrow({where:{id:replaced.id}})).extractedMarkdown,null,'Old claim cannot overwrite a replacement lease');
  let first=true; const broken=db.$extends({query:{documento:{async findFirst({args,query}){if(first){first=false;throw new Error('transient-database');}return query(args);}}}});
  const retryRecovery=createDocumentProcessor({client:broken as unknown as PrismaClient,documentIds:[],process:processText}); processors.push(retryRecovery);
  await assert.rejects(retryRecovery.recover(),/transient-database/); await retryRecovery.recover();
  // Use the production processor on a real mixed PDF and persist per-page results.
  const pdf=await doc({nombre:`${prefix}.pdf`,storageKey:'fictitious/mixed.pdf'});
  const bytes=await readFile(new URL('./evidence/pdf-fixtures/mixed-three-pages.pdf',import.meta.url));
  const pdfWorker=createDocumentProcessor({client:db,documentIds:[pdf.id],read:async()=>bytes}); processors.push(pdfWorker);
  await pdfWorker.recover();
  const prepared=await db.documento.findUniqueOrThrow({where:{id:pdf.id}});
  assert.equal(prepared.extractionStatus,'completed');
  assert.equal(prepared.extractionLockToken,null);
  assert.deepEqual(prepared.extractedMarkdown?.match(/^## Página \d+$/gm),['## Página 1','## Página 2']);
  const metadata=JSON.parse(prepared.extractionJson!);
  assert.equal(metadata.partial,false);
  assert.deepEqual(metadata.ocrPagesProcessed,[1]);
  assert.deepEqual(metadata.pages.map((page:{pageNumber:number;status:string})=>[page.pageNumber,page.status]),[[1,'completed'],[2,'completed'],[3,'empty']]);
  console.log('document-processing-queue.integration OK: 201, concurrent claim, stale lease, retry, CAS, recovery and real mixed PDF persistence');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{processors.forEach(p=>p.stop());await db.documento.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
