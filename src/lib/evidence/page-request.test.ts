import assert from "node:assert/strict";
import { requestPdfPage } from "./page-request";

async function main() {
  let calls = 0;
  const waits: number[] = [];
  const transport: typeof fetch = async () => ++calls < 3 ? new Response('{"error":"Ocupado"}', { status: 429 }) : new Response(new Uint8Array([1,2,3]), { headers: { "Content-Type": "image/png" } });
  const image = await requestPdfPage("/private-page", new AbortController().signal, transport, async ms => { waits.push(ms); });
  assert.equal(image.size, 3); assert.equal(calls, 3); assert.deepEqual(waits, [500,1000]);
  for (const status of [401,403,404,409,500]) {
    calls = 0;
    await assert.rejects(requestPdfPage("/private-page", new AbortController().signal, async () => { calls++; return new Response('{"error":"No disponible"}', { status }); }), /No disponible/);
    assert.equal(calls, 1, `Never retry status ${status}`);
  }
  calls = 0;
  await assert.rejects(requestPdfPage("/private-page", new AbortController().signal, async () => { calls++; return new Response('{"error":"Ocupado"}', {status:429}); }, async () => {}), /Ocupado/);
  assert.equal(calls, 3, "Retry must be bounded");
  const controller = new AbortController(); calls = 0;
  await assert.rejects(requestPdfPage("/private-page", controller.signal, async () => { calls++; return new Response(null, {status:429}); }, async () => { controller.abort(); }), error => (error as Error).name === "AbortError");
  assert.equal(calls, 1, "A superseded page must not create more requests");
  await assert.rejects(requestPdfPage("/private-page", new AbortController().signal, async () => new Response("html", {headers:{"Content-Type":"text/html"}})), /no es una imagen verificable/);
  console.log("PDF page request PASS: bounded busy recovery, current authorization failures, cancellation and verified image type");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
