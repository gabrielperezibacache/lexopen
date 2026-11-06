import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createFeedback, readFeedback, updateFeedback } from "./service";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = randomUUID(), userIds: string[] = [];
  try {
    async function fixture(role: string) {
      const row = await db.user.create({
        data: { role, name: `Feedback ${role}`, email: `${tag}-${role}@feedback.invalid`, password: "not-a-login" },
      });
      userIds.push(row.id);
      return row;
    }
    const [author, colleague, admin, client] = await Promise.all(["abogado", "socio", "admin", "cliente"].map(fixture));
    const requestId = `feedback:${tag}`;
    const input = { requestId, category: "sugerencia", title: "  Una mejora  ", details: "  Datos ficticios.\nOtra línea.  " };
    await assert.rejects(createFeedback({ ...input, details: "x".repeat(3001) }, author, db));
    await assert.rejects(createFeedback({ ...input, category: "publicar" }, author, db));
    await assert.rejects(createFeedback({ ...input, attachment: "not allowed" }, author, db));
    await assert.rejects(createFeedback(input, client, db), statusIs(403));
    await assert.rejects(readFeedback(client, null, db), statusIs(403));

    const [first, duplicate] = await Promise.all([createFeedback(input, author, db), createFeedback(input, author, db)]);
    assert.equal(first.id, duplicate.id);
    assert.equal(first.status, "nuevo");
    assert.equal(first.title, "Una mejora");
    assert.equal(first.details, "Datos ficticios.\nOtra línea.");
    assert.equal(first.author, undefined);
    await assert.rejects(createFeedback({ ...input, title: "Otro título" }, author, db), statusIs(409));

    const other = await createFeedback({ ...input, title: "Otra persona" }, colleague, db);
    assert.notEqual(other.id, first.id, "request keys are scoped to the author");
    assert.deepEqual((await readFeedback(author, null, db)).feedback.map(item => item.id), [first.id]);
    assert.deepEqual((await readFeedback(colleague, null, db)).feedback.map(item => item.id), [other.id]);
    await assert.rejects(updateFeedback({ id: first.id, status: "resuelto" }, colleague, db), statusIs(403));
    await assert.rejects(updateFeedback({ id: first.id, status: "resuelto" }, author, db), statusIs(403));

    const adminPage = await readFeedback(admin, null, db);
    assert.equal(adminPage.canManage, true);
    const adminItem = adminPage.feedback.find(item => item.id === first.id);
    assert.deepEqual(adminItem?.author, { id: author.id, name: author.name });
    assert.ok(!JSON.stringify(adminItem).includes(author.email));
    const updated = await updateFeedback({ id: first.id, status: "en_revision" }, admin, db);
    assert.equal(updated.status, "en_revision");
    assert.equal((await updateFeedback({ id: first.id, status: "en_revision" }, admin, db)).updatedAt, updated.updatedAt);
    assert.equal((await createFeedback(input, author, db)).status, "en_revision");

    await db.user.update({ where: { id: admin.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateFeedback({ id: first.id, status: "resuelto" }, admin, db), statusIs(403));
    assert.deepEqual(await readFeedback(admin, null, db), { feedback: [], canManage: false, nextCursor: null });

    await db.feedback.createMany({ data: Array.from({ length: 30 }, (_, index) => ({
      ownerId: author.id,
      requestId: `pagination:${tag}:${index}`,
      category: "otro",
      title: `Comentario ${index}`,
      details: "Ficticio",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    })) });
    const page = await readFeedback(author, null, db);
    assert.equal(page.feedback.length, 30);
    assert.ok(page.nextCursor);
    const tail = await readFeedback(author, page.nextCursor, db);
    assert.equal(tail.feedback.length, 1);
    assert.equal(tail.nextCursor, null);
    assert.equal(new Set([...page.feedback, ...tail.feedback].map(item => item.id)).size, 31);
    await assert.rejects(readFeedback(author, "bad-cursor", db), statusIs(400));
    console.log("Feedback integration passed: private ownership, admin role and revocation, bounded validation, concurrent idempotency, pagination and status.");
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
