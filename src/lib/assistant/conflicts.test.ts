import assert from "node:assert/strict";
import { describeEventConflicts, type EventConflict } from "./conflicts";

assert.equal(describeEventConflicts([]), "");

const conflicts: EventConflict[] = [
  {
    id: "e1",
    titulo: "Audiencia civil",
    inicio: new Date("2026-09-30T14:00:00.000Z"),
    fin: new Date("2026-09-30T15:00:00.000Z"),
  },
  {
    id: "e2",
    titulo: "Reunión cliente",
    inicio: new Date("2026-09-30T14:30:00.000Z"),
    fin: null,
  },
];

const text = describeEventConflicts(conflicts);
assert.match(text, /Conflicto de agenda/);
assert.match(text, /2 evento/);
assert.match(text, /Audiencia civil/);
assert.match(text, /Reunión cliente/);

console.log("assistant/conflicts.test.ts OK");
