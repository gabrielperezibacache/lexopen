import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  maskRut,
  secretsKeySource,
} from "@/lib/pjud/secret";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import { publicScrapeEnabled, publicScrapeReady } from "@/lib/pjud/public-scrape";

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
