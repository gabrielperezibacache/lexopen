import assert from "node:assert/strict";
import { clientVisibleFileWhere, siteFileWhereForRole } from "@/lib/auth/access";

assert.deepEqual(clientVisibleFileWhere(), {
  confidencial: false,
  tags: { contains: "cliente", mode: "insensitive" },
});

assert.deepEqual(siteFileWhereForRole("cliente"), clientVisibleFileWhere());
assert.deepEqual(siteFileWhereForRole("asistente"), { confidencial: false });
assert.deepEqual(siteFileWhereForRole("admin"), {});

console.log("acl.http.test.ts OK");
