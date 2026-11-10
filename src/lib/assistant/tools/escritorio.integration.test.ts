/** Real owned PostgreSQL fixtures; every gateway/model response below is synthetic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest, seal } from "@/lib/personal-connectors/core";
import { runAssistantTurn } from "../pipeline";
import { authorizeCommittedResult } from "../secure-tool";
import { cancelAltazorTurn, confirmAltazorTurn, readAltazorConversation, patchAltazorConversation, createAltazorTurn, executeAltazorTurn } from "@/lib/altazor/conversations";
import { storePlan } from "../plan-store";
import { escritorioEncargarTool, escritorioListarTool } from "./escritorio";
import type { ToolContext } from "../types";

const denied = (error: unknown) => [403,404,409,410].includes(Number((error as {status?:number}).status));
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  process.env.LLM_API_URL = "http://127.0.0.1:19999/v1"; process.env.LLM_API_KEY = "fictitious-classifier-key"; process.env.LLM_ALLOW_DEMO = "0"; process.env.HERMES_ALLOW_DEMO = "0";
  const prefix = randomUUID(), userIds: string[] = [], caseIds: string[] = [], workspaceIds: string[] = [], planIds: string[] = [];
  const beforeFetch = globalThis.fetch, payloads: Record<string, unknown>[] = [], snapshots = new Map<string, { kitty: Record<string, unknown>; chat: Record<string, unknown> }>();
  let network = 0;
  const text = "Encarga al escritorio preparar una pauta de audiencia de ejemplo, sin enviar mensajes a terceros.";
  globalThis.fetch = (async (raw, init) => {
    network++; const target = new URL(String(raw)), path = target.pathname, body = init?.body ? JSON.parse(String(init.body)) : {};
    assert.equal(target.hostname, "127.0.0.1");
    if (target.port === "19999") return Response.json({ choices: [{ message: { content: JSON.stringify({ intents: [{ toolId: "escritorio.encargar", confidence: 1, slots: { texto: text } }] }) } }] });
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-desktop-tool-token");
    if (/^\/v1\/lexopen\/chats\/[A-Za-z0-9_-]{1,100}\/computer-policy$/.test(path)) {
      assert.equal(init?.method || "GET", "GET", "legacy fixtures never grant computer-use permission");
      const binding = target.searchParams.get("binding"), kittyId = target.searchParams.get("kitty");
      assert.match(binding || "", /^[a-f0-9]{64}$/); assert.match(kittyId || "", /^[A-Za-z0-9_-]{1,100}$/);
      return Response.json({ applied: false, chat_id: path.split("/")[4], kitty: kittyId, binding, mode: "supervised", revision: 0, allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 0, consultations_used: 0, outcome_unknown: false });
    }
    if (path === "/v1/approvals") return Response.json({ approvals: [] });
    const snapshot = snapshots.get(target.origin); assert.ok(snapshot);
    if (path === "/v1/health") return Response.json({ ok:true, version:"desktop-tool-fixture", containers:true, lexopen_connector_gate:"v1", lexopen_connector_platform:"linux", lexopen_async_messages:"v1", lexopen_computer_use_policy:"v1" });
    if (path === "/v1/providers") return Response.json({ providers:[{name:"separate-model",kind:"openai"}] });
    if (path === "/v1/kitties") return Response.json({kitties:[snapshot.kitty]});
    if (path === `/v1/kitties/${snapshot.kitty.id}`) return Response.json({kitty:snapshot.kitty});
    if (path === `/v1/chats/${snapshot.chat.id}`) return Response.json({chat:snapshot.chat});
    if (path.endsWith("/messages/async")) {
      assert.deepEqual(body.files,[]);
      assert.match(String(body.request_id), /^[A-Za-z0-9_-]{1,100}$/);
      payloads.push(body);
      return Response.json({ request_id: body.request_id, chat_id: snapshot.chat.id, status: "accepted", state: "accepted" }, { status: 202 });
    }
    throw new Error("Unexpected synthetic desktop tool endpoint");
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({data:{email:`${prefix}@desktop-tool.invalid`,name:"Desktop tool owner",role:"abogado",password:"not-a-login"}}); userIds.push(owner.id);
    const other = await prisma.user.create({data:{email:`${prefix}-other@desktop-tool.invalid`,name:"Desktop tool outsider",role:"abogado",password:"not-a-login"}}); userIds.push(other.id);
    const cases = [];
    for (let i=0;i<2;i++) { const row=await prisma.causa.create({data:{titulo:`Desktop fixture ${i}`,tribunal:"Fictitious",materia:"civil",acceso:"equipo",abogadoId:owner.id}}); cases.push(row);caseIds.push(row.id); }
    const conversation=await prisma.altazorConversation.create({data:{ownerId:owner.id,requestId:`conversation-${prefix}`,scopeKey:`causa:${cases[0].id}`,causaId:cases[0].id,title:"Desktop fixture conversation"}});
    const sessions=[];
    for(let i=0;i<3;i++){
      const id=randomUUID(),causaId=i===2?null:cases[i].id,scopeKey=causaId?`causa:${causaId}`:"personal",endpoint=`http://127.0.0.1:${32000+i+Math.floor(Math.random()*1000)}`;
      const workspace=await prisma.altazorComputerWorkspace.create({data:{id,ownerId:owner.id,causaId,scopeKey,endpoint,providerName:"separate-model",enabled:true,dedicatedDeclaredAt:new Date(),credentialEnc:seal({token:"fictitious-desktop-tool-token"},`altazor:computer:${owner.id}:${id}:${scopeKey}`)}});workspaceIds.push(workspace.id);
      const session=await prisma.altazorComputerSession.create({data:{ownerId:owner.id,workspaceId:id,requestId:`session-${prefix}-${i}`,kittyId:`kitty-${i}`,kittyName:`altazor-tool-${prefix}-${i}`,chatId:`chat-${i}`,state:"ready",connectorNamesJson:'["clima"]',expiresAt:null}});sessions.push(session);
      snapshots.set(endpoint,{kitty:{id:session.kittyId,name:session.kittyName,provider:"separate-model",desktop:true,container:`kitty-${session.kittyName}`,status:"running",connectors:["clima"],approvals:"ask",backup:""},chat:{id:session.chatId,members:[session.kittyId],turns:[]}});
    }
    const ctx: ToolContext={userId:owner.id,role:"abogado",chatId:conversation.id,scope:{causaId:cases[0].id}};
    const aliases = ["google", "github", "dropbox", "microsoft"].map(kind => `altazor-${kind}-${"a".repeat(16)}`);
    await prisma.altazorComputerSession.update({ where: { id: sessions[0].id }, data: { connectorNamesJson: JSON.stringify(aliases) } });
    const cloudPreview = await escritorioEncargarTool.preview({ sessionId: sessions[0].id, texto: text }, ctx);
    for (const label of ["Google Drive", "GitHub (repositorios públicos)", "Dropbox (archivos)", "Microsoft 365 / OneDrive (archivos)"]) assert.ok(cloudPreview.includes(label));
    assert.equal(aliases.some(alias => cloudPreview.includes(alias)), false, "review uses service names instead of technical account aliases");
    assert.ok(cloudPreview.includes("sin editar, publicar ni eliminar")); assert.ok(cloudPreview.includes("OneDrive no incluye correo ni calendario"));
    await prisma.altazorComputerSession.update({ where: { id: sessions[0].id }, data: { connectorNamesJson: '["clima"]' } });
    const metadataText = "Comprueba mi conexión de Dropbox y muestra sólo los nombres de hasta cinco archivos PDF disponibles, sin abrir ni modificar su contenido. Usa la cuenta de Dropbox ya conectada.";
    const metadataAlias = `altazor-dropbox-${digest(`${owner.id}:${workspaceIds[0]}`).slice(0, 16)}`;
    const metadataPlanId = `altazor-${randomUUID()}`; planIds.push(metadataPlanId);
    await prisma.altazorComputerSession.update({ where: { id: sessions[0].id }, data: { connectorNamesJson: JSON.stringify([metadataAlias]) } });
    const beforeMetadataPreview = network;
    const metadataPlan = await runAssistantTurn({ text: metadataText, user: { id: owner.id, role: "abogado" }, chatId: conversation.id, scope: ctx.scope, planId: metadataPlanId });
    assert.equal(network, beforeMetadataPreview, "a literal metadata preview neither invokes the model nor consults the account");
    assert.equal(metadataPlan.previewSteps.length, 1); assert.equal(metadataPlan.previewSteps[0].toolId, "escritorio.encargar");
    assert.equal(metadataPlan.previewSteps[0].input.texto, metadataText, "the exact human request remains the confirmed plan payload");
    assert.ok(metadataPlan.previewSteps[0].preview.startsWith("Consultar hasta 5 nombres de archivos PDF en tu cuenta de Dropbox."));
    assert.ok(metadataPlan.previewSteps[0].preview.includes(metadataText));
    assert.ok(metadataPlan.previewSteps[0].preview.includes("no se abre ni descarga su contenido"));
    assert.equal(metadataPlan.previewSteps[0].preview.includes("separate-model"), false); assert.equal(metadataPlan.previewSteps[0].preview.includes("proveedor remoto"), false);
    const foreignMetadataAlias = `altazor-dropbox-${digest(`${other.id}:${workspaceIds[0]}`).slice(0, 16)}`;
    await prisma.altazorComputerSession.update({ where: { id: sessions[0].id }, data: { connectorNamesJson: JSON.stringify([foreignMetadataAlias]) } });
    const foreignMetadataPreview = await escritorioEncargarTool.preview({ sessionId: sessions[0].id, texto: metadataText }, ctx);
    assert.equal(foreignMetadataPreview.startsWith("Consultar hasta 5 nombres"), false, "a selected alias from another owner cannot claim the direct metadata path");
    await prisma.altazorComputerSession.update({ where: { id: sessions[0].id }, data: { connectorNamesJson: '["clima"]' } });
    const listed=await escritorioListarTool.execute({},ctx);assert.ok(listed.ok);
    assert.equal((listed.card?.sessions as unknown[]).length,1);assert.ok(listed.message.includes(sessions[0].id));assert.equal(listed.message.includes(sessions[1].id),false);assert.equal(JSON.stringify(listed).includes("fictitious-desktop-tool-token"),false);
    await assert.rejects(escritorioListarTool.execute({}, {...ctx,scope:undefined}),denied);
    await assert.rejects(Promise.resolve(escritorioEncargarTool.preview({sessionId:sessions[1].id,texto:text},ctx)),denied);
    await assert.rejects(Promise.resolve(escritorioEncargarTool.preview({sessionId:sessions[2].id,texto:text},ctx)),denied);
    const planId=`altazor-${randomUUID()}`;planIds.push(planId);
    const prepared=await runAssistantTurn({text,user:{id:owner.id,role:"abogado"},chatId:conversation.id,scope:ctx.scope,planId,context:"must-not-copy-selected-context",history:[{role:"assistant",content:"must-not-copy-history"}]});
    assert.equal(payloads.length,0);assert.equal(prepared.autoResults,undefined);assert.equal(prepared.previewSteps.length,1);
    const step=prepared.previewSteps[0];assert.equal(step.toolId,"escritorio.encargar");assert.equal(step.input.sessionId,sessions[0].id);assert.ok(step.preview.includes(text));assert.ok(step.preview.includes("separate-model"));assert.ok(step.preview.includes("clima"));assert.equal(step.preview.includes("must-not-copy"),false);
    const context={version:1,attachmentIds:[],refs:[],historyTurnIds:[] as string[],memoryDependencies:[]};
    const destination={provider:"fixture-chat",model:"fixture",endpoint:"http://127.0.0.1:19999/v1",endpointHash:"fictitious-endpoint-hash",remote:false,permitted:true,key:"fictitious-destination-key"};
    const options={destination:async()=>destination};
    const nativeTurn=await prisma.altazorTurn.create({data:{conversationId:conversation.id,ownerId:owner.id,requestId:`turn-${prefix}`,ordinal:1,inputSha256:digest(text),userText:text,planId,status:"awaiting_confirmation",contextJson:JSON.stringify(context),destinationJson:JSON.stringify({...destination,allowRemote:false,useMemory:false})}});
    const awaiting=await readAltazorConversation(conversation.id,owner,prisma,{},options);
    assert.equal(awaiting.turns[0].status,"awaiting_confirmation");assert.equal(awaiting.turns[0].errorCode,null);assert.equal(awaiting.turns[0].plan?.needsConfirm,true);
    assert.equal(awaiting.turns[0].plan?.steps[0].preview,step.preview);assert.ok(awaiting.turns[0].plan?.steps[0].preview.includes(text));assert.deepEqual(awaiting.turns[0].sourceRefs,[]);assert.equal(payloads.length,0);
    const authorized:ToolContext={...ctx,commandKey:`assistant-plan:${planId}:0`,authorizeContext:async()=>{const row=await prisma.altazorTurn.findUniqueOrThrow({where:{id:nativeTurn.id}});if(row.status!=="running"||row.cancelRequestedAt)throw Object.assign(new Error("Cancelled fixture plan"),{status:409});}};
    const input={sessionId:sessions[0].id,texto:text};
    await assert.rejects(escritorioEncargarTool.execute(input,authorized),denied);assert.equal(payloads.length,0);
    await prisma.altazorTurn.update({where:{id:nativeTurn.id},data:{status:"running",leaseToken:"fictitious-lease",leaseExpiresAt:new Date(Date.now()+60000)}});
    await assert.rejects(escritorioEncargarTool.execute({...input,texto:"Changed after review"},authorized),denied);assert.equal(payloads.length,0);
    await prisma.altazorTurn.update({where:{id:nativeTurn.id},data:{status:"awaiting_confirmation",leaseToken:null,leaseExpiresAt:null}});
    const confirmed=await confirmAltazorTurn(conversation.id,nativeTurn.id,true,owner,prisma,options);
    assert.equal(confirmed.turns[0].status,"completed",JSON.stringify(confirmed.turns[0]));assert.equal(confirmed.turns[0].plan,null);assert.equal(confirmed.turns[0].errorCode,null);
    const result=confirmed.turns[0].results[0].result;assert.ok(result.ok);assert.equal(payloads.length,1);assert.equal(payloads[0].text,text);assert.equal(JSON.stringify(payloads).includes("must-not-copy"),false);
    assert.equal(result.card?.type,"escritorio");assert.equal(result.card?.id,sessions[0].id);assert.equal(result.card?.causaId,cases[0].id);assert.equal(result.card?.provider,"separate-model");
    const repeated=await confirmAltazorTurn(conversation.id,nativeTurn.id,true,owner,prisma,options);assert.equal(repeated.turns[0].status,"completed");assert.equal(payloads.length,1);
    const reloaded=await readAltazorConversation(conversation.id,owner,prisma,{},options);assert.equal(reloaded.turns[0].status,"completed");assert.equal(reloaded.turns[0].results[0].result.card?.type,"escritorio");assert.equal(reloaded.turns[0].results[0].result.card?.id,sessions[0].id);
    const cancelledPlanId=`altazor-${randomUUID()}`;planIds.push(cancelledPlanId);
    await storePlan({id:cancelledPlanId,intents:[{toolId:"escritorio.encargar",confidence:1,slots:input}],steps:[step],needsConfirm:true},owner.id);
    const cancelledTurn=await prisma.altazorTurn.create({data:{conversationId:conversation.id,ownerId:owner.id,requestId:`cancelled-turn-${prefix}`,ordinal:2,inputSha256:digest(text),userText:text,planId:cancelledPlanId,status:"awaiting_confirmation",contextJson:JSON.stringify({...context,historyTurnIds:[nativeTurn.id]}),destinationJson:JSON.stringify({...destination,allowRemote:false,useMemory:false})}});
    const withHistory=await readAltazorConversation(conversation.id,owner,prisma,{},options);assert.equal(withHistory.turns[1].status,"awaiting_confirmation");assert.equal(withHistory.turns[1].plan?.steps[0].preview,step.preview);
    await cancelAltazorTurn(conversation.id,cancelledTurn.id,owner,prisma);
    const cancelled=await readAltazorConversation(conversation.id,owner,prisma,{},options);assert.equal(cancelled.turns[1].status,"cancelled");assert.equal(cancelled.turns[1].plan,null);assert.equal(cancelled.turns[0].status,"completed");
    await assert.rejects(confirmAltazorTurn(conversation.id,cancelledTurn.id,true,owner,prisma,options),denied);assert.equal(payloads.length,1);
    await patchAltazorConversation(conversation.id,{status:"archived",expectedRevision:cancelled.conversation.revision},owner,prisma);
    const archived=await readAltazorConversation(conversation.id,owner,prisma,{},options);
    assert.equal(archived.conversation.status,"archived");assert.equal(archived.turns[0].status,"completed");assert.equal(archived.turns[0].errorCode,null);assert.equal(archived.turns[0].results[0].result.card?.id,sessions[0].id);
    assert.equal(archived.turns[1].status,"cancelled");assert.equal(archived.turns[1].userText,text);
    const beforeArchivedActions=network;
    await assert.rejects(Promise.resolve(escritorioEncargarTool.preview(input,ctx)),denied);
    await assert.rejects(escritorioEncargarTool.execute(input,authorized),denied);
    await assert.rejects(escritorioListarTool.execute({},ctx),denied);
    await assert.rejects(createAltazorTurn(conversation.id,{requestId:`archived-${prefix}`,expectedRevision:archived.conversation.revision,text,destinationKey:"a".repeat(64)},owner,prisma,options),denied);
    await assert.rejects(executeAltazorTurn(conversation.id,nativeTurn.id,owner,prisma,options),denied);
    await assert.rejects(confirmAltazorTurn(conversation.id,nativeTurn.id,true,owner,prisma,options),denied);
    assert.equal(network,beforeArchivedActions);assert.equal(payloads.length,1);
    await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:"assistant.use"}});
    const beforeDenied=network;await assert.rejects(escritorioEncargarTool.execute(input,authorized),denied);assert.equal(network,beforeDenied);
    await prisma.user.update({where:{id:owner.id},data:{capabilityRevokes:""}});
    await prisma.causa.update({where:{id:cases[0].id},data:{abogadoId:other.id}});
    await assert.rejects(authorizeCommittedResult("escritorio.encargar",input,result,ctx,prisma),denied);
    await assert.rejects(readAltazorConversation(conversation.id,owner,prisma,{},options),denied);
    await prisma.causa.update({where:{id:cases[0].id},data:{abogadoId:owner.id}});
    await prisma.altazorComputerSession.update({where:{id:sessions[0].id},data:{state:"closed",expiresAt:new Date(0)}});
    await prisma.assistantPlanRecord.update({where:{id:planId},data:{expiresAt:new Date(0)}});
    await authorizeCommittedResult("escritorio.encargar",input,result,ctx,prisma);
    const historical=await readAltazorConversation(conversation.id,owner,prisma,{},options);assert.equal(historical.turns[0].status,"completed");assert.equal(historical.turns[0].results[0].result.card?.id,sessions[0].id);assert.equal(historical.turns[1].status,"cancelled");assert.equal(historical.turns[1].userText,text);
    console.log("Desktop orchestration integration PASS: native reader exposes the complete preview and confirmed result; archived history remains readable while new plans, preview, execution and confirmation are denied; current ACL, one send, no context/file/secret transfer, cancellation and historical cards after desktop/plan expiry.");
  } finally {
    globalThis.fetch=beforeFetch;
    await prisma.altazorComputerAction.deleteMany({where:{ownerId:{in:userIds}}});await prisma.altazorComputerSession.deleteMany({where:{ownerId:{in:userIds}}});await prisma.altazorComputerWorkspace.deleteMany({where:{id:{in:workspaceIds}}});
    await prisma.altazorConversation.deleteMany({where:{ownerId:{in:userIds}}});await prisma.assistantPlanRecord.deleteMany({where:{id:{in:planIds}}});await prisma.causa.deleteMany({where:{id:{in:caseIds}}});await prisma.auditEvent.deleteMany({where:{actorId:{in:userIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Desktop orchestration fixture failed");process.exitCode=1;});
