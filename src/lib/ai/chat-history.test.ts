import assert from "node:assert/strict";
import { buildChatHistoryForLlm } from "./chat-history";

const history = buildChatHistoryForLlm([
  { role: "user", content: "Hola" },
  { role: "assistant", content: "Respuesta", source: "llm" },
  { role: "user", content: "Seguimiento" },
  { role: "assistant", content: "Error previo", source: "error" },
  { role: "assistant", content: "Descartado", discarded: true },
]);

assert.equal(history.length, 3);
assert.deepEqual(history[0], { role: "user", content: "Hola" });
assert.deepEqual(history[2], { role: "user", content: "Seguimiento" });

const capped = buildChatHistoryForLlm(
  Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg-${i}`,
  })),
  { maxMessages: 4 }
);
assert.equal(capped.length, 4);
assert.equal(capped[0]?.content, "msg-16");

console.log("ai/chat-history.test.ts OK");
