import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_MODELS, LOCAL_MODELS_BY_MEMORY, configuredLocalModel, localModelProfile, localModelsForMemory, OLLAMA_LOCAL_API } from "./local-model-profiles";
import {
  canonicalLocalModelState,
  localModelInventory,
  localModelRecommendation,
  normalizeLocalModelHardware,
  sanitizeInstalledLocalModels,
} from "./local-model-hardware";

const GIB = 1024 ** 3;
const observations = { platform: "linux", arch: "x64", cpuName: "Synthetic CPU", cpuCores: 8, totalMemoryBytes: 32 * GIB, freeMemoryBytes: 20 * GIB, availableMemoryBytes: 19 * GIB, diskFreeBytes: 30 * GIB };

test("container limits and current process headroom override the physical machine", () => {
  const unconstrained = normalizeLocalModelHardware(observations);
  assert.equal(localModelRecommendation(unconstrained).candidateId, "gemma4-12b");
  const constrained = normalizeLocalModelHardware({ ...observations, constrainedMemoryBytes: 2 * GIB, availableMemoryBytes: .5 * GIB });
  assert.equal(constrained.totalMemoryBytes, 2 * GIB);
  assert.equal(constrained.availableMemoryBytes, .5 * GIB);
  assert.equal(localModelRecommendation(constrained).candidateId, null);
  assert.equal(normalizeLocalModelHardware({ ...observations, constrainedMemoryBytes: 0 }).totalMemoryBytes, observations.totalMemoryBytes);
  assert.equal(normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 0 }).availableMemoryBytes, 0, "zero current memory is a real observation, not an unsupported API");
  assert.equal(normalizeLocalModelHardware({ ...observations, availableMemoryBytes: undefined }).availableMemoryBytes, observations.freeMemoryBytes);
});

test("one recommendation shrinks with memory pressure and reserves system headroom", () => {
  const medium = normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 5 * GIB });
  const recommendation = localModelRecommendation(medium);
  assert.equal(recommendation.candidateId, "qwen-mini");
  assert.equal(recommendation.memoryBudgetBytes, 2 * GIB);
  assert.equal(recommendation.estimate, true);
  assert.equal("purpose" in recommendation, false);
  const exhausted = normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 512 * 1024 ** 2 });
  assert.deepEqual([localModelRecommendation(exhausted).candidateId, localModelRecommendation(exhausted).memoryBudgetBytes], [null, 0]);
});

test("document recommendations do not require installation, disk access or an existing model", () => {
  const noDisk = normalizeLocalModelHardware({ ...observations, diskFreeBytes: null });
  assert.equal(localModelRecommendation(noDisk).candidateId, "gemma4-12b");
  assert.equal(localModelRecommendation(noDisk).downloadFits, null);
  assert.equal(localModelRecommendation(noDisk, ["qwen-mini"]).candidateId, "gemma4-12b", "an installed tiny model must not override the document recommendation");
  const lowDisk = normalizeLocalModelHardware({ ...observations, diskFreeBytes: 300 * 1024 ** 2 });
  assert.equal(localModelRecommendation(lowDisk).candidateId, "gemma4-12b");
  assert.equal(localModelRecommendation(lowDisk).downloadFits, false);
});

test("unavailable observations remain unknown without exposing paths or claiming GPU support", () => {
  const unavailable = normalizeLocalModelHardware({ platform: "/private/host", arch: "invalid\narch", cpuName: " Synthetic\nCPU\u202e ", totalMemoryBytes: Number.NaN, freeMemoryBytes: Infinity, availableMemoryBytes: -1, diskFreeBytes: -5, cpuCores: 0 });
  assert.deepEqual(unavailable, { platform: "unknown", arch: "unknown", cpuName: "Synthetic CPU", cpuCores: 1, totalMemoryBytes: 0, availableMemoryBytes: 0, diskFreeBytes: null, scope: "host", gpu: "unknown", gpus: [], memoryKind: "ram", unifiedMemoryBytes: null, availableMemorySource: "os" });
  assert.equal(localModelRecommendation(unavailable).candidateId, null);
  assert.equal(normalizeLocalModelHardware({ ...observations, freeMemoryBytes: 2 * GIB, availableMemoryBytes: 10 * GIB }).availableMemoryBytes, 2 * GIB);
});

