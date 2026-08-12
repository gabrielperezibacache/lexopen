import assert from "node:assert/strict";
import { assertCsrfDoubleSubmit, CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/csrf-token";
import { cookieSecureFlag } from "@/lib/auth/cookie-options";

const env = process.env as Record<string, string | undefined>;
const prevNode = env.NODE_ENV;
const prevApp = env.NEXT_PUBLIC_APP_URL;
const prevSecure = env.LEXOPEN_COOKIE_SECURE;
const prevDesktop = env.LEXOPEN_DESKTOP;

env.NEXT_PUBLIC_APP_URL = "http://pc.tailnet.ts.net:3000";
delete env.LEXOPEN_COOKIE_SECURE;
assert.equal(cookieSecureFlag(), false);
env.NEXT_PUBLIC_APP_URL = "https://app.example";
assert.equal(cookieSecureFlag(), true);
env.LEXOPEN_COOKIE_SECURE = "0";
assert.equal(cookieSecureFlag(), false);

env.NODE_ENV = "production";
const token = "abcd1234abcd1234";
assert.throws(() =>
  assertCsrfDoubleSubmit(
    new Request("https://app.example/api/x", {
      method: "POST",
      headers: {
        cookie: `lexopen_session=u.1.0.admin.sig`,
      },
    })
  )
);
assert.doesNotThrow(() =>
  assertCsrfDoubleSubmit(
    new Request("https://app.example/api/x", {
      method: "POST",
      headers: {
        cookie: `lexopen_session=u.1.0.admin.sig; ${CSRF_COOKIE}=${token}`,
        [CSRF_HEADER]: token,
      },
    })
  )
);

if (prevNode === undefined) delete env.NODE_ENV;
else env.NODE_ENV = prevNode;
if (prevApp === undefined) delete env.NEXT_PUBLIC_APP_URL;
else env.NEXT_PUBLIC_APP_URL = prevApp;
if (prevSecure === undefined) delete env.LEXOPEN_COOKIE_SECURE;
else env.LEXOPEN_COOKIE_SECURE = prevSecure;
if (prevDesktop === undefined) delete env.LEXOPEN_DESKTOP;
else env.LEXOPEN_DESKTOP = prevDesktop;

console.log("csrf-token + cookie-options OK");
