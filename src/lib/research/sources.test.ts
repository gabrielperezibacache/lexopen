import assert from "node:assert/strict";
import { describePublicLegalSource, fetchPublicLegalSource, isPublicSourceAddress, validatePublicLegalSourceUrl, PUBLIC_SOURCE_MAX_BYTES } from "./sources";

const dt = "https://www.dt.gob.cl/legislacion/1624/w3-article-129188.html";
const bcn = "https://www.bcn.cl/leychile/navegar?idNorma=242302";
const sii = "https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_renta/2016/ja2151.htm";
// Shapes and short identifiers come from the official BCN/SII documents; body
// sentences are deliberately fictitious so this fixture is never legal advice.
const siiContent = `<div><div style="font-weight:bold">RENTA (ORD. N° 2151, DE 01.08.2016)</div><div>ASUNTO FICTICIO DE PRUEBA</div><div><p>Contenido ficticio suficiente para comprobar la extracción fiel del cuerpo de un oficio tributario, sin transformar citas en una conclusión jurídica.</p><p>CONCLUSIÓN: la prueba conserva el texto publicado.</p><p>Oficio N° 2151, de 01.08.2016<br>Subdirección Normativa</p><script>no-evidencia</script><p hidden>no-visible</p></div></div>`;
const historicalJson = {
  metadatos: { id_norma: "242302", titulo_norma: "Norma ficticia de validación JSON", fecha_publicacion: "2005-09-22", fecha_version: "2005-09-22", vigencia: { inicio_vigencia: "2005-09-22", fin_vigencia: "2007-02-15" }, derogado: false },
  html: [{ i: 1, t: "<div>Texto de encabezado ficticio para comprobar la versión histórica.</div>", h: [{ i: 2, t: "<div>Artículo primero ficticio: el texto de prueba conserva su orden y sus notas.<span>Nota de fuente</span><script>no-evidencia</script></div>" }] }],
  estructura: [{ i: 1, n: "Encabezado", h: [{ i: 2, n: "Artículo 1" }] }],
  proyectos: [{ texto: "PROYECTO-AJENO-NO-ARTICULADO" }], doctrina: ["DOCTRINA-AJENA"],
  alerta_global: { m: ["El texto de esta versión no se encuentra vigente"] },
};
const dtHtml = `<!DOCTYPE html><html><head><title>Menú institucional</title><script>fetch('https://outside.invalid')</script></head><body>
  <nav>Menú que no es evidencia</nav>
  <div id="article_i__w3_ar_ArticuloCompleto_presentacion_1"><h3 class="titulo">ORD.N°252/20</h3><p class="fecha iso8601-20260416T0000000400">16-abr-2026</p></div>
  <div id="article_i__w3_ar_ArticuloCompleto_cuerpo_1"><p>DICTAMEN: <strong>252-20</strong></p><p>La exclusión de la limitación de jornada prevista en el artículo 22 inciso 2º del Código del Trabajo.</p><div style="display:none">No incluir palabras clave ocultas</div><script>Texto inyectado no jurídico</script></div>
  <aside>Dictamen distinto sin relación</aside></body></html>`;
const bcnXml = `<?xml version="1.0" encoding="UTF-8"?><Norma xmlns="http://www.leychile.cl/esquemas" normaId="242302" fechaVersion="2024-01-01" derogado="no derogado">
  <Identificador fechaPublicacion="2005-09-17"><TiposNumeros><TipoNumero><Tipo>Ley</Tipo><Numero>20000</Numero></TipoNumero></TiposNumeros></Identificador>
  <Metadatos><TituloNorma>Norma ficticia de validación XML</TituloNorma></Metadatos>
  <Encabezado><Texto>Texto ficticio suficiente para comprobar el formato de intercambio de BCN.</Texto></Encabezado>
  <EstructurasFuncionales><EstructuraFuncional><Articulo><Texto>Artículo primero: fixture que no representa una disposición real.</Texto></Articulo></EstructuraFuncional></EstructurasFuncionales>
  <ArchivosBinarios>datos-binarios-que-no-son-texto</ArchivosBinarios></Norma>`;

