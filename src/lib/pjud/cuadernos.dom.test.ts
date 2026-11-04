/** Offline fixtures. No OJV navigation, credentials, document requests or solver. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { changeCuaderno, pjudCuadernoIdentity, scrapeAllCuadernos } from "@/lib/pjud/public-scrape";
import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import { PJUD_MAX_CAUSA_MOVIMIENTOS } from "@/lib/pjud/cuadernos-limits";

type Entry = { code: string; label: string; rows?: number; title?: string; empty?: boolean; brokenHistory?: boolean; brokenNotifications?: boolean; stale?: boolean; paged?: boolean };
const entries: Entry[] = [
  { code: "1.0", label: "1.0 - Principal", rows: 1 },
  { code: "1.1", label: "1.1 - Excepciones Dilatorias", rows: 1 },
  { code: "2.0", label: "2.0 - Cumplimiento incidental", rows: 1 },
];

function fixture(data: Entry[], options: { delayMs?: number; noSelector?: boolean } = {}) {
  return `<div class="modal show" id="modalDetalleCivil" style="display:block">
    <table class="table-titulos"><tbody><tr><td>Detalle de causa ficticia</td></tr></tbody></table>
    <div id="selectorHost"></div><div id="historyHost"></div>
  </div><nav class="pagination" aria-label="Paginación del listado exterior"><button class="next">Siguiente</button></nav><script>(()=>{
  const data = ${JSON.stringify(data)};
  let generation = 0;
  window.queries = [];
  function rows(entry, notifications) {
    if (entry.empty) return '<tr><td colspan="4">Sin movimientos</td></tr>';
    if (entry.brokenHistory && !notifications) return '';
    let text = '';
    const count = notifications ? Math.min(entry.rows || 1, 1) : (entry.rows || 1);
    for (let index=0; index<count; index++) text += '<tr><td>'+(index+1)+'</td><td>01/10/2026</td><td>'+(notifications?'Notificación ficticia':entry.title || 'Resolución idéntica ficticia')+'</td><td></td></tr>';
    return text;
  }
  function table(entry, notifications=false) {
    return '<table'+(notifications&&entry.brokenNotifications?' aria-busy="true"':'')+'><thead><tr><th>Folio</th><th>Fecha</th><th>Trámite</th><th>Doc.</th></tr></thead><tbody>'+rows(entry,notifications)+'</tbody></table>';
  }
  function render(code) {
    generation++;
    const entry = data.find(item => item.code === code);
    ${options.noSelector ? "selectorHost.innerHTML='';" : `selectorHost.innerHTML='<label for="selCuaderno">Cuaderno</label><select id="selCuaderno">'+data.map(item=>'<option value="SESSION_TOKEN_MUST_NOT_LEAK_'+generation+'_'+item.code+'"'+(item.code===code?' selected':'')+'>'+item.label+'</option>').join('')+'</select>';
    selCuaderno.onchange = () => {
      const selected = data[selCuaderno.selectedIndex]; window.queries.push(selected.code);
      // The previous data remains on screen during the request, as on real OJV.
      const body = document.querySelector('#historiaCiv tbody');
      if (body) body.insertAdjacentHTML('beforeend','<tr class="loading"><td colspan="4">Cargando...</td></tr>');
      setTimeout(()=> {
        if (selected.stale) {
          document.querySelectorAll('.loading').forEach(node=>node.remove());
          const header = document.querySelector('#historiaCiv th');
          if (header) header.setAttribute('data-response','new-heading-only');
          return;
        }
        render(selected.code);
      }, ${options.delayMs ?? 70});
    };`}
    historyHost.innerHTML='<ul class="nav nav-tabs"><li><a href="#historiaCiv" data-toggle="tab">Historia</a></li><li><a href="#notificacionesCiv" data-toggle="tab">Notificaciones</a></li><li><a href="#escritosCiv" data-toggle="tab">Escritos</a></li></ul>'+
      '<div class="tab-pane active" id="historiaCiv">'+table(entry)+(entry.paged?'<nav class="pagination"><button aria-label="Next page">›</button></nav>':'')+'</div>'+
      '<div class="tab-pane" id="notificacionesCiv" style="display:none">'+table(entry,true)+'</div>'+
      '<div class="tab-pane" id="escritosCiv" style="display:none"><table><thead><tr><th>Doc.</th><th>Fecha de ingreso</th><th>Tipo Escrito</th></tr></thead><tbody></tbody></table></div>';
    document.querySelectorAll('.nav-tabs a').forEach(link=>link.onclick=event=>{
      event.preventDefault();
      document.querySelectorAll('.tab-pane').forEach(pane=>{pane.classList.remove('active');pane.style.display='none';});
      const pane=document.querySelector(link.getAttribute('href'));pane.classList.add('active');pane.style.display='block';
    });
  }
  render(data[0].code);
  })();</script>`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const prior = process.env.PJUD_AUTO_CONFIRM_PROMPTS;
  process.env.PJUD_AUTO_CONFIRM_PROMPTS = "0";
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    const options = { allowPrompts: false, panelTimeoutMs: 400, transitionTimeoutMs: 500, emptyIdleMs: 10, totalTimeoutMs: 8_000 };
    await page.setContent(fixture(entries));
    await assert.doesNotReject(() => changeCuaderno(page, { ...pjudCuadernoIdentity(entries[1].label), value: "" }, { timeoutMs: 800, allowPrompts: false }));
    await page.setContent(fixture(entries));
    const first = await scrapeAllCuadernos(page, options);
    assert.equal(first.cuadernos.status, "complete", JSON.stringify(first.cuadernos));
    assert.equal(first.cuadernos.read, 3);
    assert.equal(first.movimientos.length, 6);
    assert.deepEqual(first.cuadernos.items.map(item => item.key), ["cuaderno:1.0", "cuaderno:1.1", "cuaderno:2.0"]);
    assert.deepEqual([...new Set(first.movimientos.map(item => item.cuaderno))], ["Principal", "1.1 - Excepciones Dilatorias", "2.0 - Cumplimiento incidental"]);
    assert.equal(new Set(first.movimientos.map(item => item.externalId)).size, 6, "identical folios, titles and dates remain distinct across cuadernos");
    assert.doesNotMatch(JSON.stringify(first), /SESSION_TOKEN_MUST_NOT_LEAK/);
    assert.deepEqual(normalizeCuadernosCoverage(first.cuadernos), first.cuadernos);
    const repeat = await scrapeAllCuadernos(page, options);
    assert.deepEqual(repeat.movimientos.map(item => item.externalId).sort(), first.movimientos.map(item => item.externalId).sort(), "fresh repeat has stable identities despite regenerated option values");
    assert.equal(repeat.cuadernos.status, "complete");
    assert.deepEqual(await page.evaluate(() => (window as typeof window & { queries: string[] }).queries), ["1.1", "2.0", "1.0", "1.1", "2.0"]);

    await page.setContent(fixture(entries.map(entry => ({ ...entry, stale: entry.code === "1.1" }))));
    const stale = await scrapeAllCuadernos(page, { ...options, transitionTimeoutMs: 170 });
    assert.equal(stale.cuadernos.status, "partial");
    assert.equal(stale.cuadernos.read, 2);
    assert.equal(stale.cuadernos.items[1].status, "failed");
    assert.equal(stale.cuadernos.items[1].count, 0);
    assert.ok(stale.movimientos.every(item => item.cuaderno !== "1.1 - Excepciones Dilatorias"), "spinner and heading changes cannot relabel old rows as a new cuaderno");

    await page.setContent(fixture(entries.map(entry => ({ ...entry, brokenNotifications: entry.code === "1.1" }))));
    const partial = await scrapeAllCuadernos(page, { ...options, panelTimeoutMs: 120 });
    assert.equal(partial.cuadernos.status, "partial");
    assert.equal(partial.cuadernos.read, 2);
    assert.equal(partial.cuadernos.items[1].count, 1, "a failed auxiliary tab retains the verified history");
    assert.equal(partial.cuadernos.items[1].status, "failed");
    assert.ok(partial.movimientos.some(item => item.cuaderno === "1.1 - Excepciones Dilatorias"));

    await page.setContent(fixture(entries.map(entry => ({ ...entry, paged: entry.code === "1.1" }))));
    const paged = await scrapeAllCuadernos(page, options);
    assert.equal(paged.cuadernos.status, "partial");
    assert.equal(paged.cuadernos.read, 2);
    assert.match(paged.cuadernos.items[1].note || "", /páginas por leer/);
    assert.equal(paged.cuadernos.items[1].count, 2, "unverified paging retains the page read without claiming completeness");

    await page.setContent(fixture(entries.map(entry => ({ ...entry, brokenHistory: entry.code === "1.0" }))));
    const brokenFirst = await scrapeAllCuadernos(page, { ...options, panelTimeoutMs: 250 });
    assert.equal(brokenFirst.cuadernos.status, "partial");
    assert.equal(brokenFirst.cuadernos.read, 2, "an unreadable initial cuaderno does not prevent reading later ones");

    await page.setContent(fixture(entries.map(entry => ({ ...entry, empty: entry.code === "1.1" }))));
    const empty = await scrapeAllCuadernos(page, options);
    assert.equal(empty.cuadernos.status, "complete");
    assert.equal(empty.cuadernos.items[1].count, 0, "an explicitly empty history remains a verified cuaderno");

    await page.setContent(fixture([{ ...entries[0], rows: 601 }]));
    const large = await scrapeAllCuadernos(page, { ...options, totalTimeoutMs: 15_000 });
    assert.equal(large.cuadernos.status, "complete");
    assert.equal(large.movimientos.length, 602, "the old 500-row parser default does not truncate full-cuaderno reads");

    await page.setContent(fixture([{ ...entries[0], rows: 2 }], { noSelector: true }));
    const unknown = await scrapeAllCuadernos(page, options);
    assert.deepEqual(unknown.cuadernos, { status: "unknown", total: null, read: 0, items: [] });
    assert.ok(unknown.movimientos.every(item => !item.cuaderno), "a missing selector never invents Principal");

    await page.setContent(fixture([{ ...entries[0], rows: 2, brokenNotifications: true }], { noSelector: true }));
    let unknownPartial: Awaited<ReturnType<typeof scrapeAllCuadernos>> | undefined;
    await assert.doesNotReject(async () => { unknownPartial = await scrapeAllCuadernos(page, options); });
    assert.equal(unknownPartial?.cuadernos.status, "partial");
    assert.equal(unknownPartial?.movimientos.length, 2, "an unlisted detail also retains verified history when an auxiliary tab fails");

    await page.setContent(fixture([{ ...entries[0], rows: PJUD_MAX_CAUSA_MOVIMIENTOS + 1 }]));
    const capped = await scrapeAllCuadernos(page, { ...options, totalTimeoutMs: 30_000 });
    assert.equal(capped.movimientos.length, PJUD_MAX_CAUSA_MOVIMIENTOS);
    assert.equal(capped.cuadernos.status, "partial");
    assert.equal(capped.cuadernos.items[0].status, "failed", "a safety cap cannot be reported as complete");

    assert.equal(pjudCuadernoIdentity("1.0 - Principal").cuaderno, "Principal");
    assert.notEqual(pjudCuadernoIdentity("1.1 - Incidente").key, pjudCuadernoIdentity("1.2 - Incidente").key);
    assert.match(pjudCuadernoIdentity("Cuaderno especial").key, /^cuaderno:label:[a-f0-9]{24}$/);
    assert.throws(() => pjudCuadernoIdentity("eyJsecret123456.eyJsession123456.signature123456"), /etiqueta/);
    console.log("pjud/cuadernos.dom.test.ts OK (offline fixtures, no credentials/network)");
  } finally {
    if (prior === undefined) delete process.env.PJUD_AUTO_CONFIRM_PROMPTS;
    else process.env.PJUD_AUTO_CONFIRM_PROMPTS = prior;
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
