/** Offline browser fixtures only. No OJV navigation, credentials, or CAPTCHA. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { clickBuscar, collectOjvResultPages, enterConsultaCausas, fillRolSearchFields, openExactCauseModal, readConsultaFormState, selectTribunalOrCorte } from "@/lib/pjud/public-scrape";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
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
