import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";

async function main() {
  type Row = Record<string, unknown>;
  const plans = new Map<string, Row>();
  const undos = new Map<string, Row>();
  const fake = {
    assistantPlanRecord: {
      create: async ({ data }: { data: Row }) => { const row = { status: "pending", ...data }; plans.set(String(data.id), row); return row; },
      findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => {
        const row = plans.get(where.id); return row && row.ownerId === where.ownerId && row.status !== "cancelled" ? row : null;
      },
      updateMany: async ({ where }: { where: { id: string; ownerId: string } }) => {
        const row = plans.get(where.id);
        if (!row || row.ownerId !== where.ownerId) return { count: 0 };
        row.status = "cancelled"; return { count: 1 };
      },
    },
    assistantUndo: {
      create: async ({ data }: { data: Row }) => { const row = { consumedAt: null, ...data }; undos.set(String(data.id), row); return row; },
      findFirst: async ({ where }: { where: { id: string; ownerId: string; toolId?: string } }) => {
        const row = undos.get(where.id);
        return row && row.ownerId === where.ownerId && (!where.toolId || row.toolId === where.toolId) && !row.consumedAt ? row : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; ownerId: string }; data: Row }) => {
        const row = undos.get(where.id);
        if (!row || row.ownerId !== where.ownerId || row.consumedAt) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    nota: { findUnique: async () => ({ id: "note-fixture", contenido: "fixture", updatedAt: new Date("2026-11-01T12:00:00Z") }) },
  };
  (globalThis as unknown as { prisma: unknown }).prisma = fake;
  const { getPlan, storePlan, cancelPlan, storeUndo, readUndo, consumeUndo } = await import("./plan-store");
  const { withAssistantTransaction } = await import("./transaction-context");
  const tx = fake as unknown as Prisma.TransactionClient;
  await storePlan({ id: "fixture-plan", intents: [], steps: [], needsConfirm: true }, "owner-A");
  assert.equal((await getPlan("fixture-plan", "owner-A"))?.id, "fixture-plan");
  assert.equal(await getPlan("fixture-plan", "owner-B"), null);
  assert.equal(await cancelPlan("fixture-plan", "owner-B"), false);
  assert.equal(await cancelPlan("fixture-plan", "owner-A"), true);
  assert.equal(await getPlan("fixture-plan", "owner-A"), null);
  await assert.rejects(() => storeUndo({ toolId: "nota.crear", entityType: "Nota", entityId: "note-fixture" }), /transaccional/);
  await withAssistantTransaction(tx, { userId: "owner-A", role: "abogado" }, async () => {
    const token = await storeUndo({ toolId: "nota.crear", entityType: "Nota", entityId: "note-fixture" });
    assert.equal(await readUndo(token, "owner-B", "nota.crear", tx), null);
    assert.equal(await readUndo(token, "owner-A", "nota.editar", tx), null);
    assert.ok(await readUndo(token, "owner-A", "nota.crear", tx));
    assert.equal((await consumeUndo(token))?.entityId, "note-fixture");
    assert.equal(await consumeUndo(token), null);
  });
  console.log("assistant durable store ownership tests ok");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
