import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as googleIntegrationCallback } from "@/app/api/integrations/google/callback/route";
import { GET as googleMailCallback } from "@/app/api/mail/google/callback/route";
import { GET as microsoftMailCallback } from "@/app/api/mail/microsoft/callback/route";
import { resolveOAuthReturnUrl } from "@/lib/net/oauth-return-url";

const ENV_KEYS = [
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_MAIL_REDIRECT_URI",
  "MICROSOFT_REDIRECT_URI",
] as const;

const previousEnv = new Map(
  ENV_KEYS.map((key) => [key, process.env[key]] as const)
);

function clearTestEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previousEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function testReturnUrlResolution() {
  clearTestEnv();
  process.env.APP_URL = " https://app.example.test/root ";
  process.env.NEXT_PUBLIC_APP_URL = "https://public.example.test";
  assert.equal(
    resolveOAuthReturnUrl(
      "http://127.0.0.1:3000/api/callback",
      "/integraciones?google=error",
      "https://oauth.example.test/api/callback"
    ).href,
    "https://oauth.example.test/integraciones?google=error"
  );

  assert.equal(
    resolveOAuthReturnUrl(
      "http://127.0.0.1:3000/api/callback",
      "/configuracion/correo?gmail=error"
    ).origin,
    "https://app.example.test"
  );

  delete process.env.APP_URL;
  assert.equal(
    resolveOAuthReturnUrl(
      "http://127.0.0.1:3000/api/callback",
      "/configuracion/correo?microsoft=error"
    ).origin,
    "https://public.example.test"
  );

  clearTestEnv();
  const e2eUrl = resolveOAuthReturnUrl(
    "http://127.0.0.1:3100/api/mail/google/callback?error=access_denied",
    "/configuracion/correo?gmail=error"
  );
  assert.equal(e2eUrl.origin, "http://127.0.0.1:3100");
  assert.equal(e2eUrl.pathname, "/configuracion/correo");
  assert.equal(e2eUrl.search, "?gmail=error");

  process.env.APP_URL = "https://user:password@app.example.test";
  process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
  assert.equal(
    resolveOAuthReturnUrl(
      "http://127.0.0.1:3100/api/callback",
      "/return"
    ).origin,
    "http://127.0.0.1:3100",
    "malformed or credential-bearing environment URLs fall back safely"
  );

  process.env.NEXT_PUBLIC_APP_URL = "https://public.example.test/path";
  assert.equal(
    resolveOAuthReturnUrl(
      "http://127.0.0.1:3100/api/callback",
      "/return",
      "not a URL"
    ).origin,
    "https://public.example.test",
    "invalid explicit callback URL falls through to a valid public URL"
  );

  assert.throws(
    () =>
      resolveOAuthReturnUrl(
        "https://public.example.test/api/callback",
        "//evil.test/path"
      ),
    /same-origin/
  );
  assert.throws(
    () =>
      resolveOAuthReturnUrl(
        "https://public.example.test/api/callback",
        "/\\evil.test/path"
      ),
    /selected origin/
  );
}

async function testCallbackHandlers() {
  clearTestEnv();
  const publicOrigin = "https://lexopen.example.test";
  process.env.GOOGLE_REDIRECT_URI =
    `${publicOrigin}/api/integrations/google/callback`;
  process.env.GOOGLE_MAIL_REDIRECT_URI =
    `${publicOrigin}/api/mail/google/callback`;
  process.env.MICROSOFT_REDIRECT_URI =
    `${publicOrigin}/api/mail/microsoft/callback`;
  process.env.NEXT_PUBLIC_APP_URL = publicOrigin;

  const cases = [
    {
      get: googleIntegrationCallback,
      route: "/api/integrations/google/callback",
      returnPath: "/integraciones",
      parameter: "google",
      cookie: "google_oauth_state",
    },
    {
      get: googleMailCallback,
      route: "/api/mail/google/callback",
      returnPath: "/configuracion/correo",
      parameter: "gmail",
      cookie: "lexopen_mail_google_oauth",
    },
    {
      get: microsoftMailCallback,
      route: "/api/mail/microsoft/callback",
      returnPath: "/configuracion/correo",
      parameter: "microsoft",
      cookie: "lexopen_mail_microsoft_oauth",
    },
  ];

  for (const item of cases) {
    const req = new NextRequest(
      `http://127.0.0.1:3000${item.route}?error=access_denied`,
      {
        headers: {
          host: "attacker.example.test",
          "x-forwarded-host": "attacker.example.test",
        },
      }
    );
    const response = await item.get(req);
    assert.equal(response.status, 307, `${item.route}: redirect status`);

    const location = response.headers.get("location");
    assert.ok(location, `${item.route}: Location header`);
    const redirectUrl = new URL(location);
    assert.equal(redirectUrl.origin, publicOrigin, `${item.route}: public origin`);
    assert.equal(redirectUrl.pathname, item.returnPath, `${item.route}: return path`);
    assert.equal(
      redirectUrl.searchParams.get(item.parameter),
      "error",
      `${item.route}: error result`
    );

    const expiredCookie = response.cookies.get(item.cookie);
    assert.ok(expiredCookie, `${item.route}: state cookie is cleared`);
    assert.equal(expiredCookie.value, "", `${item.route}: empty state cookie`);
    assert.equal(expiredCookie.maxAge, 0, `${item.route}: state cookie expires`);
  }
}

async function main() {
  try {
    testReturnUrlResolution();
    await testCallbackHandlers();
    console.log("oauth-return-url.test.ts OK");
  } finally {
    restoreEnv();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
