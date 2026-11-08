import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { getCaseDriveState, executeCaseDriveCommand, type CaseDriveCommand } from "@/lib/integrations/case-drive";
import { assertDriveToolInputAccess, driveScope } from "./drive-access";
import type { AssistantPlan, ToolContext, ToolResult } from "../types";
import type { AssistantTool } from "./types";

const id = z.string().min(1).max(160), hex = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().trim().min(1).max(180).refine(value => !value.startsWith(".") && Buffer.byteLength(value, "utf8") <= 180 && !/[/\\\p{Cc}\p{Cf}]/u.test(value), "Usa un nombre breve, sin punto inicial, barras ni caracteres de control.");
const binding = { connectionId: id, bindingRevision: hex, caseRevision: hex };
const file = { ...binding, documentoId: id, documentVersion: z.number().int().positive(), sourceSha256: hex, nombre: name, folderId: id, folderName: z.string().min(1).max(700), bytes: z.number().int().positive().max(4 * 1024 * 1024), mime: z.string().min(1).max(200) };
export const driveEstadoSchema = z.object({}).strict();
export const driveCrearCarpetaSchema = z.object({ ...binding, nombre: name, parentFolderId: z.literal("root") }).strict();
export const driveGuardarDocumentoSchema = z.discriminatedUnion("action", [
  z.object({ ...file, action: z.literal("upload-document") }).strict(),
  z.object({ ...file, action: z.literal("save-version"), fileId: id, expectedVersion: z.string().regex(/^\d{1,30}$/) }).strict(),
]);
type FolderInput = z.infer<typeof driveCrearCarpetaSchema>;
type FileInput = z.infer<typeof driveGuardarDocumentoSchema>;
type Dependencies = { client?: typeof prisma; state?: typeof getCaseDriveState; command?: typeof executeCaseDriveCommand };
const href = (causaId: string) => `/causas/${encodeURIComponent(causaId)}#drive-folder`;

