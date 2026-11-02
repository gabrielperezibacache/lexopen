import { Prisma, type PrismaClient } from "@prisma/client";

export type NotifyClient = PrismaClient | Prisma.TransactionClient;

/** A nested caller owns its transaction and retries; never catch SQL errors inside it. */
export async function notificationTransaction<T>(
  client: NotifyClient,
  action: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!("$transaction" in client)) return action(client);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" || attempt >= 4) throw error;
    }
  }
}
