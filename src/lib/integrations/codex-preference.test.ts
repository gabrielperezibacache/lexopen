import assert from "node:assert/strict";

async function main() {
  type Row = { provider: string; enabled: boolean; configJson: string };
  const globals = globalThis as unknown as { prisma?: unknown }, previous = globals.prisma;
  const rows = new Map<string, Row>();
  let simulateConcurrentSave = false, mismatched = false, reads = 0;
  const client = { integrationConfig: {
    findUnique: async ({ where }: { where: { provider: string } }) => { reads++; return mismatched ? rows.get("codex:alice") ?? null : rows.get(where.provider) ?? null; },
    upsert: async ({ where, create, update }: { where: { provider: string }; create: Row; update: Omit<Row, "provider"> }) => { const row = rows.has(where.provider) ? { ...rows.get(where.provider)!, ...update } : create; rows.set(where.provider, row); return row; },
    updateMany: async ({ where, data }: { where: { provider: string; configJson: string }; data: { configJson: string } }) => {
      const row = rows.get(where.provider);
      if (simulateConcurrentSave && row) { simulateConcurrentSave = false; row.configJson = JSON.stringify({ model: "concurrent", source: "host", revision: "concurrent" }); return { count: 0 }; }
      if (!row || row.configJson !== where.configJson) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
  } };
  globals.prisma = client;
  try {
    const { assertPersonalCodexAction, canUsePersonalCodex, personalCodexPreference, savePersonalCodexPreference, rotatePersonalCodexRevision, hostCodexPolicy, saveHostCodexPolicy } = await import("./codex-preference");
    const { codexDestinationFor } = await import("./codex-destination");
    const uses = ["connect", "models", "test", "save"] as const;
    const cleanup = ["cancel", "disconnect", "save"] as const;
    for (const role of ["admin", "socio", "abogado", "procurador", "asistente", "contabilidad"]) {
      const actor = { role };
      assert.equal(canUsePersonalCodex(actor), true, `${role} uses its own connection`);
      for (const action of uses) {
        assert.doesNotThrow(() => assertPersonalCodexAction(actor, action, false, true));
        assert.throws(() => assertPersonalCodexAction(actor, action, true, true), { status: 403 });
      }
      const revokedActor = { role, capabilityGrants: "assistant.use,host.admin", capabilityRevokes: "assistant.use" };
      assert.equal(canUsePersonalCodex(revokedActor), false);
      for (const action of uses) assert.throws(() => assertPersonalCodexAction(revokedActor, action, false, true), { status: 403 });
      for (const action of cleanup) assert.doesNotThrow(() => assertPersonalCodexAction(revokedActor, action, true, false));
    }
    for (const role of ["cliente", "externo", "unknown"]) {
      const actor = { role, capabilityGrants: "assistant.use,host.admin" };
      assert.equal(canUsePersonalCodex(actor), false, "a grant does not cross the staff boundary");
      for (const action of [...uses, ...cleanup]) assert.throws(() => assertPersonalCodexAction(actor, action, false), { status: 403 });
    }
    assert.deepEqual(await personalCodexPreference("alice"), { enabled: false, model: "", source: "personal", revision: "legacy" });
    assert.deepEqual(await hostCodexPolicy(), { enabled: false, revision: "legacy" });
    rows.set("codex:alice", { provider: "codex:alice", enabled: true, configJson: JSON.stringify({ model: "legacy-model" }) });
    const legacy = await personalCodexPreference("alice"); assert.equal(legacy.source, "personal"); assert.equal(legacy.revision, (await personalCodexPreference("alice")).revision);
    rows.set("codex:bad", { provider: "codex:bad", enabled: true, configJson: "null" }); assert.equal((await personalCodexPreference("bad")).source, "personal");
    const personal = await savePersonalCodexPreference("alice", { enabled: true, model: "same-model" });
    const personalDestination = await codexDestinationFor("alice", personal);
    const host = await savePersonalCodexPreference("alice", { enabled: true, model: "same-model", source: "host" });
    assert.notEqual(personal.revision, host.revision);
    const disabledDestination = await codexDestinationFor("alice", host); assert.equal(disabledDestination.permitted, false);
    const shared = await saveHostCodexPolicy(true);
    const hostDestination = await codexDestinationFor("alice", host); assert.equal(hostDestination.permitted, true); assert.match(hostDestination.endpoint, /Host/);
    assert.notEqual(personalDestination.endpointHash, hostDestination.endpointHash);
    assert.notEqual((await codexDestinationFor("bob", host)).endpointHash, hostDestination.endpointHash, "approval is actor-bound");
    await savePersonalCodexPreference("bob", { enabled: false, model: "other-model" });
    assert.deepEqual(await personalCodexPreference("alice"), host, "another user's preference cannot replace this connection");
    assert.deepEqual(await personalCodexPreference("bob"), { enabled: false, model: "other-model", source: "personal", revision: (await personalCodexPreference("bob")).revision });
    mismatched = true;
    assert.deepEqual(await personalCodexPreference("bob"), { enabled: false, model: "", source: "personal", revision: "legacy" }, "a row from another user is ignored");
    mismatched = false;
    for (const configJson of ["null", "[]", "{bad", '{"model":123}']) {
      rows.set("codex:alice", { provider: "codex:alice", enabled: true, configJson });
      assert.equal((await personalCodexPreference("alice")).model, "");
    }
    rows.set("codex:alice", { provider: "codex:alice", enabled: true, configJson: JSON.stringify({ model: "same-model", source: "host", revision: "safe" }) });
    rows.delete("codex:bob");
    const revoked = await saveHostCodexPolicy(false); assert.equal((await codexDestinationFor("alice", host)).permitted, false);
    await assert.rejects(saveHostCodexPolicy(true, undefined, shared.revision), error => (error as { status?: number }).status === 409, "an enable checked before a concurrent account change cannot restore sharing");
    assert.equal((await hostCodexPolicy()).enabled, false);
    await saveHostCodexPolicy(true, undefined, revoked.revision); assert.equal((await hostCodexPolicy()).enabled, true);
    const reshared = await saveHostCodexPolicy(true); assert.notEqual(shared.revision, reshared.revision); assert.notEqual((await codexDestinationFor("alice", host)).endpointHash, hostDestination.endpointHash, "revoking and re-enabling invalidates old approvals");
    simulateConcurrentSave = true; await rotatePersonalCodexRevision("alice");
    const rotated = await personalCodexPreference("alice"); assert.equal(rotated.model, "concurrent"); assert.equal(rotated.source, "host"); assert.notEqual(rotated.revision, "concurrent");
    assert.deepEqual(await personalCodexPreference("bob"), { enabled: false, model: "", source: "personal", revision: "legacy" });
    await rotatePersonalCodexRevision("bob"); assert.equal(rows.has("codex:bob"), false);
    const beforeInvalidIdentity = reads;
    await assert.rejects(personalCodexPreference("alice:bob"), { status: 400 });
    await assert.rejects(savePersonalCodexPreference("../bob", { enabled: true, model: "model" }), { status: 400 });
    assert.equal(reads, beforeInvalidIdentity, "invalid identity must not query another namespace");
    assert.ok(!JSON.stringify([...rows.values()]).includes("Token"));
  } finally { globals.prisma = previous; }
  console.log("Codex preferences: legacy compatibility, opt-in Host, isolated choice, revisions and concurrent rotation passed (zero DB/network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
