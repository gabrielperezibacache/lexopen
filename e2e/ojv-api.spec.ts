import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

// Real application routes; all users and matters belong to this disposable run.
// Only malformed previews and add-rol(syncNow:false) are sent: never a live
// OJV query, a valid Mis Causas sync, CAPTCHA solve or credential mutation.
const databaseUrl = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("OJV API tests require a local application and disposable PostgreSQL database");
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const tag = randomUUID();
const prefix = `OJV API fixture ${tag}`;
const password = `OJV-api-fixture-${tag}`;
const ritNumber = randomInt(600_000, 900_000);
const rit = (offset: number) => `C-${ritNumber + offset}-2026`;
const tribunal = "1º Juzgado Civil de Santiago";
const otherTribunal = "2º Juzgado Civil de Santiago";
const lookup = "/api/pjud/lookup";
type ActorKey = "viewer" | "malformed" | "noRead" | "noCreate" | "linker" | "racer" | "outsider" | "client" | "socio" | "admin";
type Actor = { id: string; email: string; api: APIRequestContext; csrf: string };
const actors = {} as Record<ActorKey, Actor>;
const actorIds: string[] = [];
const contexts: APIRequestContext[] = [];
const caseIds: string[] = [];
let existingId: string;
let privateId: string;

function privateHeaders(response: APIResponse) {
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["vary"].toLowerCase().split(/\s*,\s*/)).toContain("cookie");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
}
async function json<T>(response: APIResponse, status: number, fromHandler = true): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  // Client role ACL is rejected by the shared proxy before these handlers.
  if (fromHandler) privateHeaders(response);
  return response.json() as Promise<T>;
}
function post(actor: ActorKey, path: string, data: unknown) {
  return actors[actor].api.post(path, {
    data,
    headers: { "Content-Type": "application/json", "x-csrf-token": actors[actor].csrf },
  });
}
function add(offset: number, extra: Record<string, unknown> = {}) {
  return { action: "add-rol", rit: rit(offset), tribunal, titulo: `${prefix} ${offset}`, syncNow: false, ...extra };
}
function assertSafeStatus(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(/"(?:password|claveUnicaPasswordEnc|claveUnicaRut|accessToken|refreshToken)"\s*:/i);
  expect(serialized).not.toContain("enc:v2:");
  expect(serialized).not.toContain(password);
}
async function firmSyncState() {
  return db.firmSettings.findMany({
    select: { id: true, claveUnicaEnabled: true, claveUnicaLastSyncAt: true, claveUnicaLastSyncStatus: true, claveUnicaLastSyncNote: true },
    orderBy: { id: "asc" },
  });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  // Read only non-secret account state. The runner must seed its own test DB;
  // this suite neither changes shared settings nor supplies credentials.
  expect(await db.firmSettings.count(), "Run against the seeded disposable E2E database").toBeGreaterThan(0);
  const hashed = await bcrypt.hash(password, 4);
  const fixtures: Array<{ key: ActorKey; role: string; capabilityRevokes?: string }> = [
    { key: "viewer", role: "abogado" },
    { key: "malformed", role: "socio" },
    { key: "noRead", role: "abogado", capabilityRevokes: "causa.read" },
    { key: "noCreate", role: "abogado", capabilityRevokes: "causa.create" },
    { key: "linker", role: "abogado" },
    { key: "racer", role: "abogado" },
    { key: "outsider", role: "abogado" },
    { key: "client", role: "cliente" },
    { key: "socio", role: "socio" },
    { key: "admin", role: "admin" },
  ];
  for (const fixture of fixtures) {
    const user = await db.user.create({ data: {
      email: `ojv-api-${fixture.key}-${tag}@example.test`.toLowerCase(),
      name: `${prefix} ${fixture.key}`,
      password: hashed,
      role: fixture.role,
      capabilityRevokes: fixture.capabilityRevokes || "",
    } });
    actorIds.push(user.id);
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: new URL(baseURL).origin, "Accept-Language": "es-CL,es;q=0.9" },
    });
    contexts.push(api);
    const login = await api.post("/api/auth/login", { data: { email: user.email, password } });
    expect(login.status(), await login.text()).toBe(200);
    expect((await login.json()).needsTotp).not.toBe(true);
    const csrf = (await api.storageState()).cookies.find(cookie => cookie.name === "lexopen_csrf")?.value;
    expect(csrf).toBeTruthy();
    actors[fixture.key] = { id: user.id, email: user.email, api, csrf: csrf! };
  }
  const existing = await db.causa.create({ data: {
    titulo: `${prefix} lowercase existing`, rit: rit(0).toLowerCase(), tribunal: tribunal.toLowerCase(),
    materia: "Civil", abogadoId: actors.linker.id, pjudMonitoreoActivo: false,
  } });
  existingId = existing.id; caseIds.push(existing.id);
  const restricted = await db.causa.create({ data: {
    titulo: `${prefix} expediente reservado`, rit: rit(10), tribunal,
    materia: "Civil", acceso: "equipo", abogadoId: actors.linker.id, pjudMonitoreoActivo: false,
  } });
  privateId = restricted.id; caseIds.push(restricted.id);
});

