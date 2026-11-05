/** Synthetic PostgreSQL regression. No provider, credentials, documents or user data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { causaAccessWhere, documentReadWhere, siteRelatedWhere } from "@/lib/auth/causa-access";
import { confidentialWhere } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { ftsCausaIds, ftsDocumentoIds, ftsWikiIds } from "./search";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL!).toString(), url);
  const tag = `search-${randomUUID()}`;
  const token = `lexsearch${randomUUID().replaceAll("-", "")}`;
  const q = `fundamentacion ${token}`;
  const actor = { id: `${tag}-reader`, role: "asistente" };
  const owner = `${tag}-owner`;
  const hidden = Array.from({ length: 105 }, (_, index) => `${tag}-${String(index).padStart(3, "0")}`);
  const active = `${tag}-800`, future = `${tag}-801`, expired = `${tag}-802`;
  const publicIds = Array.from({ length: 12 }, (_, index) => `${tag}-${900 + index}`);
  const causeIds = [...hidden, active, future, expired, ...publicIds];
  const siteId = (id: string) => `${id}-site`;
  const docId = (id: string) => `${id}-doc`;
  const wikiId = (id: string) => `${id}-wiki`;
  const flagged = [`${tag}-810-confidential`, `${tag}-811-privileged`];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("Search fixtures must not contact providers"); }) as typeof fetch;
  try {
    await prisma.user.createMany({ data: [actor.id, owner].map((id, index) => ({
      id, email: `${id}@example.invalid`, name: "Synthetic search actor", role: index ? "abogado" : actor.role,
      password: "disabled-synthetic-account",
    })) });
    await prisma.causa.createMany({ data: causeIds.map(id => ({
      id, titulo: `Fundamentación ${token}`, tribunal: "Tribunal ficticio", materia: "civil",
      acceso: publicIds.includes(id) ? "estudio" : "equipo", abogadoId: owner,
    })) });
    const yesterday = new Date(Date.now() - 86_400_000), tomorrow = new Date(Date.now() + 86_400_000);
    await prisma.causaMiembro.createMany({ data: [
      { causaId: active, userId: actor.id, rol: "lectura", desde: yesterday },
      { causaId: future, userId: actor.id, rol: "lectura", desde: tomorrow },
      { causaId: expired, userId: actor.id, rol: "lectura", desde: yesterday, hasta: new Date(Date.now() - 1000) },
    ] });
    await prisma.site.createMany({ data: causeIds.map(id => ({ id: siteId(id), name: "Espacio ficticio", slug: siteId(id), causaId: id })) });
    await prisma.wikiPage.createMany({ data: causeIds.map(id => ({ id: wikiId(id), siteId: siteId(id), title: "Nota de investigación", slug: "nota", content: `Fundamentación ${token}` })) });
    await prisma.documento.createMany({ data: [
      ...causeIds.map(id => ({ id: docId(id), causaId: id, nombre: "Fuente ficticia", extractedMarkdown: `Fundamentación ${token}` })),
      { id: flagged[0], causaId: publicIds[0], nombre: `Fundamentación ${token}`, confidencial: true },
      { id: flagged[1], causaId: publicIds[0], nombre: `Fundamentación ${token}`, privilegio: true },
    ] });

    // Reproduce the old limit-before-policy query: all ten matches are excluded.
    const previousCandidates = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Causa"
      WHERE to_tsvector('spanish', unaccent(titulo)) @@ plainto_tsquery('spanish', unaccent(${q}))
      ORDER BY id ASC LIMIT 10
    `;
    assert.equal(previousCandidates.length, 10);
    assert.ok(previousCandidates.every(row => hidden.includes(row.id)));
    assert.equal(await prisma.causa.count({ where: { AND: [causaAccessWhere(actor), { id: { in: previousCandidates.map(row => row.id) } }] } }), 0);

    let batches = 0;
    const authorizedCauses = (user = actor) => (ids: string[]) => {
      batches++;
      return prisma.causa.findMany({ where: { AND: [causaAccessWhere(user), { id: { in: ids } }] }, select: { id: true } });
    };
    const found = await ftsCausaIds(prisma, q, authorizedCauses(), 10);
    assert.deepEqual(found, [active, ...publicIds.slice(0, 9)]);
    assert.equal(batches, 2, "Visible matches beyond the first full excluded batch remain discoverable");
    const documents = await ftsDocumentoIds(prisma, q, ids => prisma.documento.findMany({
      where: { AND: [documentReadWhere(actor), confidentialWhere(actor), { id: { in: ids } }] }, select: { id: true },
    }), 10);
    assert.deepEqual(documents, [active, ...publicIds.slice(0, 9)].map(docId), "Markdown content is searchable; confidential and privileged sources do not consume the limit");
    const wiki = await ftsWikiIds(prisma, q, ids => prisma.wikiPage.findMany({
      where: { AND: [siteRelatedWhere(actor), { id: { in: ids } }] }, select: { id: true },
    }), 10);
    assert.deepEqual(wiki, [active, ...publicIds.slice(0, 9)].map(wikiId), "Space pages inherit the matter wall before counting results");

    await prisma.causaMiembro.update({ where: { causaId_userId: { causaId: active, userId: actor.id } }, data: { hasta: new Date(Date.now() - 1000) } });
    assert.deepEqual(await ftsCausaIds(prisma, q, authorizedCauses(), 10), publicIds.slice(0, 10), "Expired membership is no longer counted");
    assert.deepEqual(await ftsCausaIds(prisma, q, authorizedCauses({ ...actor, role: "admin" }), 10), publicIds.slice(0, 10), "A technical admin does not bypass the matter wall");
    const revoked = { ...actor, capabilityRevokes: "causa.read" };
    assert.deepEqual(await ftsCausaIds(prisma, q, ids => prisma.causa.findMany({ where: { AND: [causaAccessWhere(revoked), { id: { in: ids } }] }, select: { id: true } }), 10), []);
    const override = { ...actor, capabilityGrants: "causa.override_walls" };
    assert.deepEqual(await ftsCausaIds(prisma, q, ids => prisma.causa.findMany({ where: { AND: [causaAccessWhere(override), { id: { in: ids } }] }, select: { id: true } }), 10), hidden.slice(0, 10));
    console.log("search PostgreSQL OK: 105 excluded matches, 10 authorized results, Spanish accents, extracted text, wiki walls, flags, active/future/expired membership, revoked read and explicit override");
  } finally {
    globalThis.fetch = previousFetch;
    await prisma.documento.deleteMany({ where: { id: { in: [...causeIds.map(docId), ...flagged] } } });
    await prisma.site.deleteMany({ where: { id: { in: causeIds.map(siteId) } } });
    await prisma.causa.deleteMany({ where: { id: { in: causeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, owner] } } });
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
