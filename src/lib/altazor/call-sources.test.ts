import assert from "node:assert/strict";
import { test } from "node:test";
import { CALL_SOURCES, parseCallFeed, readCallSource } from "./call-sources";

const source = CALL_SOURCES.find(item => item.id === "ukri-gb")!;
const feed = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
const entry = `<item>
  <title>Ciencia &amp; formación</title><guid isPermaLink="false">public-call-1</guid>
  <link>https://www.ukri.org/opportunity/ficticia/?campaign=test#old</link>
  <description><![CDATA[<p>Texto <em>público</em>.</p><script>oculto()</script><p>Más datos&nbsp; aquí.</p>]]></description>
  <pubDate>Tue, 16 Jun 2026 09:00:00 +0000</pubDate><deadline>2026-10-22</deadline>
</item>`;
const hasStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

test("RSS conserva la identidad pública, limpia HTML y deduplica sin adivinar plazos", () => {
  const repeated = entry.replace("public-call-1", "otro-guid");
  const hostile = entry.replace("https://www.ukri.org", "https://www.ukri.org@external.example");
  const secondary = entry.replace("public-call-1", "public-call-2").replace("/ficticia/", "/otra/").replace("2026-10-22", "2026-02-30");
  const [first, second] = parseCallFeed(feed(entry + repeated + hostile + secondary), source);
  assert.equal(first.title, "Ciencia & formación");
  assert.equal(first.summary, "Texto público. Más datos aquí.");
  assert.equal(first.url, "https://www.ukri.org/opportunity/ficticia/");
  assert.equal(first.deadline, "2026-10-22");
  assert.equal(first.publishedAt, "2026-06-16T09:00:00.000Z");
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.notEqual(first.id, second.id);
  assert.equal(second.deadline, undefined);
  assert.equal(parseCallFeed(feed(entry.replace("/ficticia/", "/nueva-ruta/")), source)[0].id, first.id);
  assert.equal(parseCallFeed(feed(entry + repeated + hostile + secondary), source).length, 2);
});

test("Atom conserva la ficha alternativa oficial y distingue una actualización de la publicación", () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <id>urn:call:ficticia</id><title>Convocatoria</title>
    <link rel="self" href="https://external.example/private"/><link rel="alternate" href="/opportunity/ficticia/"/>
    <summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Un párrafo</p><p>Otro párrafo</p></div></summary>
    <updated>2026-06-17T10:00:00Z</updated>
  </entry></feed>`;
  const [item] = parseCallFeed(atom, source);
  assert.equal(item.url, "https://www.ukri.org/opportunity/ficticia/");
  assert.equal(item.summary, "Un párrafo Otro párrafo");
  assert.equal(item.publishedAt, undefined);
  assert.equal(item.deadline, undefined);
});

test("NSF traslada sólo una fecha límite explícita de propuesta completa", () => {
  const nsf = CALL_SOURCES.find(item => item.id === "nsf-us")!;
  const item = (slug: string, line: string) => `<item><title>Ficha ${slug}</title><link>https://www.nsf.gov/funding/opportunities/${slug}</link><description><![CDATA[${line}<br/><p>Bases y requisitos.</p>]]></description></item>`;
  const rows = parseCallFeed(feed(
    item("full", "Full Proposal Deadline Date: November 10, 2026") +
    item("preliminary", "Preliminary Proposal Deadline Date: December 2, 2026") +
    item("multiple", "Full Proposal Deadline Date: November 10, 2026 and December 2, 2026")
  ), nsf);
  assert.deepEqual(rows.map(row => row.deadline), ["2026-11-10", undefined, undefined]);
});

test("el lector rechaza XML con entidades, documentos ajenos y fichas sin origen oficial", () => {
  assert.throws(() => parseCallFeed(`<!DOCTYPE rss [<!ENTITY malicious SYSTEM "file:///private.txt">]>${feed(entry)}`, source), hasStatus(502));
  assert.throws(() => parseCallFeed("<html><body>Error</body></html>", source), hasStatus(502));
  assert.throws(() => parseCallFeed(feed(entry.replace("/opportunity/ficticia/", "/redirect/")), source), hasStatus(502));
  assert.deepEqual(parseCallFeed(feed(""), source), []);
});

test("el transporte solo consulta canales fijos y rechaza redirecciones y respuestas excesivas", async () => {
  let checked = false;
  const items = await readCallSource("ukri-gb", { fetch: async (url, init) => {
    assert.equal(url, source.feedUrl);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.body, undefined);
    checked = true;
    return new Response(feed(entry), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
  } });
  assert.equal(items.length, 1);
  assert.equal(checked, true);
  const never = async () => assert.fail("No se debe hacer una consulta externa");
  await assert.rejects(readCallSource("https://private.example/feed", { fetch: never }), hasStatus(404));
  await assert.rejects(readCallSource("anid-cl", { fetch: never }), hasStatus(422));
  await assert.rejects(readCallSource("ukri-gb", { fetch: async () => Response.redirect("https://private.example/feed") }), hasStatus(502));
  await assert.rejects(readCallSource("ukri-gb", { fetch: async () => new Response("x".repeat(512 * 1024 + 1), { headers: { "content-type": "text/xml" } }) }), hasStatus(413));
});