test.afterAll(async () => {
  try {
    for (const api of contexts) await api.dispose();
    if (actorIds.length) {
      const ownCases = await db.causa.findMany({
        where: { OR: [{ id: { in: caseIds } }, { abogadoId: { in: actorIds } }, { titulo: { startsWith: prefix } }] },
        select: { id: true },
      });
      const ownIds = ownCases.map(causa => causa.id);
      await db.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: actorIds } }, { entityType: "Causa", entityId: { in: ownIds } }] } });
      await db.pjudSyncJob.deleteMany({ where: { causaId: { in: ownIds } } });
      await db.causaMovimiento.deleteMany({ where: { causaId: { in: ownIds } } });
      await db.activity.deleteMany({ where: { OR: [{ userId: { in: actorIds } }, { causaId: { in: ownIds } }] } });
      await db.causa.deleteMany({ where: { id: { in: ownIds } } });
      await db.user.deleteMany({ where: { id: { in: actorIds } } });
    }
  } finally { await db.$disconnect(); }
});

test("catálogo real: permisos efectivos, preparación y respuestas privadas", async () => {
  const catalogue = await json<{ tribunales: string[]; readiness: { configured: boolean; channel: string }; capabilities: { preview: boolean; byRut: boolean; create: boolean } }>(await actors.viewer.api.get(lookup), 200);
  expect(catalogue.tribunales).toContain(tribunal);
  expect(typeof catalogue.readiness.configured).toBe("boolean");
  expect(["unconfigured", "sidecar", "browser"]).toContain(catalogue.readiness.channel);
  expect(catalogue.capabilities.create).toBe(true);
  expect(catalogue.capabilities.preview).toBe(catalogue.readiness.configured);
  expect(catalogue.capabilities.byRut).toBe(catalogue.readiness.configured);
  assertSafeStatus(catalogue);
  await json(await actors.client.api.get(lookup), 403, false);
  await json(await actors.noRead.api.get(lookup), 403);
  const noCreate = await json<{ capabilities: { create: boolean } }>(await actors.noCreate.api.get(lookup), 200);
  expect(noCreate.capabilities.create).toBe(false);
});

test("JSON, tamaño, inyección e identidad inválidos no crean causas ni trabajos", async () => {
  const before = await db.causa.count({ where: { titulo: { startsWith: prefix } } });
  const payloads: Array<{ body: unknown; status: number }> = [
    { body: '{"action":', status: 400 },
    { body: JSON.stringify(add(20, { titulo: `${prefix}${"x".repeat(9000)}` })), status: 413 },
    { body: add(21, { actorId: actors.linker.id }), status: 400 },
    { body: { action: "preview-rol", rit: "C-1-2026';DROP TABLE Causa;--", tribunal }, status: 400 },
    { body: { action: "preview-rol", rit: rit(22), tribunal: "Por identificar" }, status: 400 },
    { body: { action: "buscar-rut", rut: "11.111.111-2" }, status: 400 },
  ];
  for (const payload of payloads) await json(await post("malformed", lookup, payload.body), payload.status);
  expect(await db.causa.count({ where: { titulo: { startsWith: prefix } } })).toBe(before);
  expect(await db.pjudSyncJob.count({ where: { causa: { abogadoId: actors.malformed.id } } })).toBe(0);
});

