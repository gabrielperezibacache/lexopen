import assert from "node:assert/strict";
import {
  buildDemoReply,
  legalSystemPrompt,
  sanitizeHermesMessages,
  statusLabel,
} from "./hermes";

const cleaned = sanitizeHermesMessages([
  { role: "system", content: "sys" },
  { role: "user", content: "   " },
  { role: "user", content: "hola" },
  { role: "assistant", content: "respuesta" },
  { role: "user", content: "x".repeat(20000) },
]);
assert.equal(cleaned[0].role, "system");
assert.ok(cleaned.every((m) => m.content.trim()));
assert.ok(cleaned.find((m) => m.role === "user" && m.content.startsWith("x"))!.content.length <= 12000);

const many = sanitizeHermesMessages(
  [
    { role: "system", content: "sys" },
    ...Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`,
    })),
  ],
  10
);
assert.ok(many.length <= 10);
assert.equal(many[0].role, "system");

assert.ok(buildDemoReply("prueba plazo hábil").includes("(demo)"));
assert.ok(buildDemoReply("prueba").includes("Hermes no conectado"));
assert.ok(legalSystemPrompt('{"rit":"C-1-2026"}').includes("C-1-2026"));
assert.ok(legalSystemPrompt().includes("confidenciales"));

assert.equal(statusLabel("hermes"), "Hermes Agent (real)");
assert.equal(statusLabel("demo"), "Demo local (no Hermes)");
assert.equal(statusLabel("error"), "Error / no alcanzable");

console.log("hermes.test.ts OK");
