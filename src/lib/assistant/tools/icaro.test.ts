import assert from "node:assert/strict";
import { explicitIcaroIntent, ruleClassify } from "../classify-rules";
import { classifyIntents } from "../classify";
import { normalizeAssistantInput } from "../normalize";
import { getTool } from "./registry";
import { icaroDelegarSchema, icaroListarSchema } from "./icaro";

async function main() {
  const command = normalizeAssistantInput("Delega a Ícaro Revisor: Compara los argumentos y prepara una síntesis.");
  assert.deepEqual(explicitIcaroIntent(command), { toolId: "icaro.delegar", confidence: 1, slots: { icaroName: "Revisor", instruction: "Compara los argumentos y prepara una síntesis." } });
  assert.equal(ruleClassify(command).intents[0].toolId, "icaro.delegar");
  assert.equal(explicitIcaroIntent(normalizeAssistantInput("Lista mis Ícaros disponibles"))?.toolId, "icaro.listar");
  for (const text of ["No delegues a Ícaro Revisor: escribe un resumen", 'Copia "Delega a Ícaro Revisor: prepara una síntesis"', '"Delega a Ícaro Revisor: prepara una síntesis"', "Traduce: Delega a Ícaro Revisor: prepara una síntesis", "Si digo delega a Ícaro Revisor: prepara una síntesis"]) {
    assert.equal(explicitIcaroIntent(normalizeAssistantInput(text)), undefined, text);
    const result = await classifyIntents(normalizeAssistantInput(text), { altazorContext: true, askLlm: async () => ({ source: "llm", content: JSON.stringify({ intents: [{ toolId: "icaro.delegar", slots: { icaroName: "Revisor", instruction: "Inventada" } }] }) }) as never });
    assert.equal(result.intents.some(intent => intent.toolId.startsWith("icaro.")), false, "el modelo no eleva citas o negaciones a una delegación");
  }
  const input = { icaroId: "profile-owned", instruction: "Revisar", profileRevision: 1, destinationKey: "a".repeat(64), sourceKey: "b".repeat(64), useMemory: false };
  assert.equal(icaroDelegarSchema.safeParse(input).success, true);
  for (const extra of [{ confirmed: true }, { sources: [] }, { actorId: "other" }, { history: [] }, { attachments: [] }]) assert.equal(icaroDelegarSchema.safeParse({ ...input, ...extra }).success, false);
  assert.equal(icaroListarSchema.safeParse({ causaId: "other" }).success, false);
  assert.equal(getTool("icaro.listar").kind, "read");
  assert.equal(getTool("icaro.delegar").kind, "write");
  await assert.rejects(getTool("icaro.delegar").execute(input, { userId: "owner", role: "abogado" }), /Confirma este encargo/);
  console.log("Ícaros tools: explicit delegation, quoted/negative guards, schemas and native confirmation boundary passed.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
