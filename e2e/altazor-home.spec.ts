/** Real APIs/Prisma/storage with disposable users and an explicitly fictitious loopback model. */
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient, type IntegrationConfig } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), storage = process.env.STORAGE_PATH;
if (new URL(process.env.DATABASE_URL!).toString() !== url || !storage || !path.isAbsolute(storage) || [process.env.S3_BUCKET,process.env.S3_ACCESS_KEY_ID,process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Use only the explicitly disposable local database and storage");
const db = new PrismaClient({ datasources: { db: { url } } }), ownerIds: string[] = [], causaIds: string[] = [];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Message = { role: string; content: string };
type Conversation = { conversation: { id: string; revision: number; causaId: string | null; scopeKey: string }; destination: { key: string; remote: boolean }; turns: { id: string; ordinal: number; status: string; userText: string; assistantText: string; sourceRefs: unknown[] }[]; attachments: { id: string; sourceSha256: string; textSha256: string; status: string }[] };
let server: Server | undefined, previousConfig: IntegrationConfig[] = [], configCaptured = false, answerNumber = 0;
const modelRequests: Message[][] = [];
test.use({ actionTimeout: 15_000 });

async function json<T>(response: APIResponse, status = 200): Promise<T> { expect(response.status(), await response.text()).toBe(status); return response.json(); }
async function fixture() {
  const tag = randomUUID(), email = `altazor-home-${tag}@example.test`, user = await db.user.create({ data: { email, name: "Profesional ficticio ALTAZOR", password: await hash("lexopen",10), role: "abogado" } }); ownerIds.push(user.id);
  await db.userBookPreference.create({ data: { userId: user.id, defaultConvertToText: true, defaultPreserveOriginal: false } });
  return { user, email, tag };
}
async function readChat(page: Page, id: string) { return json<Conversation>(await page.request.get(`/api/altazor/conversations/${id}`)); }
function chatId(page: Page) { const id = new URL(page.url()).searchParams.get("conversacion"); expect(id).toBeTruthy(); return id!; }
async function composerViewport(page: Page, phase: "new" | "recovered") {
  await expect(page.locator(".altazor-send-settings:visible").filter({hasText:"IA local"})).toBeVisible();
  await page.evaluate(async()=>{await document.fonts.ready;});
  for(const viewport of [{width:1440,height:1000},{width:360,height:800}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>window.scrollTo(0,0));expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    const composer=page.getByTestId("inicio-composer"),attach=page.getByRole("button",{name:"Adjuntar",exact:true}),submit=page.getByTestId("inicio-send");
    const geometry={phase,viewport,document:await page.evaluate(()=>({width:document.documentElement.scrollWidth,innerWidth,scrollY})),composer:await composer.boundingBox(),attach:await attach.boundingBox(),submit:await submit.boundingBox()};
    await test.info().attach(`${phase}-${viewport.width}-geometry`,{body:JSON.stringify(geometry),contentType:"application/json"});
    await expect.soft(composer,`${phase} ${viewport.width}: editor íntegro antes de desplazarse`).toBeInViewport({ratio:1});
    await expect.soft(attach,`${phase} ${viewport.width}: Adjuntar íntegro antes de desplazarse`).toBeInViewport({ratio:1});
    await expect.soft(submit,`${phase} ${viewport.width}: Enviar íntegro antes de desplazarse`).toBeInViewport({ratio:1});
  }
  await page.setViewportSize({width:1440,height:1000});
}
async function openTools(page: Page) {
  const tools=page.locator(".altazor-tools"); if(await tools.getAttribute("open")===null)await tools.locator(":scope > summary").click();
}
async function send(page: Page, text: string) {
  const previous = new URL(page.url()).searchParams.get("conversacion"), before = previous ? (await readChat(page,previous)).turns.length : 0;
  await page.getByTestId("inicio-composer").fill(text);
  const consent = page.getByRole("checkbox", { name: /Permitir el envío de este mensaje/ }); if (await consent.count()) await consent.check();
  await page.getByTestId("inicio-send").click();
  await expect.poll(async () => { const id = new URL(page.url()).searchParams.get("conversacion"); if (!id) return "pending"; const data = await readChat(page,id); return data.turns.length === before + 1 ? data.turns.at(-1)?.status : "pending"; }, { timeout: 25_000 }).toBe("completed");
  await expect(page.getByTestId("inicio-composer")).toHaveValue("");
  return readChat(page,chatId(page));
}
test.beforeAll(async () => {
  server = createServer(async (request,response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { messages } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Message[] }; modelRequests.push(messages);
    const classification = messages.some(message => message.content.startsWith("Clasifica la intención"));
    let content: string;
    if (classification) content = JSON.stringify({ intents: [{ toolId: "respuesta.libre", confidence: 1, slots: {} }] });
    else {
      if (messages.at(-1)?.content.includes("DETENER-FIXTURE")) { await new Promise<void>(resolve => { const timer=setTimeout(resolve,15_000); response.once("close",()=>{clearTimeout(timer);resolve();}); }); if (response.destroyed) return; }
      content = `Respuesta ficticia local ${++answerNumber}. Preparación para revisión profesional.`;
    }
    response.writeHead(200,{"Content-Type":"application/json"}).end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}));
  });
  await new Promise<void>((resolve,reject) => { server!.once("error",reject); server!.listen(0,"127.0.0.1",resolve); });
  const address=server.address(); if(!address||typeof address==="string")throw Error("The fictitious model needs a loopback TCP port");
  previousConfig=await db.integrationConfig.findMany({where:{provider:{in:["llm","hermes"]}}}); configCaptured=true;
  const configJson=JSON.stringify({preset:"custom",apiUrl:`http://127.0.0.1:${address.port}/v1`,apiKey:"",model:"fictitious-altazor-browser",requireApproval:true,allowDemo:false});
  for(const provider of ["llm","hermes"])await db.integrationConfig.upsert({where:{provider},create:{provider,enabled:true,configJson},update:{enabled:true,configJson}});
});
test.afterAll(async () => {
  try {
    if(configCaptured){
      await db.integrationConfig.deleteMany({where:{provider:{in:["llm","hermes"]},id:{notIn:previousConfig.map(row=>row.id)}}});
      for(const row of previousConfig)await db.integrationConfig.upsert({where:{provider:row.provider},create:row,update:{enabled:row.enabled,configJson:row.configJson,updatedAt:row.updatedAt}});
    }
    const books=await db.libraryBook.findMany({where:{ownerId:{in:ownerIds}},select:{id:true}});
    await db.altazorConversation.deleteMany({where:{ownerId:{in:ownerIds}}}); await db.altazorMemorySpace.deleteMany({where:{ownerId:{in:ownerIds}}});
    await db.libraryBook.deleteMany({where:{ownerId:{in:ownerIds}}}); await db.causa.deleteMany({where:{id:{in:causaIds}}});
    await db.assistantPlanRecord.deleteMany({where:{ownerId:{in:ownerIds}}}); await db.commandExecution.deleteMany({where:{ownerId:{in:ownerIds}}}); await db.assistantUndo.deleteMany({where:{ownerId:{in:ownerIds}}});
    await db.activity.deleteMany({where:{userId:{in:ownerIds}}}); await db.auditEvent.deleteMany({where:{actorId:{in:ownerIds}}}); await db.user.deleteMany({where:{id:{in:ownerIds}}});
    for(const book of books){if(!/^book_[a-f0-9]{40}$/.test(book.id))throw Error("Unexpected fixture book identifier");await rm(path.join(storage!,"library-books",book.id),{recursive:true,force:true});}
  } finally { server?.closeAllConnections(); await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve()); await db.$disconnect(); }
});

