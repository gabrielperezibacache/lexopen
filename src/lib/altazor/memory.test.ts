import assert from "node:assert/strict";
import { createMemoryNodeSchema, createMemoryEdgeSchema, updateMemorySchema, memoryScopeKey, rankMemory, MEMORY_LIMITS } from "./memory-types";
import { captureMemorySupport, verifyMemorySupport, bookMemoryIdentity } from "./memory-supports";
import type { BookClient } from "@/lib/books/access";
import type { BookCitation } from "@/lib/books/types";
import { sha256 } from "@/lib/evidence/fragments";

async function main() {
  assert.notEqual(memoryScopeKey(), memoryScopeKey("case-fixture"));
  assert.throws(() => memoryScopeKey("../case"));
  const input = { requestId: "fixture-request", expectedEpoch: 1, kind: "preference", label: "Redacción clara", body: "Prefiero párrafos breves", supports: [{ kind: "manual" }] };
  assert.equal(createMemoryNodeSchema.safeParse(input).success, true);
  assert.equal(createMemoryNodeSchema.safeParse({ ...input, ownerId: "other" }).success, false, "Caller cannot choose another memory owner");
  assert.equal(createMemoryNodeSchema.safeParse({ ...input, expectedEpoch: undefined }).success, false, "Late jobs must retain the prepared epoch");
  assert.equal(createMemoryNodeSchema.safeParse({ ...input, supports: Array(MEMORY_LIMITS.supports + 1).fill({ kind: "manual" }) }).success, false);
  assert.equal(createMemoryEdgeSchema.safeParse({ requestId: "fixture-relation", expectedEpoch: 1, fromId: "same", toId: "same", relation: "relates", supports: [{ kind: "manual" }] }).success, false);
  assert.equal(updateMemorySchema.safeParse({ requestId: "fixture-change", target: "node", expectedRevision: 1, action: "confirm", ownerId: "other" }).success, false);
  assert.deepEqual(rankMemory([{ label: "Audiencia", body: "" }, { label: "Redacción", body: "Audiencia preparada" }], "audiencia" ).map(row => row.label), ["Audiencia", "Redacción"]);
  assert.deepEqual(rankMemory([{ label: "Redacción", body: "" }], "redaccion").length, 1);
  assert.deepEqual(rankMemory([{ label: "Redacción", body: "" }], ""), []);
  const actor = { id: "memory-owner", role: "abogado" }, target = { causaId: null, scopeKey: "personal", text: "Redacción clara\nPrefiero párrafos breves", manualAllowed: true };
  const client = {} as BookClient;
  const support = { id: "support-fixture", ...await captureMemorySupport({ kind: "manual" }, actor, target, client) };
  const verified = await verifyMemorySupport(support, actor, target, client);
  assert.equal(verified.kind, "manual"); assert.equal(verified.quote, target.text);
  await assert.rejects(captureMemorySupport({ kind: "manual" }, actor, { ...target, manualAllowed: false }, client));
  await assert.rejects(verifyMemorySupport(support, { ...actor, id: "other" }, target, client));
  await assert.rejects(verifyMemorySupport(support, actor, { ...target, scopeKey: "causa:other" }, client));
  await assert.rejects(verifyMemorySupport(support, actor, { ...target, text: "Modified preference" }, client));
  await assert.rejects(verifyMemorySupport({ ...support, snapshotJson: "{}" }, actor, target, client));
  await assert.rejects(verifyMemorySupport({ ...support, sourceKey: sha256("other") }, actor, target, client));
  const citation = { sourceKey: "a", sourceSha256: "b", textSha256: "c", quoteSha256: "d", pageNumber: null, locatorLabel: "Fragment", href: "/biblioteca/fixture", verificationBasis: "original" } as BookCitation;
  assert.notDeepEqual(bookMemoryIdentity(citation), bookMemoryIdentity({ ...citation, verificationBasis: "retained_text", retainedSha256: "new" }));
  console.log("Altazor memory units passed: strict owner/scope/epoch contracts, bounded inputs, lexical retrieval and manual/source identity gates; no DB/network");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
