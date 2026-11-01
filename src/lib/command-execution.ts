import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";

/** Stable JSON is also used for optimistic undo snapshots. Dates stay ISO. */
export function canonicalJson(value: unknown): string {
  const plain = JSON.parse(JSON.stringify(value ?? null));
  const sort = (v: unknown): unknown => Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)]))
      : v;
  return JSON.stringify(sort(plain));
}

export function requestCommandKey(req: Request, scope: string): string {
  const provided = req.headers.get("Idempotency-Key");
  if (provided && !/^[A-Za-z0-9._:-]{8,160}$/.test(provided)) {
    throw httpError("Idempotency-Key inválida", 400);
  }
  return `${scope}:${provided || randomUUID()}`;
}

export async function serializable<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 4) throw error;
    }
  }
}

/** The receipt commits with the domain writes; rollback leaves the key retryable. */
export async function executeCommand<T>(opts: {
  key: string;
  ownerId: string;
  input: unknown;
  /** Revalidated even when returning an existing receipt. */
  authorize?: (tx: Prisma.TransactionClient, committedResult?: T) => Promise<void>;
  run: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  const key = createHash("sha256").update(`${opts.ownerId}:${opts.key}`).digest("hex");
  const inputHash = createHash("sha256").update(canonicalJson(opts.input)).digest("hex");
  const replay = (row: { ownerId: string; inputHash: string; status: string; resultJson: string | null }): T => {
    if (row.ownerId !== opts.ownerId || row.inputHash !== inputHash) {
      throw httpError("La clave de operación ya se usó con otros datos", 409);
    }
    if (row.status !== "completed" || !row.resultJson) throw httpError("Operación en curso; reintente con la misma clave", 409);
    return JSON.parse(row.resultJson) as T;
  };
  try {
    return await serializable(async (tx) => {
      const existing = await tx.commandExecution.findUnique({ where: { key } });
      if (existing) {
        const result = replay(existing);
        await opts.authorize?.(tx, result);
        return result;
      }
      await opts.authorize?.(tx);
      const receipt = await tx.commandExecution.create({ data: { key, ownerId: opts.ownerId, inputHash } });
      const result = await opts.run(tx);
      await tx.commandExecution.update({
        where: { id: receipt.id },
        data: { status: "completed", resultJson: canonicalJson(result) },
      });
      return result;
    });
  } catch (error) {
    // A concurrent same-key transaction may win the unique constraint. Its
    // receipt exists only after every domain write has committed.
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.commandExecution.findUnique({ where: { key } });
      if (existing) return serializable(async (tx) => {
        const result = replay(existing);
        await opts.authorize?.(tx, result);
        return result;
      });
    }
    throw error;
  }
}
