import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "./disposable-db";

/** Actual PostgreSQL failure, restricted to one fictitious actor and action. */
export async function withRejectedAudit<T>(actorId: string, action: string, run: () => Promise<T>) {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  if (url !== new URL(process.env.DATABASE_URL!).toString()) throw Error("Use the explicit disposable database");
  const name = `lexopen_audit_failure_${randomUUID().replaceAll("-", "")}`;
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit rollback fixture'; END; $$`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditEvent" FOR EACH ROW WHEN (NEW."actorId" = ${literal(actorId)} AND NEW."action" = ${literal(action)}) EXECUTE FUNCTION "${name}"()`);
    return await run();
  } finally {
    try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "AuditEvent"`); }
    finally { await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`); }
  }
}