test("cliente y capacidades revocadas no pueden registrar causas", async () => {
  for (const actor of ["client", "noRead", "noCreate"] as const) {
    await json(await post(actor, lookup, add(30)), 403, actor !== "client");
    expect(await db.causa.count({ where: { abogadoId: actors[actor].id } })).toBe(0);
  }
});

test("identidad sin distinguir mayúsculas vincula y otro tribunal crea expediente propio", async () => {
  const linked = await json<{ causaId: string; created: boolean; sync: unknown }>(await post("linker", lookup, add(0)), 200);
  expect(linked).toMatchObject({ causaId: existingId, created: false, sync: null });
  expect((await db.causa.findUniqueOrThrow({ where: { id: existingId } })).pjudMonitoreoActivo).toBe(true);
  expect(await db.causa.count({ where: { rit: { equals: rit(0), mode: "insensitive" }, tribunal: { equals: tribunal, mode: "insensitive" } } })).toBe(1);
  const separate = await json<{ causaId: string; created: boolean; sync: unknown }>(await post("linker", lookup, add(0, { tribunal: otherTribunal })), 201);
  caseIds.push(separate.causaId);
  expect(separate.created).toBe(true);
  expect(separate.causaId).not.toBe(existingId);
  const saved = await db.causa.findUniqueOrThrow({ where: { id: separate.causaId } });
  expect(saved).toMatchObject({ abogadoId: actors.linker.id, tribunal: otherTribunal, pjudMonitoreoActivo: true, pjudLastSyncStatus: "never" });
  expect(await db.pjudSyncJob.count({ where: { causaId: { in: [existingId, separate.causaId] } } })).toBe(0);
});

test("un expediente de equipo ajeno permanece reservado y no se reactiva", async () => {
  const response = await post("outsider", lookup, add(10));
  const error = await json<{ error: string }>(response, 404);
  expect(JSON.stringify(error)).not.toContain(privateId);
  expect(JSON.stringify(error)).not.toContain("expediente reservado");
  expect((await db.causa.findUniqueOrThrow({ where: { id: privateId } })).pjudMonitoreoActivo).toBe(false);
  expect(await db.causa.count({ where: { rit: rit(10), tribunal } })).toBe(1);
});

test("dos altas simultáneas de la misma identidad conservan una sola causa", async () => {
  const responses = await Promise.all([
    post("racer", lookup, add(40)),
    post("racer", lookup, add(40, { rit: rit(40).toLowerCase(), tribunal: tribunal.toLowerCase() })),
  ]);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 201]);
  const bodies = await Promise.all(responses.map(response => json<{ causaId: string; sync: unknown }>(response, response.status())));
  expect(new Set(bodies.map(body => body.causaId)).size).toBe(1);
  caseIds.push(bodies[0].causaId);
  expect(bodies.every(body => body.sync === null)).toBe(true);
  const rows = await db.causa.findMany({ where: { rit: { equals: rit(40), mode: "insensitive" }, tribunal: { equals: tribunal, mode: "insensitive" } } });
  expect(rows).toHaveLength(1);
  expect(rows[0].abogadoId).toBe(actors.racer.id);
  expect(await db.pjudSyncJob.count({ where: { causaId: rows[0].id } })).toBe(0);
});

test("Mis Causas inválido no reclama la sincronización y su metadata refleja permisos", async () => {
  const before = await firmSyncState();
  await json(await post("socio", "/api/pjud/mis-causas", '{"action":'), 400);
  expect(await firmSyncState()).toEqual(before);
  const status = await json<{ capabilities: { sync: boolean; credentials: boolean }; status: unknown }>(await actors.socio.api.get("/api/pjud/mis-causas"), 200);
  expect(status.capabilities).toEqual({ sync: true, credentials: false });
  assertSafeStatus(status);
  const admin = await json<{ capabilities: { sync: boolean; credentials: boolean } }>(await actors.admin.api.get("/api/pjud/mis-causas"), 200);
  expect(admin.capabilities).toEqual({ sync: false, credentials: true });
  const credentialStatus = await json<{ hasPassword: boolean; rutMasked: string | null }>(await actors.admin.api.get("/api/pjud/claveunica"), 200);
  expect(typeof credentialStatus.hasPassword).toBe("boolean");
  assertSafeStatus(credentialStatus);
  expect(await firmSyncState()).toEqual(before);
});
