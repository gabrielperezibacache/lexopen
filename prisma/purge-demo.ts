/**
 * CLI: elimina datos demo / operativos y deja la BD lista para /setup.
 *
 *   npm run db:purge-demo
 *   npm run db:purge-demo -- --wipe-catalogs
 *   npm run db:purge-demo -- --yes
 */
import { PrismaClient } from "@prisma/client";
import {
  PURGE_CONFIRM_PHRASE,
  detectDemoDataset,
  purgeDemoData,
} from "../src/lib/demo-purge";

const args = new Set(process.argv.slice(2));
const yes = args.has("--yes") || args.has("-y");
const wipeCatalogs = args.has("--wipe-catalogs");

async function main() {
  if (!yes) {
    console.error(
      `[db:purge-demo] Esto borra causas, clientes, usuarios y el resto de datos operativos.`
    );
    console.error(
      `[db:purge-demo] Confirme con: npm run db:purge-demo -- --yes`
    );
    console.error(
      `[db:purge-demo] Frase de confirmación (API/UI): ${PURGE_CONFIRM_PHRASE}`
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const before = await detectDemoDataset(prisma);
    console.log(
      `[db:purge-demo] Antes: users=${before.users} demoUsers=${before.demoUsers} causas=${before.causas} clientes=${before.clientes}`
    );
    const result = await purgeDemoData(prisma, {
      keepCatalogs: !wipeCatalogs,
    });
    const remaining = Object.values(result.deleted).reduce((a, b) => a + b, 0);
    console.log(
      `[db:purge-demo] OK · filas eliminadas≈${remaining} · catalogs=${
        result.keptCatalogs ? "conservados" : "borrados"
      }`
    );
    if (result.needsSetup) {
      console.log("");
      console.log("Siguiente paso (producción desde cero):");
      console.log("  1) En .env: LEXOPEN_DEMO_SWITCHER=0  HERMES_ALLOW_DEMO=0  PJUD_ALLOW_DEMO=0");
      console.log("  2) Genere un token:  export LEXOPEN_BOOTSTRAP_TOKEN=$(openssl rand -hex 24)");
      console.log("  3) Arranque la app y abra:  /setup?token=$LEXOPEN_BOOTSTRAP_TOKEN");
      console.log("  4) Cree el administrador del estudio.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[db:purge-demo]", error);
  process.exit(1);
});
