import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db.mjs";
export function checkDevContainerDatabase(env = process.env) {
  if (env.LEXOPEN_DEV_CONTAINER !== "1") return false;
  const url = assertDisposableDatabaseUrl(env.DATABASE_URL);
  if (env.E2E_DATABASE_URL && assertDisposableDatabaseUrl(env.E2E_DATABASE_URL) !== url) throw new Error("Las bases de desarrollo y de pruebas deben coincidir en este contenedor desechable.");
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkDevContainerDatabase();
