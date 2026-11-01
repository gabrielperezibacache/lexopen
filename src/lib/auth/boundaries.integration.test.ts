import { prisma } from "@/lib/db";
import { checkConflicts } from "@/lib/conflict";
import { canReceiveNotification } from "@/lib/notify/access";
import { createTask, updateTasks } from "@/lib/tasks/service";
import { syncTaskFromTramite } from "@/lib/tasks/sync-mirrors";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveAprobacion } from "./aprobacion";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, relatedCausaWhere, taskAccessWhere } from "./causa-access";
import { generateTotpCode, generateTotpSecret, sealTotpSecret } from "./totp";
import { confirmTotpEnrollment, prepareTotpEnrollment } from "./totp-enrollment";

assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw new Error("DATABASE_URL must equal E2E_DATABASE_URL");
process.env.SESSION_SECRET ||= "test-auth-boundaries-32-characters-long";
const key = randomUUID();
const userIds: string[] = [], causeIds: string[] = [];
async function user(role: string) {
 const row = await prisma.user.create({ data: { role, name: `Auth fixture ${key}`, email: `${randomUUID()}@auth-fixture.invalid`, password: "unused-fixture", totpEnabled: false } }); userIds.push(row.id); return row;
}
async function main() {
try {
 const owner = await user("abogado"), excluded = await user("abogado"), accountant = await user("contabilidad"), socio = await user("socio");
 const party = `ReservedFixture${key.replaceAll("-", "")}`;
 const cause = await prisma.causa.create({ data: { titulo: `Private ${key}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, partes: { create: { nombre: party, rut: "99999999-9", rol: "demandante" } }, miembros: { create: [{ userId: owner.id, rol: "responsable" }, { userId: accountant.id, rol: "lectura" }] } } }); causeIds.push(cause.id);
 await assertCausaAccess(cause.id, owner);
 await assert.rejects(assertCausaAccess(cause.id, excluded), /No encontrada/);
 await assertCausaAccess(cause.id, accountant);
 await assert.rejects(assertCausaCapability(cause.id, accountant, "causa.write"), /Prohibido/);
 await assert.rejects(assertCausaCapability(cause.id, { ...owner, capabilityRevokes: "causa.write" }, "causa.write"), /Prohibido/);
 const restrictedConflict = await checkConflicts({ user: excluded, partes: [{ nombre: party, rut: "99999999-9" }] });
 assert.equal(restrictedConflict.status, "blocked"); assert.equal(restrictedConflict.hasRestrictedMatch, true);
 assert.deepEqual(restrictedConflict.conflicts, []);
 assert.equal(restrictedConflict.notice, "Coincidencia reservada: requiere revisión de un socio autorizado");
 const reservedJson = JSON.stringify(restrictedConflict);
 for (const secret of [cause.id, cause.titulo, party, "99999999-9"]) assert.equal(reservedJson.includes(secret), false);
 assert.equal(Object.hasOwn(restrictedConflict, "count"), false);
 const authorizedConflict = await checkConflicts({ user: socio, partes: [{ nombre: party, rut: "99999999-9" }] });
 assert.equal(authorizedConflict.conflicts.some(hit => hit.causaId === cause.id), true);
 const doc = await prisma.documento.create({ data: { nombre: key, causaId: cause.id, contenido: "Private text" } });
 assert.equal(await prisma.documento.count({ where: { id: doc.id, ...relatedCausaWhere(excluded) } }), 0);
 assert.equal(await prisma.documento.count({ where: { id: doc.id, ...relatedCausaWhere(socio) } }), 1);
 const study = await prisma.causa.create({ data: { titulo: key, tribunal: "Fixture", materia: "civil", acceso: "estudio", abogadoId: owner.id } }); causeIds.push(study.id);
 const privileged = await prisma.documento.create({ data: { nombre: key, causaId: study.id, privilegio: true, autorId: owner.id } });
 assert.equal(await prisma.documento.count({ where: { id: privileged.id, ...documentReadWhere(excluded) } }), 0);
 assert.equal(await prisma.documento.count({ where: { id: privileged.id, ...documentReadWhere(owner) } }), 1);
 assert.equal(await prisma.documento.count({ where: { id: privileged.id, ...documentReadWhere(socio) } }), 1);
 assert.equal(await canReceiveNotification(excluded.id, { entityType: "Documento", entityId: privileged.id }, prisma), false);
 assert.equal(await canReceiveNotification(owner.id, { entityType: "Documento", entityId: privileged.id }, prisma), true);
 assert.equal(await canReceiveNotification(socio.id, { entityType: "Documento", entityId: privileged.id }, prisma), true);
 const privateMinute = await prisma.minuta.create({ data: { titulo: key, resumenEjecutivo: "Restricted", causaId: cause.id, confidencial: true } });
 const minuteTask = await prisma.task.create({ data: { title: key, causaId: cause.id, origen: "minuta" } });
 const minuteDeadline = await prisma.plazo.create({ data: { titulo: key, causaId: cause.id, fechaLimite: new Date(Date.now() + 86_400_000) } });
 await prisma.minutaAccion.create({ data: { descripcion: key, minutaId: privateMinute.id, taskId: minuteTask.id, plazoId: minuteDeadline.id } });
 assert.equal(await prisma.task.count({ where: { id: minuteTask.id, ...taskAccessWhere(accountant) } }), 0);
 assert.equal(await prisma.task.count({ where: { id: minuteTask.id, ...taskAccessWhere(owner) } }), 1);
 assert.equal(await canReceiveNotification(accountant.id, { entityType: "Plazo", entityId: minuteDeadline.id }, prisma), false);
 assert.equal(await canReceiveNotification(owner.id, { entityType: "Plazo", entityId: minuteDeadline.id }, prisma), true);
 await assert.rejects(createTask(accountant, { title: key, causaId: cause.id, plazoId: minuteDeadline.id }), /Referencia no encontrada/);
 const tr = await prisma.tramite.create({ data: { causaId: cause.id, titulo: key, responsableId: owner.id } });
 const mirror = await syncTaskFromTramite(tr.id); assert.ok(mirror);
 const publicTask = await createTask(owner, { title: key, assigneeId: owner.id });
 await assert.rejects(updateTasks(excluded, [publicTask.id, mirror.id], { status: "done" }), /Tarea no encontrada/);
 assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: publicTask.id } })).status, "todo");
 await updateTasks(owner, [mirror.id], { status: "done" });
 assert.equal((await prisma.tramite.findUniqueOrThrow({ where: { id: tr.id } })).estado, "hecho");
 const recurring = await createTask(owner, { title: key, assigneeId: owner.id, causaId: cause.id, rrule: "FREQ=DAILY" });
 await Promise.allSettled([updateTasks(owner, [recurring.id], { status: "done" }), updateTasks(owner, [recurring.id], { status: "done" })]);
 assert.equal(await prisma.task.count({ where: { causaId: cause.id, rrule: "FREQ=DAILY", status: "todo" } }), 1);
 const approval = await prisma.aprobacion.create({ data: { tipo: "escrito", titulo: key, entityType: "causa", entityId: cause.id, solicitanteId: owner.id, aprobadorId: socio.id } });
 const resolved = await Promise.allSettled([resolveAprobacion({ id: approval.id, actor: socio, decision: "aprobada" }), resolveAprobacion({ id: approval.id, actor: socio, decision: "rechazada" })]);
 assert.equal(resolved.filter((r) => r.status === "fulfilled").length, 1);
 const expired = await prisma.aprobacion.create({ data: { tipo: "escrito", titulo: key, entityType: "causa", entityId: cause.id, aprobadorId: socio.id, venceAt: new Date(0) } });
 await assert.rejects(resolveAprobacion({ id: expired.id, actor: socio, decision: "aprobada" }), /expirado/);
 assert.equal((await prisma.aprobacion.findUniqueOrThrow({ where: { id: expired.id } })).estado, "expirada");
 const activeSecret = generateTotpSecret();
 const protectedUser = await prisma.user.update({ where: { id: owner.id }, data: { totpEnabled: true, totpSecretEnc: sealTotpSecret(activeSecret) } });
 await assert.rejects(prepareTotpEnrollment(owner.id, owner.sessionVersion), /código 2FA actual/);
 const prepared = await prepareTotpEnrollment(owner.id, owner.sessionVersion, generateTotpCode(activeSecret));
 const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
 assert.equal(unchanged.totpEnabled, true); assert.equal(unchanged.totpSecretEnc, protectedUser.totpSecretEnc);
 const confirmed = await confirmTotpEnrollment(prepared.token, owner.id, owner.sessionVersion, generateTotpCode(prepared.secret));
 assert.equal(confirmed.user.sessionVersion, owner.sessionVersion + 1);
 await assert.rejects(confirmTotpEnrollment(prepared.token, owner.id, owner.sessionVersion, generateTotpCode(prepared.secret)), /cambió/);
 console.log("auth boundaries: negative ACL and notification source policy, reserved conflict, atomic bulk, mirror, recurrence, approval CAS/expiry, TOTP enrollment OK");
} finally {
 await prisma.aprobacion.deleteMany({ where: { titulo: key } });
 await prisma.task.deleteMany({ where: { title: key } });
 await prisma.documento.deleteMany({ where: { nombre: key } });
 await prisma.causa.deleteMany({ where: { id: { in: causeIds } } });
 await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
 await prisma.user.deleteMany({ where: { id: { in: userIds } } });
 await prisma.$disconnect();
}

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
