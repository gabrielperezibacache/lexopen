import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMinutaTemplate } from "./template";
test("minute templates accept ordinary text, preserve Unicode and reject unreadable structures", () => {
  assert.deepEqual(parseMinutaTemplate(JSON.stringify({ titulo: "Audiencia preparatoria", acuerdos: "Revisar antecedentes", proximosPasos: ["Consultar a la clienta"] })), { titulo: "Audiencia preparatoria", acuerdos: "Revisar antecedentes", proximosPasos: ["Consultar a la clienta"] });
  assert.deepEqual(parseMinutaTemplate(""), {});
  assert.throws(() => parseMinutaTemplate("texto sin estructura"), /formato válido/);
  assert.throws(() => parseMinutaTemplate("[]"), /formato válido/);
  assert.throws(() => parseMinutaTemplate('{"titulo":123}'), /formato válido/);
  assert.throws(() => parseMinutaTemplate('{"proximosPasos":[{"texto":"acción"}]}'), /formato válido/);
  assert.throws(() => parseMinutaTemplate(" ".repeat(60001)), /demasiado extensa/);
});
