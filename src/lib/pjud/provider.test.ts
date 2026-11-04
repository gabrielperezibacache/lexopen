import assert from "node:assert/strict";
import {
  fingerprint,
  pjudDemoAllowed,
  pjudSyncIntervalMs,
  fetchPjudMovimientos,
} from "@/lib/pjud/provider";

assert.equal(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint(" resolución ", new Date(2026, 7, 11, 12), "R-1")
);
assert.notEqual(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint("Resolución", new Date(2026, 7, 12, 12), "R-1")
);

const env = process.env as Record<string, string | undefined>;
const previousNodeEnv = env.NODE_ENV;
const previousDemo = env.PJUD_ALLOW_DEMO;
const previousInterval = env.PJUD_SYNC_INTERVAL_MINUTES;
env.NODE_ENV = "production";
env.PJUD_ALLOW_DEMO = "0";
assert.equal(pjudDemoAllowed(), false);
env.PJUD_ALLOW_DEMO = "1";
assert.equal(pjudDemoAllowed(), true);
env.PJUD_SYNC_INTERVAL_MINUTES = "60";
assert.equal(pjudSyncIntervalMs(), 60 * 60 * 1000);
env.PJUD_SYNC_INTERVAL_MINUTES = "0";
assert.equal(pjudSyncIntervalMs(), 240 * 60 * 1000);
delete env.PJUD_SYNC_INTERVAL_MINUTES;
assert.equal(pjudSyncIntervalMs(), 240 * 60 * 1000);
if (previousNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = previousNodeEnv;
if (previousDemo === undefined) delete env.PJUD_ALLOW_DEMO;
else env.PJUD_ALLOW_DEMO = previousDemo;
if (previousInterval === undefined) delete env.PJUD_SYNC_INTERVAL_MINUTES;
else env.PJUD_SYNC_INTERVAL_MINUTES = previousInterval;

console.log("pjud/provider.test.ts OK");

async function coverageFromPartner() {
  const names = ["NODE_ENV", "PJUD_ALLOW_DEMO", "PJUD_PUBLIC_SCRAPE", "PJUD_SCRAPER_URL", "PJUD_API_URL", "PJUD_API_KEY"] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let response: unknown = { movimientos: [{ titulo: "Resolución ficticia", fecha: "2026-11-01" }] };
  let requests = 0;
  try {
    Object.assign(process.env, { NODE_ENV: "production", PJUD_ALLOW_DEMO: "0", PJUD_PUBLIC_SCRAPE: "0", PJUD_SCRAPER_URL: "", PJUD_API_URL: "https://partner.example.test", PJUD_API_KEY: "" });
    globalThis.fetch = async input => {
      assert.ok(String(input).startsWith("https://partner.example.test/causas/lookup?"));
      requests++;
      return new Response(JSON.stringify(response));
    };
    const causa = { id: "fixture", rit: "C-100-2026", ruc: null, tribunal: "1º Juzgado Civil de Santiago", titulo: "Ficticia", caratula: null };
    const legacy = await fetchPjudMovimientos(causa);
    assert.equal(legacy.movimientos[0].cuaderno, null, "a legacy API must not invent Principal");
    assert.equal(legacy.cuadernos?.status, "unknown");
    const items = [{ key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok", count: 1 }];
    response = { movimientos: [{ titulo: "Resolución ficticia", fecha: "2026-11-01", cuaderno: "Principal" }], cuadernos: { status: "complete", total: 1, read: 1, items } };
    assert.equal((await fetchPjudMovimientos(causa)).cuadernos?.status, "complete");
    response = { movimientos: [], cuadernos: { status: "complete", total: 1, read: 1, items: [{ ...items[0], key: "PRIVATE_SESSION.JWT.VALUE" }] } };
    const unsafe = await fetchPjudMovimientos(causa);
    assert.equal(unsafe.cuadernos?.status, "unknown");
    assert.doesNotMatch(JSON.stringify(unsafe.cuadernos), /PRIVATE_SESSION/);
    assert.equal(requests, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete env[name]; else env[name] = previous[name];
    }
  }
  console.log("PJUD partner coverage: explicit unknown, verified metadata and no opaque session keys (mocked transport).");
}
coverageFromPartner().catch(error => { console.error(error); process.exitCode = 1; });
