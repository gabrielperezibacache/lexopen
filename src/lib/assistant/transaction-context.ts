import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict, type WriteAuditOpts } from "@/lib/audit";
import type { ToolContext } from "./types";

type Context = { tx: Prisma.TransactionClient; actor: ToolContext };
const context = new AsyncLocalStorage<Context>();

export function assistantTransaction() { return context.getStore(); }
export function withAssistantTransaction<T>(tx: Prisma.TransactionClient, actor: ToolContext, run: () => Promise<T>) {
  return context.run({ tx, actor }, run);
}

/** Tools share the enclosing transaction, including their nested minuta writes. */
export const assistantDb = new Proxy(prisma, {
  get(target, prop) {
    const tx = context.getStore()?.tx;
    if (tx && prop === "$transaction") {
      return (run: (client: Prisma.TransactionClient) => Promise<unknown>) => run(tx);
    }
    const client = tx || target;
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function writeAssistantAudit(opts: Omit<WriteAuditOpts, "strict">) {
  const tx = context.getStore()?.tx;
  if (!tx) throw new Error("La escritura del asistente requiere una transacción");
  return writeAuditStrict(opts, tx);
}
