import assert from "node:assert/strict";
import { validateHostPorts } from "./host-runtime.mjs";

assert.doesNotThrow(() => validateHostPorts(3000, 54329));
assert.throws(() => validateHostPorts(3000, 3000), /debe ser distinto/);
assert.throws(() => validateHostPorts(80, 54329), /Puerto inválido/);
assert.throws(() => validateHostPorts(3000, 70000), /Puerto inválido/);

console.log("desktop/host-runtime.test.mjs OK");
