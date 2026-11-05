import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { createHearing, createHearingNote } from "@/lib/hearings/service";
import { createCaseWriting, createCaseWritingFromSnapshots, listCaseWritings } from "@/lib/writings/service";
import type { StoredWritingSource } from "@/lib/writings/source-types";
import { assistantDb as db } from "../transaction-context";
import { secureTool } from "../secure-tool";
import type { AssistantPlan, ToolContext } from "../types";
import type { AssistantTool } from "./types";
import { currentAnswerParent, savedAnswer, workflowScope } from "./workflow-access";
const empty = z.object({}).strict();
const create = z.object({titulo:z.string().trim().min(3).max(180),fecha:z.string().datetime().nullable().default(null)}).strict();
const note = z.object({workspaceId:z.string().min(1).max(100),titulo:z.string().trim().min(1).max(180),texto:z.string().trim().min(1).max(20000)}).strict();
const save = z.object({sourceTurnId:z.string().min(1).max(100),titulo:z.string().trim().min(1).max(200),answerHash:z.string().length(64)}).strict();

async function confirmed(id:string,input:unknown,ctx:ToolContext) {
  const scope = await workflowScope(ctx,db), match = /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(ctx.commandKey || "");
  if (!match || !ctx.authorizeContext) throw httpError("Revisa y confirma este cambio en ALTAZOR.",409);
  const record = await db.assistantPlanRecord.findFirst({where:{id:match[1],ownerId:scope.actor.id,expiresAt:{gt:new Date()},status:{not:"cancelled"}},select:{planJson:true}});
  let plan:AssistantPlan|undefined; try { plan=record ? JSON.parse(record.planJson) : undefined; } catch { /* Closed on malformed plans. */ }
  const step=plan?.steps[Number(match[2])];
  if (!plan?.needsConfirm || step?.toolId!==id || canonicalJson(step.input)!==canonicalJson(input) || !await db.altazorTurn.findFirst({where:{planId:plan.id,conversationId:scope.conversationId,ownerId:scope.actor.id,status:"running",cancelRequestedAt:null,leaseToken:{not:null},leaseExpiresAt:{gt:new Date()}},select:{id:true}})) throw httpError("Cambió el plan. Prepara y confirma uno nuevo.",409);
  await ctx.authorizeContext(); return {...scope,requestId:`altazor-writing-${sha256(ctx.commandKey!).slice(0,64)}`};
}
export async function resolveWorkflowToolInput(id:string,input:Record<string,unknown>,ctx:ToolContext) {
  const scope=await workflowScope(ctx,db);
  if (id==="audiencia.nota" && !input.workspaceId) {
    const choices=await db.hearingWorkspace.findMany({where:{causaId:scope.causaId,ownerId:scope.actor.id,status:{not:"closed"}},select:{id:true},take:2});
    if(choices.length!==1) throw httpError("Elige una audiencia en su panel antes de indicar dónde guardar la nota.",409);
    return {...input,workspaceId:choices[0].id};
  }
  if(id==="escrito.guardar") {
    const parent = await currentAnswerParent(ctx,db);
    const row=await db.altazorTurn.findFirst({where:{id:parent,conversationId:scope.conversationId,ownerId:scope.actor.id,status:"completed",assistantText:{not:""}},select:{id:true,assistantText:true,contextJson:true}});
    if(!row) throw httpError("Prepara primero una respuesta con las fuentes elegidas y luego pide guardarla como escrito.",409);
    return {titulo:input.titulo || "Borrador de ALTAZOR",sourceTurnId:row.id,answerHash:sha256(canonicalJson({body:row.assistantText,context:row.contextJson}))};
  }
  return input;
}
export const audienciaListarTool:AssistantTool<z.infer<typeof empty>>=secureTool({id:"audiencia.listar",kind:"read",roles:[...STAFF_ROLES],description:"Consulta las mesas de audiencia privadas de la causa actual, sin copiar sus notas ni fuentes.",inputSchema:empty,preview:()=>"Consultar tus audiencias de esta causa.",async execute(_input,ctx){const scope=await workflowScope(ctx,db),rows=await db.hearingWorkspace.findMany({where:{causaId:scope.causaId,ownerId:scope.actor.id},select:{id:true,title:true,status:true},orderBy:{updatedAt:"desc"},take:50});return{ok:true,message:rows.length?rows.map(row=>`${row.title} · ${row.status==="live"?"En vivo":row.status==="closed"?"Finalizada":"Preparación"}`).join("\n"):"Aún no tienes audiencias preparadas para esta causa.",card:{type:"audiencia",causaId:scope.causaId,href:`/causas/${scope.causaId}/audiencias`}};}});
export const audienciaCrearTool:AssistantTool<z.infer<typeof create>>=secureTool({id:"audiencia.crear",kind:"write",roles:[...STAFF_ROLES],description:"Crea una mesa privada de audiencia en la causa elegida, con confirmación. No inicia grabación ni agrega un evento al calendario.",inputSchema:create,preview:input=>`Crear la mesa de audiencia «${input.titulo}»${input.fecha?` para ${input.fecha}`:""}. Los documentos y la grabación se eligen después en su panel.`,async execute(input,ctx){const scope=await confirmed("audiencia.crear",input,ctx),row=await createHearing(scope.causaId,{title:input.titulo,scheduledFor:input.fecha},scope.actor,db);return{ok:true,message:"Mesa de audiencia preparada. Abre el panel para elegir documentos, notas y herramientas en vivo.",entityId:row.id,card:{type:"audiencia",id:row.id,causaId:scope.causaId,href:`/causas/${scope.causaId}/audiencias?mesa=${row.id}`}};}});
export const audienciaNotaTool:AssistantTool<z.infer<typeof note>>=secureTool({id:"audiencia.nota",kind:"write",roles:[...STAFF_ROLES],description:"Guarda una observación personal en una audiencia propia de la causa actual, con confirmación. No la presenta como hecho probado ni crea citas.",inputSchema:note,preview:input=>`Guardar la nota «${input.titulo}» en la audiencia elegida.\n\n${input.texto}\n\nObservación personal sin cita documental.`,async execute(input,ctx){const scope=await confirmed("audiencia.nota",input,ctx),row=await createHearingNote(scope.causaId,input.workspaceId,{title:input.titulo,body:input.texto,citation:null},scope.actor,db);return{ok:true,message:"Nota personal guardada en la audiencia. Puedes contrastarla con el expediente desde el panel.",entityId:row.id,card:{type:"audiencia",causaId:scope.causaId,href:`/causas/${scope.causaId}/audiencias?mesa=${input.workspaceId}`}};}});
export const escritoListarTool:AssistantTool<z.infer<typeof empty>>=secureTool({id:"escrito.listar",kind:"read",roles:[...STAFF_ROLES],description:"Consulta la disponibilidad de los escritos privados y abre el editor de la causa actual, sin enviar su contenido al modelo.",inputSchema:empty,preview:()=>"Consultar tus escritos privados de esta causa.",async execute(_input,ctx){const scope=await workflowScope(ctx,db),rows=await listCaseWritings(scope.causaId,scope.actor,undefined,db),count=rows.drafts.filter(row=>row.available).length;return{ok:true,message:`${count}${rows.limited?" o más":""} escritos disponibles en esta causa. Ábrelos para continuar con el guardado automático y las referencias verificadas.`,card:{type:"escrito",causaId:scope.causaId,href:`/causas/${scope.causaId}/escritos`}};}});
export const escritoGuardarTool:AssistantTool<z.infer<typeof save>>=secureTool({id:"escrito.guardar",kind:"write",roles:[...STAFF_ROLES],description:"Conserva la última respuesta completada de esta conversación como borrador privado de escrito, con sus fuentes cotejadas y confirmación. No firma, presenta ni envía.",inputSchema:save,async preview(input,ctx){const {turn,snapshot}=await savedAnswer(input,ctx,db);if(sha256(canonicalJson({body:turn.assistantText,context:turn.contextJson}))!==input.answerHash)throw httpError("Cambió la respuesta que ibas a guardar.",409);if(snapshot.refs.some(ref=>JSON.parse(ref.proofJson).kind!=="writing"))throw httpError("Este escrito necesita fuentes de la biblioteca, documentos, hechos o notas de la causa. Incorpora los materiales oficiales al editor para conservar sus citas.",409);return `Guardar «${input.titulo}» como borrador privado, con ${snapshot.refs.length} fuentes vinculadas. Revisa el texto completo:\n\n${turn.assistantText}\n\nNo se firma ni se presenta ante el tribunal.`;},async execute(input,ctx){const scope=await confirmed("escrito.guardar",input,ctx),{turn,snapshot}=await savedAnswer(input,ctx,db);if(sha256(canonicalJson({body:turn.assistantText,context:turn.contextJson}))!==input.answerHash)throw httpError("La respuesta cambió. Prepara otro plan.",409);const sources:StoredWritingSource[]=snapshot.refs.map(ref=>{const proof=JSON.parse(ref.proofJson);if(proof.kind!=="writing")throw httpError("Revisa las fuentes antes de guardar este escrito.",409);return proof.value;});const raw={requestId:scope.requestId,title:input.titulo,body:turn.assistantText.replace(/\[(R[1-9][0-9]*)\]/g,"[^$1]")};const result=sources.length?await createCaseWritingFromSnapshots(scope.causaId,raw,sources,scope.actor,db):await createCaseWriting(scope.causaId,raw,scope.actor,db);return{ok:true,message:"Borrador conservado con historial y sus referencias. Revisa su contenido y pertinencia en el editor.",entityId:result.draft.id,card:{type:"escrito",id:result.draft.id,causaId:scope.causaId,href:`/causas/${scope.causaId}/escritos?draft=${result.draft.id}`}};}});
