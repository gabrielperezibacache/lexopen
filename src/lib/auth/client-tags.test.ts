import assert from "node:assert/strict";
import {
  isClientSharedTag,
  parseTagTokens,
} from "@/lib/auth/client-tags";
import {
  isPrivateOrLocalHostname,
  isSafeOutboundHttpUrl,
} from "@/lib/net/safe-url";

assert.deepEqual(parseTagTokens("cliente, interno"), ["cliente", "interno"]);
assert.equal(isClientSharedTag("cliente"), true);
assert.equal(isClientSharedTag("foo,cliente;bar"), true);
assert.equal(isClientSharedTag("no_cliente"), false);
assert.equal(isClientSharedTag("clientes"), false);
assert.equal(isClientSharedTag("cliente-interno"), false);

assert.equal(isPrivateOrLocalHostname("127.0.0.1"), true);
assert.equal(isPrivateOrLocalHostname("10.0.0.5"), true);
assert.equal(isPrivateOrLocalHostname("169.254.169.254"), true);
assert.equal(isPrivateOrLocalHostname("metadata.google.internal"), true);
assert.equal(isPrivateOrLocalHostname("example.com"), false);
assert.equal(isPrivateOrLocalHostname("::1"), true);
assert.equal(isPrivateOrLocalHostname("fd12:3456:789a::1"), true);
assert.equal(isPrivateOrLocalHostname("fe80::1"), true);
assert.equal(isPrivateOrLocalHostname("::ffff:127.0.0.1"), true);
assert.equal(isPrivateOrLocalHostname("::ffff:a9fe:a9fe"), true);
assert.equal(isPrivateOrLocalHostname("127.0.0.1.nip.io"), true);
assert.equal(isPrivateOrLocalHostname("10.0.0.1.sslip.io"), true);
assert.equal(isPrivateOrLocalHostname("2001:4860:4860::8888"), false);

assert.equal(
  isSafeOutboundHttpUrl("https://hermes.example.com/v1", { allowHttp: false }),
  true
);
assert.equal(
  isSafeOutboundHttpUrl("http://169.254.169.254/", { allowHttp: true }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("http://localhost:8642/v1", { allowHttp: true }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("http://localhost:8642/v1", {
    allowHttp: true,
    allowLoopback: true,
  }),
  true
);
assert.equal(
  isSafeOutboundHttpUrl("https://[::ffff:169.254.169.254]/latest", {
    allowHttp: false,
  }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("https://[fd00::1]/v1", { allowHttp: false }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("https://127.0.0.1.nip.io/v1", { allowHttp: false }),
  false
);

console.log("client-tags + safe-url OK");
