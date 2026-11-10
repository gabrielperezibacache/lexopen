/** Disposable PostgreSQL and synthetic views; no gateway, account or notification traffic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { reconcileComputerHelp } from "./reconciler";
import type { ComputerSessionView } from "../computer/types";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const client = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID();
  let ownerId = "", workspaceId = "", organizationId = "";
  const previous = await client.firmSettings.findFirst({ select: { id: true, assistantLlmMode: true } });
  try {
    if (previous) await client.firmSettings.update({ where: { id: previous.id }, data: { assistantLlmMode: "remote_allowed" } });
    else organizationId = (await client.organization.create({ data: { name: "Fictitious fairness study", settings: { create: { assistantLlmMode: "remote_allowed" } } } })).id;
    ownerId = (await client.user.create({ data: { email: `${tag}@fairness.invalid`, name: "Fictitious worker", role: "abogado", password: "not-a-login" } })).id;
    workspaceId = (await client.altazorComputerWorkspace.create({ data: { ownerId, scopeKey: "personal", endpoint: `http://127.0.0.1:19451`, providerName: "unused-fixture", credentialEnc: "not-used-by-synthetic-reader", enabled: true, dedicatedDeclaredAt: new Date() } })).id;
    const heldAt = new Date(Date.now() - 60_000);
    const held = await client.altazorComputerSession.create({ data: { id: `a-${tag}`, ownerId, workspaceId, requestId: `held-${tag}`, kittyName: `held-${tag}`, state: "ready", held: true, expiresAt: null, updatedAt: heldAt } });
    const active = await client.altazorComputerSession.create({ data: { id: `b-${tag}`, ownerId, workspaceId, requestId: `active-${tag}`, kittyName: `active-${tag}`, state: "ready", expiresAt: null } });
    const reads: string[] = [];
    const deps = {
      client,
      read: async (_user: unknown, id: string): Promise<ComputerSessionView> => {
        reads.push(id);
        return { session: { id, state: "ready", persistent: true, held: false, expiresAt: null, renewableUntil: null, canRenew: false, createdAt: active.createdAt.toISOString(), connectors: [] }, runtime: "container", kittyStatus: "running", working: false, approvals: [], turns: [] };
      },
      resume: async () => { throw new Error("No task should resume during a fairness scan"); },
    };
    await reconcileComputerHelp({ ownerId, limit: 1 }, deps);
    assert.deepEqual(reads, [], "held desktop is not read");
    const checked = await client.altazorComputerSession.findUniqueOrThrow({ where: { id: held.id } });
    assert.ok(checked.lastHelpCheckedAt);
    assert.equal(checked.updatedAt.getTime(), heldAt.getTime(), "scanning must not renew manual control or invalidate secret bindings");
    await reconcileComputerHelp({ ownerId, limit: 1 }, deps);
    assert.deepEqual(reads, [active.id], "a persistent held desktop must not starve another worker");
    console.log("Persistent help fairness PG PASS: bounded scans advance past held desktops without extending keyboard leases; synthetic only.");
  } finally {
    if (ownerId) await client.altazorComputerSession.deleteMany({ where: { ownerId } });
    if (workspaceId) await client.altazorComputerWorkspace.deleteMany({ where: { id: workspaceId } });
    if (ownerId) await client.user.deleteMany({ where: { id: ownerId } });
    if (previous) await client.firmSettings.update({ where: { id: previous.id }, data: { assistantLlmMode: previous.assistantLlmMode } });
    if (organizationId) await client.organization.deleteMany({ where: { id: organizationId } });
    await client.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
