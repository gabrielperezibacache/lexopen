/** All browser requests are fulfilled locally; no OJV access or real credentials. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readManuallyAuthenticatedMisCausas } from "@/lib/pjud/live-validation";
import { redactedPjudValidationUrl, startClaveUnicaOidcFromOjv } from "@/lib/pjud/ojv-oidc";
import { applyMisCausasFiltros, clickMisCausasBuscar, collectMisCausasFromAuthenticatedOjv, openClaveUnicaFromOjv } from "@/lib/pjud/public-scrape";

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
      <div class="sweet-alert showSweetAlert visible" style="display:none"><button class="confirm" onclick="window.confirmed=true">Continuar</button></div>
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

    await page.locator('.sweet-alert').evaluate(node => {
      (node as HTMLElement).style.display = "block";
      const state = window as typeof window & { accepted: boolean; confirmed: boolean; menuOpened: boolean; searched: boolean };
      state.accepted = false; state.confirmed = false; state.menuOpened = false; state.searched = false;
    });
    const blocked = await readManuallyAuthenticatedMisCausas(page);
    assert.equal(blocked.status, "failed", "a visible notice must block manual collection rather than be accepted or ignored");
    assert.equal(blocked.itemCount, null);
    assert.equal(blocked.openedMenu, false);
    assert.equal(await page.locator('.sweet-alert').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => {
      const state = window as typeof window & { accepted: boolean; confirmed: boolean; menuOpened: boolean; searched: boolean };
      return { accepted: state.accepted, confirmed: state.confirmed, menuOpened: state.menuOpened, searched: state.searched };
    }), { accepted: false, confirmed: false, menuOpened: false, searched: false }, "the blocked response must not click confirmation, menu or search controls");

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

    // Current Mis Causas uses a hidden checkbox inside a visible switch label.
    // Suprema precedes Civil in the DOM; only the active materia may be searched.
    await page.setContent(`<style>
      .tab-pane { display:none } .tab-pane.active { display:block }
      label.switch { display:inline-block; width:60px; height:30px }
      label.switch input { position:absolute; opacity:0; width:0; height:0 }
      label.switch span { display:inline-block; width:60px; height:30px }
    </style>
    <button onclick="window.accepted=true">Acepto</button>
    <a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
    <a href="#" onclick="event.preventDefault();showMateria('Sup')">Corte Suprema</a>
    <a href="#" onclick="event.preventDefault();showMateria('Civ')">Civil</a>
    <section id="tabSup" class="tab-pane active">
      <label class="switch"><input type="checkbox" id="filtroMisCauSup" onchange="toggleFilter('Sup',this.checked)"><span>Filtro Suprema</span></label>
      <button hidden id="btnConsultaMisCauSup" onclick="searchMateria('Sup')">Buscar</button>
      <table id="dtaTableDetalleMisCauSup"><thead><tr><th></th><th>Rol</th><th>Caratulado</th><th>Fecha Ingreso</th><th>Estado Causa</th><th>Corte</th><th>Institución</th></tr></thead>
      <tbody id="rowsSup"><tr><td></td><td>999-2020</td><td>PRIVATE_OLD_SUP</td><td>01/01/2020</td><td>Tramitación</td><td>Corte Suprema</td><td>Institución ficticia</td></tr></tbody></table>
    </section>
    <section id="tabCiv" class="tab-pane">
      <label class="switch"><input type="checkbox" id="filtroMisCauCiv" onchange="toggleFilter('Civ',this.checked)"><span>Filtro Civil</span></label>
      <button hidden id="btnConsultaMisCauCiv" onclick="searchMateria('Civ')">Buscar</button>
      <table id="dtaTableDetalleMisCauCiv"><tbody id="rowsCiv"><tr><td>C-999-2020</td><td>3º Juzgado Civil de Santiago</td></tr></tbody></table>
    </section>
    <script>
      window.searches=[];window.filterChanges=[];window.accepted=false;
      function showMateria(materia){document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));document.querySelector('#tab'+materia).classList.add('active')}
      function toggleFilter(materia,checked){window.filterChanges.push(materia);document.querySelector('#btnConsultaMisCau'+materia).hidden=!checked}
      function searchMateria(materia){
        window.searches.push(materia);
        document.querySelector('#rows'+materia).innerHTML=materia==='Sup'
          ? '<tr><td></td><td>20-2024</td><td>PRIVATE_SUP_A / PRIVATE_SUP_B</td><td>02/01/2024</td><td>Tramitación</td><td>Corte Suprema</td><td>Institución ficticia</td></tr>'
          : '<tr><td></td><td>C-20-2024</td><td>3º Juzgado Civil de Santiago</td><td>PRIVATE_CIV</td></tr>';
      }
    </script>`);
    assert.equal(await page.locator('#filtroMisCauSup').isVisible(), false);
    const materias = await readManuallyAuthenticatedMisCausas(page);
    assert.equal(materias.status, "listed");
    assert.deepEqual(materias.materiasTried, ["Civil", "Corte Suprema"]);
    assert.equal(materias.itemCount, 2, "only replacement rows from the searched materias count");
    assert.doesNotMatch(JSON.stringify(materias), /PRIVATE|20-2024|Santiago|caratula|cookie/);
    assert.deepEqual(await page.evaluate(() => ({
      searches: (window as typeof window & { searches: string[] }).searches,
      changes: (window as typeof window & { filterChanges: string[] }).filterChanges,
      accepted: (window as typeof window & { accepted: boolean }).accepted,
    })), { searches: ["Civ", "Sup"], changes: ["Civ", "Sup"], accepted: false });
    await applyMisCausasFiltros(page);
    assert.equal(await page.locator('#filtroMisCauSup').isChecked(), true, "an enabled filter must not be toggled off");
    assert.deepEqual(await page.evaluate(() => (window as typeof window & { filterChanges: string[] }).filterChanges), ["Civ", "Sup"]);
    await page.getByRole("link", { name: "Civil", exact: true }).click();
    await applyMisCausasFiltros(page);
    assert.equal(await clickMisCausasBuscar(page), true);
    assert.deepEqual(await page.evaluate(() => (window as typeof window & { searches: string[] }).searches), ["Civ", "Sup", "Civ"], "automatic mode also searches the active visible materia");

    await page.setContent(`<a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
      <button onclick="document.querySelector('#legacySearch').hidden=false">Filtros</button>
      <button hidden id="legacySearch" onclick="document.querySelector('#legacyResults').innerHTML='<table><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>'">Buscar</button>
      <main id="legacyResults"></main>`);
    assert.equal((await readManuallyAuthenticatedMisCausas(page)).itemCount, 1, "the legacy Filtros button remains supported");

    await page.setContent(`<section class="tab-pane" style="display:none"><button onclick="window.wrongSearch=true">Buscar</button></section>
      <section class="tab-pane active"><button style="display:none" onclick="window.wrongSearch=true">Buscar</button></section>`);
    assert.equal(await clickMisCausasBuscar(page), false, "automatic mode also refuses hidden search buttons");
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { wrongSearch?: boolean }).wrongSearch)), false);

    await page.setContent('<button onclick="window.accepted=true">Acepto</button>');
    assert.equal((await readManuallyAuthenticatedMisCausas(page)).status, "mis-causas-unavailable");
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { accepted?: boolean }).accepted)), false);

    // Production entry also handles a link-only, immediate OIDC popup.
    await page.setContent('<a target="_blank" href="https://accounts.claveunica.gob.cl/accounts/login/?next=PRIVATE">OIDC</a>');
    const linkPopup = await openClaveUnicaFromOjv(page);
    assert.ok(linkPopup);
    await context.close();

    // The official homepage now ends in /home/, including an OIDC return's query/hash.
    // Automatic collection enters the shell; a manual probe must preserve its page.
    const returnContext = await browser.newContext();
    let shellVisits = 0;
    await returnContext.route("**/*", async (route) => {
      const isShell = new URL(route.request().url()).pathname === "/indexN.php";
      if (isShell) shellVisits += 1;
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: isShell ? `
        <a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
        <button onclick="document.querySelector('#results').innerHTML='<table><tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td></tr></table>'">Buscar</button><main id="results"></main>
      ` : '<h1>Inicio OJV</h1>' });
    });
    const returnPage = await returnContext.newPage();
    const homeReturn = "https://oficinajudicialvirtual.pjud.cl/home/?probe=PRIVATE#PRIVATE";
    await returnPage.goto(homeReturn);
    assert.equal((await collectMisCausasFromAuthenticatedOjv(returnPage)).items.length, 1);
    assert.equal(new URL(returnPage.url()).pathname, "/indexN.php");
    assert.equal(shellVisits, 1);
    await returnPage.goto(homeReturn);
    await assert.rejects(collectMisCausasFromAuthenticatedOjv(returnPage, { allowPrompts: false }), /Buscar visible/);
    assert.equal(returnPage.url(), homeReturn, "manual mode preserves the selected homepage without entering a shell");
    assert.equal(shellVisits, 1, "manual mode does not navigate through post-authentication URLs");
    await returnContext.close();
    console.log("pjud/live-validation.dom.test.ts OK (offline browser fixtures)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
