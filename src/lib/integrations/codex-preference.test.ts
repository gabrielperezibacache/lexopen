import assert from "node:assert/strict";

async function main() {
  const globals = globalThis as unknown as { prisma?: unknown };
  const previousPrisma = globals.prisma;
  type Row = { provider: string; enabled: boolean; configJson: string };
  const rows = new Map<string, Row>();
  let reads = 0, mismatched = false;
  globals.prisma = { integrationConfig: {
    findUnique: async ({ where }: { where: { provider: string } }) => {
      reads++;
      return mismatched ? rows.get("codex:actor_a") : rows.get(where.provider) || null;
    },
    upsert: async ({ where, create, update }: { where: { provider: string }; create: Row; update: Omit<Row, "provider"> }) => {
      const row = rows.has(where.provider) ? { provider: where.provider, ...update } : create;
      rows.set(where.provider, row);
      return row;
    },
  } };
  try {
    const { assertPersonalCodexAction, canUsePersonalCodex, personalCodexPreference, savePersonalCodexPreference } = await import("./codex-preference");
    const uses = ["connect", "models", "test", "save"] as const;
    const cleanup = ["cancel", "disconnect", "save"] as const;
    for (const role of ["admin", "socio", "abogado", "procurador", "asistente", "contabilidad"]) {
      const actor = { role };
      assert.equal(canUsePersonalCodex(actor), true, `${role} uses its own connection`);
      for (const action of uses) {
        assert.doesNotThrow(() => assertPersonalCodexAction(actor, action, false, true));
        assert.throws(() => assertPersonalCodexAction(actor, action, true, true), { status: 403 });
      }
      const revoked = { role, capabilityGrants: "assistant.use,host.admin", capabilityRevokes: "assistant.use" };
      assert.equal(canUsePersonalCodex(revoked), false);
      for (const action of uses) assert.throws(() => assertPersonalCodexAction(revoked, action, false, true), { status: 403 });
      for (const action of cleanup) assert.doesNotThrow(() => assertPersonalCodexAction(revoked, action, true, false));
    }
    for (const role of ["cliente", "externo", "unknown"]) {
      const actor = { role, capabilityGrants: "assistant.use,host.admin" };
      assert.equal(canUsePersonalCodex(actor), false, "a grant does not cross the staff boundary");
      for (const action of [...uses, ...cleanup]) assert.throws(() => assertPersonalCodexAction(actor, action, false), { status: 403 });
    }
    await savePersonalCodexPreference("actor_a", { enabled: true, model: "model-a" });
    await savePersonalCodexPreference("actor_b", { enabled: false, model: "model-b" });
    assert.deepEqual(await personalCodexPreference("actor_a"), { enabled: true, model: "model-a" });
    assert.deepEqual(await personalCodexPreference("actor_b"), { enabled: false, model: "model-b" });
    await savePersonalCodexPreference("actor_b", { enabled: true, model: "model-b" });
    assert.deepEqual(await personalCodexPreference("actor_a"), { enabled: true, model: "model-a" });
    mismatched = true;
    assert.deepEqual(await personalCodexPreference("actor_b"), { enabled: false, model: "" });
    mismatched = false;
    for (const configJson of ["null", "[]", "{bad", '{"model":123}']) {
      rows.set("codex:actor_a", { provider: "codex:actor_a", enabled: true, configJson });
      assert.deepEqual(await personalCodexPreference("actor_a"), { enabled: true, model: "" });
    }
    const before = reads;
    await assert.rejects(personalCodexPreference("actor_a:actor_b"), { status: 400 });
    await assert.rejects(savePersonalCodexPreference("../actor_b", { enabled: true, model: "model" }), { status: 400 });
    assert.equal(reads, before, "invalid identity must not query another namespace");
  } finally { globals.prisma = previousPrisma; }
  console.log("Personal Codex permissions: role hierarchy, revocation cleanup, local policy and actor isolation passed (zero network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
