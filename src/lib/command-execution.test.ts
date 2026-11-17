import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { serializable } from "./command-execution";

async function main() {
  const original = prisma.$transaction;
  const tx = {} as Prisma.TransactionClient;
  let calls = 0;
  prisma.$transaction = (async (run: (client: Prisma.TransactionClient) => Promise<unknown>) => {
    calls++;
    return run(tx);
  }) as typeof prisma.$transaction;
  const conflict = Object.assign(new Error("Fictitious rolled-back serialization conflict"), { code: "P2034" });
  try {
    // A competing writer finishes on the event loop. Immediate repeated
    // transactions exhaust the retry budget before this work can settle.
    let writerFinished = false;
    const release = setTimeout(() => { writerFinished = true; }, 0);
    try {
      const value = await serializable(async () => {
        if (!writerFinished) throw conflict;
        return "recovered";
      });
      assert.equal(value, "recovered");
      assert.equal(calls, 2);
    } finally { clearTimeout(release); }

    // Authorization is part of the fresh callback, not a cached approval from
    // the rolled-back attempt. A revocation during contention must win.
    calls = 0;
    let permitted = true;
    const denied = Object.assign(new Error("Fictitious access revoked"), { status: 403 });
    const revoke = setTimeout(() => { permitted = false; }, 0);
    try {
      await assert.rejects(serializable(async () => {
        if (!permitted) throw denied;
        throw conflict;
      }), error => error === denied);
      assert.equal(calls, 2);
    } finally { clearTimeout(revoke); }

    calls = 0;
    await assert.rejects(serializable(async () => { throw conflict; }), error => error === conflict);
    assert.equal(calls, 5, "Contention remains bounded to five total attempts");
    for (const error of [
      Object.assign(new Error("Unknown commit outcome"), { code: "P2028" }),
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
      Object.assign(new Error("Audit failed"), { status: 500 }),
      new Error("Connection lost"),
    ]) {
      calls = 0;
      await assert.rejects(serializable(async () => { throw error; }), actual => actual === error);
      assert.equal(calls, 1, "Only a known PostgreSQL rollback may be retried");
    }
    console.log("Commands retry PASS: contention yields, fresh authorization, bounded recovery and no retry of unknown outcomes or audit errors; no database/network.");
  } finally { prisma.$transaction = original; await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
