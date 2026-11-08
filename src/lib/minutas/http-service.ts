import { z } from "zod";
import { createHash } from "node:crypto";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, documentReadWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { executeCommand, serializable } from "@/lib/command-execution";
import { documentoListSelect } from "@/lib/sites/file-select";
import { calcularVencimiento } from "@/lib/plazos";
import { requireDeadlineComputation } from "@/lib/plazos-policy";
import { parseLocalDateInput } from "@/lib/minutas";
import { memoId, minuteFieldsSchema, type MinuteFields } from "./schemas";
import { memoCause, loadMinute, minuteFields, minuteVersion, prepareMinute, writeMinute, authorizeMinuteEffects, type MinuteAuthority } from "./mutations";
export const nativeMinuteCreateSchema = z.object({
  causaId: memoId, titulo: z.string().trim().min(1).max(300), resumenEjecutivo: z.string().trim().min(1).max(50000),
  tipo: z.enum(["audiencia", "reunion", "llamada"]).default("reunion"), modalidad: z.enum(["presencial", "videollamada", "telefonica", "hibrida"]).default("presencial"), fecha: z.string().max(80).nullish(),
  lugar: z.string().max(300).nullish(), participantes: z.string().max(3000).nullish(), hechosRelevantes: z.string().max(20000).nullish(), acuerdos: z.string().max(20000).nullish(), proximosPasos: z.string().max(20000).nullish(), riesgosAlertas: z.string().max(20000).nullish(), estadoCausaNota: z.string().max(20000).nullish(), etapaSugerida: z.string().max(40).nullish(),
  confidencial: z.boolean().default(false), actualizarEtapa: z.boolean().default(false), subirADrive: z.boolean().default(false),
  acciones: z.array(z.object({ id: memoId.optional(), descripcion: z.string().trim().max(10000), responsable: z.string().max(300).nullish(), fechaLimite: z.string().max(80).nullish(), diasPlazo: z.coerce.number().int().positive().max(3650).nullish(), tipoComputo: z.enum(["habiles", "corridos"]).default("habiles"), esFatal: z.boolean().default(false), prioridad: z.enum(["baja", "media", "alta", "urgente"]).default("media"), crearTask: z.boolean().default(true), crearPlazo: z.boolean().default(false) })).max(50).default([]),
});
function nativeDate(value: string | null | undefined) {
  if (!value) return null;
  const prefix = value.slice(0, 10);
  const date = parseLocalDateInput(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix) || Number.isNaN(Date.parse(prefix)) || new Date(prefix).toISOString().slice(0, 10) !== prefix || !date || Number.isNaN(date.getTime())) throw httpError("Fecha inválida", 400);
  return date;
}
export async function getMinuteView(user: StaffActor, id: string) {
  return serializable(async tx => {
    const actor = await currentStaffActor(user, tx);
    const row = await tx.minuta.findUnique({ where: { id }, include: { causa: true, autor: { select: publicUserSelect }, acciones: { orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }] }, documento: { select: documentoListSelect } } });
    if (!row) throw httpError("Minuta no encontrada", 404);
    const access = await assertCausaAccess(row.causaId, actor, { auditOverride: false }, tx);
    if (row.confidencial && !can(actor, "doc.confidential.read")) throw httpError("Minuta no disponible", 403);
    if (row.documento && !await tx.documento.findFirst({ where: { id: row.documento.id, ...documentReadWhere(actor) }, select: { id: true } })) row.documento = null;
    let version: string | undefined;
    const canCreate = can(actor, "causa.write", { causaRol: access.causaRol });
    if (canCreate) { try { version = minuteVersion(await loadMinute(id, actor, tx)); } catch (e) { if (![403, 404, 409].includes((e as { status?: number }).status || 0)) throw e; } }
    return { ...row, version, canEdit: Boolean(version), canCreate };
  });
}
export async function createNativeMinute(user: StaffActor, body: z.infer<typeof nativeMinuteCreateSchema>, key: string) {
  const result = await executeCommand<{ id: string; authority: MinuteAuthority }>({ key, ownerId: user.id, input: body,
    authorize: async (tx, committed) => { const actor = await currentStaffActor(user, tx); await memoCause(body.causaId, actor, tx); if (body.confidencial && !can(actor, "doc.confidential.read")) throw httpError("Sin permiso para la minuta confidencial", 403); if (committed) { await loadMinute(committed.id, actor, tx); await authorizeMinuteEffects(committed.authority, actor, tx); } },
    run: async tx => {
      const actor = await currentStaffActor(user, tx), fecha = nativeDate(body.fecha) || new Date();
      const calculated = new Map<string, { days: number; type: string }>(), assignees = new Map<string, string | null>();
      const actions: MinuteFields["acciones"] = [];
      for (const [index, a] of body.acciones.filter(a => a.descripcion).entries()) {
        const id = a.id || createHash("sha256").update(`${actor.id}:${key}:${index}`).digest("hex");
        let due = nativeDate(a.fechaLimite);
        if (!due && a.diasPlazo) { await requireDeadlineComputation(tx); due = calcularVencimiento({ desde: fecha, dias: a.diasPlazo, tipoComputo: a.tipoComputo }); calculated.set(id, { days: a.diasPlazo, type: a.tipoComputo }); }
        actions.push({ id, descripcion: a.descripcion, responsable: a.responsable?.trim() || null, fechaLimite: due?.toISOString() || null, prioridad: a.prioridad, estado: "pendiente", crearTask: a.crearTask, crearPlazo: a.crearPlazo, tipoComputo: a.tipoComputo, esFatal: a.esFatal });
        const matches = a.responsable?.trim() ? await tx.user.findMany({ where: { OR: [{ name: { equals: a.responsable.trim(), mode: "insensitive" } }, { email: { equals: a.responsable.trim(), mode: "insensitive" } }] }, select: { id: true }, take: 2 }) : [];
        assignees.set(id, matches.length === 1 ? matches[0].id : null);
      }
      const fields = minuteFieldsSchema.parse({ tipo: body.tipo, titulo: body.titulo, resumenEjecutivo: body.resumenEjecutivo, fecha: fecha.toISOString(), modalidad: body.modalidad, lugar: body.lugar || null, participantes: body.participantes || "", hechosRelevantes: body.hechosRelevantes || null, acuerdos: body.acuerdos || null, proximosPasos: body.proximosPasos || null, riesgosAlertas: body.riesgosAlertas || null, estadoCausaNota: body.estadoCausaNota || null, etapaSugerida: body.etapaSugerida || null, confidencial: body.confidencial, acciones: actions });
      const prepared = await prepareMinute(fields, body.causaId, actor, tx, null, { reviewedActions: actions.map(a => a.id), hostCalculated: [...calculated.keys()], newTaskAssignees: assignees });
      return writeMinute(actor, fields, tx, null, prepared, { applyStage: body.actualizarEtapa, calculatedActions: calculated, newTaskAssignees: assignees });
    },
  });
  return getMinuteView(user, result.id);
}
export async function updateNativeMinute(user: StaffActor, id: string, raw: Record<string, unknown>, key: string) {
  const result = await executeCommand<{ id: string; authority: MinuteAuthority }>({ key, ownerId: user.id, input: { id, raw },
    authorize: async (tx, committed) => { const actor = await currentStaffActor(user, tx); await loadMinute(id, actor, tx); if (committed) await authorizeMinuteEffects(committed.authority, actor, tx); },
    run: async tx => {
      const actor = await currentStaffActor(user, tx), before = await loadMinute(id, actor, tx);
      if (raw.expectedVersion !== undefined && raw.expectedVersion !== minuteVersion(before)) throw httpError("La minuta o sus seguimientos cambiaron en otra sesión. Conserve su copia y compare las versiones.", 409);
      const fields = minuteFields(before);
      if (raw.action === "accion-estado") {
        const action = fields.acciones.find(a => a.id === raw.accionId); if (!action) throw httpError("La acción no pertenece a esta minuta", 404);
        action.estado = raw.estado as typeof action.estado;
      } else {
        if (raw.action) throw httpError("Acción de minuta no válida", 400);
        const editable = ["titulo", "resumenEjecutivo", "hechosRelevantes", "acuerdos", "proximosPasos", "riesgosAlertas", "estadoCausaNota", "participantes", "lugar", "modalidad", "confidencial"];
        for (const k of editable) if (raw[k] !== undefined) Object.assign(fields, { [k]: raw[k] });
      }
      minuteFieldsSchema.parse(fields);
      const prepared = await prepareMinute(fields, before.causaId, actor, tx, before, { allowDeclassify: true });
      return writeMinute(actor, fields, tx, before, prepared);
    },
  });
  return getMinuteView(user, result.id);
}
