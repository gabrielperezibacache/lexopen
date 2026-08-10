import assert from "node:assert/strict";
import {
  AI_ACTIONS,
  AI_ACTION_META,
  demoForAction,
  isAiActionId,
  parseActionResult,
} from "./actions";

assert.equal(new Set(AI_ACTIONS).size, AI_ACTIONS.length);
for (const id of AI_ACTIONS) {
  assert.equal(AI_ACTION_META[id].id, id);
  assert.ok(AI_ACTION_META[id].label.length > 2);
}

assert.equal(isAiActionId("causa.resumen"), true);
assert.equal(isAiActionId("no.existe"), false);

const rawPlazos = demoForAction("plazo.sugerir");
const parsedPlazos = parseActionResult("plazo.sugerir", rawPlazos);
assert.ok(parsedPlazos.data);
const plazosData = parsedPlazos.data as { plazos: unknown[] };
assert.ok(Array.isArray(plazosData.plazos));
assert.ok(plazosData.plazos.length > 0);

const rawResumen = demoForAction("causa.resumen", "prueba");
const parsedResumen = parseActionResult("causa.resumen", rawResumen);
assert.equal(parsedResumen.data, null);
assert.match(parsedResumen.content, /Estado actual/);

console.log("ai/actions.test.ts OK");
