import assert from "node:assert/strict";
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  normalizeOrigin,
} from "./csrf";
import { assertCsrf } from "./api";

assert.equal(normalizeOrigin("http://pc.tailnet.ts.net:3000/path"), "http://pc.tailnet.ts.net:3000");
assert.equal(normalizeOrigin("not-a-url"), null);

const allowed = buildAllowedOrigins({
  host: "pc.tailnet.ts.net:3000",
  appUrl: "http://pc.tailnet.ts.net:3000",
  trustedCsv: "http://127.0.0.1:3000,http://localhost:3000",
});

assert.ok(isAllowedOrigin("http://pc.tailnet.ts.net:3000", allowed));
assert.ok(isAllowedOrigin("http://127.0.0.1:3000/login", allowed));
// Prefijo malicioso NO debe pasar
assert.equal(
  isAllowedOrigin("http://127.0.0.1:3000.evil.com", allowed),
  false
);
assert.equal(isAllowedOrigin("http://127.0.0.1:30001", allowed), false);

const withoutHost = buildAllowedOrigins({
  host: "evil.example:3000",
  appUrl: "https://app.example",
  trustedCsv: "https://app.example",
  trustHost: false,
});
assert.equal(isAllowedOrigin("http://evil.example:3000", withoutHost), false);
assert.ok(isAllowedOrigin("https://app.example", withoutHost));

function req(headers: Record<string, string>, method = "POST") {
  return new Request("http://pc.tailnet.ts.net:3000/api/x", {
    method,
    headers,
  });
}

process.env.LEXOPEN_TRUSTED_ORIGINS = "http://127.0.0.1:3000";
assertCsrf(
  req({
    host: "pc.tailnet.ts.net:3000",
    origin: "http://pc.tailnet.ts.net:3000",
  })
);
assertCsrf(
  req({
    host: "pc.tailnet.ts.net:3000",
    origin: "http://127.0.0.1:3000",
  })
);

let blocked = false;
try {
  assertCsrf(
    req({
      host: "pc.tailnet.ts.net:3000",
      origin: "http://127.0.0.1:3000.evil.com",
    })
  );
} catch {
  blocked = true;
}
assert.equal(blocked, true);

assertCsrf(req({ host: "pc.tailnet.ts.net:3000" }, "GET")); // métodos seguros

console.log("csrf.test.ts OK");
