import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { chromium, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";

async function main() {
  if (process.env.NODE_ENV !== "production" || process.env.LEXOPEN_E2E === "1" || process.env.LEXOPEN_RELAX_CSRF === "1") throw new Error("Production mode without relaxed controls required");
  const base = process.env.PROD_TEST_BASE_URL;
  if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Explicit loopback PROD_TEST_BASE_URL required");
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  if (url !== process.env.DATABASE_URL || !process.env.STORAGE_PATH) throw new Error("Explicit matching disposable database and storage required");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = randomUUID(), password = `Fixture-${randomUUID()}`, files = new Set<string>();
  let ownerId = "", otherId = "", clientId = "", causeId = "", docId = "", sourceId = "", orgId = "", siteId = "";
  const officialSourceIds: string[] = [];
  const api = await request.newContext({ baseURL: base });
  const portal = await request.newContext({ baseURL: base });
  try {
    const org = await db.organization.create({ data: { name: `PDF smoke ${tag}`, settings: { create: { assistantLlmMode: "local_only", require2faPrivileged: true } } } }); orgId = org.id;
    for (const role of ["abogado", "abogado", "cliente"]) {
      const user = await db.user.create({ data: { email: `${randomUUID()}@pdf-research-fixture.invalid`, name: `Fixture ${role}`, role, password: await hash(password, 10) } });
      if (!ownerId) ownerId = user.id; else if (!otherId) otherId = user.id; else clientId = user.id;
    }
    const owner = await db.user.findUniqueOrThrow({ where: { id: ownerId } });
    const login = await api.post("/api/auth/login", { headers: { Origin: base }, data: { email: owner.email, password } }); assert.equal(login.status(), 200, await login.text());
    const token = (await api.storageState()).cookies.find(cookie => cookie.name === "lexopen_csrf")?.value; assert.ok(token);
    const headers = { Origin: base, "x-csrf-token": token! };
    const cause = await db.causa.create({ data: { titulo: `Private PDF ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: ownerId } }); causeId = cause.id;
    const bytes = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
    const key = `production-pdf-${tag}/original.pdf`; files.add(key);
    await putObject({ key, body: bytes, contentType: "application/pdf" });
    const doc = await db.documento.create({ data: { nombre: `Documento ficticio ${tag}.pdf`, mimeType: "application/pdf", storageKey: key, causaId: causeId, autorId: ownerId, extractionStatus: "completed" } }); docId = doc.id;
    const capture = await api.post(`/api/documentos/${docId}/evidence`, { headers }); assert.equal(capture.status(), 201, await capture.text());
    const version = await capture.json();
    const snapshot = await db.documentEvidenceVersion.findUniqueOrThrow({ where: { id: version.id } }); files.add(snapshot.sourceStorageKey!);
    const page = await api.get(`/api/documentos/${docId}/evidence?version=${version.id}&page=2`); assert.equal(page.status(), 200); const evidence = await page.json();
    assert.equal(evidence.selectedPageNumber, 2); assert.equal(evidence.pages.length, 3); assert.equal(evidence.fragments[0].pageNumber, 2);
    assert.match(evidence.fragments[0].text, /PAGO/); assert.equal(evidence.pages[2].status, "empty");
    for (const n of [1, 2]) { const image = await api.get(`/api/evidence/versions/${version.id}/pages/${n}`); assert.equal(image.status(), 200, await image.text()); assert.match(image.headers()["content-type"], /image\/png/); assert.match(image.headers()["cache-control"], /no-store/); }
    const quote = await api.post(`/api/evidence/fragments/${evidence.fragments[0].id}/verify`, { headers, data: { quote: evidence.fragments[0].text } }); assert.equal((await quote.json()).pageNumber, 2);
    const source = await api.post("/api/research/sources", { headers, data: { mode: "manual", url: `https://www.dt.gob.cl/legislacion/1624/w3-article-${Math.floor(Math.random() * 1_000_000) + 90_000_000}.html`, title: `Fuente pública ficticia ${tag}`, text: `Material ficticio: la jornada y el pago se contrastan con los antecedentes. ${tag}` } }); assert.equal(source.status(), 201, await source.text()); const legal = await source.json(); sourceId = legal.sourceId;
    const legalVersion = await db.legalSourceVersion.findUniqueOrThrow({ where: { id: legal.id } }); files.add(legalVersion.sourceStorageKey!);
    const site = await db.site.create({ data: { name: `Private space ${tag}`, slug: `prod-space-${tag}`, causaId: causeId } }); siteId = site.id;
    const siteFile = await db.siteFile.create({ data: { name: `PDF del espacio ${tag}.pdf`, siteId, mimeType: "application/pdf", storageKey: key, sizeBytes: bytes.length } });
    const siteCapture = await api.post(`/api/sites/${siteId}/files/${siteFile.id}/evidence`, { headers }); assert.equal(siteCapture.status(), 201, await siteCapture.text());
    const siteVersion = await siteCapture.json(); const frozenSite = await db.documentEvidenceVersion.findUniqueOrThrow({ where: { id: siteVersion.id } }); files.add(frozenSite.sourceStorageKey!);
    const siteScope = await api.get(`/api/research/scope?siteId=${siteId}`); assert.equal(siteScope.status(), 200); assert.equal((await siteScope.json()).files[0].id, siteFile.id);
    const siteResearch = await api.post("/api/research", { headers, data: { query: "pago", siteId, siteFileIds: [siteFile.id], sourceKinds: [] } }); assert.equal(siteResearch.status(), 201, await siteResearch.text()); const siteRun = await siteResearch.json(); assert.equal(siteRun.scope.siteId, siteId); assert.ok(siteRun.results.some((citation: {sourceKind: string; pageNumber: number}) => citation.sourceKind === "space_file" && citation.pageNumber === 2));
    if (process.env.LEXOPEN_LIVE_OFFICIAL_SOURCES === "1") {
      for (const url of ["https://www.bcn.cl/leychile/navegar?idNorma=242302", "https://www.bcn.cl/leychile/navegar?idNorma=242302&idVersion=2005-09-22", "https://www.sii.cl/pagina/jurisprudencia/adminis/2016/renta/ja2151.htm"]) {
        const imported = await api.post("/api/research/sources", { headers, data: { mode: "url", url }, timeout: 60000 }); assert.equal(imported.status(), 201, await imported.text()); const live = await imported.json(); officialSourceIds.push(live.sourceId);
        const version = await db.legalSourceVersion.findUniqueOrThrow({ where: { id: live.id } }); files.add(version.sourceStorageKey!);
        const original = await api.get(`/api/research/sources/${live.id}/original`); assert.equal(original.status(), 200); assert.equal((await original.body()).length > 1000, true);
        console.log(JSON.stringify({ check: "official-live-import", url, title: live.title, sourceSha256: live.sourceSha256, textSha256: live.textSha256, originalBytes: (await original.body()).length }));
      }
    }
    const browser = await chromium.launch({ headless: true });
    let run;
    try {
      const context = await browser.newContext({ storageState: await api.storageState(), locale: "es-CL" }); const browserPage = await context.newPage(); const errors: string[] = [];
      browserPage.on("pageerror", error => errors.push(error.message));
      await browserPage.goto(`${base}/jurisprudencia`);
      await browserPage.locator("#research-query").fill("pago jornada"); await browserPage.locator("#research-case").selectOption(causeId);
      const pending = browserPage.waitForResponse(response => new URL(response.url()).pathname === "/api/research" && response.request().method() === "POST");
      await browserPage.getByRole("button", { name: "Consultar mis fuentes", exact: true }).click(); const searched = await pending; assert.equal(searched.status(), 201, await searched.text()); run = await searched.json();
      assert.equal(run.answerMode, "extractive"); assert.equal(run.scope.causaId, causeId); assert.equal(run.coverage.networkRequests, 0); assert.equal(run.coverage.modelUsed, false);
      assert.ok(run.results.some((citation: { kind: string }) => citation.kind === "legal")); assert.ok(run.results.some((citation: { pageNumber: number }) => citation.pageNumber === 2));
      await browserPage.reload(); await browserPage.locator("#research-query").waitFor(); await browserPage.waitForFunction(id => (document.querySelector("#research-case") as HTMLSelectElement)?.value === id, causeId);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    const noCsrf = await api.post("/api/research", { headers: { Origin: base }, data: { query: "pago jornada" } }); assert.equal(noCsrf.status(), 403);
    const falseQuote = await api.post("/api/research/citations/verify", { headers, data: { kind: "document", fragmentId: evidence.fragments[0].id, quote: "Una cita inventada" } }); assert.equal((await falseQuote.json()).verified, false);
    await db.causa.update({ where: { id: causeId }, data: { abogadoId: otherId } });
    assert.equal((await api.get(`/api/research/${run.id}`)).status(), 404);
    assert.equal((await api.get(`/api/evidence/versions/${version.id}/pages/2`)).status(), 404);
    assert.equal((await api.get(`/api/research/${siteRun.id}`)).status(), 404);
    assert.equal((await api.get(`/api/evidence/versions/${siteVersion.id}/pages/2`)).status(), 404);
    assert.equal((await api.get(`/api/research/scope?siteId=${siteId}`)).status(), 404);
    const client = await db.user.findUniqueOrThrow({ where: { id: clientId } });
    assert.equal((await portal.post("/api/auth/login", { headers: { Origin: base }, data: { email: client.email, password } })).status(), 200);
    assert.equal((await portal.get("/api/research/sources")).status(), 403);
    console.log(JSON.stringify({ mode: "production", checks: ["CSRF real", "PDF physical pages and local OCR", "PNG original bound and private cache", "exact page citation", "manual provenance", "compiled research UI and restored scope", "no model/network in search", "false quote rejected", "revoked image and history denied", "portal denied", "SiteFile PDF scope, citations and revocation"], officialSourcesLive: process.env.LEXOPEN_LIVE_OFFICIAL_SOURCES === "1", externalServicesConfigured: false }));
  } finally {
    await api.dispose(); await portal.dispose();
    await db.legalSource.deleteMany({ where: { id: { in: [sourceId, ...officialSourceIds].filter(Boolean) } } });
    await db.researchRun.deleteMany({ where: { ownerId } });
    if (siteId) await db.site.deleteMany({ where: { id: siteId } });
    if (causeId) await db.causa.deleteMany({ where: { id: causeId } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: [ownerId, otherId, clientId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, clientId].filter(Boolean) } } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    await Promise.all([...files].map(file => rm(path.join(process.env.STORAGE_PATH!, file), { force: true })));
    await db.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
