import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { ZodError } from "zod";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function harness() {
  const state = { csrf: true, staff: true, allowed: true, actorId: "actor-a", limited: false, onLimit: undefined as (() => void) | undefined, searches: 0, reads: 0 };
  const error = (message: string, status: number) => Object.assign(new Error(message), { status });
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/api": {
      assertCsrf: () => { if (!state.csrf) throw error("CSRF", 403); },
      requireStaff: async () => { state.reads++; if (!state.staff) throw error("Acceso denegado", 403); return { id: state.actorId, allowed: state.allowed }; },
      httpError: error,
      handleRouteError: (e: unknown) => Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: e instanceof ZodError ? 400 : (e as { status?: number }).status || 500 }),
    },
    "@/lib/auth/access": { httpError: error },
    "@/lib/auth/permissions": { canSome: (user: { allowed: boolean }, permission: string) => { assert.equal(permission, "assistant.use"); return user.allowed; } },
    "@/lib/auth/rate-limit": { rateLimitAsync: async (key: string, limit: number, interval: number) => { assert.equal(key, "research:pjud:actor-a"); assert.equal(limit, 12); assert.equal(interval, 60_000); state.onLimit?.(); return { ok: !state.limited }; } },
    "@/lib/research/sources": { searchPublicPjudJudgments: async (input: unknown, options: { signal: AbortSignal }) => { state.searches++; assert.ok(options.signal); assert.deepEqual(JSON.parse(JSON.stringify(input)), { terms: "contrato", rol: "", page: 0 }); return { items: [], totalReported: 0 }; } },
  };
  const bundle = await build({ entryPoints: [path.join(root, "app/api/research/pjud/route.ts")], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "boundaries", setup(builder) {
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => ["@/lib/knowledge/route-body", "@/lib/research/pjud-search", "@/lib/pjud/private-response"].includes(name) ? { path: path.join(root, name.slice(2) + ".ts") } : { path: name, external: true });
    // Only schema validation is used from this module; the source transport is external.
    builder.onResolve({ filter: /^\.\/pjud-judgments$/ }, () => ({ path: "fixture-unused", external: true }));
  } }] });
  modules["fixture-unused"] = {};
  const loaded = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  runInNewContext(bundle.outputFiles[0].text, { module: loaded, exports: loaded.exports, require: (id: string) => modules[id] ?? require(id), Buffer, TextDecoder, console });
  return { state, post: (request?: Request) => loaded.exports.POST(request || new Request("http://fixture.invalid", { method: "POST", body: JSON.stringify({ terms: "contrato" }) })) };
}
function privateHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
async function main() {
  const valid = await harness(); const response = await valid.post();
  assert.equal(response.status, 200); assert.equal(valid.state.searches, 1); assert.equal(valid.state.reads, 2); privateHeaders(response);
  for (const key of ["csrf", "staff", "allowed"] as const) {
    const test = await harness(); test.state[key] = false;
    const denied = await test.post(); assert.equal(denied.status, 403); privateHeaders(denied); assert.equal(test.state.searches, 0);
  }
  const rate = await harness(); rate.state.limited = true; const limited = await rate.post(); assert.equal(limited.status, 429); privateHeaders(limited); assert.equal(rate.state.searches, 0);
  for (const mutation of [(s: Awaited<ReturnType<typeof harness>>["state"]) => { s.allowed = false; }, (s: Awaited<ReturnType<typeof harness>>["state"]) => { s.actorId = "actor-b"; }, (s: Awaited<ReturnType<typeof harness>>["state"]) => { s.staff = false; }]) {
    const test = await harness(); test.state.onLimit = () => mutation(test.state); const denied = await test.post(); assert.equal(denied.status, 403); privateHeaders(denied); assert.equal(test.state.searches, 0);
  }
  for (const [body, status] of [["{", 400], [JSON.stringify({ terms: "contrato", privateDocument: "should-not-forward" }), 400], ["x".repeat(4097), 413]] as const) {
    const test = await harness(); const rejected = await test.post(new Request("http://fixture.invalid", { method: "POST", body })); assert.equal(rejected.status, status); privateHeaders(rejected); assert.equal(test.state.searches, 0);
  }
  const declared = await harness();
  const tooLarge = await declared.post(new Request("http://fixture.invalid", { method: "POST", body: "{}", headers: { "content-length": "4097" } }));
  assert.equal(tooLarge.status, 413); privateHeaders(tooLarge); assert.equal(declared.state.searches, 0);
  const cancelled = await harness(); const controller = new AbortController(); cancelled.state.onLimit = () => controller.abort();
  const stopped = await cancelled.post(new Request("http://fixture.invalid", { method: "POST", body: JSON.stringify({ terms: "contrato" }), signal: controller.signal })); assert.equal(stopped.status, 408); privateHeaders(stopped); assert.equal(cancelled.state.searches, 0);
  console.log("PJUD route: real handler/parser/schema, CSRF, staff/capability, revocation, identity change, size, rate, cancellation and private headers OK; zero DB/network");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
