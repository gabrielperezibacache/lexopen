import assert from "node:assert/strict";
import {
  isLoopbackHostname,
  isLoopbackHttpRequest,
  isLoopbackIp,
} from "@/lib/net/loopback-request";

assert.equal(isLoopbackIp("127.0.0.1"), true);
assert.equal(isLoopbackIp("::1"), true);
assert.equal(isLoopbackIp("::ffff:127.0.0.1"), true);
assert.equal(isLoopbackIp("10.0.0.1"), false);
assert.equal(isLoopbackHostname("127.0.0.1:3000"), true);
assert.equal(isLoopbackHostname("localhost"), true);
assert.equal(isLoopbackHostname("app.onrender.com"), false);

const prevTrusted = process.env.LEXOPEN_TRUSTED_PROXY;
delete process.env.LEXOPEN_TRUSTED_PROXY;
assert.equal(
  isLoopbackHttpRequest({
    headers: { get: (n) => (n === "host" ? "127.0.0.1:3000" : null) },
  }),
  true
);
assert.equal(
  isLoopbackHttpRequest({
    headers: { get: (n) => (n === "host" ? "lexopen.onrender.com" : null) },
  }),
  false
);

process.env.LEXOPEN_TRUSTED_PROXY = "1";
assert.equal(
  isLoopbackHttpRequest({
    headers: {
      get: (n) => {
        if (n === "host") return "lexopen.onrender.com";
        if (n === "x-forwarded-for") return "127.0.0.1";
        return null;
      },
    },
  }),
  true
);

if (prevTrusted === undefined) delete process.env.LEXOPEN_TRUSTED_PROXY;
else process.env.LEXOPEN_TRUSTED_PROXY = prevTrusted;

console.log("loopback-request.test.ts OK");
