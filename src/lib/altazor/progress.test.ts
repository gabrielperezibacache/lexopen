import assert from "node:assert/strict";
import { plannedActionSummary, turnProgress } from "./progress";

const plan = [{ toolId: "icaro.delegar", preview: "PRIVATE SOURCE MUST NOT APPEAR" }, { toolId: "icaro.delegar", preview: "PRIVATE SOURCE MUST NOT APPEAR" }];
assert.equal(plannedActionSummary(plan).includes("PRIVATE SOURCE"), false);
const waiting = turnProgress(plan, [
  { toolId: "icaro.delegar", result: { ok: true, message: "Accepted", card: { status: "queued" } } },
  { toolId: "icaro.delegar", result: { ok: true, message: "Working", card: { status: "running" } } },
]);
assert.equal(waiting.planned, 2);
assert.equal(waiting.completed, 0, "queuing or starting a delegate is not completing its analysis");
const final = turnProgress(plan, [
  { toolId: "icaro.delegar", result: { ok: true, message: "Done", card: { status: "completed" } } },
  { toolId: "icaro.delegar", result: { ok: false, message: "Stopped" } },
]);
assert.equal(final.completed, 1);
assert.equal(final.failed, 1);
assert.equal(turnProgress([], [{ toolId: "respuesta.libre", result: { ok: true, message: "Answer" } }]).planned, 1);
console.log("Altazor progress: no private preview echo, real action counts and pending delegation semantics passed.");
