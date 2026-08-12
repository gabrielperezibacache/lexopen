const assert = require("node:assert/strict");
const { isAllowedExternalUrl } = require("./external-url.cjs");

assert.equal(
  isAllowedExternalUrl("https://evil.com", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);
assert.equal(
  isAllowedExternalUrl("http://127.0.0.1:3000/setup", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("https://pc.ts.net:3010/login", {
    appUrls: ["https://pc.ts.net:3010"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("https://github.com/gabrielperezibacache/lexopen", {
    appUrls: ["http://127.0.0.1:3000"],
    extraHosts: ["github.com"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("javascript:alert(1)", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);
assert.equal(
  isAllowedExternalUrl("https://user:pass@127.0.0.1:3000/", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);

console.log("desktop/external-url.test.cjs OK");
