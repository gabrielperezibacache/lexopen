import assert from "node:assert/strict";
import {
  demoSalasTablaHtml,
  parseSalasTablaHtml,
} from "@/lib/pjud/salas";

// Offline contract for live source plumbing: restricted portal returns empty html path.
assert.equal(parseSalasTablaHtml("").length, 0);
assert.ok(parseSalasTablaHtml(demoSalasTablaHtml()).length >= 1);

// Restricted body should not be parsed as agenda rows
const restricted = parseSalasTablaHtml("<html><body>acceso restringido</body></html>");
assert.equal(restricted.length, 0);

console.log("pjud/online-probe.contract.test.ts OK");
