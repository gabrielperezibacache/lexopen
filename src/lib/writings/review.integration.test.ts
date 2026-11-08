import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createCaseWriting, readCaseWriting, reviewCaseWriting, saveCaseWriting } from "./service";
import { exportCaseWritingDocx } from "./export";
const status = (value: number) => (error: unknown) => (error as { status?: number }).status === value;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = []; let causeId = "";
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@review.invalid`, name: "Profesional ficticio", role: "abogado", password: "no-login" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@review.invalid`, name: "Otro profesional", role: "abogado", password: "no-login" } }); users.push(other.id);
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causeId = cause.id;
    let draft = (await createCaseWriting(cause.id, { requestId: randomUUID(), title: "Revisión ficticia", body: "Texto de autor ficticio." }, owner)).draft;
    const review = { requestId: randomUUID(), expectedRevision: draft.revision, decision: "approved", citationsChecked: true, note: "Cotejo profesional ficticio" };
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "escrito.approve" } });
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, review, owner), status(403));
    assert.equal((await readCaseWriting(cause.id, draft.id, owner)).canReview, false);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, { ...review, citationsChecked: false }, owner), { name: "ZodError" });
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, review, other), status(404));
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved" }), status(409));
    await withRejectedAudit(owner.id, "case.writing.review", async () => {
      await assert.rejects(reviewCaseWriting(cause.id, draft.id, review, owner), status(500));
      assert.equal(await prisma.caseWritingReview.count({ where: { draftId: draft.id } }), 0);
    });
    const concurrent = await Promise.all([reviewCaseWriting(cause.id, draft.id, review, owner), reviewCaseWriting(cause.id, draft.id, review, owner)]);
    assert.equal(await prisma.caseWritingReview.count({ where: { draftId: draft.id } }), 1);
    assert.equal(concurrent[0].draft.review?.id, concurrent[1].draft.review?.id);
    assert.equal(concurrent[0].draft.review?.reviewerId, owner.id);
    assert.equal((await reviewCaseWriting(cause.id, draft.id, review, owner)).reused, true);
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, { ...review, note: "Changed" }, owner), status(409));
    await withRejectedAudit(owner.id, "case.writing.export", async () => {
      await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved" }), status(500));
      assert.equal(await prisma.caseWritingExport.count({ where: { draftId: draft.id } }), 0);
    });
    const output = await exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved", expectedRevision: draft.revision });
    const receipt = await prisma.caseWritingExport.findUniqueOrThrow({ where: { id: output.receiptId } });
    assert.equal(receipt.contentSha256, createHash("sha256").update(output.content).digest("hex"));
    assert.equal(receipt.bytes, output.content.length); assert.equal(receipt.reviewId, concurrent[0].draft.review?.id);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "escrito.approve" } });
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, review, owner), status(403));
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved" }), status(403));
    await exportCaseWritingDocx(cause.id, draft.id, owner);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    draft = (await saveCaseWriting(cause.id, draft.id, { requestId: randomUUID(), expectedRevision: draft.revision, title: draft.title, body: "Texto modificado después de aprobar." }, owner)).draft;
    assert.equal(draft.review?.current, false);
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved" }), status(409));
    assert.equal((await reviewCaseWriting(cause.id, draft.id, review, owner)).draft.review?.current, false, "old receipt cannot approve a new revision");
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { expectedRevision: 1 }), status(409));
    await exportCaseWritingDocx(cause.id, draft.id, owner);
    await reviewCaseWriting(cause.id, draft.id, { ...review, requestId: randomUUID(), expectedRevision: draft.revision, decision: "changes_requested", citationsChecked: false }, owner);
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner, prisma, { purpose: "approved" }), status(409));
    draft = (await saveCaseWriting(cause.id, draft.id, { requestId: randomUUID(), expectedRevision: draft.revision, title: draft.title, body: "Cita desconocida [^R999]." }, owner)).draft;
    await assert.rejects(reviewCaseWriting(cause.id, draft.id, { ...review, requestId: randomUUID(), expectedRevision: draft.revision }, owner), status(409));
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: other.id } });
    await assert.rejects(readCaseWriting(cause.id, draft.id, owner), status(404));
    await assert.rejects(exportCaseWritingDocx(cause.id, draft.id, owner), status(404));
    console.log("Writing review passed: explicit citation check, version binding, private owner, concurrent replay, atomic audit failures, changed-content invalidation, stale export denial and byte-verified generation receipts.");
  } finally {
    if (causeId) { await prisma.caseWritingDraft.deleteMany({ where: { causaId: causeId } }); await prisma.causa.deleteMany({ where: { id: causeId } }); }
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