test("ALTAZOR conserva conversación, adjuntos y fuentes; errores y paneles preservan el borrador",async({page})=>{
  test.setTimeout(120_000);const {user,email}=await fixture();await page.setViewportSize({width:1440,height:1000});await loginAs(page,email);
  await expect(page.getByTestId("altazor-home")).toBeVisible();await expect(page.getByLabel("Mensaje para ALTAZOR")).toBeVisible();
  await composerViewport(page,"new");
  const first=await send(page,"Analiza el primer antecedente enteramente ficticio"),id=first.conversation.id;
  expect(first.turns.map(turn=>turn.ordinal)).toEqual([1]);
  const travellingDraft="Mensaje ficticio conservado al cambiar de apartado";
  await page.getByTestId("inicio-composer").fill(travellingDraft);
  await page.locator('a[href="/biblioteca"]:visible').first().click();
  await page.getByRole("button",{name:"Conversar con ALTAZOR",exact:true}).click();
  const companion=page.getByRole("dialog",{name:"ALTAZOR",exact:true});
  await expect(companion.getByTestId("inicio-composer")).toHaveValue(travellingDraft);
  await expect(companion.locator(".altazor-turns")).toContainText(first.turns[0].assistantText);
  await expect(companion.getByRole("link",{name:"Abrir conversación completa",exact:true})).toHaveAttribute("href",`/inicio?conversacion=${id}`);
  await companion.getByRole("link",{name:"Abrir conversación completa",exact:true}).click();
  await expect(page.getByTestId("inicio-composer")).toHaveValue(travellingDraft);
  await page.getByTestId("inicio-composer").fill("");
  await expect.poll(async()=>(await page.request.get("/api/altazor/companion")).json().then(value=>value.activeConversationId)).toBe(id);
  await page.reload();await expect(page.locator(".altazor-turns")).toContainText(first.turns[0].assistantText);
  await composerViewport(page,"recovered");
  const bytes=Buffer.from("El comprobante ficticio registra treinta unidades y exige una revisión prudente."),filename="antecedente-ficticio.txt";
  await page.locator('.altazor-composer input[type="file"]').setInputFiles({name:filename,mimeType:"text/plain",buffer:bytes});
  await expect(page.locator(".altazor-attachments")).toContainText(filename);
  const attached=(await readChat(page,id)).attachments[0];expect(attached.status).toBe("ready");expect(attached.sourceSha256).toBe(sha(bytes));
  const original=await page.request.get(`/api/altazor/conversations/${id}/attachments/${attached.id}/original`);expect(original.status()).toBe(200);expect(sha(await original.body())).toBe(sha(bytes));
  const extraction=await json<{attachment:{extraction:unknown}}>(await page.request.get(`/api/altazor/conversations/${id}/attachments/${attached.id}`));expect(JSON.stringify(extraction.attachment.extraction)).toContain("treinta unidades");
  const beforeAttachment=modelRequests.length;await send(page,"Analiza el comprobante adjunto ficticio");expect(modelRequests.slice(beforeAttachment).some(messages=>JSON.stringify(messages).includes(bytes.toString()))).toBe(true);
  await page.getByRole("button",{name:"Guardar en biblioteca",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Guardado en tu biblioteca"})).toBeVisible();
  const book=await db.libraryBook.findFirstOrThrow({where:{ownerId:user.id,requestId:`altazor-attachment-${attached.id}`}});expect(book.originalRetained).toBe(false);expect(book.convertedToText).toBe(true);expect(book.sourceSha256).toBe(sha(bytes));
  await page.getByRole("button",{name:"Guardar en biblioteca",exact:true}).click();await expect(page.getByRole("button",{name:"Guardar en biblioteca",exact:true})).toBeEnabled();expect(await db.libraryBook.count({where:{ownerId:user.id,requestId:`altazor-attachment-${attached.id}`}})).toBe(1);
  const fragment=await db.libraryBookFragment.findFirstOrThrow({where:{bookId:book.id},orderBy:{ordinal:"asc"}}),callsBeforeForgery=modelRequests.length,current=await readChat(page,id);
  const forged=await page.request.post(`/api/altazor/conversations/${id}/turns`,{data:{requestId:randomUUID(),expectedRevision:current.conversation.revision,text:"Consulta ficticia con cita fabricada",destinationKey:current.destination.key,sources:[{kind:"book",bookId:book.id,fragmentId:fragment.id,quote:"Una afirmación inventada que no figura en el material conservado"}]}});expect(forged.status()).toBe(409);expect(modelRequests.length).toBe(callsBeforeForgery);
  await page.locator(".altazor-attachments").getByRole("checkbox").uncheck();
  await page.locator(".altazor-source-disclosure > summary").click();const picker=page.getByRole("region",{name:"Fuentes para ALTAZOR"});await expect(picker.locator(`option[value="${book.id}"]`)).toHaveCount(1);await picker.getByRole("combobox",{name:/^Libro/}).selectOption(book.id);
  await expect(picker.locator(".altazor-source-quote")).toContainText("treinta unidades");await picker.getByRole("checkbox").check();
  const beforeSource=modelRequests.length,third=await send(page,"Explica los límites del pasaje elegido de mi biblioteca");expect(third.turns.at(-1)?.sourceRefs).toHaveLength(1);
  expect(modelRequests.slice(beforeSource).filter(messages=>!messages.some(message=>message.content.startsWith("Clasifica la intención"))).some(messages=>JSON.stringify(messages).includes("treinta unidades"))).toBe(true);
  const stored=await db.altazorTurn.findUniqueOrThrow({where:{id:third.turns.at(-1)!.id}}),ref=JSON.parse(stored.contextJson).refs[0];expect(ref.input.bookId).toBe(book.id);expect(ref.citations[0].sourceSha256).toBe(book.sourceSha256);
  expect((await readChat(page,id)).turns.map(turn=>turn.ordinal)).toEqual([1,2,3]);await page.reload();await expect(page.locator(".altazor-user-message")).toHaveCount(3);
  const draft="Borrador ficticio todavía sin enviar";await page.getByTestId("inicio-composer").fill(draft);await openTools(page);await page.getByRole("button",{name:"Memoria",exact:true}).click();await expect(page.getByTestId("altazor-memory")).toBeVisible();await page.getByRole("button",{name:"Conversación",exact:true}).click();await expect(page.getByTestId("inicio-composer")).toHaveValue(draft);
  let failedRequestId="";await page.route(`**/api/altazor/conversations/${id}/turns`,async route=>{if(route.request().method()==="POST"){failedRequestId=route.request().postDataJSON().requestId;return route.fulfill({status:503,json:{error:"Fallo ficticio de envío; el borrador debe conservarse"}});}return route.continue();});
  await page.getByTestId("inicio-send").click();await expect(page.getByTestId("altazor-home").getByRole("alert").filter({hasText:"Fallo ficticio"})).toBeVisible();await expect(page.getByTestId("inicio-composer")).toHaveValue(draft);expect((await readChat(page,id)).turns).toHaveLength(3);
  await page.unroute(`**/api/altazor/conversations/${id}/turns`);const retry=page.waitForRequest(request=>new URL(request.url()).pathname===`/api/altazor/conversations/${id}/turns`&&request.method()==="POST");await send(page,draft);expect((await retry).postDataJSON().requestId).toBe(failedRequestId);
  await page.getByRole("button",{name:`Retirar archivo ${filename}`,exact:true}).click();await expect(page.locator(".altazor-attachments")).toHaveCount(0);
  const withdrawn=await readChat(page,id);expect(withdrawn.attachments).toHaveLength(0);expect(withdrawn.turns[1].status).toBe("blocked");expect(withdrawn.turns[1].assistantText).toBe("");expect(withdrawn.turns[2].status).toBe("blocked");
  expect((await page.request.get(`/api/altazor/conversations/${id}/attachments/${attached.id}/original`)).status()).toBe(404);
  expect((await page.request.get(`/api/books/${book.id}`)).status()).toBe(200);expect(await db.libraryBook.count({where:{id:book.id,ownerId:user.id,deletedAt:null}})).toBe(1);
  await page.setViewportSize({width:360,height:800});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByTestId("inicio-composer")).toBeVisible();
  for(const name of ["Conversación","Memoria","Conexiones","Computadora"]){const tab=page.locator(".altazor-tabs").getByRole("button",{name,exact:true});await tab.focus();await expect(tab).toBeInViewport();expect(await tab.locator("span").evaluate(label=>{const text=label.getBoundingClientRect(),button=label.closest("button")!.getBoundingClientRect();return text.left>=Math.max(0,button.left)-1&&text.right<=Math.min(innerWidth,button.right)+1;}),`El destino ${name} debe conservar su etiqueta completa a 360px`).toBe(true);}
});

test("Inicio recibe otra consulta en la misma ruta y conserva el chat anterior sin enviar ni mezclar causas",async({page})=>{
  test.setTimeout(100_000);const owner=await fixture(),outsider=await fixture();await loginAs(page,owner.email);
  const original=await send(page,"Respuesta ficticia del espacio personal"),id=original.conversation.id,pending="Borrador personal pendiente antes de cambiar de causa";
  await page.getByTestId("inicio-composer").fill(pending);
  const create=async(title:string,abogadoId:string)=>{const cause=await db.causa.create({data:{titulo:title,tribunal:"Tribunal ficticio",materia:"civil",acceso:"equipo",abogadoId}});causaIds.push(cause.id);return cause.id;};
  const firstCase=await create("Primera causa ficticia",owner.user.id),secondCase=await create("Segunda causa ficticia",owner.user.id),deniedCase=await create("Causa ajena ficticia",outsider.user.id),before=modelRequests.length;
  const navigateQuery=async(causaId:string,intencion:string)=>{const query=new URLSearchParams({causaId,intencion});await page.evaluate(search=>history.pushState(null,"",`/inicio?${search}`),query.toString());};
  await navigateQuery(firstCase,"Prepara el primer encargo ficticio sin enviarlo");
  await expect(page.getByTestId("inicio-composer")).toHaveValue("Prepara el primer encargo ficticio sin enviarlo");await expect(page.locator(".altazor-context-label select")).toHaveValue(firstCase);
  await navigateQuery(secondCase,"Prepara el segundo encargo ficticio sin enviarlo");
  await expect(page.getByTestId("inicio-composer")).toHaveValue("Prepara el segundo encargo ficticio sin enviarlo");await expect(page.locator(".altazor-context-label select")).toHaveValue(secondCase);
  await navigateQuery(deniedCase,"No se debe aplicar este encargo ajeno");
  await expect(page.getByTestId("altazor-home").getByRole("alert")).toContainText(/no encontrada|no está disponible/i);await expect(page.getByTestId("inicio-composer")).toHaveValue("Prepara el segundo encargo ficticio sin enviarlo");await expect(page.locator(".altazor-context-label select")).toHaveValue(secondCase);
  expect(modelRequests.length).toBe(before);expect(await db.altazorConversation.count({where:{ownerId:owner.user.id}})).toBe(1);const untouched=await readChat(page,id);expect(untouched.conversation.causaId).toBeNull();expect(untouched.turns).toHaveLength(1);
  await page.evaluate(conversation=>history.pushState(null,"",`/inicio?conversacion=${conversation}`),id);
  await expect(page.getByTestId("inicio-composer")).toHaveValue(pending);await expect(page.locator(".altazor-turns")).toContainText(original.turns[0].assistantText);
  await page.evaluate(()=>history.pushState(null,"","/inicio"));await expect.poll(()=>new URL(page.url()).searchParams.get("conversacion")).toBe(id);
  await send(page,pending);expect((await readChat(page,id)).turns).toHaveLength(2);
});

test("memoria privada: grafo confirmado entra al contexto y olvidar oculta el historial derivado",async({page})=>{
  test.setTimeout(100_000);const {email,user}=await fixture();await loginAs(page,email);await openTools(page);await page.getByRole("button",{name:"Memoria",exact:true}).click();const memory=page.getByTestId("altazor-memory");
  const labels=["Faro de redacción ficticia","Faro de revisión prudente"];
  await memory.getByText("Añadir recuerdo",{exact:true}).click();
  for(const label of labels){await memory.getByLabel("Qué prefieres recordar",{exact:true}).fill(label);await memory.getByLabel("Detalle opcional",{exact:true}).fill("Prefiero síntesis breves con un cierre explícito.");await memory.getByRole("button",{name:"Guardar propuesta",exact:true}).click();await memory.locator("article").getByRole("button",{name:new RegExp(`^${label}`)}).click();await memory.getByRole("button",{name:"Confirmar recuerdo",exact:true}).click();}
  await expect(memory.locator('g[role="button"]')).toHaveCount(2);await memory.locator('g[role="button"]').first().focus();await page.keyboard.press("Enter");
  await memory.getByText("Conectar dos recuerdos",{exact:true}).click();const graph=await json<{nodes:{id:string;label:string}[]}>(await page.request.get("/api/altazor/memory"));
  await memory.getByRole("combobox",{name:/^Desde/}).selectOption(graph.nodes.find(node=>node.label===labels[0])!.id);await memory.getByRole("combobox",{name:/^Hacia/}).selectOption(graph.nodes.find(node=>node.label===labels[1])!.id);await memory.getByLabel("Cómo se relacionan",{exact:true}).fill("orienta");await memory.getByRole("button",{name:"Proponer relación",exact:true}).click();await memory.getByRole("button",{name:"Confirmar recuerdo",exact:true}).click();
  await page.getByRole("button",{name:"Conversación",exact:true}).click();await page.getByRole("checkbox",{name:"Usar mi memoria confirmada en este espacio"}).check();const before=modelRequests.length,chat=await send(page,"Usa el faro de redacción y revisión para organizar esta explicación ficticia");
  expect(modelRequests.slice(before).some(messages=>JSON.stringify(messages).includes(labels[0]))).toBe(true);const turn=await db.altazorTurn.findUniqueOrThrow({where:{id:chat.turns[0].id}});expect(JSON.parse(turn.contextJson).memoryDependencies).toHaveLength(3);
  await page.getByRole("button",{name:"Memoria",exact:true}).click();const memoryButton=memory.locator("article").getByRole("button",{name:new RegExp(`^${labels[0]}`)});if(await memoryButton.getAttribute("aria-expanded")!=="true")await memoryButton.click();await memory.getByRole("button",{name:"Olvidar",exact:true}).first().click();await memory.getByRole("button",{name:"Sí, olvidar",exact:true}).click();
  await expect.poll(async()=>(await json<{nodes:{label:string}[]}>(await page.request.get("/api/altazor/memory"))).nodes.some(node=>node.label===labels[0])).toBe(false);
  await page.reload();await expect(page.locator(".altazor-turns")).toContainText("Contenido no disponible");await expect(page.locator(".altazor-turns")).not.toContainText(chat.turns[0].assistantText);expect((await readChat(page,chat.conversation.id)).turns[0].status).toBe("blocked");
  expect(await db.altazorMemoryNode.count({where:{space:{ownerId:user.id},status:"forgotten",label:"",body:""}})).toBe(1);
});

test("el ámbito es inmutable; un turno en cola se recupera sin ejecutarse y cancelar libera el siguiente",async({page,browser})=>{
  test.setTimeout(100_000);const {email,user}=await fixture(),other=await fixture();await loginAs(page,email);
  const causa=await db.causa.create({data:{titulo:"Causa privada ficticia ALTAZOR",tribunal:"Tribunal ficticio",materia:"civil",acceso:"equipo",abogadoId:user.id}});causaIds.push(causa.id);
  const created=await json<Conversation>(await page.request.post("/api/altazor/conversations",{data:{requestId:randomUUID(),title:"Conversación personal en cola",causaId:null}}),201),id=created.conversation.id;
  const current=await readChat(page,id),payload={requestId:randomUUID(),expectedRevision:current.conversation.revision,text:"Explicación ficticia preparada en cola",destinationKey:current.destination.key,allowRemote:false};
  const queued=await json<{turnId:string}>(await page.request.post(`/api/altazor/conversations/${id}/turns`,{data:payload}),201),calls=modelRequests.length;
  const blocked=await page.request.post(`/api/altazor/conversations/${id}/turns`,{data:{...payload,requestId:randomUUID(),expectedRevision:2}});expect(blocked.status()).toBe(409);
  expect((await page.request.patch(`/api/altazor/conversations/${id}`,{data:{expectedRevision:2,causaId:causa.id}})).status()).toBe(400);
  await page.goto(`/inicio?conversacion=${id}`);await expect(page.getByRole("button",{name:"Ejecutar solicitud",exact:true})).toBeVisible();await page.reload();await expect(page.getByRole("button",{name:"Ejecutar solicitud",exact:true})).toBeVisible();expect(modelRequests.length).toBe(calls);
  await page.getByRole("button",{name:"Detener",exact:true}).click();await expect.poll(async()=>(await readChat(page,id)).turns[0].status).toBe("cancelled");expect(modelRequests.length).toBe(calls);
  const second=await json<{turnId:string}>(await page.request.post(`/api/altazor/conversations/${id}/turns`,{data:{...payload,requestId:randomUUID(),expectedRevision:(await readChat(page,id)).conversation.revision,text:"Reanudar explícitamente la siguiente explicación ficticia"}}),201);
  await page.reload();await page.getByRole("button",{name:"Ejecutar solicitud",exact:true}).click();await expect.poll(async()=>(await readChat(page,id)).turns.at(-1)?.status,{timeout:20_000}).toBe("completed");
  const after=modelRequests.length;await page.request.post(`/api/altazor/conversations/${id}/turns/${second.turnId}/execute`,{data:{}});expect(modelRequests.length).toBe(after);
  expect((await readChat(page,id)).turns.map(turn=>turn.id)).toEqual([queued.turnId,second.turnId]);
  await page.getByTestId("inicio-composer").fill("DETENER-FIXTURE: explicación ficticia interrumpible");await page.getByTestId("inicio-send").click();
  await expect.poll(()=>modelRequests.some(messages=>messages.at(-1)?.content.includes("DETENER-FIXTURE")&&!messages.some(message=>message.content.startsWith("Clasifica la intención"))),{timeout:20_000}).toBe(true);
  await page.getByRole("button",{name:"Detener",exact:true}).click();await expect.poll(async()=>(await readChat(page,id)).turns.at(-1)?.status,{timeout:20_000}).toBe("cancelled");
  const scoped=await json<Conversation>(await page.request.post("/api/altazor/conversations",{data:{requestId:randomUUID(),title:"Conversación de causa ficticia",causaId:causa.id}}),201);expect(scoped.conversation.scopeKey).toBe(`causa:${causa.id}`);
  expect((await page.request.patch(`/api/altazor/conversations/${scoped.conversation.id}`,{data:{expectedRevision:1,causaId:null}})).status()).toBe(400);
  const outsider=await browser.newContext();try{const outsidePage=await outsider.newPage();await loginAs(outsidePage,other.email);expect((await outsidePage.request.get(`/api/altazor/conversations/${id}`)).status()).toBe(404);expect((await outsidePage.request.get(`/api/altazor/conversations/${scoped.conversation.id}`)).status()).toBe(404);}finally{await outsider.close();}
});
