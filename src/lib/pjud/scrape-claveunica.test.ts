import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  maskRut,
  secretsKeySource,
} from "@/lib/pjud/secret";
import { parseClaveUnicaRut } from "@/lib/pjud/claveunica";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import {
  PjudScrapeError,
  CLAVEUNICA_RUT_SELECTORS,
  formatClaveUnicaRunInput,
  claveUnicaAutomationAllowed,
  pjudPlaywrightInstallHint,
  publicScrapeEnabled,
  publicScrapeReady,
  scrapeMisCausasWithClaveUnica,
} from "@/lib/pjud/public-scrape";

assert.equal(formatClaveUnicaRunInput("19606213-0"), "19.606.213-0");
assert.equal(formatClaveUnicaRunInput("19.606.213-0"), "19.606.213-0");
assert.equal(formatClaveUnicaRunInput("12345678-5"), "12.345.678-5");
assert.doesNotMatch(CLAVEUNICA_RUT_SELECTORS, /id\*=.*rut/i);
assert.doesNotMatch(CLAVEUNICA_RUT_SELECTORS, /rut_hidden/i);
assert.match(CLAVEUNICA_RUT_SELECTORS, /#uname:visible/);

const env = process.env as Record<string, string | undefined>;
const prevSecret = env.SESSION_SECRET;
const prevPjudKey = env.PJUD_SECRETS_KEY;
env.SESSION_SECRET = "test-session-secret-for-pjud-vault";
delete env.PJUD_SECRETS_KEY;

const cipher = encryptSecret("clave-unica-password");
assert.ok(cipher.startsWith("enc:v2:"));
assert.notEqual(cipher, "clave-unica-password");
assert.equal(decryptSecret(cipher), "clave-unica-password");
assert.equal(decryptSecret("not-encrypted"), undefined);
assert.equal(decryptSecret("not-encrypted", { strict: false }), "not-encrypted");
assert.equal(maskRut("12.345.678-9"), "12****-9");
assert.equal(secretsKeySource(), "session");

assert.equal(parseClaveUnicaRut("12.345.678-5"), "12345678-5");
assert.equal(parseClaveUnicaRut("12345678-5"), "12345678-5");
assert.equal(parseClaveUnicaRut("12.345.678\u20135"), "12345678-5");
assert.throws(
  () => parseClaveUnicaRut("12.345.678-9"),
  (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal((err as Error & { status: number }).status, 400);
    assert.match(err.message, /RUT ClaveÚnica inválido/);
    return true;
  }
);

{
  const prevNode = env.NODE_ENV;
  env.NODE_ENV = "production";
  const prevS = env.SESSION_SECRET;
  const prevK = env.PJUD_SECRETS_KEY;
  delete env.SESSION_SECRET;
  delete env.PJUD_SECRETS_KEY;
  assert.throws(
    () => encryptSecret("clave"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error & { status: number }).status, 503);
      assert.match(err.message, /SESSION_SECRET/);
      return true;
    }
  );
  if (prevS === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = prevS;
  if (prevK === undefined) delete env.PJUD_SECRETS_KEY;
  else env.PJUD_SECRETS_KEY = prevK;
  if (prevNode === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = prevNode;
}

env.PJUD_SECRETS_KEY = "dedicated-pjud-secrets-key";
assert.equal(secretsKeySource(), "pjud");

const prevScrape = env.PJUD_PUBLIC_SCRAPE;
const prevProv = env.CAPTCHA_SOLVER_PROVIDER;
const prevKey = env.CAPTCHA_SOLVER_API_KEY;
env.PJUD_PUBLIC_SCRAPE = "0";
assert.equal(publicScrapeEnabled(), false);
assert.equal(publicScrapeReady(), false);
env.PJUD_PUBLIC_SCRAPE = "1";
env.CAPTCHA_SOLVER_PROVIDER = "2captcha";
env.CAPTCHA_SOLVER_API_KEY = "dummy";
assert.equal(captchaSolverConfigured(), true);
assert.equal(publicScrapeReady(), true);
env.CAPTCHA_SOLVER_API_KEY = "";
assert.equal(publicScrapeReady(), false);

async function main() {
  const prevCu = env.PJUD_CLAVEUNICA_SCRAPE;
  delete env.PJUD_CLAVEUNICA_SCRAPE;
  assert.equal(claveUnicaAutomationAllowed(false), false);
  assert.equal(claveUnicaAutomationAllowed(true), true);
  env.PJUD_CLAVEUNICA_SCRAPE = "0";
  assert.equal(claveUnicaAutomationAllowed(true), false);
  env.PJUD_CLAVEUNICA_SCRAPE = "1";
  assert.equal(claveUnicaAutomationAllowed(false), true);
  delete env.PJUD_CLAVEUNICA_SCRAPE;

  assert.match(pjudPlaywrightInstallHint(), /pjud:chromium/);
  assert.match(pjudPlaywrightInstallHint(), /web:host/);

  await assert.rejects(
    () => scrapeMisCausasWithClaveUnica({ rut: "12345678-5", password: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof PjudScrapeError);
      assert.equal(err.status, 409);
      assert.match(err.message, /ClaveÚnica deshabilitada/);
      return true;
    }
  );

  env.PJUD_PUBLIC_SCRAPE = "0";
  await assert.rejects(
    () =>
      scrapeMisCausasWithClaveUnica({
        rut: "12345678-5",
        password: "x",
        optedIn: true,
      }),
    (err: unknown) => {
      assert.ok(err instanceof PjudScrapeError);
      assert.equal(err.status, 409);
      assert.match(err.message, /PJUD_PUBLIC_SCRAPE=1/);
      return true;
    }
  );

  if (prevCu === undefined) delete env.PJUD_CLAVEUNICA_SCRAPE;
  else env.PJUD_CLAVEUNICA_SCRAPE = prevCu;

  if (prevSecret === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = prevSecret;
  if (prevPjudKey === undefined) delete env.PJUD_SECRETS_KEY;
  else env.PJUD_SECRETS_KEY = prevPjudKey;
  if (prevScrape === undefined) delete env.PJUD_PUBLIC_SCRAPE;
  else env.PJUD_PUBLIC_SCRAPE = prevScrape;
  if (prevProv === undefined) delete env.CAPTCHA_SOLVER_PROVIDER;
  else env.CAPTCHA_SOLVER_PROVIDER = prevProv;
  if (prevKey === undefined) delete env.CAPTCHA_SOLVER_API_KEY;
  else env.CAPTCHA_SOLVER_API_KEY = prevKey;

  console.log("pjud/scrape-claveunica.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
