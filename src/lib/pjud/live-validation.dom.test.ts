/** All browser requests are fulfilled locally; no OJV access or real credentials. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readManuallyAuthenticatedMisCausas } from "@/lib/pjud/live-validation";
import { redactedPjudValidationUrl, startClaveUnicaOidcFromOjv } from "@/lib/pjud/ojv-oidc";
import { applyMisCausasFiltros, clickMisCausasBuscar, collectMisCausasFromAuthenticatedOjv, openClaveUnicaFromOjv, PjudScrapeError, readCausaDetailFromAuthenticatedOjv, waitForAuthenticatedOjvPage, waitForMisCausasMenuEntry } from "@/lib/pjud/public-scrape";

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

    const delayedContext = await browser.newContext();
    await delayedContext.route("https://oficinajudicialvirtual.pjud.cl/**", async route => {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `
        <a id="menuMisCausas" href="#" onclick="event.preventDefault();window.loadMenu()">Mis Causas</a><main id="misCausas"></main>
        <script>
          window.loadMenu=()=>setTimeout(()=>{
            const section=document.createElement('section'); section.className='tab-pane active';
            const category=document.createElement('a'); category.href='#'; category.textContent='Civil'; section.append(category);
            const table=document.createElement('table'); table.id='dtaTableDetalleMisCauCiv';
            table.innerHTML='<thead><tr><th>Rol</th><th>Tribunal</th><th>Fecha Ingreso</th><th>Estado Causa</th></tr></thead><tbody id="rowsCiv"></tbody>';
            const button=document.createElement('button'); button.textContent='Buscar';
            button.onclick=()=>{document.querySelector('#rowsCiv').innerHTML='<tr><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td><td>12/08/2026</td><td>Tramitación</td></tr>'};
            section.append(button,table); document.querySelector('#misCausas').replaceChildren(section);
          },850);
        </script>
      ` });
    });
    const delayedPage = await delayedContext.newPage();
    await delayedPage.goto("https://oficinajudicialvirtual.pjud.cl/indexN.php");
    const delayedResult = await collectMisCausasFromAuthenticatedOjv(delayedPage, { materias: ["Civil"] });
    assert.equal(delayedResult.openedMenu, true);
    assert.deepEqual(delayedResult.materiasTried, ["Civil"]);
    assert.equal(delayedResult.items.length, 1, "automatic mode waits for menu content added after the old 700 ms delay");
    assert.equal(delayedResult.items[0].rit, "C-1-2024");
    await delayedContext.close();

    const detailContext = await browser.newContext();
    await detailContext.route("https://oficinajudicialvirtual.pjud.cl/**", async route => {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `
        <a id="menuMisCausas" href="#" onclick="event.preventDefault()">Mis Causas</a>
        <a href="#tabSup">Corte Suprema</a><a href="#tabCiv">Civil</a>
        <section id="tabSup" class="tab-pane active">
          <label class="switch"><input id="filtroMisCauSup" type="checkbox"><span>Filtro</span></label>
          <button id="buscarSup" onclick="window.searched=(window.searched||[]).concat('Sup')">Buscar</button>
          <table id="dtaTableDetalleMisCauSup"><thead><tr><th></th><th>Rol</th><th>Tipo Recurso</th><th>Caratulado</th><th>Fecha Ingreso</th><th>Estado Causa</th><th>Corte</th></tr></thead><tbody>
            <tr><td><a href="#" onclick="event.preventDefault();window.detailOpened=true;const modal=document.querySelector('#modalDetalleSuprema');modal.innerHTML='<table><thead><tr><th>Folio</th><th>Fecha Trámite</th><th>Trámite</th><th>Des. Trámite</th></tr></thead><tbody><tr><td>4</td><td>14/11/2025</td><td>Ingreso</td><td>Resolución ficticia de Corte Suprema</td></tr></tbody></table>';modal.style.display='block';modal.classList.add('show')">Ver</a></td><td>18390-2025</td><td>(Penal) Contienda de Competencia</td><td>Parte A contra Sala de la Corte de Apelaciones de Iquique</td><td>14/11/2025</td><td>Tramitación</td><td>Corte Suprema</td></tr>
          </tbody></table>
        </section>
        <section id="tabCiv" class="tab-pane"><button onclick="window.searched=(window.searched||[]).concat('Civil')">Buscar</button></section>
        <div id="modalDetalleSuprema" class="modal" style="display:none"></div>
      ` });
    });
    const detailPage = await detailContext.newPage();
    await detailPage.goto("https://oficinajudicialvirtual.pjud.cl/indexN.php");
    const detailResult = await readCausaDetailFromAuthenticatedOjv(detailPage, {
      id: "fixture-causa", rit: "18390-2025", ruc: null, tribunal: "Corte Suprema", titulo: "Corte Suprema", caratula: null,
    }, { downloadDocuments: false });
    assert.deepEqual(await detailPage.evaluate(() => (window as typeof window & { searched?: string[] }).searched), ["Sup"], "the matching materia is searched before Civil");
    assert.equal(await detailPage.evaluate(() => Boolean((window as typeof window & { detailOpened?: boolean }).detailOpened)), true);
    assert.equal(detailResult.movimientos.some(movement => movement.titulo.includes("Resolución ficticia de Corte Suprema")), true);
    await detailContext.close();

    const readinessContext = await browser.newContext();
    await readinessContext.route("https://oficinajudicialvirtual.pjud.cl/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname === "/home/index.php"
        ? '<main><h1>Consulta Unificada</h1></main>'
        : `<main id="return"></main><script>
            setTimeout(()=>{const signout=document.createElement('a');signout.href='/logout';signout.textContent='Cerrar sesión';document.querySelector('#return').append(signout)},250);
            setTimeout(()=>{const menu=document.createElement('a');menu.id='menuMisCausas';menu.href='#';menu.textContent='Mis Causas';document.querySelector('#return').append(menu)},450);
          </script>`;
      await route.fulfill({ contentType: "text/html; charset=utf-8", body });
    });
    const publicTab = await readinessContext.newPage();
    await publicTab.goto("https://oficinajudicialvirtual.pjud.cl/home/index.php");
    const delayedReturnTab = await readinessContext.newPage();
    await delayedReturnTab.goto("https://oficinajudicialvirtual.pjud.cl/indexN.php");
    const readyTab = await waitForAuthenticatedOjvPage(publicTab, {}, 1_500);
    assert.equal(readyTab, delayedReturnTab, "a delayed authenticated return beats the initial public OJV tab");
    assert.equal(await waitForMisCausasMenuEntry(readyTab, {}, 1_000), true, "menu entry may appear after the session marker");
    assert.equal(await waitForMisCausasMenuEntry(publicTab, {}, 150), false, "a public tab without the menu is not treated as authenticated");
    await readinessContext.close();

    const absentMenuContext = await browser.newContext();
    await absentMenuContext.route("https://oficinajudicialvirtual.pjud.cl/**", route => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<a href="/logout">Cerrar sesión</a><main>OJV</main>',
    }));
    const absentMenuPage = await absentMenuContext.newPage();
    await absentMenuPage.goto("https://oficinajudicialvirtual.pjud.cl/indexN.php");
    assert.equal(await waitForAuthenticatedOjvPage(absentMenuPage, {}, 150), absentMenuPage,
      "a visible session marker confirms the OJV page even when Mis Causas has not rendered");
    assert.equal(await waitForMisCausasMenuEntry(absentMenuPage, {}, 150), false,
      "a confirmed session with no menu remains distinct from an unconfirmed session");
    await absentMenuContext.close();

    const noSessionContext = await browser.newContext();
    await noSessionContext.route("https://oficinajudicialvirtual.pjud.cl/**", route => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<main><h1>Consulta Unificada</h1></main>",
    }));
    const noSessionPage = await noSessionContext.newPage();
    await noSessionPage.goto("https://oficinajudicialvirtual.pjud.cl/home/index.php");
    await assert.rejects(waitForAuthenticatedOjvPage(noSessionPage, {}, 150), error => {
      assert.ok(error instanceof PjudScrapeError);
      assert.match(error.message, /No se confirmó una señal visible de sesión/);
      assert.doesNotMatch(error.message, /Se autenticó/);
      return true;
    });
    const controller = new AbortController();
    const pendingSessionWait = waitForAuthenticatedOjvPage(noSessionPage, { signal: controller.signal }, 5_000);
    await new Promise(resolve => setTimeout(resolve, 50));
    controller.abort();
    await assert.rejects(pendingSessionWait, error => error instanceof DOMException && error.name === "AbortError");
    await noSessionContext.close();
    console.log("pjud/live-validation.dom.test.ts OK (offline browser fixtures)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