async function main() {
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(dtHtml, { headers: { "content-type": "text/html; charset=UTF-8" } });
  };
  const source = await fetchPublicLegalSource(dt, { fetch: transport });
  assert.equal(source.title, "ORD.N°252/20");
  assert.equal(source.organism, "Dirección del Trabajo");
  assert.equal(source.kind, "administrative");
  assert.equal(source.publishedAt?.toISOString().slice(0, 10), "2026-04-16");
  assert.equal(source.effectiveFrom, undefined);
  assert.equal(source.effectiveTo, undefined);
  assert.equal(source.rawBytes.toString(), dtHtml);
  assert.equal(source.canonicalUrl, dt);
  assert.ok(source.text.includes("DICTAMEN: 252-20"));
  assert.ok(source.text.includes("artículo 22 inciso 2º"));
  for (const omitted of ["Menú institucional", "Texto inyectado", "palabras clave ocultas", "Dictamen distinto"]) assert.equal(source.text.includes(omitted), false);
  assert.ok(source.coverageWarnings.some(w => /no acreditan su vigencia/.test(w)));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init?.redirect, "error");
  assert.equal(requests[0].init?.credentials, "omit");
  assert.equal(new Headers(requests[0].init?.headers).has("Authorization"), false);
  assert.equal(new Headers(requests[0].init?.headers).has("Cookie"), false);

  assert.equal(validatePublicLegalSourceUrl("https://dt.gob.cl/legislacion/1624/w3-article-129188.html#contenido"), dt);
  assert.equal(validatePublicLegalSourceUrl("https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=242302"), bcn);
  assert.deepEqual(describePublicLegalSource(sii), { canonicalUrl: sii, organism: "Servicio de Impuestos Internos", kind: "administrative" });
  assert.equal(describePublicLegalSource(bcn).kind, "legislation");
  assert.equal(describePublicLegalSource(dt).organism, "Dirección del Trabajo");
  assert.equal(validatePublicLegalSourceUrl("https://sii.cl/pagina/jurisprudencia/adminis/2016/renta/ja2151.htm#texto"), sii);
  assert.equal(validatePublicLegalSourceUrl(sii.replace("ley_impuesto_renta", "ley_impuesto_ventas")), sii.replace("ley_impuesto_renta", "ley_impuesto_ventas"));
  for (const invalid of ["http://www.dt.gob.cl/legislacion/1624/w3-article-129188.html", "https://127.0.0.1/", "https://10.0.0.1/", "https://169.254.169.254/", "https://www.dt.gob.cl.evil.invalid/legislacion/1624/w3-article-129188.html", "https://attacker@www.dt.gob.cl/legislacion/1624/w3-article-129188.html", `${dt}?secreto=expediente`, "https://www.dt.gob.cl:8443/legislacion/1624/w3-article-129188.html", "https://www.dt.gob.cl/portal/1626/w3-search.html", `${bcn}&idVersion=2024-02-31`, `${bcn}&idNorma=6374`, `${bcn}&idVersion=`, `${bcn}&opt=3`, `${sii}?expediente=privado`, sii.replace("www.sii.cl", "www.sii.cl.evil.invalid"), sii.replace("www.sii.cl", "usuario@www.sii.cl"), sii.replace("ja2151.htm", "ley_impuesto_renta_jadm2016.htm"), sii.replace("ja2151.htm", "ja2151.pdf"), sii.replace("ley_impuesto_renta", "jurisprudencia_judicial"), "https://www.sii.cl/normativa_legislacion/resoluciones/2026/reso48.pdf"]) {
    await assert.rejects(fetchPublicLegalSource(invalid, { fetch: transport }), (error: unknown) => (error as { status?: number }).status === 400);
  }
  assert.equal(requests.length, 1, "Unsupported input must cause zero requests");
  for (const privateAddress of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "fec0::1", "ff00::1", "2001:db8::1", "not-an-address"]) assert.equal(isPublicSourceAddress(privateAddress), false);
  for (const publicAddress of ["1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicSourceAddress(publicAddress), true);

  let redirects = 0;
  await assert.rejects(fetchPublicLegalSource(dt, { fetch: async () => { redirects++; return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/" } }); } }), /HTTP 302/);
  assert.equal(redirects, 1);
  await assert.rejects(fetchPublicLegalSource(bcn, { fetch: async () => new Response(null, { status: 401 }) }), /HTTP 401/);
  await assert.rejects(fetchPublicLegalSource(dt, { fetch: async () => new Response(null, { status: 204, headers: { "content-type": "text/html" } }) }), /no devolvió contenido/);
  await assert.rejects(fetchPublicLegalSource(dt, { fetch: async () => new Response("login", { headers: { "content-type": "text/html" } }) }), /no contiene un dictamen reconocible/);
  await assert.rejects(fetchPublicLegalSource(dt, { fetch: async () => new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }) }), /formato distinto/);
  await assert.rejects(fetchPublicLegalSource(dt, { fetch: async () => new Response(dtHtml, { headers: { "content-type": "text/html", "content-length": String(PUBLIC_SOURCE_MAX_BYTES + 1) } }) }), (error: unknown) => (error as { status?: number }).status === 413);
  await assert.rejects(fetchPublicLegalSource(dt, { maxBytes: 80, fetch: transport }), (error: unknown) => (error as { status?: number }).status === 413);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(fetchPublicLegalSource(dt, { signal: abort.signal, fetch: transport }), /cancelada/);
  assert.equal(requests.length, 2, "Aborted request must not invoke transport");
  const keepAlive = setTimeout(() => undefined, 1000);
  try { await assert.rejects(fetchPublicLegalSource(dt, { timeoutMs: 15, fetch: async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } }) }), /agotó su tiempo/); }
  finally { clearTimeout(keepAlive); }

  let bcnRequested = "";
  const xmlFetch: typeof fetch = async input => { bcnRequested = String(input); return new Response(bcnXml, { headers: { "content-type": "application/xml; charset=utf-8" } }); };
  const law = await fetchPublicLegalSource(bcn, { fetch: xmlFetch });
  assert.equal(law.kind, "legislation");
  assert.equal(law.externalId, "BCN:242302");
  assert.ok(bcnRequested.includes("/consulta/obtxml?opt=7&idNorma=242302"));
  assert.equal(law.publishedAt?.toISOString().slice(0, 10), "2005-09-17");
  assert.equal(law.effectiveFrom, undefined);
  assert.equal(law.text.includes("datos-binarios"), false);
  await assert.rejects(fetchPublicLegalSource(bcn, { fetch: async () => new Response(bcnXml.replace('normaId="242302"', 'normaId="6374"'), { headers: { "content-type": "text/xml" } }) }), /no identifica la norma solicitada/);
  await assert.rejects(fetchPublicLegalSource(bcn, { fetch: async () => new Response(`<!DOCTYPE Norma SYSTEM "file:///etc/passwd">${bcnXml}`, { headers: { "content-type": "text/xml" } }) }), /declaraciones no admitidas/);
  await assert.rejects(fetchPublicLegalSource(bcn, { fetch: async () => new Response(bcnXml.replace('</Norma>', ''), { headers: { "content-type": "text/xml" } }) }), /truncado/);
  assert.ok(law.coverageWarnings.some(w => w.includes("Fecha de versión declarada por BCN: 2024-01-01")));
  await assert.rejects(fetchPublicLegalSource(bcn, { fetch: async () => new Response(bcnXml.replace('fechaVersion="2024-01-01"', 'fechaVersion="2024-02-31"'), { headers: { "content-type": "text/xml" } }) }), /fecha de versión válida/);

  const jsonFetch: typeof fetch = async (input, init) => {
    bcnRequested = String(input);
    assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "omit");
    return new Response(JSON.stringify(historicalJson), { headers: { "content-type": "application/json; charset=utf-8" } });
  };
  const historical = await fetchPublicLegalSource(`${bcn}&idVersion=2005-09-22`, { fetch: jsonFetch });
  assert.equal(new URL(bcnRequested).hostname, "nuevo.leychile.cl");
  assert.equal(new URL(bcnRequested).searchParams.get("idVersion"), "2005-09-22");
  assert.equal(historical.mimeType, "application/json");
  assert.equal(historical.publishedAt?.toISOString().slice(0, 10), "2005-09-22");
  assert.equal(historical.effectiveFrom, undefined); assert.equal(historical.effectiveTo, undefined);
  assert.ok(historical.text.indexOf("encabezado") < historical.text.indexOf("Artículo primero"));
  assert.ok(historical.text.includes("Nota de fuente"));
  for (const omitted of ["PROYECTO-AJENO", "DOCTRINA-AJENA", "no-evidencia"]) assert.equal(historical.text.includes(omitted), false);
  assert.ok(historical.coverageWarnings.some(w => w.includes("Alerta de BCN:")));
  await assert.rejects(fetchPublicLegalSource(`${bcn}&idVersion=2007-02-16`, { fetch: jsonFetch }), /no confirmó la versión histórica/);
  // Historical XML ignores the requested version in the actual public service;
  // it must never be silently accepted as the historical JSON representation.
  await assert.rejects(fetchPublicLegalSource(`${bcn}&idVersion=2005-09-22`, { fetch: xmlFetch }), /formato distinto/);
  async function invalidJson(value: unknown, expression: RegExp) {
    await assert.rejects(fetchPublicLegalSource(`${bcn}&idVersion=2005-09-22`, { fetch: async () => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }) }), expression);
  }
  await invalidJson({ ...historicalJson, metadatos: { ...historicalJson.metadatos, id_norma: "6374" } }, /no identifica/);
  await invalidJson({ ...historicalJson, metadatos: { ...historicalJson.metadatos, vigencia: { inicio_vigencia: "2026-04-16" } } }, /versión histórica/);
  await invalidJson({ ...historicalJson, html: [{ i: 1, t: "Texto incompleto" }] }, /no coincide/);
  await invalidJson({ ...historicalJson, html: [...historicalJson.html, historicalJson.html[0]] }, /incompleta/);

  const tax = await fetchPublicLegalSource(sii, { fetch: async () => new Response(siiContent, { headers: { "content-type": "text/html" } }) });
  assert.equal(tax.organism, "Servicio de Impuestos Internos");
  assert.equal(tax.kind, "administrative"); assert.equal(tax.externalId, "SII:2016:2151");
  assert.ok(tax.title.includes("Oficio N° 2151")); assert.ok(tax.title.includes("ASUNTO FICTICIO"));
  assert.equal(tax.publishedAt?.toISOString().slice(0, 10), "2016-08-01");
  assert.equal(tax.effectiveFrom, undefined); assert.equal(tax.effectiveTo, undefined);
  assert.equal(tax.text.includes("no-evidencia"), false); assert.equal(tax.text.includes("no-visible"), false);
  const latinHtml = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><title>RENTA (ORD. N° 2151, DE 01.08.2016)</title></head><body>${siiContent.replaceAll("—", "-")}</body></html>`;
  const latin = Buffer.from(latinHtml, "latin1");
  const taxLegacy = await fetchPublicLegalSource("https://www.sii.cl/pagina/jurisprudencia/adminis/2016/renta/ja2151.htm", { fetch: async input => {
    assert.ok(String(input).includes("/pagina/jurisprudencia/adminis/2016/renta/ja2151.htm"));
    return new Response(latin, { headers: { "content-type": "text/html" } });
  } });
  assert.equal(taxLegacy.canonicalUrl, sii); assert.equal(taxLegacy.text, tax.text); assert.deepEqual(taxLegacy.rawBytes, latin);
  for (const badHtml of [siiContent.replaceAll("2151", "999"), siiContent.replaceAll("01.08.2016", "31.02.2016"), siiContent.replace("Oficio N° 2151", "Oficio N° 999"), "<html><title>Índice</title><p>Enlace a oficios</p></html>"]) {
    await assert.rejects(fetchPublicLegalSource(sii, { fetch: async () => new Response(badHtml, { headers: { "content-type": "text/html" } }) }), /no confirma|cierre concordantes/);
  }
  await assert.rejects(fetchPublicLegalSource(sii, { fetch: async () => new Response(latinHtml.replace("iso-8859-1", "utf-7"), { headers: { "content-type": "text/html" } }) }), /Codificación/);
  console.log("Public sources OK: DT and SII individual extraction, original bytes/charsets, closed URL scope, no redirects/credentials, size/timeout/abort, BCN XML identity and historical JSON/version/structure, no inferred validity");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
