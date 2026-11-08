import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authenticateApiRequests, loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

const db=new PrismaClient({datasources:{db:{url:assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL)}}});
const label=`Evidence browser ${randomUUID()}`;let causeId='';let documentId='';
test.beforeAll(async()=>{
 const owner=await db.user.findUniqueOrThrow({where:{email:'socio@estudio.cl'}});
 const cause=await db.causa.create({data:{titulo:label,tribunal:'Fixture',materia:'civil',acceso:'equipo',abogadoId:owner.id}});causeId=cause.id;
 const text=Array.from({length:70},(_,i)=>`Documento ficticio ${i}: ${'Hechos con evidencia y fecha verificable. '.repeat(36)}`).join('\n\n');
 const doc=await db.documento.create({data:{nombre:label+'.txt',contenido:text,extractedMarkdown:text,extractionStatus:'completed',causaId:cause.id,autorId:owner.id}});documentId=doc.id;
});
test.afterAll(async()=>{
 await db.auditEvent.deleteMany({where:{entityId:documentId}});
 if(documentId)await db.documento.deleteMany({where:{id:documentId}});
 if(causeId)await db.causa.deleteMany({where:{id:causeId}});await db.$disconnect();
});
test('fuentes propias: preparar, citar, paginar y conservar versión; portal sin acceso',async({page,browser},testInfo)=>{
 await loginAs(page,'socio@estudio.cl');
 await authenticateApiRequests(page);
 await page.goto(`/documentos/${documentId}/fuentes`);
 await expect(page.getByRole('heading',{name:label+'.txt'})).toBeVisible();
 await page.getByRole('button',{name:'Preparar fuentes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fragmento 1',exact:true})).toBeVisible();
 const response=await page.request.get(`/api/documentos/${documentId}/evidence`);expect(response.ok()).toBeTruthy();const evidence=await response.json();
 expect(evidence.fragments).toHaveLength(50);expect(evidence.nextAfter).not.toBeNull();
 const verify=await page.request.post(`/api/evidence/fragments/${evidence.fragments[0].id}/verify`,{data:{quote:'Cita inexistente inventada'}});expect(verify.status(),await verify.text()).toBe(200);expect((await verify.json()).verified).toBe(false);
 const original=await page.request.get(`/api/evidence/versions/${evidence.selectedVersionId}/original`);expect(original.ok()).toBeTruthy();
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:testInfo.outputPath('evidence-desktop.png'),fullPage:false});
 await page.setViewportSize({width:360,height:800});await page.screenshot({path:testInfo.outputPath('evidence-mobile.png'),fullPage:false});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.route(`**/api/documentos/${documentId}/evidence*`,route=>route.request().method()==='POST' ? route.fulfill({status:503,json:{error:'Error ficticio de preparación'}}) : route.continue());
 await page.getByRole('button',{name:'Preparar versión actual',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Error ficticio de preparación'})).toBeVisible();
 await page.getByRole('button',{name:'Volver a cargar',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Error ficticio de preparación'})).toHaveCount(0);
 await page.unroute(`**/api/documentos/${documentId}/evidence*`);
 await page.getByRole('button',{name:'Siguientes fragmentos'}).click();await expect(page.getByRole('heading',{name:'Fragmento 51',exact:true})).toBeVisible();
 await db.documento.update({where:{id:documentId},data:{contenido:'Versión nueva de fixture',extractedMarkdown:'Versión nueva de fixture'}});
 await page.getByRole('button',{name:'Preparar versión actual',exact:true}).click();await expect(page.getByText('Versión nueva de fixture',{exact:true})).toBeVisible();
 await page.goto(`/documentos/${documentId}/fuentes?version=${evidence.selectedVersionId}`);await expect(page.getByText(/Documento ficticio 0:/).first()).toBeVisible();
 const client=await browser.newContext();const portal=await client.newPage();await loginAs(portal,'cliente@andes.cl');
 const denied=await portal.request.get(`/api/documentos/${documentId}/evidence`);expect([403,404]).toContain(denied.status());
 const binary=await portal.request.get(`/api/evidence/versions/${evidence.selectedVersionId}/original`);expect([403,404]).toContain(binary.status());await client.close();
});