test("memory planning keeps RAM, VRAM and unified capacities separate", () => {
  assert.deepEqual(localModelsForMemory("ram", 4).map(model => model.id), ["qwen-mini"]);
  assert.ok(localModelsForMemory("ram", 8).some(model => model.id === "qwen35-2b"));
  assert.ok(!localModelsForMemory("ram", 8).some(model => model.id === "qwen35-4b"));
  assert.ok(localModelsForMemory("vram", 6).some(model => model.id === "qwen35-4b"));
  assert.ok(localModelsForMemory("unified", 24).some(model => model.id === "gpt-oss-20b"));
  assert.ok(!localModelsForMemory("unified", 64).some(model => model.id === "gpt-oss-120b"));
  assert.ok(localModelsForMemory("unified", 96).some(model => model.id === "gpt-oss-120b"));
  assert.deepEqual(localModelsForMemory("ram", Number.NaN), []);
  assert.deepEqual(localModelsForMemory("vram", Infinity), []);
  assert.deepEqual(localModelsForMemory("unified", -1), []);
  const ample = normalizeLocalModelHardware({ ...observations, totalMemoryBytes: 128 * GIB, availableMemoryBytes: 100 * GIB, diskFreeBytes: 200 * GIB });
  assert.equal(localModelRecommendation(ample).candidateId, "gemma4-12b", "more memory must not automatically select the biggest download");
  assert.equal(localModelRecommendation(ample, ["qwen-small"]).candidateId, "gemma4-12b", "recommendation is oriented to documents, independently of installed models");
});

const discrete = (total: number, available: number | null) => ({ name: "NVIDIA de prueba", vendor: "nvidia", memoryKind: "dedicated", totalMemoryBytes: total * GIB, availableMemoryBytes: available === null ? null : available * GIB, source: "nvidia-smi" });

test("Apple unified memory is counted once, including reclaimable availability and process limits", () => {
  const apple = normalizeLocalModelHardware({ ...observations, platform: "darwin", cpuName: "Apple M4 Max", totalMemoryBytes: 36 * GIB, freeMemoryBytes: GIB, availableMemoryBytes: GIB, systemAvailableMemoryBytes: 30 * GIB, availableMemorySource: "memory-pressure", gpus: [{ name: "Apple M4 Max", vendor: "apple", memoryKind: "unified", totalMemoryBytes: null, availableMemoryBytes: null, source: "system-profiler" }] });
  assert.equal(apple.memoryKind, "unified");
  assert.equal(apple.unifiedMemoryBytes, 36 * GIB);
  assert.equal(apple.gpus[0].totalMemoryBytes, apple.totalMemoryBytes);
  assert.equal(apple.availableMemoryBytes, 30 * GIB);
  const recommendation = localModelRecommendation(apple);
  assert.equal(recommendation.basis, "unified");
  assert.equal(recommendation.candidateId, "qwen38-27b");
  assert.equal(recommendation.memoryCapacityBytes, 36 * GIB);
  assert.ok(recommendation.memoryBudgetBytes < 30 * GIB);
  const ample = normalizeLocalModelHardware({ ...apple, totalMemoryBytes: 128 * GIB, systemAvailableMemoryBytes: 110 * GIB, availableMemorySource: "memory-pressure" });
  assert.equal(localModelRecommendation(ample).candidateId, "qwen38-27b", "ample memory should not automatically favor a 65 GB download for a small editorial ranking gain");
  const constrained = normalizeLocalModelHardware({ ...apple, constrainedMemoryBytes: 2 * GIB, availableMemoryBytes: .25 * GIB, systemAvailableMemoryBytes: 30 * GIB, availableMemorySource: "memory-pressure" });
  assert.equal(constrained.unifiedMemoryBytes, 2 * GIB);
  assert.equal(constrained.availableMemoryBytes, .25 * GIB);
  assert.equal(localModelRecommendation(constrained).candidateId, null);
});

