import assert from "node:assert/strict";
import {
  CAPTCHA_SOLVER_PROVIDER_IDS,
  CAPTCHA_SOLVER_PROVIDERS,
  apiKeyFromEnv,
  captchaSolverConfigured,
  captchaSolverStatusPublic,
  isCaptchaSolverProvider,
  providerFromEnv,
} from "@/lib/pjud/captcha-solver";

const env = process.env as Record<string, string | undefined>;
const prevProv = env.CAPTCHA_SOLVER_PROVIDER;
const prevKey = env.CAPTCHA_SOLVER_API_KEY;

assert.ok(CAPTCHA_SOLVER_PROVIDER_IDS.includes("nopecha"));
assert.ok(CAPTCHA_SOLVER_PROVIDER_IDS.includes("2captcha"));
assert.ok(CAPTCHA_SOLVER_PROVIDERS.some((p) => p.freeTier && p.id === "nopecha"));
assert.equal(isCaptchaSolverProvider("capmonster"), true);
assert.equal(isCaptchaSolverProvider("tiagozip"), false);

env.CAPTCHA_SOLVER_PROVIDER = "nopecha";
delete env.CAPTCHA_SOLVER_API_KEY;
assert.equal(providerFromEnv(), "nopecha");
assert.equal(apiKeyFromEnv(), undefined);
assert.equal(captchaSolverConfigured(), true);

env.CAPTCHA_SOLVER_API_KEY = "free";
assert.equal(apiKeyFromEnv(), undefined);
assert.equal(captchaSolverConfigured(), true);

env.CAPTCHA_SOLVER_PROVIDER = "2captcha";
env.CAPTCHA_SOLVER_API_KEY = "";
assert.equal(captchaSolverConfigured(), false);
env.CAPTCHA_SOLVER_API_KEY = "abc";
assert.equal(captchaSolverConfigured(), true);

const status = captchaSolverStatusPublic();
assert.equal(status.configured, true);
assert.equal(status.provider, "2captcha");
assert.ok(status.providers.length >= 5);
assert.ok(status.providers.some((p) => p.id === "nopecha" && p.freeTier));

if (prevProv === undefined) delete env.CAPTCHA_SOLVER_PROVIDER;
else env.CAPTCHA_SOLVER_PROVIDER = prevProv;
if (prevKey === undefined) delete env.CAPTCHA_SOLVER_API_KEY;
else env.CAPTCHA_SOLVER_API_KEY = prevKey;

console.log("pjud/captcha-solver.test.ts OK");
