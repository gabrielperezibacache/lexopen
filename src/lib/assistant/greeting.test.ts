import assert from "node:assert/strict";
import { chileGreeting } from "./greeting";

// Fixed instants interpreted in America/Santiago (CLT/CLST).
const morning = new Date("2026-06-15T12:00:00.000Z"); // ~08:00 CLT
const afternoon = new Date("2026-06-15T18:00:00.000Z"); // ~14:00 CLT
const evening = new Date("2026-06-16T02:00:00.000Z"); // ~22:00 CLT

assert.match(chileGreeting("María Pérez", morning), /^Buenos días, María$/);
assert.match(chileGreeting("Juan", afternoon), /^Buenas tardes, Juan$/);
assert.match(chileGreeting("Ana Silva", evening), /^Buenas noches, Ana$/);
assert.match(chileGreeting("  ", morning), /^Buenos días/);

console.log("assistant/greeting.test.ts OK");
