import { Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { writingActor, writingTransaction, type WritingClient } from "@/lib/writings/access";
import { captureWritingSource } from "@/lib/writings/sources";
import { createCaseWritingFromSnapshots, readCaseWriting } from "@/lib/writings/service";
import { createWorkbenchSchema, type WorkbenchMode } from "./schemas";
import { workbenchDestination, type WorkbenchDestination } from "./policy";
import { dockerConfig, runtimeCapabilities, type DockerConfig } from "./runtime";
import { verifyWorkbenchInputs } from "./sources";

export type WorkbenchClient = WritingClient;
export type RunWithInputs = Prisma.WorkbenchRunGetPayload<{ include: { inputs: true } }>;
export type WorkbenchServiceOptions = { config?: DockerConfig; capability?: typeof runtimeCapabilities; destination?: (actorId: string, mode: WorkbenchMode) => Promise<WorkbenchDestination> };
const missing = () => httpError("Trabajo no disponible con sus permisos actuales", 404);
export async function workbenchRunFor(causaId: string, id: string, user: CausaAccessUser, client: WorkbenchClient = prisma, write = false) {
  const { actor } = await writingActor(causaId, user, client, write);
  const row = await client.workbenchRun.findFirst({ where: { id, causaId, ownerId: actor.id }, include: { inputs: { orderBy: { ordinal: "asc" } } } });
  if (!row) throw missing();
  return { actor, row };
}
export async function createWorkbenchRun(causaId: string, raw: z.input<typeof createWorkbenchSchema>, user: CausaAccessUser, client: PrismaClient = prisma, options: WorkbenchServiceOptions = {}) {
  const input = createWorkbenchSchema.parse(raw), hash = sha256(JSON.stringify(input));
  if (new Set(input.sources.map(source => source.fragmentId)).size !== input.sources.length) throw httpError("Seleccione cada pasaje una sola vez", 400);
  const { actor } = await writingActor(causaId, user, client, true);
  const existing = await client.workbenchRun.findUnique({ where: { ownerId_causaId_requestId: { ownerId: actor.id, causaId, requestId: input.requestId } } });
  if (existing) {
    if (existing.inputSha256 !== hash) throw httpError("La solicitud ya identifica otro trabajo; conserve el resultado y prepare uno nuevo", 409);
    return { run: await readWorkbenchRun(causaId, existing.id, actor, client), reused: true };
  }
  const config = options.config || dockerConfig(), capability = await (options.capability || runtimeCapabilities)(config);
  if (!capability.available) throw httpError(capability.reason, 503);
  const destination = await (options.destination || workbenchDestination)(actor.id, input.mode);
  if (destination.key !== input.destinationKey) throw httpError("El proveedor cambió. Revise el destino y vuelva a preparar el trabajo", 409);
  if (!destination.permitted || destination.remote && !input.allowRemote) throw httpError("El destino no está autorizado. Revise la política y confirme el envío seleccionado", 403);
  return writingTransaction(client, async tx => {
    const { actor: current } = await writingActor(causaId, actor, tx, true), cache = new Map<string, unknown>();
    const duplicate = await tx.workbenchRun.findUnique({ where: { ownerId_causaId_requestId: { ownerId: actor.id, causaId, requestId: input.requestId } } });
    if (duplicate) {
      if (duplicate.inputSha256 !== hash) throw httpError("La solicitud identifica otro trabajo", 409);
      return { run: await readWorkbenchRun(causaId, duplicate.id, current, tx), reused: true };
    }
    if (await tx.workbenchRun.count({ where: { ownerId: actor.id, causaId } }) >= 100) throw httpError("La Mesa admite cien trabajos por causa y profesional", 413);
    const sources = [];
    for (const source of input.sources) sources.push(await captureWritingSource(causaId, { kind: "document", ...source }, current, tx, cache));
    const row = await tx.workbenchRun.create({ data: { ownerId: actor.id, causaId, requestId: input.requestId, inputSha256: hash, objective: input.objective, destinationJson: JSON.stringify(destination), imageId: config.imageId,
      inputs: { create: sources.map((source, ordinal) => { const sourceJson = JSON.stringify(source); return { ordinal, sourceJson, sourceSha256: sha256(sourceJson) }; }) },
      events: { create: { kind: "queued", message: "Trabajo preparado con la selección explícita de fuentes. Aún no se ha ejecutado." } } } });
    await writeAuditStrict({ actorId: actor.id, action: "workbench.create", entityType: "WorkbenchRun", entityId: row.id, after: { causaId, sourceCount: sources.length, mode: input.mode, remote: destination.remote } }, tx);
    return { run: await readWorkbenchRun(causaId, row.id, actor, tx), reused: false };
  });
}
export async function readWorkbenchRun(causaId: string, id: string, user: CausaAccessUser, client: WorkbenchClient = prisma) {
  const { actor, row } = await workbenchRunFor(causaId, id, user, client);
  const sources = await verifyWorkbenchInputs(causaId, row.inputs, actor, client);
  if (["awaiting_review", "imported"].includes(row.status) && sha256(row.body) !== row.bodySha256) throw httpError("El resultado no coincide con su copia conservada", 409);
  const [events, artifacts, receipt] = await Promise.all([
    client.workbenchEvent.findMany({ where: { runId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 30, select: { id: true, kind: true, message: true, createdAt: true } }),
    client.workbenchArtifact.findMany({ where: { runId: id }, orderBy: { name: "asc" }, select: { id: true, name: true, mimeType: true, size: true, sha256: true } }),
    client.workbenchImportReceipt.findUnique({ where: { runId: id }, select: { draftId: true } }),
  ]);
  const interrupted = row.status === "running" && row.leaseExpiresAt && row.leaseExpiresAt < new Date();
  return { id: row.id, objective: row.objective, status: interrupted ? "interrupted" : row.status, body: row.status === "awaiting_review" || row.status === "imported" ? row.body : "", createdAt: row.createdAt.toISOString(), destination: JSON.parse(row.destinationJson) as WorkbenchDestination,
    sources: sources.map((source, index) => ({ marker: `R${index + 1}`, title: source.title, text: source.text, href: source.href, versionId: source.input.kind === "document" ? source.input.versionId : "", sourceSha256: source.citations[0].sourceSha256, warnings: source.warnings })),
    events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })), artifacts: row.status === "awaiting_review" || row.status === "imported" ? artifacts : [], draftId: receipt?.draftId || null };
}
export type WorkbenchRunView = Awaited<ReturnType<typeof readWorkbenchRun>>;
export async function listWorkbenchRuns(causaId: string, user: CausaAccessUser, client: WorkbenchClient = prisma) {
  const { actor } = await writingActor(causaId, user, client);
  const rows = await client.workbenchRun.findMany({ where: { ownerId: actor.id, causaId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true } });
  const runs: ({ id: string; available: false } | { id: string; available: true; objective: string; status: string; createdAt: string })[] = [];
  for (const row of rows) {
    try { const run = await readWorkbenchRun(causaId, row.id, actor, client); runs.push({ id: run.id, available: true, objective: run.objective, status: run.status, createdAt: run.createdAt }); }
    catch (error) { if (![403, 404, 409, 413, 422].includes(Number((error as { status?: number }).status))) throw error; runs.push({ id: row.id, available: false }); }
  }
  return { runs, limited: rows.length === 20 };
}
export async function cancelWorkbenchRun(causaId: string, id: string, user: CausaAccessUser, client: WorkbenchClient = prisma) {
  return writingTransaction(client, async tx => {
    const { actor, row } = await workbenchRunFor(causaId, id, user, tx);
    const changed = await tx.workbenchRun.updateMany({ where: { id, status: { in: ["queued", "running"] } }, data: { status: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date(), body: "", leaseToken: null, leaseExpiresAt: null } });
    if (changed.count) {
      await tx.workbenchEvent.create({ data: { runId: row.id, kind: "cancelled", message: "Trabajo cancelado. No se incorporarán resultados al expediente." } });
      await writeAuditStrict({ actorId: actor.id, action: "workbench.cancel", entityType: "WorkbenchRun", entityId: id }, tx);
    }
    return { status: changed.count ? "cancelled" : row.status };
  });
}
export async function readWorkbenchArtifact(causaId: string, id: string, artifactId: string, user: CausaAccessUser, client: WorkbenchClient = prisma) {
  const { actor, row } = await workbenchRunFor(causaId, id, user, client);
  await verifyWorkbenchInputs(causaId, row.inputs, actor, client);
  if (!["awaiting_review", "imported"].includes(row.status) || row.cancelRequestedAt) throw httpError("Este trabajo no tiene archivos disponibles para utilizar", 409);
  const artifact = await client.workbenchArtifact.findFirst({ where: { id: artifactId, runId: id } });
  if (!artifact || artifact.size !== artifact.data.byteLength || sha256(artifact.data) !== artifact.sha256) throw missing();
  return artifact;
}
export async function importWorkbenchWriting(causaId: string, id: string, user: CausaAccessUser, client: WorkbenchClient = prisma) {
  return writingTransaction(client, async tx => {
    // Serialize cancellation/import and concurrent imports at the same durable boundary.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "WorkbenchRun" WHERE "id" = ${id} AND "ownerId" = ${user.id} AND "causaId" = ${causaId} FOR UPDATE`);
    const { actor, row } = await workbenchRunFor(causaId, id, user, tx, true);
    const sources = await verifyWorkbenchInputs(causaId, row.inputs, actor, tx);
    if (row.cancelRequestedAt || !["awaiting_review", "imported"].includes(row.status)) throw httpError("Sólo puede incorporar un resultado terminado y revisado", 409);
    if (sha256(row.body) !== row.bodySha256) throw httpError("El resultado cambió respecto de su copia conservada", 409);
    const receipt = await tx.workbenchImportReceipt.findUnique({ where: { runId: id } });
    if (receipt) { const draft = await readCaseWriting(causaId, receipt.draftId, actor, tx); return { draftId: draft.id, reused: true }; }
    const artifact = await tx.workbenchArtifact.findUnique({ where: { runId_name: { runId: id, name: "borrador.md" } } });
    if (!artifact || sha256(artifact.data) !== artifact.sha256) throw httpError("El artefacto no coincide con su registro", 409);
    const { draft } = await createCaseWritingFromSnapshots(causaId, { requestId: `workbench-${id}`, title: row.objective.slice(0, 160), body: row.body }, sources, actor, tx);
    await tx.workbenchImportReceipt.create({ data: { runId: id, draftId: draft.id, artifactSha256: artifact.sha256 } });
    await tx.workbenchRun.update({ where: { id }, data: { status: "imported" } });
    await tx.workbenchEvent.create({ data: { runId: id, kind: "imported", message: "El profesional incorporó el resultado como un escrito privado con fuentes. El original se conserva." } });
    await writeAuditStrict({ actorId: actor.id, action: "workbench.import", entityType: "WorkbenchRun", entityId: id, after: { draftId: draft.id } }, tx);
    return { draftId: draft.id, reused: false };
  });
}
