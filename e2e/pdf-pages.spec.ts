import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { authenticateApiRequests, loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";

const db=new PrismaClient({datasources:{db:{url:assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL)}}});
if ([process.env.S3_BUCKET,process.env.S3_ACCESS_KEY_ID,process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("PDF browser fixtures require local storage only");
const prefix=randomUUID(),name=`PDF verificable ${prefix}.pdf`;
const storageRoot=path.resolve(process.env.STORAGE_PATH||path.join(process.cwd(),"storage"));
const sourcePrefix=`pdf-browser/${prefix}`;
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
let documentId="",causeId="";
let bytes:Buffer;
test.beforeAll(async()=>{
  const owner=await db.user.findUniqueOrThrow({where:{email:"socio@estudio.cl"}});
  const cause=await db.causa.create({data:{titulo:`PDF browser ${prefix}`,tribunal:"Fixture",materia:"civil",acceso:"equipo",abogadoId:owner.id}});causeId=cause.id;
  bytes=await readFile(path.join(process.cwd(),"src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
  const storageKey=`${sourcePrefix}/original.pdf`;
  await putObject({key:storageKey,body:bytes,contentType:"application/pdf"});
  const doc=await db.documento.create({data:{nombre:name,mimeType:"application/pdf",storageKey,contenido:"Extracción anterior ficticia sin localizadores físicos",extractedMarkdown:"Esta extracción previa no debe usarse como texto de página",extractionStatus:"completed",causaId:cause.id,autorId:owner.id}});documentId=doc.id;
});
test.afterAll(async()=>{
  try {
    if(documentId){await db.auditEvent.deleteMany({where:{entityId:documentId}});await db.documento.deleteMany({where:{id:documentId}});}
    if(causeId)await db.causa.deleteMany({where:{id:causeId}});
    await rm(path.join(storageRoot,sourcePrefix),{recursive:true,force:true});
    if(documentId)await rm(path.join(storageRoot,"evidence",encodeURIComponent(documentId)),{recursive:true,force:true});
  } finally { await db.$disconnect(); }
});

test("carga de PDF mixto: prepara el texto en orden y conserva el original",async({page})=>{
  await loginAs(page,"socio@estudio.cl");
  await authenticateApiRequests(page);
  let uploadedId="",uploadedKey="";
  try {
    const response=await page.request.post("/api/documentos",{multipart:{nombre:`Carga OCR ${prefix}.pdf`,causaId:causeId,file:{name:`Carga OCR ${prefix}.pdf`,mimeType:"application/pdf",buffer:bytes}}});
    expect(response.status(),await response.text()).toBe(201);
    const uploaded=await response.json();uploadedId=uploaded.id;uploadedKey=uploaded.storageKey;
    await expect.poll(async()=> (await db.documento.findUniqueOrThrow({where:{id:uploadedId}})).extractionStatus,{timeout:20_000}).toBe("completed");
    const prepared=await db.documento.findUniqueOrThrow({where:{id:uploadedId}});
    const metadata=JSON.parse(prepared.extractionJson!);
    expect(metadata.partial).toBe(false);
    expect(metadata.ocrPagesProcessed).toEqual([1]);
    expect(metadata.ocrPagesFailed).toEqual([]);
    expect(metadata.pages.map((p:{pageNumber:number;status:string})=>[p.pageNumber,p.status])).toEqual([[1,"completed"],[2,"completed"],[3,"empty"]]);
    const text=await page.request.get(`/api/documentos/${uploadedId}/markdown`);
    expect(text.ok()).toBe(true);
    expect((await text.text()).match(/^## Página \d+$/gm)).toEqual(["## Página 1","## Página 2"]);
    const original=await page.request.get(`/api/documentos/${uploadedId}/content`);
    expect(original.ok()).toBe(true);
    expect(digest(await original.body())).toBe(digest(bytes));
  } finally {
    if(uploadedId){await db.auditEvent.deleteMany({where:{entityId:uploadedId}});await db.documento.deleteMany({where:{id:uploadedId}});}
    if(uploadedKey)await rm(path.join(storageRoot,uploadedKey),{force:true});
  }
});

test("PDF físico: página, OCR, original y cita conservan su versión y permisos",async({page,browser},testInfo)=>{
  test.setTimeout(90_000);
  // Exercise the actual manual-copy fallback rather than the OS clipboard.
  await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{value:undefined,configurable:true}));
  await loginAs(page,"socio@estudio.cl");
  await authenticateApiRequests(page);
  await page.goto(`/documentos/${documentId}/fuentes`);
  await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Preparar fuentes",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Fragmento 1 · Página 1",exact:true})).toBeVisible({timeout:20_000});
  const firstResponse=await page.request.get(`/api/documentos/${documentId}/evidence`);expect(firstResponse.ok()).toBeTruthy();
  const first=await firstResponse.json();
  expect(first.pages.map((p:{pageNumber:number;method:string;status:string})=>[p.pageNumber,p.method,p.status])).toEqual([[1,"native","completed"],[2,"ocr","completed"],[3,"empty","empty"]]);
  const version=first.selectedVersionId as string;
  const selector=page.getByLabel("Página del PDF",{exact:true});
  await selector.selectOption("2");
  await expect(page.getByRole("heading",{name:"Fragmento 2 · Página 2",exact:true})).toBeVisible();
  await expect(page.getByText(/HECHO FICTICIO: PAGO EL 12 DE MAYO DE 2025/)).toBeVisible();
  const image=page.getByRole("img",{name:`Página 2 de ${name}`,exact:true});
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0),{timeout:20_000}).toBe(true);
  const pageResponse=await page.request.get(`/api/evidence/versions/${version}/pages/2`);
  expect(pageResponse.ok()).toBeTruthy();expect(pageResponse.headers()["content-type"]).toContain("image/png");expect(pageResponse.headers()["cache-control"]).toContain("no-store");
  expect((await page.request.get(`/api/evidence/versions/${version}/pages/0`)).status()).toBe(400);
  expect((await page.request.get(`/api/evidence/versions/${version}/pages/4`)).status()).toBe(404);
  await page.getByRole("button",{name:"Copiar referencia del fragmento 2",exact:true}).click();
  const reference=page.getByLabel("Copie esta referencia",{exact:true});
  await expect(reference).toBeVisible();expect(await reference.inputValue()).toContain("Página 2");expect(await reference.inputValue()).toContain("page=2");
  await page.getByRole("button",{name:"Cerrar referencia",exact:true}).click();
  const pdfPage2=await page.request.get(`/api/documentos/${documentId}/evidence?version=${version}&page=2`);const fragments=await pdfPage2.json();
  const verification=await page.request.post(`/api/evidence/fragments/${fragments.fragments[0].id}/verify`,{data:{quote:fragments.fragments[0].text}});
  expect(verification.status(),await verification.text()).toBe(200);
  const verified=await verification.json();expect(verified.verified).toBe(true);expect(verified.pageNumber).toBe(2);expect(verified.href).toContain("page=2");
  await page.setViewportSize({width:1366,height:900});await selector.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath("pdf-pages-desktop.png")});
  await page.setViewportSize({width:360,height:800});await selector.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath("pdf-pages-mobile.png")});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await selector.selectOption("3");
  await expect(page.getByRole("heading",{name:/Fragmento \d+ · Página 3/})).toHaveCount(0);
  await expect(page.getByRole("img",{name:`Página 3 de ${name}`,exact:true})).toBeVisible();
  await expect(page.getByText(/No hay fragmentos|no contiene texto|página está vacía/i)).toBeVisible();

  const nextBytes=Buffer.concat([bytes,Buffer.from("\n% Next PDF browser source fixture\n")]);
  const newKey=`${sourcePrefix}/next.pdf`;
  await putObject({key:newKey,body:nextBytes,contentType:"application/pdf"});
  await db.documento.update({where:{id:documentId},data:{storageKey:newKey}});
  await page.getByRole("button",{name:"Preparar versión actual",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Fragmento 1 · Página 1",exact:true})).toBeVisible({timeout:20_000});
  const newer=(await (await page.request.get(`/api/documentos/${documentId}/evidence`)).json()).selectedVersionId;
  expect(newer).not.toBe(version);
  await page.goto(`/documentos/${documentId}/fuentes?version=${version}&page=2`);
  await expect(page.getByLabel("Versión consultada",{exact:true})).toHaveValue(version);
  await expect(page.getByRole("heading",{name:"Fragmento 2 · Página 2",exact:true})).toBeVisible();
  const retained=await page.request.get(`/api/evidence/versions/${version}/original`);expect(retained.ok()).toBeTruthy();expect(digest(await retained.body())).toBe(digest(bytes));
  const saved=await db.documentEvidenceVersion.findUniqueOrThrow({where:{id:version}});
  await putObject({key:saved.sourceStorageKey!,body:"tampered frozen PDF fixture"});
  expect((await page.request.get(`/api/evidence/versions/${version}/pages/2`)).status()).toBe(409);
  await page.reload();
  await expect(page.getByRole("alert").filter({hasText:"El original no coincide"})).toBeVisible();
  await putObject({key:saved.sourceStorageKey!,body:bytes,contentType:"application/pdf"});
  await page.getByRole("button",{name:"Reintentar página",exact:true}).click();
  await expect(page.getByRole("img",{name:`Página 2 de ${name}`,exact:true})).toBeVisible();
  const portal=await browser.newContext();
  try {
    const client=await portal.newPage();await loginAs(client,"cliente@andes.cl");await authenticateApiRequests(client);
    expect([403,404]).toContain((await client.request.get(`/api/evidence/versions/${version}/pages/2`)).status());
    expect([403,404]).toContain((await client.request.get(`/api/documentos/${documentId}/evidence?version=${version}&page=2`)).status());
    expect([403,404]).toContain((await client.request.post(`/api/evidence/fragments/${fragments.fragments[0].id}/verify`,{data:{quote:fragments.fragments[0].text}})).status());
  } finally { await portal.close(); }
});
