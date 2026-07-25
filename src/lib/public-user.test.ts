import assert from "node:assert/strict";
import { publicUser, stripPasswordsDeep } from "@/lib/auth/public-user";

const user = {
  id: "u1",
  email: "a@example.com",
  name: "A",
  role: "cliente",
  password: "hash",
  avatarColor: "#000",
  title: null,
};

assert.equal("password" in publicUser(user), false);

const stripped = stripPasswordsDeep({
  user,
  nested: [{ sender: user }, { password: "secret", ok: true }],
});

assert.deepEqual(stripped, {
  user: {
    id: "u1",
    email: "a@example.com",
    name: "A",
    role: "cliente",
    avatarColor: "#000",
    title: null,
  },
  nested: [
    {
      sender: {
        id: "u1",
        email: "a@example.com",
        name: "A",
        role: "cliente",
        avatarColor: "#000",
        title: null,
      },
    },
    { ok: true },
  ],
});

console.log("public-user.test.ts OK");
