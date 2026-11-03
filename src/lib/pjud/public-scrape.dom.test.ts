/** Offline browser fixtures only. No OJV navigation, credentials, or CAPTCHA. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { assertPjudPromptPolicy, assertPublicScrapeRuntime, attachDocumentoBytesFromPage, clickBuscar, collectOjvResultPages, enterConsultaCausas, fillRolSearchFields, maybeSolveCaptchaOnPage, modalActivePaneHtml, openExactCauseModal, publicScrapeReady, readConsultaFormState, readModalPanelDebugDiagnostics, scrapeModalTabs, selectTribunalOrCorte, waitForModalHistoryPanel } from "@/lib/pjud/public-scrape";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    const policyNames = ["PJUD_PUBLIC_SCRAPE", "PJUD_CAPTCHA_AUTO_SOLVE", "PJUD_AUTO_CONFIRM_PROMPTS", "PJUD_DOC_DOWNLOADS", "CAPTCHA_SOLVER_PROVIDER", "CAPTCHA_SOLVER_API_KEY"] as const;
    const previousPolicies = Object.fromEntries(policyNames.map(name => [name, process.env[name]]));
    const originalFetch = globalThis.fetch;
    let solverRequests = 0;
    try {
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      process.env.PJUD_CAPTCHA_AUTO_SOLVE = "0";
      process.env.PJUD_AUTO_CONFIRM_PROMPTS = "0";
      process.env.PJUD_DOC_DOWNLOADS = "0";
      delete process.env.CAPTCHA_SOLVER_PROVIDER;
      delete process.env.CAPTCHA_SOLVER_API_KEY;
      globalThis.fetch = async () => { solverRequests++; throw new Error("unexpected solver request"); };
      assert.equal(publicScrapeReady(), true);
      await assertPublicScrapeRuntime();
      await page.setContent('<select id="competencia"><option value="3">Civil</option></select>');
      await enterConsultaCausas(page, { formTimeoutMs: 100 });
      for (const style of ["display:none", "opacity:0"]) {
        await page.setContent(`<select id="competencia"><option>Civil</option></select><div style="${style}"><img id="captcha_image" width="80" height="30" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div>`);
        await enterConsultaCausas(page, { formTimeoutMs: 100 });
      }
      process.env.CAPTCHA_SOLVER_PROVIDER = "2captcha";
      process.env.CAPTCHA_SOLVER_API_KEY = "fictional-key-never-used";
      await page.setContent('<select id="competencia"><option>Civil</option></select><img id="captcha_image" width="80" height="30" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">');
      await assert.rejects(() => maybeSolveCaptchaOnPage(page), /resolución automática está deshabilitada/);
      assert.equal(solverRequests, 0, "validation never submits a solve or spends provider credits");
      await page.setContent('<select id="competencia"><option>Civil</option></select><div class="sweet-alert showSweetAlert visible"><button class="confirm" onclick="window.accepted=true">Acepto</button></div>');
      await assert.rejects(() => enterConsultaCausas(page, { formTimeoutMs: 100 }), /confirmación automática está deshabilitada/);
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { accepted?: boolean }).accepted)), false);
      await page.setContent('<div class="modal show" style="display:block"><button data-dismiss="modal" onclick="window.accepted=true">Continuar</button></div>');
      await assert.rejects(() => assertPjudPromptPolicy(page), /intervención manual/);
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { accepted?: boolean }).accepted)), false);
      await page.setContent('<div id="modalDetalleCivil" class="modal show" style="display:block"><table class="table-titulos"><tr><td>Detalle de causa ficticia</td></tr></table></div>');
      await assertPjudPromptPolicy(page);
      let downloadRequests = 0;
      const originalGet = page.request.get;
      page.request.get = async () => { downloadRequests++; throw new Error("unexpected document download"); };
      try {
        const movements = [{ externalId: "fixture-movement", titulo: "Resolución ficticia", fecha: new Date("2026-01-01T12:00:00Z"), fuente: "pjud" as const, documentoRef: "https://oficinajudicialvirtual.pjud.cl/documento.php?fixture=1" }];
        assert.equal(await attachDocumentoBytesFromPage(page, movements), movements);
        assert.equal(downloadRequests, 0, "downloads off is checked before any document request");
      } finally { page.request.get = originalGet; }

      // A mocked solver response must not be rejected by an invisible old image.
      process.env.PJUD_CAPTCHA_AUTO_SOLVE = "1";
      process.env.CAPTCHA_SOLVER_PROVIDER = "solvecha";
      process.env.CAPTCHA_SOLVER_API_KEY = "fictional-local-response-only";
      globalThis.fetch = async () => { solverRequests++; return Response.json({ errorId: 0, taskId: "fixture", status: "ready", solution: { text: "ABC" } }); };
      await page.route("https://captcha-finish-fixture.test/**", route => route.fulfill({ contentType: "text/html", body: '<img id="captcha_image" style="opacity:0" width="80" height="30" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">' }));
      await page.setContent('<form action="https://captcha-finish-fixture.test/done"><img id="captcha_image" width="80" height="30" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><input id="captcha_response" name="captcha_response"><button type="submit">Ingresar</button></form>');
      assert.equal(await maybeSolveCaptchaOnPage(page), true);
      assert.equal(solverRequests, 1, "the only solver request is intercepted by the local mock");
    } finally {
      globalThis.fetch = originalFetch;
      for (const name of policyNames) {
        if (previousPolicies[name] === undefined) delete process.env[name];
        else process.env[name] = previousPolicies[name];
      }
    }
    // Route fulfillment keeps the entire entry flow local, including navigation.
    await page.route("https://ojv-fixture.test/**", async (route) => {
      const shell = new URL(route.request().url()).pathname === "/indexN.php";
      await route.fulfill({ contentType: "text/html", body: shell ? `
        <div class="modal show" style="display:block;position:fixed;inset:0;z-index:10;background:white">
          Aviso <button data-dismiss="modal" onclick="this.parentElement.style.display='none';this.parentElement.classList.remove('show')">Cerrar</button>
        </div>
        <a href="" onclick="event.preventDefault();sessionStorage.setItem('menuClicked','yes');setTimeout(()=>document.querySelector('#content').innerHTML='<select id=jurCompetencia><option>Civil</option></select>',50)">Consulta Unificada</a>
        <main id="content"></main>
      ` : `
        <button class="dropbtn" style="display:none" onclick="accesoConsultaCausas('hidden')">Consulta de causas</button>
        <button class="dropbtn" onclick="accesoConsultaCausas('visible')">Consulta de causas</button>
        <script>function accesoConsultaCausas(which){sessionStorage.setItem('guestClicked',which);location.href='/indexN.php'}</script>
      ` });
    });
    await page.goto("https://ojv-fixture.test/home/index.php");
    await enterConsultaCausas(page, { formTimeoutMs: 2_000 });
    assert.equal(new URL(page.url()).pathname, "/indexN.php");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("guestClicked")), "visible", "the hidden duplicate guest entry must not be selected");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("menuClicked")), "yes");
    assert.equal(await page.locator("#jurCompetencia").isVisible(), true);

    await page.setContent(`<select id="jurCompetencia"><option>Civil</option></select><button class="dropbtn" onclick="window.unexpectedGuestClick=true;accesoConsultaCausas()">Entrar</button><a href="" onclick="window.unexpectedMenuClick=true">Consulta Unificada</a>`);
    await enterConsultaCausas(page, { formTimeoutMs: 100 });
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { unexpectedGuestClick?: boolean; unexpectedMenuClick?: boolean }).unexpectedGuestClick || (window as typeof window & { unexpectedMenuClick?: boolean }).unexpectedMenuClick)), false, "an already open form must not navigate again");

    await page.setContent(`<a href="" onclick="event.preventDefault()">Consulta Unificada</a><iframe src="about:blank"></iframe>`);
    await assert.rejects(() => enterConsultaCausas(page, { formTimeoutMs: 100 }), /no mostró el formulario de búsqueda/);
    await page.setContent(`<button class="dropbtn" style="display:none" onclick="accesoConsultaCausas()">Entrar</button>`);
    await assert.rejects(() => enterConsultaCausas(page, { formTimeoutMs: 100 }), /acceso visible a Consulta Unificada/);

    await page.setContent(`<a href="#BusJuridica">Persona jurídica</a><a href="#BusCausa">ROL</a>`);
    const tabsOnly = await readConsultaFormState(page);
    assert.equal(tabsOnly.consultaTabsVisible, true);
    assert.equal(tabsOnly.ready, false, "tabs alone do not verify a search form");
    assert.deepEqual(tabsOnly.fields, []);
    await assert.rejects(() => enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 }), /acceso visible a Consulta Unificada/);

    for (const badgeStyle of ["visibility:hidden", "opacity:0", "position:absolute;left:-10000px"]) {
      await page.setContent(`
        <a href="" onclick="event.preventDefault();document.querySelector('#breadcrumbs').textContent='Consulta Unificada'">Consulta Unificada</a>
        <nav id="breadcrumbs"></nav><main id="contMain"></main>
        <div class="grecaptcha-badge" style="${badgeStyle}">
          <iframe title="fixture invisible badge" width="256" height="60" srcdoc="" src="https://captcha-fixture.test/recaptcha/api2/anchor?size=invisible"></iframe>
        </div>
      `);
      const shellState = await readConsultaFormState(page);
      assert.equal(shellState.captchaVisible, false, "an invisible badge is not a visible CAPTCHA challenge");
      assert.equal(shellState.stage, "guest-shell");
      assert.equal(shellState.ready, false);
      await assert.rejects(() => enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 }), /portal quedó en el menú sin campos de consulta/);
      assert.equal(await page.locator("#breadcrumbs").innerText(), "Consulta Unificada");
      assert.equal(await page.locator("#contMain").innerHTML(), "");
    }
    for (const captchaPath of ["anchor?size=normal", "bframe"]) {
      await page.setContent(`<iframe title="fixture visible challenge" width="304" height="78" srcdoc="" src="https://captcha-fixture.test/recaptcha/api2/${captchaPath}"></iframe>`);
      assert.equal((await readConsultaFormState(page)).captchaVisible, true, "a visible checkbox or challenge still requires manual intervention");
      await assert.rejects(() => enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 }), /captcha-required/);
    }

    await page.setContent(`
      <a href="" onclick="consultaUnificada();return false">Consulta Unificada</a>
      <main id="content"></main>
      <script>
        window.lateMenuClicks=0;
        setTimeout(() => { window.consultaUnificada=() => {
          window.lateMenuClicks++;
          document.querySelector('#content').innerHTML='<select id="jurCompetencia"><option>Civil</option></select>';
        }; }, 150);
      </script>
    `);
    const entryErrors: string[] = [];
    const onEntryError = (error: Error) => entryErrors.push(error.name);
    page.on("pageerror", onEntryError);
    await enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 2_000 });
    page.off("pageerror", onEntryError);
    assert.equal(await page.evaluate(() => (window as typeof window & { lateMenuClicks?: number }).lateMenuClicks), 1, "wait for the observed handler, then click once");
    assert.deepEqual(entryErrors, []);

    await page.setContent(`
      <select id="jurCompetencia"><option>Civil</option></select>
      <div class="sweet-alert showSweetAlert visible" style="width:300px;height:100px">
        <button class="confirm" onclick="window.termsAccepted=true">Acepto</button>
      </div>
      <img id="captcha_image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="80" height="30" alt="captcha">
    `);
    await assert.rejects(() => enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 }), /intervención manual/);
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { termsAccepted?: boolean }).termsAccepted)), false, "manual entry never accepts a confirmation");
    assert.equal((await readConsultaFormState(page)).captchaVisible, true);

    // Automatic entry would attempt to screenshot this matched CAPTCHA image.
    // Manual entry must not call the solver even when the form is already open.
    await page.setContent(`<input id="rutJur" name="rutJur" value="fixture-private-value"><img id="captcha_image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" style="display:none">`);
    await enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 });
    const safeState = await readConsultaFormState(page);
    assert.equal(safeState.stage, "ready");
    assert.equal(safeState.fields[0].id, "rutJur");
    assert.equal(JSON.stringify(safeState).includes("fixture-private-value"), false, "diagnostics exclude field values");

    await page.setContent(`<input type="password" value="fixture-password">`);
    const loginState = await readConsultaFormState(page);
    assert.equal(loginState.stage, "login-required");
    assert.equal(JSON.stringify(loginState).includes("fixture-password"), false);
    await assert.rejects(() => enterConsultaCausas(page, { mode: "manual", formTimeoutMs: 100 }), /login-required/);
    const tribunal = "1º Juzgado Civil de Santiago";
    await page.setContent(`
      <table id="verDetalleJuridica"><tbody>
        <tr><td><button onclick="window.selected='prefix'">Ver</button></td><td>C-11-2024</td><td>${tribunal}</td></tr>
        <tr><td><button onclick="window.selected='type'">Ver</button></td><td>F-1-2024</td><td>${tribunal}</td></tr>
        <tr><td><button onclick="window.selected='tribunal'">Ver</button></td><td>C-1-2024</td><td>2º Juzgado Civil de Santiago</td></tr>
        <tr><td><button onclick="window.selected='exact';document.querySelector('#detail td:last-child').textContent='Resolución cargada desde la causa exacta';document.querySelector('#detail').style.display='block';document.querySelector('#detail').classList.add('show')">Ver</button></td><td>C-1-2024</td><td>${tribunal}</td></tr>
      </tbody></table>
      <div id="detail" class="modal" style="display:none"><table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>01/01/2024</td><td>Resolución de prueba</td></tr></table></div>
    `);
    assert.equal(await openExactCauseModal(page, { rit: "C-1-2024", tribunal }), tribunal);
    assert.equal(await page.evaluate(() => (window as typeof window & { selected?: string }).selected), "exact");

    await page.setContent(`<table id="verDetalleJuridica"><tr><td>C-1-2024</td><td>${tribunal}</td><td><button onclick="window.selected='wrong'">Ver</button></td></tr><tr><td>C-1-2024</td><td>${tribunal}</td><td><button onclick="window.selected='wrong'">Ver</button></td></tr></table>`);
    await assert.rejects(() => openExactCauseModal(page, { rit: "C-1-2024", tribunal }), /varias filas/);
    assert.equal(await page.evaluate(() => (window as typeof window & { selected?: string }).selected), "exact", "ambiguous rows must not click any detail");

    // Page 2 contains only an already-seen cause; page 3 must still be collected.
    await page.setContent(`
      <div id="result"></div>
      <script>
        let current = 0;
        const rows = ['C-1-2024', 'C-1-2024', 'C-2-2024'];
        function render() {
          document.querySelector('#result').innerHTML = '<table><tr><td>'+rows[current]+'</td></tr></table><nav class="pagination"><span>'+(current+1)+'</span><button '+(current===2?'disabled':'')+' onclick="current++;render()">Siguiente</button></nav>';
        }
        render();
      </script>
    `);
    const visited: string[] = [];
    assert.equal(await collectOjvResultPages(page, async () => { visited.push(await page.locator("tr").innerText()); }), false);
    assert.deepEqual(visited, ["C-1-2024", "C-1-2024", "C-2-2024"]);

    await page.setContent(`<table><tr><td>C-1-2024</td></tr></table><nav class="pagination"><button>Siguiente</button></nav>`);
    await assert.rejects(() => collectOjvResultPages(page, async () => {}), /repitió una página/);

    await page.setContent(`<button id="btnBuscar" onclick="setTimeout(()=>document.querySelector('#resultConsultaJuridica').textContent='C-2-2024',150)">Buscar</button><div id="resultConsultaJuridica">C-1-2024</div>`);
    await clickBuscar(page, 2_000);
    assert.equal(await page.locator("#resultConsultaJuridica").innerText(), "C-2-2024", "submission must await the new response before parsing");
    await page.setContent(`<button id="btnBuscar">Buscar</button><div id="resultConsultaJuridica">C-1-2024</div>`);
    await assert.rejects(() => clickBuscar(page, 100), /No se usarán resultados anteriores/);

    await page.setContent(`
      <button id="btnConConsulta" onclick="this.disabled=true;document.querySelector('#dtaTableDetalle tbody').insertAdjacentHTML('beforeend','<tr id=spinner><td colspan=5>Procesando...</td></tr>');setTimeout(()=>{document.querySelector('#dtaTableDetalle tbody').innerHTML='<tr><td>Ver</td><td>C-42-2026</td><td>01/01/2026</td><td>Ejemplo ficticio</td><td>3º Juzgado Civil de Santiago</td></tr>';this.disabled=false},250)">Buscar</button>
      <table id="dtaTableDetalle"><tbody><tr><td>Ver</td><td>C-9-2025</td><td>01/01/2025</td><td>Respuesta anterior ficticia</td><td>3º Juzgado Civil de Santiago</td></tr></tbody></table>
    `);
    await clickBuscar(page, 2_000);
    assert.equal(await page.locator('#btnConConsulta').isEnabled(), true);
    assert.equal(await page.locator('#dtaTableDetalle tbody tr').count(), 1);
    assert.equal(await page.locator('#dtaTableDetalle tbody tr td').nth(1).innerText(), "C-42-2026", "a spinner must not release the lookup before its new rows arrive");
    await page.setContent(`
      <button id="btnConConsulta" onclick="document.querySelector('#status').textContent='Procesando';setTimeout(()=>document.querySelector('#status').textContent='Terminado',20)">Buscar</button>
      <table id="dtaTableDetalle"><tbody><tr><td>Ver</td><td>C-9-2025</td><td>01/01/2025</td><td>Respuesta anterior ficticia</td><td>3º Juzgado Civil de Santiago</td></tr></tbody><tfoot><tr><td id="status" colspan="5"></td></tr></tfoot></table>
    `);
    await assert.rejects(() => clickBuscar(page, 150), /No se usarán resultados anteriores/, "changing only the spinner/status cannot validate old rows");
    await page.setContent('<button id="btnConConsulta" onclick="document.querySelector(\'#dtaTableDetalle tbody\').innerHTML=\'<tr><td class=dataTables_empty>No se encontraron resultados</td></tr>\'">Buscar</button><table id="dtaTableDetalle"><tbody></tbody></table>');
    await clickBuscar(page, 1_000);

    await page.setContent(`
      <style>.tab-pane{display:none}.tab-pane.active{display:block}</style>
      <script>function fixtureTab(id){document.querySelectorAll('.tab-pane').forEach(node=>node.classList.toggle('active',node.id===id))}</script>
      <div id="modalDocumentoFixture" class="modal in" style="display:block"><table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>01/02/2026</td><td>Contenido de otro modal ficticio</td></tr></table></div>
      <div id="modalDetalleCivil" class="modal in" style="display:block">
        <table class="table-titulos"><tr><td><a href="#modalAnexoDocumentalFixture" onclick="window.badAnexoClicked=true">Anexo del documento</a></td></tr></table>
        <nav class="nav-tabs">
        <a href="#historyFixture" onclick="event.preventDefault();fixtureTab('historyFixture')">Historia</a>
        <a href="#notificationsFixture" onclick="event.preventDefault();fixtureTab('notificationsFixture')">Notificaciones</a>
        <a href="#writingsFixture" onclick="event.preventDefault();fixtureTab('writingsFixture')">Escritos por Resolver</a>
        </nav>
        <div class="tab-pane active" id="historyFixture"><table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr><tr><td>1</td><td>Resolución propia ficticia</td><td>01/01/2026</td></tr></table></div>
        <div class="tab-pane" id="notificationsFixture"><table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr><tr><td>2</td><td>Notificación propia ficticia</td><td>02/01/2026</td></tr></table></div>
        <div class="tab-pane" id="writingsFixture"><table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr><tr><td>3</td><td>Escrito propio ficticio</td><td>03/01/2026</td></tr></table></div>
        <table><tr><th>Rol Corte</th><th>Trámite</th><th>Fecha</th></tr><tr><td>9-2026</td><td>Remisión de otra corte ficticia</td><td>04/01/2026</td></tr></table>
      </div>
    `);
    const scopedMovements = await scrapeModalTabs(page);
    assert.equal(scopedMovements.length, 3);
    assert.ok(scopedMovements.every(movement => !movement.titulo.includes("otra corte")), "auxiliary referrals outside the active tab are not movements");
    assert.ok(scopedMovements.every(movement => !movement.titulo.includes("otro modal")), "a coexisting document modal is not the selected case detail");
    assert.equal(await page.evaluate(() => Boolean((window as typeof window & { badAnexoClicked?: boolean }).badAnexoClicked)), false, "an earlier document Anexo link must not be mistaken for Historia");
    await page.setContent('<div id="modalDetalleCivil" class="modal in" style="display:block"><nav class="nav-tabs"><a href="#historiaMissing">Historia</a></nav><div id="historiaCiv" class="tab-pane active"><table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>01/01/2026</td><td>Historia visible ficticia</td></tr></table></div></div>');
    await assert.rejects(() => scrapeModalTabs(page), /destino existente/, "a declared but missing Historia target must not be replaced blindly by the currently active pane");
    await page.setContent('<div class="modal in" style="display:block"><div class="tab-pane">Historial no seleccionado</div><table><tr><td>Auxiliar</td></tr></table></div>');
    await assert.rejects(() => modalActivePaneHtml(page), /no muestra una pestaña activa/);
    await page.setContent('<div class="modal in" style="display:block"><table><tr><td>Historial legado sin pestañas</td></tr></table></div>');
    assert.match(await modalActivePaneHtml(page), /Historial legado/);

    // The real portal opens the title table before its AJAX history completes.
    // Every tab below is delayed, with only a header/loading state initially.
    await page.setContent(`
      <style>.tab-pane{display:none}.tab-pane.active{display:block}</style>
      <table id="dtaTableDetalle"><tr><td><button onclick="openDelayedDetail()">Ver</button></td><td>C-7-2026</td><td>${tribunal}</td></tr></table>
      <div id="modalDetalleDelayed" class="modal" style="display:none">
        <table class="table-titulos"><tr><td>Fecha de ingreso</td><td>01/01/2026</td><td>Cabecera de causa ficticia</td></tr></table>
        <a href="#historiaDelayed" onclick="event.preventDefault();selectDelayedHistory()">Historia</a>
        <a href="#notificacionesDelayed" onclick="event.preventDefault();loadDelayedTab('notificacionesDelayed')">Notificaciones</a>
        <a href="#escritosDelayed" onclick="event.preventDefault();loadDelayedTab('escritosDelayed')">Escritos</a>
        <div id="historiaDelayed" class="tab-pane active" aria-busy="true"><table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr></table></div>
        <div id="notificacionesDelayed" class="tab-pane"><table><tr><th>Doc.</th><th>Fecha</th><th>Tipo Notificación</th></tr></table></div>
        <div id="escritosDelayed" class="tab-pane"><table><tr><th>Doc.</th><th>Fecha de Ingreso</th><th>Tipo Escrito</th><th>Solicitante</th></tr></table></div>
      </div>
      <script>
        window.jQuery={active:0};
        function selectDelayedHistory(){document.querySelectorAll('.tab-pane').forEach(node=>node.classList.toggle('active',node.id==='historiaDelayed'))}
        function openDelayedDetail(){
          const modal=document.querySelector('#modalDetalleDelayed');modal.style.display='block';modal.classList.add('in');window.jQuery.active++;
          setTimeout(()=>{const pane=document.querySelector('#historiaDelayed');pane.innerHTML='<table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr><tr><td>1</td><td>Historia demorada ficticia</td><td>02/01/2026</td></tr></table>';pane.removeAttribute('aria-busy');window.jQuery.active--},2800);
        }
        function loadDelayedTab(id){
          window.jQuery.active++;
          setTimeout(()=>{
            document.querySelectorAll('.tab-pane').forEach(node=>node.classList.toggle('active',node.id===id));
            const pane=document.getElementById(id);pane.setAttribute('aria-busy','true');
            setTimeout(()=>{pane.innerHTML='<table><tr><th>Folio</th><th>Trámite</th><th>Fecha</th></tr><tr><td>'+(id==='notificacionesDelayed'?'2':'3')+'</td><td>'+id+' respuesta ficticia</td><td>'+(id==='notificacionesDelayed'?'03':'04')+'/01/2026</td></tr></table>';pane.removeAttribute('aria-busy');window.jQuery.active--},1100);
          },100);
        }
      </script>
    `);
    assert.equal(await openExactCauseModal(page, { rit: "C-7-2026", tribunal }), tribunal);
    assert.match(await page.locator('#historiaDelayed').innerText(), /Historia demorada ficticia/, "the immediately visible title table must not release the detail reader");
    const delayedMovements = await scrapeModalTabs(page, { panelTimeoutMs: 5_000 });
    assert.equal(delayedMovements.length, 3, "each delayed tab contributes only its completed response");
    assert.ok(delayedMovements.some(movement => movement.titulo.includes('notificacionesDelayed')));
    assert.ok(delayedMovements.some(movement => movement.titulo.includes('escritosDelayed')));
    assert.ok(delayedMovements.every(movement => !movement.titulo.includes('Cabecera')));

    await page.setContent('<div class="modal in" style="display:block"><table class="table-titulos"><tr><td>Fecha ingreso</td><td>01/01/2026</td><td>Cabecera ficticia</td></tr></table><div class="tab-pane active"><table><tr><th>Fecha</th><th>Trámite</th></tr></table></div></div>');
    await assert.rejects(() => scrapeModalTabs(page, { panelTimeoutMs: 150 }), /Historia.*no terminó/, "a primary history header alone is never an empty history");
    await page.setContent('<div class="modal in" style="display:block"><div class="tab-pane active"><table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td colspan="2">Sin movimientos</td></tr></table></div></div>');
    assert.deepEqual(await scrapeModalTabs(page, { panelTimeoutMs: 150 }), [], "an explicit empty primary history is terminal");
    await page.setContent(`
      <style>.tab-pane{display:none}.tab-pane.active{display:block}</style>
      <div class="modal in" style="display:block">
        <a href="#emptyHistoryFixture" onclick="event.preventDefault();fixtureEmptyTab('emptyHistoryFixture')">Historia</a>
        <a href="#emptyNotificacionesFixture" onclick="event.preventDefault();fixtureEmptyTab('emptyNotificacionesFixture')">Notificaciones</a>
        <a href="#emptyEscritosFixture" onclick="event.preventDefault();fixtureEmptyTab('emptyEscritosFixture')">Escritos</a>
        <div class="tab-pane active" id="emptyHistoryFixture"><table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>01/01/2026</td><td>Historia propia ficticia</td></tr></table></div>
        <div class="tab-pane" id="emptyNotificacionesFixture"><table><tr><th>Fecha</th><th>Tipo Notificación</th></tr><tr><td colspan="2">No existen notificaciones</td></tr></table></div>
        <div class="tab-pane" id="emptyEscritosFixture"><table><tr><th>Doc.</th><th>Anexo</th><th>Fecha de Ingreso</th><th>Tipo Escrito</th><th>Solicitante</th></tr></table></div>
      </div>
      <script>function fixtureEmptyTab(id){document.querySelectorAll('.tab-pane').forEach(node=>node.classList.toggle('active',node.id===id))}</script>
    `);
    assert.equal((await scrapeModalTabs(page, { panelTimeoutMs: 1_000, emptyIdleMs: 100 })).length, 1, "recognized optional empty tables do not block a verified primary history");
    await page.locator('#emptyEscritosFixture').evaluate(node => node.setAttribute('aria-busy', 'true'));
    await assert.rejects(() => waitForModalHistoryPanel(page, { label: 'Escritos', panelId: 'emptyEscritosFixture', optional: true, timeoutMs: 150, emptyIdleMs: 50 }), /Escritos.*no terminó/, "a loading optional table is not terminal");

    const previousValidationFlag = process.env.LEXOPEN_PJUD_LIVE_VALIDATION;
    const previousDebugFlag = process.env.PJUD_PANEL_DEBUG;
    try {
      await page.setContent('<div id="modalDetalleCivil" class="modal in" style="display:block"><div id="historiaCiv" class="tab-pane active"><table aria-hidden="true"><tr><th>Fecha</th><th>Trámite</th><th>PRIVATE_HEADER</th></tr><tr><td>05/02/2026</td><td>PRIVATE_CASE_CELL</td><td><a href="https://private-link.invalid/PRIVATE_URL">PRIVATE_PARTY</a></td></tr></table></div></div><script>window.jQuery={active:1}</script>');
      for (const flags of [["0", "1"], ["1", "0"]]) {
        process.env.LEXOPEN_PJUD_LIVE_VALIDATION = flags[0];
        process.env.PJUD_PANEL_DEBUG = flags[1];
        assert.equal(await readModalPanelDebugDiagnostics(page, 'historiaCiv'), undefined, "both validation and debug must be enabled");
      }
      process.env.LEXOPEN_PJUD_LIVE_VALIDATION = "1";
      process.env.PJUD_PANEL_DEBUG = "1";
      const diagnostics = await readModalPanelDebugDiagnostics(page, 'historiaCiv');
      assert.ok(diagnostics && 'panels' in diagnostics && 'jqueryActive' in diagnostics);
      assert.equal(diagnostics?.jqueryActive, 1);
      assert.equal(diagnostics?.panels?.[0].rowCount, 1);
      assert.equal(diagnostics?.panels?.[0].rowsWithValidDate, 1);
      assert.deepEqual(diagnostics?.panels?.[0].headerLabels, ['fecha', 'tramite', 'other']);
      assert.equal(diagnostics?.snapshotParserCount, 0);
      assert.equal(diagnostics?.visibleTableTextParserCount, 1, "diagnostics distinguish parser exclusion attributes from visible table text without changing success");
      assert.equal(diagnostics?.tableExcludedAttributes.ariaHidden, 1);
      assert.ok(!/PRIVATE_|private-link|05\/02\/2026|<table|href=|parserScopeHtml|parserSnapshotHtml|parserVisibleTableTextHtml/.test(JSON.stringify(diagnostics)), "internal HTML is removed before returning diagnostics");
      await assert.rejects(() => waitForModalHistoryPanel(page, { label: 'Historia', panelId: 'historiaCiv', timeoutMs: 150 }), (error: Error) => {
        assert.match(error.message, /Diagnóstico estructural/);
        assert.match(error.message, /"jqueryActive":1/);
        assert.ok(!/PRIVATE_|private-link|05\/02\/2026|<table|href=/.test(error.message), "diagnostics contain no case cells, unknown headers, date values, URLs or HTML");
        return true;
      });
    } finally {
      if (previousValidationFlag === undefined) delete process.env.LEXOPEN_PJUD_LIVE_VALIDATION; else process.env.LEXOPEN_PJUD_LIVE_VALIDATION = previousValidationFlag;
      if (previousDebugFlag === undefined) delete process.env.PJUD_PANEL_DEBUG; else process.env.PJUD_PANEL_DEBUG = previousDebugFlag;
      await page.evaluate(() => { (window as typeof window & { jQuery?: { active?: number } }).jQuery = { active: 0 }; });
    }

    // Current public form, observed through PJUD's published session entry.
    // The RIT, parties and history below are fictitious. Every request is local.
    const current = await browser.newPage();
    await current.route("**/*", (route) => route.abort());
    await current.route("https://ojv-current-fixture.test/**", async (route) => {
      const entry = new URL(route.request().url()).pathname.endsWith("sesion-consultaunificada.php");
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: entry ? `<script>location.href='/indexN.php'</script>` : `
        <section style="display:none">
          <select id="jurCompetencia"><option value="3">Civil</option></select>
          <select id="corteJur"><option value="99">Corte oculta</option></select>
          <select id="jurTribunal"><option value="999">Tribunal oculto</option></select>
          <button id="btnConConsultaJur" onclick="window.wrongSearch=true">Buscar</button>
        </section>
        <a href="#busRit">Búsqueda por RIT</a>
        <section id="busRit" class="tab-pane active">
          <select id="competencia" onchange="document.querySelector('#conTribunal').innerHTML='<option value=0>Todos</option>'"><option value="0">Seleccione</option><option value="3">Civil</option></select>
          <select id="conCorte" onchange="setTimeout(()=>document.querySelector('#conTribunal').innerHTML='<option value=0>Todos</option><option value=260>2º Juzgado Civil de Santiago</option><option value=261>3º Juzgado Civil de Santiago</option>',50)"><option value="0">Todos</option><option value="90">C.A. Santiago</option><option value="91">C.A. San Miguel</option></select>
          <select id="conTribunal"><option value="0">Todos</option></select>
          <select id="conTipoCausa" onchange="document.querySelector('#conRolCausa').value='';document.querySelector('#conEraCausa').value=''"><option value="E">E</option><option value="C">C</option></select>
          <input id="conRolCausa"><input id="conEraCausa">
          <button id="btnConConsulta" onclick="setTimeout(()=>document.querySelector('#dtaTableDetalle tbody').innerHTML=document.querySelector('#response').innerHTML,50)">Buscar</button>
        </section>
        <table id="dtaTableDetalle"><thead><tr><th></th><th>Rol</th><th>Fecha</th><th>Caratulado</th><th>Tribunal</th></tr></thead><tbody><tr><td></td><td>C-9-2024</td><td>01/01/2024</td><td>Ejemplo anterior</td><td>3º Juzgado Civil de Santiago</td></tr></tbody></table>
        <template id="response">
          <tr><td><button onclick="window.wrongDetail=true">Ver</button></td><td>C-142-2024</td><td>01/01/2024</td><td>Otro ejemplo</td><td>3º Juzgado Civil de Santiago</td></tr>
          <tr><td><button onclick="window.wrongDetail=true">Ver</button></td><td>C-42-2024</td><td>01/01/2024</td><td>Otro tribunal</td><td>2º Juzgado Civil de Santiago</td></tr>
          <tr><td><a class="toggle-modal" title="Detalle de la causa" href="#" onclick="event.preventDefault();document.querySelector('#historiaCivFixture tbody td:nth-child(6)').textContent='Resolución ficticia cargada desde la causa exacta';document.querySelector('#modalDetalleCivil').style.display='block';document.querySelector('#modalDetalleCivil').classList.add('in')">Ver</a></td><td>C-42-2024</td><td>01/01/2024</td><td>Sociedad Ejemplo / Persona Ejemplo</td><td>3º Juzgado Civil de Santiago</td></tr>
        </template>
        <div id="modalDetalleCivil" class="modal" style="display:none">
          <a href="#historiaCivFixture">Historia</a>
          <table id="historiaCivFixture"><thead><tr><th>Folio</th><th>Doc.</th><th>Anexo</th><th>Etapa</th><th>Trámite</th><th>Desc. Trámite</th><th>Fec. Trámite</th><th>Foja</th><th>Georref.</th></tr></thead><tbody><tr><td>1</td><td></td><td></td><td>Ingreso</td><td>Resolución</td><td>Resolución ficticia de prueba</td><td>02/01/2024</td><td>1</td><td></td></tr></tbody></table>
        </div>
      ` });
    });
    await current.goto("https://ojv-current-fixture.test/includes/sesion-consultaunificada.php");
    await enterConsultaCausas(current, { mode: "manual", formTimeoutMs: 2_000 });
    assert.equal((await readConsultaFormState(current)).fields[0].id, "competencia");
    await selectTribunalOrCorte(current, "3º Juzgado Civil de Santiago");
    await fillRolSearchFields(current, { tipo: "C", numero: "42", era: "2024" });
    assert.equal(await current.locator("#conCorte").inputValue(), "90");
    assert.equal(await current.locator("#conTribunal").inputValue(), "261");
    assert.equal(await current.locator("#conRolCausa").inputValue(), "42");
    assert.equal(await current.locator("#conEraCausa").inputValue(), "2024");
    assert.equal(await current.locator("#conTipoCausa").inputValue(), "C");
    await clickBuscar(current, 2_000);
    assert.equal(await current.locator("#dtaTableDetalle tbody tr").count(), 3);
    assert.equal(await current.evaluate(() => Boolean((window as typeof window & { wrongSearch?: boolean }).wrongSearch)), false);
    assert.equal(await openExactCauseModal(current, { rit: "C-42-2024", tribunal: "3º Juzgado Civil de Santiago" }), "3º Juzgado Civil de Santiago");
    assert.equal(await current.evaluate(() => Boolean((window as typeof window & { wrongDetail?: boolean }).wrongDetail)), false);
    assert.equal(await current.locator("#modalDetalleCivil").isVisible(), true);

    await current.setContent(`<select id="competencia"><option value="3">Civil</option></select><select id="conCorte"><option value="0">Todos</option><option value="90">C.A. Santiago</option><option value="92">C.A. Santiago</option></select><select id="conTribunal"><option value="0">Todos</option></select>`);
    await assert.rejects(() => selectTribunalOrCorte(current, "3º Juzgado Civil de Santiago"), /única corte/);
    assert.equal(await current.locator("#conCorte").inputValue(), "0", "an ambiguous court is not selected");
    await current.close();
    console.log("pjud/public-scrape.dom.test.ts OK (offline fixtures)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
