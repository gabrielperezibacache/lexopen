import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_MODELS } from "./local-model-profiles";
import {
  canonicalLocalModelState,
  localModelInventory,
  localModelRecommendations,
  normalizeLocalModelHardware,
  sanitizeInstalledLocalModels,
} from "./local-model-hardware";

const GIB = 1024 ** 3;
const observations = { platform: "linux", arch: "x64", cpuName: "Synthetic CPU", cpuCores: 8, totalMemoryBytes: 32 * GIB, freeMemoryBytes: 20 * GIB, availableMemoryBytes: 19 * GIB, diskFreeBytes: 30 * GIB };

test("container limits and current process headroom override the physical machine", () => {
  const unconstrained = normalizeLocalModelHardware(observations);
  assert.equal(localModelRecommendations(unconstrained)[0].candidateId, "qwen-small");
  const constrained = normalizeLocalModelHardware({ ...observations, constrainedMemoryBytes: 2 * GIB, availableMemoryBytes: .5 * GIB });
  assert.equal(constrained.totalMemoryBytes, 2 * GIB);
  assert.equal(constrained.availableMemoryBytes, .5 * GIB);
  assert.ok(localModelRecommendations(constrained).every(result => result.candidateId === null));
  assert.equal(normalizeLocalModelHardware({ ...observations, constrainedMemoryBytes: 0 }).totalMemoryBytes, observations.totalMemoryBytes);
  assert.equal(normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 0 }).availableMemoryBytes, 0, "zero current memory is a real observation, not an unsupported API");
  assert.equal(normalizeLocalModelHardware({ ...observations, availableMemoryBytes: undefined }).availableMemoryBytes, observations.freeMemoryBytes);
});

test("recommendations shrink with memory pressure and reserve headroom for browser work", () => {
  const medium = normalizeLocalModelHardware({ ...observations, availableMemoryBytes: Math.floor(4.7 * GIB) });
  const recommendations = localModelRecommendations(medium);
  assert.equal(recommendations.find(result => result.purpose === "documents")?.candidateId, "qwen-mini");
  assert.equal(recommendations.find(result => result.purpose === "writing")?.candidateId, "gemma-small");
  assert.equal(recommendations.find(result => result.purpose === "browser")?.candidateId, null);
  assert.match(recommendations.find(result => result.purpose === "browser")!.reason, /acciones del navegador.*permisos/);
  assert.ok(recommendations.every(result => result.estimate === true));
  const exhausted = normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 512 * 1024 ** 2 });
  assert.ok(localModelRecommendations(exhausted).every(result => result.candidateId === null && result.memoryBudgetBytes === 0));
});

test("unknown or insufficient disk capacity does not recommend a new download", () => {
  const noDisk = normalizeLocalModelHardware({ ...observations, diskFreeBytes: null });
  assert.ok(localModelRecommendations(noDisk).every(result => result.candidateId === null));
  const existing = localModelRecommendations(noDisk, ["qwen-mini"]);
  assert.ok(existing.every(result => result.candidateId === "qwen-mini"));
  const lowDisk = normalizeLocalModelHardware({ ...observations, diskFreeBytes: 300 * 1024 ** 2 });
  assert.ok(localModelRecommendations(lowDisk).every(result => result.candidateId === null));
  assert.ok(localModelRecommendations(normalizeLocalModelHardware({ ...observations, diskFreeBytes: 2 * GIB })).every(result => result.candidateId === "qwen-mini"));
});

test("unavailable observations remain unknown without exposing paths or claiming GPU support", () => {
  const unavailable = normalizeLocalModelHardware({ platform: "/private/host", arch: "invalid\narch", cpuName: " Synthetic\nCPU\u202e ", totalMemoryBytes: Number.NaN, freeMemoryBytes: Infinity, availableMemoryBytes: -1, diskFreeBytes: -5, cpuCores: 0 });
  assert.deepEqual(unavailable, { platform: "unknown", arch: "unknown", cpuName: "Synthetic CPU", cpuCores: 1, totalMemoryBytes: 0, availableMemoryBytes: 0, diskFreeBytes: null, scope: "host", gpu: "unknown" });
  assert.ok(localModelRecommendations(unavailable).every(result => result.candidateId === null));
  assert.equal(normalizeLocalModelHardware({ ...observations, freeMemoryBytes: 2 * GIB, availableMemoryBytes: 10 * GIB }).availableMemoryBytes, 2 * GIB);
});

test("inventory verifies aliases by digest and size but activation still needs the canonical tag", () => {
  const profile = LOCAL_MODELS[1];
  const alias = sanitizeInstalledLocalModels([{ name: "estudio/mini:local", size: profile.bytes, digest: profile.sha256.toUpperCase(), extra: "/private/never-return-this" }]);
  const inventory = localModelInventory(alias);
  assert.deepEqual(inventory.installed, [{ name: "estudio/mini:local", size: profile.bytes, digest: `sha256:${profile.sha256}`, catalogId: profile.id, state: "verified" }]);
  assert.equal(canonicalLocalModelState(profile, alias), "missing");
  const canonical = sanitizeInstalledLocalModels([{ name: profile.tag, size: profile.bytes, digest: `sha256:${profile.sha256}` }]);
  assert.equal(canonicalLocalModelState(profile, canonical), "ready");
  const changed = sanitizeInstalledLocalModels([{ name: profile.tag, size: profile.bytes, digest: "0".repeat(64) }]);
  assert.equal(canonicalLocalModelState(profile, [...alias, ...changed]), "different");
  assert.equal(canonicalLocalModelState(profile, [...canonical, ...changed]), "different", "ambiguous duplicate canonical tags must not activate");
  const wrongSize = sanitizeInstalledLocalModels([{ name: profile.tag, size: profile.bytes + 1, digest: profile.sha256 }]);
  assert.equal(localModelInventory(wrongSize).installed[0].state, "unmanaged");
});

test("inventory bounds untrusted metadata and the visible window", () => {
  const unsafe = sanitizeInstalledLocalModels([
    null, {}, { name: "a\nprivate", size: 20 }, { name: "a".repeat(201), size: 20 }, { name: "model", size: -1 }, { name: "model", size: 1024 ** 4 + 1 },
    { name: "model:unknown", size: 123, digest: "not-a-digest/private/path", path: "/private/path" },
  ]);
  assert.deepEqual(unsafe, [{ name: "model:unknown", size: 123 }]);
  assert.equal(localModelInventory(unsafe).installed[0].state, "unmanaged");
  const many = sanitizeInstalledLocalModels(Array.from({ length: 1001 }, (_, index) => ({ name: `model-${index}:local`, size: 1024 })));
  const inventory = localModelInventory(many);
  assert.equal(many.length, 1000);
  assert.equal(inventory.installed.length, 100);
  assert.equal(inventory.installedCount, 1000);
  assert.equal(inventory.installedLimited, true);
});
