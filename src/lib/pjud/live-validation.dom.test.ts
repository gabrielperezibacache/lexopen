/** All browser requests are fulfilled locally; no OJV access or real credentials. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readManuallyAuthenticatedMisCausas } from "@/lib/pjud/live-validation";
import { redactedPjudValidationUrl, startClaveUnicaOidcFromOjv } from "@/lib/pjud/ojv-oidc";
import { openClaveUnicaFromOjv } from "@/lib/pjud/public-scrape";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["popup", "same-tab", "form"] as const) {
      const context = await browser.newContext();
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        const login = "https://accounts.claveunica.gob.cl/accounts/login/?next=PRIVATE_OIDC&state=PRIVATE#PRIVATE";
        const body = url.hostname === "accounts.claveunica.gob.cl"
          ? '<input id="uname"><input id="pword" type="password"><button>INGRESA</button>'
          : mode === "form"
            ? `<form id="cuform" action="${login}" target="_blank"></form>`
            : `<script>function AutenticaCUnica(){${mode === "popup" ? `window.open(${JSON.stringify(login)}, '_blank')` : `location.href=${JSON.stringify(login)}`}}</script>`;
        await route.fulfill({ contentType: "text/html", body });
      });
      const page = await context.newPage();
      await page.goto("https://oficinajudicialvirtual.pjud.cl/home/index.php");
      const oidc = await startClaveUnicaOidcFromOjv(page, { timeoutMs: 2_000 });
      assert.equal(oidc.started, mode === "form" ? "cuform" : "AutenticaCUnica");
      assert.ok(oidc.page, `${mode} OIDC entry must be observed`);
      assert.equal(oidc.page === page, mode === "same-tab");
      assert.equal(redactedPjudValidationUrl(oidc.page.url()), "https://accounts.claveunica.gob.cl/accounts/login/");
      await context.close();
    }

    const context = await browser.newContext();
    await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `
      <button onclick="window.accepted=true">Acepto</button>
      <div class="sweet-alert showSweetAlert visible"><button class="confirm" onclick="window.confirmed=true">Continuar</button></div>
      <a id="menuMisCausas" href="#" onclick="event.preventDefault();window.menuOpened=true">Mis Causas</a>
      <button id="btnBuscar" onclick="window.searched=true;document.querySelector('#results').innerHTML='<table id=verDetalleJuridica><tr><td><a>ver</a></td><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td><td></td><td>PRIVATE_CASE_TITLE</td><td>01/01/2024</td><td>Tramitación</td></tr></table>'">Buscar</button>
      <main id="results"></main>
    ` }));
    const page = await context.newPage();
    await page.goto("https://oficinajudicialvirtual.pjud.cl/indexN.php?token=PRIVATE#PRIVATE");
    const listing = await readManuallyAuthenticatedMisCausas(page);
    assert.equal(listing.status, "listed");
    assert.equal(listing.openedMenu, true);
    assert.equal(listing.itemCount, 1);
    assert.deepEqual(listing.materiasTried, []);
    assert.equal(listing.pageUrl, "https://oficinajudicialvirtual.pjud.cl/indexN.php");
    assert.doesNotMatch(JSON.stringify(listing), /PRIVATE|C-1-2024|Santiago|caratula|ruc|cookie/i);
    const actions = await page.evaluate(() => {
      const w = window as typeof window & { accepted?: boolean; confirmed?: boolean; menuOpened?: boolean; searched?: boolean };
      return { accepted: Boolean(w.accepted), confirmed: Boolean(w.confirmed), menuOpened: Boolean(w.menuOpened), searched: Boolean(w.searched) };
    });
    assert.deepEqual(actions, { accepted: false, confirmed: false, menuOpened: true, searched: true });

    await page.setContent('<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a><button onclick="document.querySelector(\'#resultConsultaCausa\').innerHTML=\'<table><tr><td>No se encontraron resultados</td></tr></table>\'">Buscar</button><div id="resultConsultaCausa"></div>');
    const empty = await readManuallyAuthenticatedMisCausas(page);
    assert.equal(empty.status, "empty-or-unverified");
    assert.equal(empty.itemCount, 0);
    await page.setContent('<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a><table id="verDetalleJuridica"><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>');
    const noSearch = await readManuallyAuthenticatedMisCausas(page);
    assert.equal(noSearch.status, "failed", "old rows without Buscar are not a validated response");
    assert.equal(noSearch.itemCount, null);
    await page.setContent('<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a><button>Buscar</button><table id="verDetalleJuridica"><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>');
    const unchanged = await readManuallyAuthenticatedMisCausas(page, { responseTimeoutMs: 100 });
    assert.equal(unchanged.status, "failed", "Buscar with no observed response must not count old rows");
    assert.equal(unchanged.itemCount, null);
    assert.equal(await page.evaluate(() => "lexopenManualMisCausas" in window), false);

    await page.setContent(`<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
      <button onclick="document.querySelector('#status').textContent='Consulta terminada'">Buscar</button>
      <div class="card" id="status">Preparando consulta</div>
      <table id="verDetalleJuridica"><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>`);
    const unrelatedCard = await readManuallyAuthenticatedMisCausas(page, { responseTimeoutMs: 100 });
    assert.equal(unrelatedCard.status, "failed", "an unrelated card mutation must not validate the unchanged old table");
    assert.equal(unrelatedCard.itemCount, null);
    assert.equal(await page.evaluate(() => "lexopenManualMisCausas" in window), false);

    await page.setContent(`<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
      <button onclick="document.querySelector('#spinner').textContent='Listo'">Buscar</button>
      <table id="verDetalleJuridica"><tr><td><span id="spinner"></span></td><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>`);
    const rowSpinner = await readManuallyAuthenticatedMisCausas(page, { responseTimeoutMs: 100 });
    assert.equal(rowSpinner.status, "failed", "a status change within an old row must not qualify as replacement data");
    assert.equal(rowSpinner.itemCount, null);

    for (const hidden of [false, true]) {
      await page.setContent(`<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
        <button onclick="document.querySelector('#newResults').innerHTML='<table><tr><td>C-2-2024</td><td>2º Juzgado Civil de Santiago</td></tr></table>'">Buscar</button>
        <table id="verDetalleJuridica" ${hidden ? 'style="display:none"' : ''}><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>
        <main id="newResults"></main>`);
      const separateFresh = await readManuallyAuthenticatedMisCausas(page);
      assert.equal(separateFresh.status, "listed");
      assert.equal(separateFresh.itemCount, 1, "a new response must exclude an untouched old table, visible or hidden");
      assert.equal(await page.evaluate(() => "lexopenManualMisCausas" in window), false);
    }

    await page.setContent('<button onclick="window.accepted=true">Acepto</button>');
    assert.equal((await readManuallyAuthenticatedMisCausas(page)).status, "mis-causas-unavailable");
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { accepted?: boolean }).accepted)), false);

    // Production entry also handles a link-only, immediate OIDC popup.
    await page.setContent('<a target="_blank" href="https://accounts.claveunica.gob.cl/accounts/login/?next=PRIVATE">OIDC</a>');
    const linkPopup = await openClaveUnicaFromOjv(page);
    assert.ok(linkPopup);
    await context.close();
    console.log("pjud/live-validation.dom.test.ts OK (offline browser fixtures)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