/** Injectable only at module construction for disposable tests, never through slots. */
export function createDriveTools(deps: Dependencies = {}) {
  const db = deps.client || prisma, stateFor = deps.state || getCaseDriveState, command = deps.command || executeCaseDriveCommand;
  async function ready(ctx: ToolContext, documentoId?: string) {
    const scope = await driveScope(ctx, true, db);
    const state = await stateFor(scope.causaId, scope.actor, { client: db }, documentoId);
    if (!state.connected || !state.connectionId || !state.bindingRevision || !state.canManage) throw httpError("Conecta Google en Aplicaciones de Altazor y elige «Permitir crear y editar» para guardar archivos.", 409);
    if (!state.canConfigure) throw httpError("No puedes cambiar el destino de Drive de esta causa.", 403);
    if (state.pendingOperation) throw httpError("Revisa la operación anterior de Drive antes de preparar otra. No se repetirá automáticamente.", 409);
    return { scope, state, proof: { connectionId: state.connectionId, bindingRevision: state.bindingRevision, caseRevision: state.caseRevision } };
  }
  async function resolveInput(toolId: string, raw: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    if (toolId === "drive.estado") { await driveScope(ctx, false, db); return {}; }
    if (toolId === "drive.crearCarpeta") {
      const { state, proof } = await ready(ctx);
      if (state.folder) throw httpError("Esta causa ya tiene una carpeta vinculada. Revisa su destino en Mis Causas antes de cambiarla.", 409);
      if (!name.safeParse(raw.nombre).success) throw httpError("Indica el nombre de la carpeta que quieres crear para esta causa.", 409);
      return { ...proof, nombre: name.parse(raw.nombre), parentFolderId: "root" };
    }
    if (toolId !== "drive.guardarDocumento") throw httpError("Herramienta de Drive no disponible.", 409);
    const scope = await driveScope(ctx, true, db);
    let documentoId = typeof raw.documentoId === "string" ? raw.documentoId : undefined;
    if (!documentoId) {
      const literal = typeof raw.documento === "string" ? raw.documento.trim() : "";
      if (!literal || literal.length > 300) throw httpError("Indica el nombre exacto del documento de esta causa que quieres guardar en Drive.", 409);
      const rows = await db.documento.findMany({ where: { AND: [{ causaId: scope.causaId, nombre: { equals: literal, mode: "insensitive" } }, documentReadWhere(scope.actor)] }, select: { id: true }, take: 2 });
      if (rows.length !== 1) throw httpError(rows.length ? "Hay más de un documento con ese nombre. Selecciona la copia exacta en esta causa." : "No encontré ese nombre exacto en esta causa. Elige el documento antes de guardarlo en Drive.", 409);
      documentoId = rows[0].id;
    }
    await assertDriveToolInputAccess(toolId, { documentoId }, ctx, true, db);
    const { state, proof } = await ready(ctx, documentoId);
    const document = "document" in state ? state.document : undefined;
    if (!state.folder || !document || document.canSave !== true) throw httpError(document?.reason || "Vincula una carpeta de Drive y revisa la copia del documento antes de guardarla.", 409);
    const pinned = { ...proof, documentoId: document.id, documentVersion: document.version, sourceSha256: document.sourceSha256, nombre: document.name, folderId: state.folder.id, folderName: state.folder.name, bytes: document.bytes, mime: document.mime };
    if (document.remoteId) {
      if (document.remoteTargetState !== "ready" || !document.remoteVersion) throw httpError("No se pudo comprobar el archivo anterior en esta carpeta. Revisa Drive antes de preparar una versión nueva.", 409);
      return { ...pinned, action: "save-version", fileId: document.remoteId, expectedVersion: document.remoteVersion };
    }
    return { ...pinned, action: "upload-document" };
  }
  async function preview(toolId: "drive.guardarDocumento" | "drive.crearCarpeta", input: FileInput | FolderInput, ctx: ToolContext) {
    await assertDriveToolInputAccess(toolId, input, ctx, true, db);
    const current = await resolveInput(toolId, toolId === "drive.crearCarpeta" ? { nombre: input.nombre } : { documentoId: (input as FileInput).documentoId }, ctx);
    if (canonicalJson(current) !== canonicalJson(input)) throw httpError("El documento, la cuenta o la carpeta cambió. Prepara y revisa un plan nuevo.", 409);
    if (toolId === "drive.crearCarpeta") return `Crear la carpeta «${input.nombre}» en tu Google Drive y vincularla a esta causa. La actualización automática seguirá en pausa. Se usará tu cuenta de Google de Altazor; no se compartirán archivos con terceros.`;
    const value = input as FileInput;
    return `${value.action === "save-version" ? "Guardar una versión nueva como copia" : "Guardar una copia exacta"} de «${value.nombre}» (versión ${value.documentVersion}, ${value.bytes} bytes) en la carpeta «${value.folderName}» de tu Google Drive, vinculada a esta causa.${value.action === "save-version" ? ` Se conserva el archivo anterior y su revisión ${value.expectedVersion}.` : ""} El original de LexOpen y sus citas se conservan. Revisa y confirma este envío de archivo.`;
  }
  async function confirmed(toolId: "drive.guardarDocumento" | "drive.crearCarpeta", input: FileInput | FolderInput, ctx: ToolContext) {
    if (!ctx.commandKey || !ctx.authorizeContext) throw httpError("Confirma este envío desde la conversación de Altazor.", 409);
    const match = /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(ctx.commandKey);
    if (!match) throw httpError("Esta acción necesita un plan confirmado de Altazor.", 409);
    const scope = await driveScope(ctx, true, db), index = Number(match[2]);
    const record = await db.assistantPlanRecord.findFirst({ where: { id: match[1], ownerId: scope.actor.id, expiresAt: { gt: new Date() }, status: { not: "cancelled" } } });
    let plan: AssistantPlan | undefined;
    try { plan = record ? JSON.parse(record.planJson) as AssistantPlan : undefined; } catch { /* Fail closed. */ }
    const step = plan?.steps[index];
    if (!plan?.needsConfirm || plan.id !== match[1] || !step || step.toolId !== toolId || canonicalJson(step.input) !== canonicalJson(input)) throw httpError("El plan cambió. Revisa nuevamente el archivo y su destino.", 409);
    const turn = await db.altazorTurn.findFirst({ where: { ...(ctx.nativeTurnId ? { id: ctx.nativeTurnId } : {}), planId: plan.id, conversationId: scope.conversationId, ownerId: scope.actor.id, status: "running", cancelRequestedAt: null, leaseToken: { not: null }, leaseExpiresAt: { gt: new Date() } }, select: { id: true } });
    if (!turn) throw httpError("El envío no está confirmado, fue cancelado o perdió su autorización de ejecución.", 409);
    await ctx.authorizeContext(); ctx.signal?.throwIfAborted();
    if (step.preview !== await preview(toolId, input, ctx)) throw httpError("La vista previa cambió. Prepara un nuevo plan antes de enviar el archivo.", 409);
    await ctx.authorizeContext(); ctx.signal?.throwIfAborted();
    return { scope, requestId: `assistant-drive-${digest(`${scope.actor.id}:${ctx.commandKey}`)}` };
  }
  async function send(toolId: "drive.guardarDocumento" | "drive.crearCarpeta", input: FileInput | FolderInput, ctx: ToolContext): Promise<ToolResult> {
    const { scope, requestId } = await confirmed(toolId, input, ctx);
    const payload: CaseDriveCommand = toolId === "drive.crearCarpeta"
      ? { ...(input as FolderInput), action: "create-folder", requestId, confirmed: true }
      : (() => { const value = input as FileInput; return { connectionId: value.connectionId, bindingRevision: value.bindingRevision, caseRevision: value.caseRevision, documentoId: value.documentoId, documentVersion: value.documentVersion, sourceSha256: value.sourceSha256, nombre: value.nombre, action: value.action, ...(value.action === "save-version" ? { fileId: value.fileId, expectedVersion: value.expectedVersion } : {}), requestId, confirmed: true as const } as CaseDriveCommand; })();
    // The CaseDrive and native ledgers own one-use egress. Never wrap this in a
    // serializable retry or promise that an unknown outcome can be resent.
    try {
      const result = await command(scope.causaId, scope.actor, payload, { client: db });
      const ok = result.state === "completed";
      return { ok, message: result.message, entityId: result.operationId, card: { type: "drive", causaId: scope.causaId, href: href(scope.causaId), state: result.state, operationId: result.operationId, ...(ok && result.file ? { file: result.file } : {}), ...(ok && result.folder ? { folder: result.folder } : {}) } };
    } catch { return { ok: false, message: "No se pudo confirmar el resultado de Drive. Revísalo desde esta causa; el envío no se repetirá automáticamente.", card: { type: "drive", causaId: scope.causaId, href: href(scope.causaId), state: "unknown" } }; }
  }
  const estado: AssistantTool<z.infer<typeof driveEstadoSchema>> = {
    id: "drive.estado", kind: "read", roles: [...STAFF_ROLES], description: "Consulta la cuenta de Google de Altazor y la carpeta vinculada a la causa actual, sin iniciar sesiones ni enviar archivos.", inputSchema: driveEstadoSchema,
    async preview(raw, ctx) { driveEstadoSchema.parse(raw); await driveScope(ctx, false, db); return "Consultar la cuenta de Drive y la carpeta vinculada a esta causa, sin modificar archivos."; },
    async execute(raw, ctx) { driveEstadoSchema.parse(raw); const scope = await driveScope(ctx, false, db), state = await stateFor(scope.causaId, scope.actor, { client: db }); return { ok: true, message: `${state.connected ? state.canManage ? "Tu cuenta de Google está vinculada para lectura y gestión de archivos." : "Tu cuenta de Google conserva permisos de lectura." : "Conecta Google desde Aplicaciones de Altazor para trabajar con esta causa."}\n${state.folder ? `Carpeta vinculada: ${state.folder.name}.` : "Esta causa aún no tiene una carpeta de Drive vinculada."}${state.pendingOperation ? " Hay una operación anterior pendiente de comprobar; no se reenviará automáticamente." : ""}`, card: { type: "drive", causaId: scope.causaId, href: href(scope.causaId) } }; },
  };
  const crear: AssistantTool<FolderInput> = { id: "drive.crearCarpeta", kind: "write", roles: [...STAFF_ROLES], description: "Crea y vincula una carpeta de Google Drive para una causa sin carpeta; requiere nombre y plan confirmado. No comparte ni sincroniza automáticamente.", inputSchema: driveCrearCarpetaSchema, preview: (raw, ctx) => preview("drive.crearCarpeta", driveCrearCarpetaSchema.parse(raw), ctx), execute: (raw, ctx) => send("drive.crearCarpeta", driveCrearCarpetaSchema.parse(raw), ctx) };
  const guardar: AssistantTool<FileInput> = { id: "drive.guardarDocumento", kind: "write", roles: [...STAFF_ROLES], description: "Envía una copia exacta de un documento no reservado de la causa actual a su carpeta Drive; conserva originales y versiones previas. Requiere plan confirmado y destino verificado.", inputSchema: driveGuardarDocumentoSchema, preview: (raw, ctx) => preview("drive.guardarDocumento", driveGuardarDocumentoSchema.parse(raw), ctx), execute: (raw, ctx) => send("drive.guardarDocumento", driveGuardarDocumentoSchema.parse(raw), ctx) };
  return { estado, crear, guardar, resolveInput };
}
const tools = createDriveTools();
export const driveEstadoTool = tools.estado, driveCrearCarpetaTool = tools.crear, driveGuardarDocumentoTool = tools.guardar;
export const resolveDriveToolInput = tools.resolveInput;
