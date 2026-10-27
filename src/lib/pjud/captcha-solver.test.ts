import assert from "node:assert/strict";
import {
  CAPTCHA_SOLVER_PROVIDER_IDS,
  CAPTCHA_SOLVER_PROVIDERS,
  apiKeyFromEnv,
  captchaConfigErrorMessage,
  captchaEnvSnippet,
  captchaSolverConfigured,
  captchaSolverStatusPublic,
  fallbackProvidersFromEnv,
  isCaptchaSolverProvider,
  providerFromEnv,
  solveImageCaptcha,
} from "@/lib/pjud/captcha-solver";

const env = process.env as Record<string, string | undefined>;
const prevProv = env.CAPTCHA_SOLVER_PROVIDER;
const prevKey = env.CAPTCHA_SOLVER_API_KEY;
const prevFb = env.CAPTCHA_SOLVER_FALLBACK;
const prevFbKey = env.CAPTCHA_SOLVER_FALLBACK_API_KEY;

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
assert.equal(captchaConfigErrorMessage(), null);

env.CAPTCHA_SOLVER_API_KEY = "free";
assert.equal(apiKeyFromEnv(), undefined);
assert.equal(captchaSolverConfigured(), true);

env.CAPTCHA_SOLVER_PROVIDER = "2captcha";
env.CAPTCHA_SOLVER_API_KEY = "";
assert.equal(captchaSolverConfigured(), false);
assert.match(captchaConfigErrorMessage() || "", /API_KEY/);
env.CAPTCHA_SOLVER_API_KEY = "abc";
assert.equal(captchaSolverConfigured(), true);

env.CAPTCHA_SOLVER_PROVIDER = "not-a-real-solver";
assert.equal(providerFromEnv(), undefined);
assert.equal(captchaSolverConfigured(), false);
assert.match(captchaConfigErrorMessage() || "", /no es válido/);

env.CAPTCHA_SOLVER_PROVIDER = "nopecha";
env.CAPTCHA_SOLVER_FALLBACK = "2captcha, capsolver, nopecha";
assert.deepEqual(fallbackProvidersFromEnv(), ["2captcha", "capsolver"]);

const status = captchaSolverStatusPublic();
assert.equal(status.configured, true);
assert.equal(status.provider, "nopecha");
assert.deepEqual(status.fallbacks, ["2captcha", "capsolver"]);
assert.ok(status.providers.some((p) => p.id === "nopecha" && p.selected));
assert.match(captchaEnvSnippet("nopecha"), /CAPTCHA_SOLVER_PROVIDER=nopecha/);

assert.ok(CAPTCHA_SOLVER_PROVIDER_IDS.includes("solvecha"));
assert.equal(isCaptchaSolverProvider("solvecha"), true);

async function solvechaMockTests() {
  const realFetch = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  const reply = (json: unknown, status = 200) =>
    new Response(JSON.stringify(json), { status });
  try {
    env.CAPTCHA_SOLVER_PROVIDER = "solvecha";
    env.CAPTCHA_SOLVER_API_KEY = "dummy-key";
    delete env.CAPTCHA_SOLVER_FALLBACK;

    // createTask ya devuelve la solución
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return reply({
        errorId: 0,
        taskId: "t1",
        status: "ready",
        solution: { text: "AB12" },
      });
    }) as typeof fetch;
    assert.equal(await solveImageCaptcha("data:image/png;base64,AAAA"), "AB12");
    assert.equal(calls[0].url, "https://api.solvecha.com/createTask");
    assert.equal(calls[0].body.clientKey, "dummy-key");
    assert.equal(calls[0].body.task.type, "ImageToTextTask");
    assert.equal(calls[0].body.task.body, "AAAA");

    // error 4xx con cuerpo JSON: se conserva el mensaje de la API
    globalThis.fetch = (async () =>
      reply(
        {
          errorId: 1,
          errorCode: "ERROR_KEY_DOES_NOT_EXIST",
          errorDescription: "Invalid API key",
        },
        401
      )) as typeof fetch;
    await assert.rejects(
      solveImageCaptcha("AAAA"),
      /Solvecha createTask falló: Invalid API key/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

solvechaMockTests().then(() => {
  if (prevProv === undefined) delete env.CAPTCHA_SOLVER_PROVIDER;
  else env.CAPTCHA_SOLVER_PROVIDER = prevProv;
  if (prevKey === undefined) delete env.CAPTCHA_SOLVER_API_KEY;
  else env.CAPTCHA_SOLVER_API_KEY = prevKey;
  if (prevFb === undefined) delete env.CAPTCHA_SOLVER_FALLBACK;
  else env.CAPTCHA_SOLVER_FALLBACK = prevFb;
  if (prevFbKey === undefined) delete env.CAPTCHA_SOLVER_FALLBACK_API_KEY;
  else env.CAPTCHA_SOLVER_FALLBACK_API_KEY = prevFbKey;

  console.log("pjud/captcha-solver.test.ts OK");
});