test("dedicated VRAM changes the document recommendation and busy GPUs fall back to RAM", () => {
  const accelerated = normalizeLocalModelHardware({ ...observations, gpus: [discrete(24, 23)] });
  const recommendation = localModelRecommendation(accelerated);
  assert.equal(recommendation.basis, "vram");
  assert.equal(recommendation.candidateId, "qwen38-27b");
  assert.equal(recommendation.gpuName, "NVIDIA de prueba");
  const busy = localModelRecommendation(normalizeLocalModelHardware({ ...observations, gpus: [discrete(24, 0)] }));
  assert.equal(busy.basis, "ram");
  assert.equal(busy.candidateId, "gemma4-12b");
  assert.equal(busy.capacityCandidateId, "qwen38-27b");
  const constrained = normalizeLocalModelHardware({ ...observations, constrainedMemoryBytes: 2 * GIB, availableMemoryBytes: GIB, gpus: [discrete(80, 79)] });
  assert.equal(localModelRecommendation(constrained).candidateId, null, "GPU capacity cannot evade a container's RAM limit");
});

test("separate GPUs and shared graphics memory never add up to a larger pool", () => {
  const two = localModelRecommendation(normalizeLocalModelHardware({ ...observations, gpus: [discrete(16, 15), discrete(16, 15)] }));
  assert.equal(two.memoryCapacityBytes, 16 * GIB);
  assert.equal(two.candidateId, "gemma4-12b");
  const shared = localModelRecommendation(normalizeLocalModelHardware({ ...observations, gpus: [{ ...discrete(128, 100), memoryKind: "shared" }] }));
  assert.equal(shared.basis, "ram");
  assert.equal(shared.candidateId, "gemma4-12b");
  const unknownFree = localModelRecommendation(normalizeLocalModelHardware({ ...observations, gpus: [discrete(16, null)] }));
  assert.equal(unknownFree.basis, "vram");
  assert.equal(unknownFree.availableMemoryKnown, false);
  assert.match(unknownFree.reason, /20 %/);
});

test("memory pressure exposes a capacity-only suggestion without claiming it can run now", () => {
  const busy = localModelRecommendation(normalizeLocalModelHardware({ ...observations, availableMemoryBytes: 512 * 1024 ** 2 }));
  assert.equal(busy.candidateId, null);
  assert.equal(busy.capacityCandidateId, "gemma4-12b");
  assert.match(busy.reason, /falta memoria libre/);
  const small = localModelRecommendation(normalizeLocalModelHardware({ ...observations, totalMemoryBytes: 8 * GIB, freeMemoryBytes: 6 * GIB, availableMemoryBytes: 6 * GIB }));
  assert.equal(small.candidateId, "qwen35-2b");
});

test("expanded pinned catalog retains existing connections and sorts without changing stable IDs", () => {
  for (const profile of LOCAL_MODELS) {
    assert.match(profile.sha256, /^[a-f0-9]{64}$/);
    assert.ok(profile.bytes > 0 && Number.isSafeInteger(profile.bytes));
    assert.equal(configuredLocalModel({ preset: "ollama", apiUrl: OLLAMA_LOCAL_API, model: profile.tag, localProfile: profile.id }), profile);
    assert.equal(canonicalLocalModelState(profile, [{ name: profile.tag, size: profile.bytes, digest: `sha256:${profile.sha256}` }]), "ready");
    assert.equal(canonicalLocalModelState(profile, [{ name: profile.tag, size: profile.bytes, digest: `sha256:${"0".repeat(64)}` }]), "different");
  }
  assert.equal(localModelProfile("qwen-small")?.tag, "qwen3:1.7b-q4_K_M");
  assert.equal(LOCAL_MODELS_BY_MEMORY[0].id, "qwen-mini");
  assert.equal(new Set(LOCAL_MODELS.map(model => model.id)).size, LOCAL_MODELS.length);
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
