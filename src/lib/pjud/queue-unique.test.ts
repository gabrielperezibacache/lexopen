import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { isActiveJobUniqueViolation } from "@/lib/pjud/queue";

assert.equal(isActiveJobUniqueViolation(new Error("nope")), false);
assert.equal(isActiveJobUniqueViolation(null), false);

const p2002 = new Prisma.PrismaClientKnownRequestError("Unique", {
  code: "P2002",
  clientVersion: "test",
  meta: { target: ["causaId"] },
});
assert.equal(isActiveJobUniqueViolation(p2002), true);

const p2001 = new Prisma.PrismaClientKnownRequestError("Not found", {
  code: "P2001",
  clientVersion: "test",
});
assert.equal(isActiveJobUniqueViolation(p2001), false);

console.log("pjud/queue-unique.test.ts OK");
