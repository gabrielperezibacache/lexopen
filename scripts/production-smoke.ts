import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { chromium, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { nextInvoiceNumber } from "../src/lib/billing";

async function main() {
 if(process.env.NODE_ENV!=='production' || process.env.LEXOPEN_E2E==='1' || process.env.LEXOPEN_RELAX_CSRF==='1')throw new Error('Production mode without relaxed authentication or CSRF required');
 const base=process.env.PROD_TEST_BASE_URL;
 if(!base || !['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Explicit loopback PROD_TEST_BASE_URL required');
 const databaseUrl=assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
 if(process.env.DATABASE_URL!==databaseUrl)throw new Error('DATABASE_URL must match the disposable E2E_DATABASE_URL');
 const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
 const prefix=randomUUID();const password=`Fixture-${randomUUID()}`;const userIds:string[]=[];let causeId='',hiddenCauseId='',docId='',orgId='';const clientIds:string[]=[];
 const clients:Awaited<ReturnType<typeof request.newContext>>[]=[];
 try {
  const organization=await db.organization.create({data:{name:`Production smoke ${prefix}`,settings:{create:{require2faPrivileged:true,assistantLlmMode:'local_only'}}}});orgId=organization.id;
  for(const role of ['admin','abogado']) {
   const u=await db.user.create({data:{email:`${prefix}-${role}@production-fixture.invalid`,name:`Production ${role}`,role,password:await hash(password,10)}});userIds.push(u.id);
  }
  const cause=await db.causa.create({data:{titulo:`Production smoke ${prefix}`,tribunal:'Fixture',materia:'civil',acceso:'equipo',abogadoId:userIds[1]}});causeId=cause.id;
  const doc=await db.documento.create({data:{nombre:'Production fixture.txt',contenido:'Texto ficticio de producción sin datos reales.',extractionStatus:'completed',causaId:cause.id,autorId:userIds[1]}});docId=doc.id;
  const admin=await request.newContext({baseURL:base});clients.push(admin);
  const login=await admin.post('/api/auth/login',{headers:{Origin:base},data:{email:`${prefix}-admin@production-fixture.invalid`,password}});assert.equal(login.status(),200,await login.text());
  for(const headers of [{},{purpose:'prefetch'},{'next-router-prefetch':'1'}] as Record<string,string>[]) {
   const denied=await admin.get('/api/causas',{headers});assert.equal(denied.status(),403,await denied.text());assert.equal((await denied.json()).code,'2fa_required');
  }
  const lawyer=await request.newContext({baseURL:base});clients.push(lawyer);
  const logged=await lawyer.post('/api/auth/login',{headers:{Origin:base},data:{email:`${prefix}-abogado@production-fixture.invalid`,password}});assert.equal(logged.status(),200,await logged.text());
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({locale:'es-CL'});
    const hydrationErrors:string[]=[];
    page.on('console',message=>{if(message.type()==='error' && /hydrat|did not match/i.test(message.text()))hydrationErrors.push(message.text())});
    await page.goto(`${base}/login`);
    await page.locator('input[name="email"]').fill(`${prefix}-abogado@production-fixture.invalid`);
    await page.locator('input[name="password"]').fill(password);
    const loginResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login' && response.request().method()==='POST');
    await page.locator('button[type="submit"]').click();
    assert.equal((await loginResponse).status(),200);
    await page.waitForURL(`${base}/inicio`);
    assert.deepEqual(hydrationErrors,[]);
  } finally { await browser.close(); }
  const storage=await lawyer.storageState();const token=storage.cookies.find(c=>c.name==='lexopen_csrf')?.value;assert.ok(token);
  const body={titulo:`Production smoke ${prefix}`,fechaLimite:'2027-01-15',causaId:causeId};
  const noCsrf=await lawyer.post('/api/plazos',{headers:{Origin:base},data:body});assert.equal(noCsrf.status(),403);
  const wrongOrigin=await lawyer.post('/api/plazos',{headers:{Origin:'https://different.invalid','x-csrf-token':token!},data:body});assert.equal(wrongOrigin.status(),403);
  const headers={Origin:base,'x-csrf-token':token!,'Idempotency-Key':`production-smoke-${prefix}`};
  const one=await lawyer.post('/api/plazos',{headers,data:body});assert.equal(one.status(),201,await one.text());const created=await one.json();
  const again=await lawyer.post('/api/plazos',{headers,data:body});assert.equal(again.status(),201,await again.text());assert.equal((await again.json()).id,created.id);
  const snapshot=await lawyer.post(`/api/documentos/${docId}/evidence`,{headers});assert.equal(snapshot.status(),201,await snapshot.text());
  const view=await lawyer.get(`/api/documentos/${docId}/evidence`);assert.equal(view.status(),200);const evidence=await view.json();assert.equal(evidence.fragments[0].text,'Texto ficticio de producción sin datos reales.');
  const quote=await lawyer.post(`/api/evidence/fragments/${evidence.fragments[0].id}/verify`,{headers,data:{quote:'Texto inventado'}});assert.equal(quote.status(),200);assert.equal((await quote.json()).verified,false);
  const account=await db.cliente.create({data:{razonSocial:`Ledger fixture ${prefix}`}});clientIds.push(account.id);
  const other=await db.cliente.create({data:{razonSocial:`Other ledger fixture ${prefix}`}});clientIds.push(other.id);
  await db.causa.update({where:{id:causeId},data:{clienteId:account.id}});
  const hidden=await db.causa.create({data:{titulo:`Hidden production ${prefix}`,tribunal:'Fixture',materia:'civil',acceso:'equipo',abogadoId:userIds[0],clienteId:account.id}});hiddenCauseId=hidden.id;
  const visibleInvoice=await db.invoice.create({data:{number:`VISIBLE-${prefix}`,clienteId:account.id,causaId:causeId,status:'emitida',totalClp:1000}});
  const hiddenInvoice=await db.invoice.create({data:{number:`HIDDEN-${prefix}`,clienteId:account.id,causaId:hidden.id,status:'emitida',totalClp:1000}});
  const hiddenPayment=await db.payment.create({data:{clienteId:account.id,invoiceId:hiddenInvoice.id,amountClp:100}});
  await db.ledgerEntry.create({data:{clienteId:account.id,causaId:hidden.id,tipo:'provision',description:'Hidden money',creditClp:9900,balanceClp:9900}});
  await db.ledgerEntry.create({data:{clienteId:account.id,causaId:causeId,tipo:'provision',description:'Visible money',creditClp:100,balanceClp:10000}});
  const ledgerPayload={clienteId:account.id,tipo:'ajuste',creditClp:1,description:`Production ledger ${prefix}`};
  for(const extra of [{invoiceId:hiddenInvoice.id},{paymentId:hiddenPayment.id}]) {
    const bad=await lawyer.post('/api/billing/ledger',{headers:{...headers,'Idempotency-Key':randomUUID()},data:{...ledgerPayload,...extra}});assert.ok([403,404].includes(bad.status()),await bad.text());
  }
  const mismatch=await lawyer.post('/api/billing/ledger',{headers:{...headers,'Idempotency-Key':randomUUID()},data:{...ledgerPayload,clienteId:other.id,causaId:causeId,invoiceId:visibleInvoice.id}});assert.equal(mismatch.status(),400,await mismatch.text());
  const ledgerHeaders={...headers,'Idempotency-Key':`ledger-${prefix}`};
  const ledger=await lawyer.post('/api/billing/ledger',{headers:ledgerHeaders,data:{...ledgerPayload,invoiceId:visibleInvoice.id}});assert.equal(ledger.status(),201,await ledger.text());const ledgerData=await ledger.json();assert.equal(ledgerData.causaId,causeId);assert.equal(ledgerData.balanceClp,101);
  const ledgerAgain=await lawyer.post('/api/billing/ledger',{headers:ledgerHeaders,data:{...ledgerPayload,invoiceId:visibleInvoice.id}});assert.equal(ledgerAgain.status(),201,await ledgerAgain.text());assert.equal((await ledgerAgain.json()).id,ledgerData.id);
  const scopeResponse=await lawyer.get(`/api/billing/ledger?clienteId=${account.id}`);assert.equal(scopeResponse.status(),200,await scopeResponse.text());const scope=await scopeResponse.json();assert.equal(scope.balances[0].balanceClp,101);assert.equal(scope.entries.length,2);assert.equal(JSON.stringify(scope).includes(hidden.id),false);
  // Occupy the next number a scoped counter would choose in a hidden case.
  const visibleCount=await db.invoice.count({where:{causaId:causeId}});
  const hiddenNumber=nextInvoiceNumber(visibleCount+1,'boleta_honorarios');
  await db.invoice.update({where:{id:hiddenInvoice.id},data:{number:hiddenNumber}});
  const invoiceBody={clienteId:account.id,causaId:causeId,lines:[{description:'Fictitious numbered invoice',unitAmountClp:100}]};
  const newInvoice=await lawyer.post('/api/billing/invoices',{headers,data:invoiceBody});assert.equal(newInvoice.status(),201,await newInvoice.text());const invoiceData=await newInvoice.json();assert.notEqual(invoiceData.number,hiddenNumber);assert.equal(invoiceData.causaId,causeId);
  const collision=await lawyer.post('/api/billing/invoices',{headers,data:{...invoiceBody,number:hiddenNumber}});assert.equal(collision.status(),409,await collision.text());assert.equal((await collision.text()).includes(hidden.id),false);
  const anonymous=await request.newContext({baseURL:base});clients.push(anonymous);assert.equal((await anonymous.get(`/api/documentos/${docId}/evidence`)).status(),401);
  console.log(JSON.stringify({mode:'production',tests:['login real','compiled browser login ready; no hydration errors','privileged 2FA enforced with both prefetch headers','CSRF token required','foreign origin rejected','idempotent deadline retry','own evidence read and false quote rejection','anonymous evidence denied','ledger private references denied','ledger case inferred and client checked','ledger scoped balance and idempotent retry','invoice numbering independent of hidden scope; collision returns 409'],externalServicesConfigured:false}));
 } finally {
  await Promise.all(clients.map(c=>c.dispose()));
  if(docId)await db.documento.deleteMany({where:{id:docId}});
  if(clientIds.length){await db.ledgerEntry.deleteMany({where:{clienteId:{in:clientIds}}});await db.payment.deleteMany({where:{clienteId:{in:clientIds}}});await db.invoice.deleteMany({where:{clienteId:{in:clientIds}}});}
  if(hiddenCauseId)await db.causa.deleteMany({where:{id:hiddenCauseId}});
  if(causeId)await db.causa.deleteMany({where:{id:causeId}});
  await db.notification.deleteMany({where:{userId:{in:userIds}}});
  await db.auditEvent.deleteMany({where:{actorId:{in:userIds}}});
  await db.commandExecution.deleteMany({where:{ownerId:{in:userIds}}});
  if(clientIds.length)await db.cliente.deleteMany({where:{id:{in:clientIds}}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
  if(orgId)await db.organization.deleteMany({where:{id:orgId}});
  await db.$disconnect();
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1});
