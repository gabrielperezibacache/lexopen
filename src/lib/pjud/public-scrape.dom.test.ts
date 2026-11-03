/** Offline browser fixtures only. No OJV navigation, credentials, or CAPTCHA. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { clickBuscar, collectOjvResultPages, enterConsultaCausas, openExactCauseModal } from "@/lib/pjud/public-scrape";

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
    console.log("pjud/public-scrape.dom.test.ts OK (offline fixtures)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
