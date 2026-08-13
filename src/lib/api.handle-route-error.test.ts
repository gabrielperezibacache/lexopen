import assert from "node:assert/strict";
import { handleRouteError } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { PjudScrapeError } from "@/lib/pjud/public-scrape";

async function jsonError(res: Response) {
  const body = await res.json();
  return { status: res.status, error: body.error as string };
}

async function main() {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "production";

  try {
    const masked = await jsonError(handleRouteError(new Error("stack secreto")));
    assert.equal(masked.status, 500);
    assert.equal(masked.error, "Error interno");

    const invalidRut = await jsonError(
      handleRouteError(httpError("RUT ClaveÚnica inválido", 400))
    );
    assert.equal(invalidRut.status, 400);
    assert.equal(invalidRut.error, "RUT ClaveÚnica inválido");

    const vault = await jsonError(
      handleRouteError(httpError("Falta SESSION_SECRET para cifrar", 503))
    );
    assert.equal(vault.status, 503);
    assert.equal(vault.error, "Falta SESSION_SECRET para cifrar");

    const scrape = await jsonError(
      handleRouteError(
        new PjudScrapeError(
          "Automatización ClaveÚnica deshabilitada. En el .env del Host ponga PJUD_CLAVEUNICA_SCRAPE=1 y reinicie.",
          409
        )
      )
    );
    assert.equal(scrape.status, 409);
    assert.match(scrape.error, /PJUD_CLAVEUNICA_SCRAPE=1/);

    const schema = await jsonError(
      handleRouteError(
        new Error(
          "The column `claveUnicaRut` does not exist in the current database."
        )
      )
    );
    assert.equal(schema.status, 503);
    assert.match(schema.error, /esquema actual/);
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
  }

  console.log("api.handle-route-error.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
