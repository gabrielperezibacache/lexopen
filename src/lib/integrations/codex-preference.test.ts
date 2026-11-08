import assert from "node:assert/strict";

async function main() {
  type Row = { provider: string; enabled: boolean; configJson: string };
  const globals = globalThis as unknown as { prisma?: unknown }, previous = globals.prisma;
  const rows = new Map<string, Row>();
  let simulateConcurrentSave = false;
  const client = { integrationConfig: {
    findUnique: async ({ where }: { where: { provider: string } }) => rows.get(where.provider) ?? null,
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
    const { personalCodexPreference, savePersonalCodexPreference, rotatePersonalCodexRevision, hostCodexPolicy, saveHostCodexPolicy } = await import("./codex-preference");
    const { codexDestinationFor } = await import("./codex-destination");
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
    const revoked = await saveHostCodexPolicy(false); assert.equal((await codexDestinationFor("alice", host)).permitted, false);
    await assert.rejects(saveHostCodexPolicy(true, undefined, shared.revision), error => (error as { status?: number }).status === 409, "an enable checked before a concurrent account change cannot restore sharing");
    assert.equal((await hostCodexPolicy()).enabled, false);
    await saveHostCodexPolicy(true, undefined, revoked.revision); assert.equal((await hostCodexPolicy()).enabled, true);
    const reshared = await saveHostCodexPolicy(true); assert.notEqual(shared.revision, reshared.revision); assert.notEqual((await codexDestinationFor("alice", host)).endpointHash, hostDestination.endpointHash, "revoking and re-enabling invalidates old approvals");
    simulateConcurrentSave = true; await rotatePersonalCodexRevision("alice");
    const rotated = await personalCodexPreference("alice"); assert.equal(rotated.model, "concurrent"); assert.equal(rotated.source, "host"); assert.notEqual(rotated.revision, "concurrent");
    assert.deepEqual(await personalCodexPreference("bob"), { enabled: false, model: "", source: "personal", revision: "legacy" });
    await rotatePersonalCodexRevision("bob"); assert.equal(rows.has("codex:bob"), false);
    assert.ok(!JSON.stringify([...rows.values()]).includes("Token"));
  } finally { globals.prisma = previous; }
  console.log("Codex preferences: legacy compatibility, opt-in Host, isolated choice, revisions and concurrent rotation passed (zero DB/network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
