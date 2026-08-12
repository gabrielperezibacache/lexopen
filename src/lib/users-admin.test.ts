import assert from "node:assert/strict";
import { isUserRole, pickAvatarColor } from "./users-admin";

assert.equal(isUserRole("admin"), true);
assert.equal(isUserRole("abogado"), true);
assert.equal(isUserRole("asistente"), true);
assert.equal(isUserRole("cliente"), true);
assert.equal(isUserRole("socio"), false);
assert.equal(isUserRole(""), false);

const a = pickAvatarColor("Ana Pérez");
const b = pickAvatarColor("Ana Pérez");
const c = pickAvatarColor("Bruno López");
assert.equal(a, b);
assert.match(a, /^#[0-9a-f]{6}$/i);
assert.ok(typeof c === "string");

console.log("users-admin.test.ts OK");
