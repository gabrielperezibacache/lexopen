import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createScraperServer } from "@/lib/pjud/scraper-server";

async function main() {
  const server = createScraperServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "lexopen-pjud-scraper");
  assert.equal(typeof body.workerRunning, "boolean");
  assert.ok(body.worker && typeof body.worker.running === "boolean");
  assert.equal(typeof body.captcha, "boolean");
  assert.ok(body.captchaProviders);
  assert.equal(typeof body.captchaProviders.configured, "boolean");
  assert.ok(Array.isArray(body.captchaProviders.providers));
  assert.ok(body.captchaProviders.providers.length >= 5);

  const missing = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(missing.status, 404);

  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );

  console.log("pjud/scraper-server.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
