import assert from "node:assert/strict";
import {
  TRAMITE_TEMPLATES,
  findTemplate,
  templatesForMateria,
  fechaLimiteFromDias,
} from "./tramite-templates";

assert.ok(TRAMITE_TEMPLATES.length >= 3);
assert.ok(findTemplate("civil-ordinario"));
assert.equal(findTemplate("no-existe"), null);

const laborales = templatesForMateria("laboral");
assert.ok(laborales.some((t) => t.id === "laboral-tutela"));
assert.ok(laborales.some((t) => t.id === "generica-handoff"));

const from = new Date(2026, 7, 10, 12);
const due = fechaLimiteFromDias(5, from);
assert.equal(due.getDate(), 15);

console.log("tramite-templates.test.ts OK");
