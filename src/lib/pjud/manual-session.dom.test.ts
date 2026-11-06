/** Owned browser fixtures only. Every request is fulfilled locally; no credentials or OJV traffic. */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { createManualOjvSession, ManualOjvSessionError } from "@/lib/pjud/manual-session";
import { OJV_INDEX_N } from "@/lib/pjud/ojv-dom";
import type { PjudCausaRef } from "@/lib/pjud/types";

const envNames = ["PJUD_PUBLIC_SCRAPE", "PJUD_CLAVEUNICA_SCRAPE", "PJUD_AUTO_CONFIRM_PROMPTS", "PJUD_CAPTCHA_AUTO_SOLVE", "PJUD_DOC_DOWNLOADS"] as const;
const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

const shell = `<!doctype html><meta charset="utf-8">
<style>.modal{position:fixed;inset:70px 20px auto;z-index:1050;background:white;padding:16px}.modal-backdrop{position:fixed;inset:0;z-index:1040;background:rgba(0,0,0,.4)}#terms{z-index:1060}</style>
<a href="#infousuario">PRIVATE_FICTITIOUS_USER</a>
<a id="menuMisCausas" href="#" onclick="event.preventDefault();openMisCausas()">Mis Causas</a>
<div id="misCausasContent">
<a href="#" onclick="event.preventDefault()">Corte Suprema</a>
<a href="#" onclick="event.preventDefault();window.unexpectedMateria=true">Civil</a>
<section class="tab-pane active" id="tab1">
  <style>label.switch {display:inline-block;width:50px;height:25px} label.switch input{opacity:0;position:absolute;width:0;height:0} label.switch span{display:block;width:50px;height:25px}</style>
  <label class="switch"><input id="filtroMisCauSup" type="checkbox" onchange="document.querySelector('#btnConsultaMisCauSup').hidden=!this.checked"><span>Filtros</span></label>
  <button id="btnConsultaMisCauSup" hidden onclick="search()">Buscar</button>
  <table id="dtaTableDetalleMisCauSup"><thead><tr><th></th><th>Rol</th><th>Caratulado</th><th>Fecha Ingreso</th><th>Estado Causa</th><th>Corte</th><th>Institución</th></tr></thead><tbody></tbody></table>
</section>
</div>
<section id="detail"></section>
<script>
  window.searches=0;window.detailOpened=0;window.detailClosed=0;window.noticeClosed=0;window.inFlight=0;window.overlap=false;
  function openMisCausas(){setTimeout(()=>document.querySelector('#misCausasContent').hidden=false,window.misCausasDelay||0)}
  function search(){window.searches++;window.inFlight++;if(window.inFlight>1)window.overlap=true;setTimeout(()=>{document.querySelector('#dtaTableDetalleMisCauSup tbody').innerHTML='<tr><td><a href="#" title="Detalle de la causa" onclick="event.preventDefault();openDetail()">Ver</a></td><td>20-2024</td><td>PRIVATE_PARTY_A / PRIVATE_PARTY_B</td><td>02/01/2024</td><td>Tramitación</td><td>Corte Suprema</td><td>Fictitious institution</td></tr>';window.inFlight--},40)}
  function openDetail(){window.detailOpened++;document.querySelector('#detail').innerHTML='<div class="modal-backdrop fade in"></div><div class="modal in" id="modalDetalleSuprema" style="display:block"><div class="modal-header"><button class="close" aria-label="Cerrar" onclick="closeDetail()">×</button></div><table class="table-titulos"><tr><td>Rol: 20-2024</td><td>Corte Suprema</td></tr></table><a href="#historiaSup" onclick="event.preventDefault()">Historia</a><div class="tab-pane active" id="historiaSup"><table><thead><tr><th>Folio</th><th>Trámite</th><th>Fecha</th><th>Doc.</th></tr></thead><tbody><tr><td>1</td><td>Resolución ficticia</td><td>03/01/2024</td><td><a href="https://oficinajudicialvirtual.pjud.cl/documento/fictitious.pdf">PDF</a></td></tr></tbody></table></div></div>'}
  function closeDetail(){window.detailClosed++;const modal=document.querySelector('#modalDetalleSuprema');modal.style.display='none';modal.classList.remove('in');setTimeout(()=>document.querySelector('.modal-backdrop')?.remove(),120)}
</script>`;

const cause: PjudCausaRef = { id: "fixture-cause", rit: "20-2024", tribunal: "Corte Suprema", titulo: "Fictitious", caratula: null, ruc: null };

async function fixture(emptyLogin = false, menuDelayMs = 0) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let accountsVisits = 0;
  let documentRequests = 0;
  const focusedPages: Page[] = [];
  const scriptErrors: string[] = [];
  context.on("page", page => {
    page.on("pageerror", error => scriptErrors.push(error.message));
    const show = page.bringToFront.bind(page);
    page.bringToFront = async () => { focusedPages.push(page); await show(); };
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".pdf")) documentRequests += 1;
    if (url.hostname === "accounts.claveunica.gob.cl") accountsVisits += 1;
    const authenticatedShell = menuDelayMs ? shell.replace('id="misCausasContent"', 'id="misCausasContent" hidden').replace("window.searches=0;", `window.misCausasDelay=${menuDelayMs};window.searches=0;`) : shell;
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: url.pathname === "/indexN.php" ? authenticatedShell : url.hostname === "accounts.claveunica.gob.cl"
      ? emptyLogin ? '<h1>PJUD</h1>' : '<h1>PJUD</h1><input name="run"><input type="password" placeholder="Ingresa tu ClaveÚnica">'
      : '<h1>OJV</h1><script>function AutenticaCUnica(){location.href="https://accounts.claveunica.gob.cl/accounts/login/?next=PRIVATE_OIDC#PRIVATE"}</script>' });
  });
  return { browser, context, owned: { browser, context, channel: "chromium" as const }, accountsVisits: () => accountsVisits, documentRequests: () => documentRequests, scriptErrors: () => scriptErrors, focusedPages: () => [...focusedPages] };
}

async function main() {
  process.env.PJUD_PUBLIC_SCRAPE = "1";
  process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
  process.env.PJUD_AUTO_CONFIRM_PROMPTS = "0";
  process.env.PJUD_CAPTCHA_AUTO_SOLVE = "0";
  process.env.PJUD_DOC_DOWNLOADS = "0";
  try {
    const unsafeError = new Error("PRIVATE_RUT=12.345.678-5 PRIVATE_ROL=C-999-2024 https://accounts.claveunica.gob.cl/?code=PRIVATE_OIDC_SECRET #PRIVATE_SELECTOR");
    unsafeError.name = "TimeoutError";
    unsafeError.stack = `${unsafeError.name}: ${unsafeError.message}\n    at PRIVATE_RUT (/private/PRIVATE_ROL/src/lib/pjud/public-scrape.ts:123:45)\n    at secret (https://accounts.claveunica.gob.cl/PRIVATE_OIDC_SECRET:77:88)\n    at privateFile (/private/PRIVATE_RUT/secrets.ts:3:4)\n    at detail (/private/PRIVATE_ROL/src/lib/pjud/manual-session.ts:234:56)\n    at parse (/private/PRIVATE_RUT/src/lib/pjud/ojv-dom.ts:345:67)`;
    const diagnosticError = new ManualOjvSessionError("action-failed", { operation: "list", error: unsafeError });
    assert.deepEqual(diagnosticError.diagnostic, { operation: "list", originalErrorName: "TimeoutError", locations: ["src/lib/pjud/public-scrape.ts:123:45", "src/lib/pjud/manual-session.ts:234:56", "src/lib/pjud/ojv-dom.ts:345:67"] });
    assert.doesNotMatch(JSON.stringify(diagnosticError), /PRIVATE|12\.345|999-2024|https:|accounts|SELECTOR|secrets\.ts/);
    unsafeError.name = "PRIVATE_RUT_12.345.678-5";
    assert.equal(new ManualOjvSessionError("action-failed", { operation: "detail", error: unsafeError }).diagnostic?.originalErrorName, "UnknownError");

    let factoryCalls = 0;
    await assert.rejects(createManualOjvSession({ optedIn: false }, { createOwnedContext: async () => { factoryCalls++; throw new Error("must not run"); } }), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "disabled");
    process.env.PJUD_CLAVEUNICA_SCRAPE = "0";
    await assert.rejects(createManualOjvSession({ optedIn: true }, { createOwnedContext: async () => { factoryCalls++; throw new Error("must not run"); } }), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "disabled");
    assert.equal(factoryCalls, 0, "kill switches must run before launching a browser");
    process.env.PJUD_CLAVEUNICA_SCRAPE = "1";

    const first = await fixture();
    process.env.PJUD_AUTO_CONFIRM_PROMPTS = "1";
    process.env.PJUD_CAPTCHA_AUTO_SOLVE = "1";
    process.env.PJUD_DOC_DOWNLOADS = "1";
    const session = await createManualOjvSession({ optedIn: true, manualInteraction: true, loginTimeoutMs: 2_000 }, { createOwnedContext: async () => first.owned });
    try {
      assert.equal(session.status().phase, "waiting-login");
      assert.equal(session.status().pageUrl, "https://accounts.claveunica.gob.cl/accounts/login/");
      assert.doesNotMatch(JSON.stringify(session.status()), /PRIVATE|cookie|password|rut|run=/i);
      const page = first.context.pages()[0];
      // This fixture transition represents the user completing identification.
      await page.goto(OJV_INDEX_N);
      assert.deepEqual(first.scriptErrors(), []);
      await page.locator("body").evaluate(body => {
        body.insertAdjacentHTML("beforeend", '<div class="modal show" id="terms"><button onclick="this.parentElement.remove()">Acepto</button></div>');
      });
      const authenticated = session.waitForAuthentication();
      await page.waitForTimeout(180);
      assert.equal(session.status().phase, "waiting-user-confirmation");
      assert.equal(await page.locator("#terms").count(), 1, "the session must leave terms untouched");
      await page.getByRole("button", { name: "Acepto", exact: true }).click();
      assert.equal((await authenticated).authenticated, true);
      await page.locator("body").evaluate(body => {
        body.insertAdjacentHTML("beforeend", '<table id="outsideMisCausas"><tr><td><button onclick="window.outsideDetailOpened=true">Ver</button></td><td>20-2024</td><td>Corte Suprema</td></tr></table>');
      });
      const [items, detail] = await Promise.all([
        session.listMisCausas({ materias: ["Corte Suprema"], responseTimeoutMs: 500 }),
        session.fetchCausaDetail(cause, { materias: ["Corte Suprema"], responseTimeoutMs: 500 }),
      ]);
      assert.equal(items.length, 1);
      assert.equal(detail.movimientos.length, 1);
      assert.equal(detail.movimientos[0].titulo, "Resolución ficticia");
      assert.equal(detail.movimientos[0].documentoBytes, undefined);
      assert.equal(first.documentRequests(), 0);
      assert.equal(first.accountsVisits(), 1, "listing and detail must not start another login");
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { outsideDetailOpened?: boolean }).outsideDetailOpened)), false, "an exact duplicate outside the active panel must not block or open the detail");
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { overlap?: boolean }).overlap)), false, "shared page operations must run in series");
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { unexpectedMateria?: boolean }).unexpectedMateria)), false);
      await assert.rejects(session.fetchCausaDetail({ ...cause, rit: "99-2024" }), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "cause-not-listed");
      assert.equal(await page.locator("#modalDetalleSuprema").isVisible(), true);
      assert.equal(await page.locator(".modal-backdrop").isVisible(), true, "a real overlay must block returning to the list until the case detail is closed");
      await page.locator("body").evaluate(body => {
        body.insertAdjacentHTML("beforeend", '<div class="modal show" id="terms"><button data-dismiss="modal" onclick="window.noticeClosed++;this.parentElement.remove()">Cerrar aviso</button><button onclick="this.parentElement.remove()">Acepto</button></div>');
      });
      await assert.rejects(session.listMisCausas({ materias: ["Corte Suprema"] }), (error: unknown) => {
        assert.ok(error instanceof ManualOjvSessionError && error.code === "action-failed");
        assert.equal(error.diagnostic?.operation, "list");
        assert.equal(error.diagnostic?.originalErrorName, "PjudScrapeError");
        assert.ok(error.diagnostic?.locations.every(location => /^src\/lib\/pjud\/(?:public-scrape|manual-session|ojv-dom)\.ts:\d+:\d+$/.test(location)));
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE|PARTY|20-2024|Corte Suprema|https:/);
        return true;
      });
      assert.equal(await page.locator("#terms").isVisible(), true, "generic notices must not be dismissed even when they have a modal close control");
      assert.equal(await page.evaluate(() => (window as typeof window & { noticeClosed: number }).noticeClosed), 0);
      assert.equal(await page.locator("#modalDetalleSuprema").isVisible(), true, "a notice must stop the read before dismissing the underlying record");
      await page.getByRole("button", { name: "Acepto", exact: true }).click();
      assert.equal((await session.listMisCausas({ materias: ["Corte Suprema"] })).length, 1, "the next read closes only the known case-detail modal");
      assert.equal(await page.locator("#modalDetalleSuprema").isVisible(), false);
      assert.equal(await page.locator(".modal-backdrop").count(), 0, "the detail backdrop must be gone before the next list is read");
      assert.equal(await page.evaluate(() => (window as typeof window & { detailClosed: number }).detailClosed), 1);
      assert.doesNotMatch(JSON.stringify(session.status()), /PRIVATE|20-2024|Corte Suprema|PARTY|cookie|password/i);
      process.env.PJUD_CLAVEUNICA_SCRAPE = "0";
      await assert.rejects(session.listMisCausas(), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "disabled");
      assert.equal(session.status().phase, "closed");
    } finally {
      process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
      process.env.PJUD_AUTO_CONFIRM_PROMPTS = "0";
      process.env.PJUD_CAPTCHA_AUTO_SOLVE = "0";
      process.env.PJUD_DOC_DOWNLOADS = "0";
      await session.close();
    }

    const delayedFixture = await fixture(false, 1_600);
    const delayed = await createManualOjvSession({ optedIn: true }, { createOwnedContext: async () => delayedFixture.owned });
    try {
      const page = delayedFixture.context.pages()[0];
      await page.goto(OJV_INDEX_N);
      await delayed.waitForAuthentication();
      assert.equal(await page.locator("#misCausasContent").isVisible(), false, "an identified shell does not imply the AJAX menu is ready");
      assert.equal((await delayed.listMisCausas({ materias: ["Corte Suprema"], responseTimeoutMs: 500 })).length, 1, "listing must wait for the selected materia after opening its AJAX menu");
      await page.locator("body").evaluate(body => {
        body.insertAdjacentHTML("beforeend", '<table id="outsideMisCausas"><tbody></tbody></table>');
        const button = body.querySelector("#btnConsultaMisCauSup");
        button?.setAttribute("onclick", "document.querySelector('#outsideMisCausas tbody').innerHTML='<tr><td>Ver</td><td>20-2024</td><td>Corte Suprema</td></tr>'");
      });
      await assert.rejects(
        delayed.fetchCausaDetail(cause, { materias: ["Corte Suprema"], responseTimeoutMs: 250, downloadDocuments: false }),
        (error: unknown) => error instanceof ManualOjvSessionError && error.code === "action-failed",
        "a fresh duplicate outside the active panel must not validate an old row within it"
      );
      assert.equal(await page.locator("#outsideMisCausas tbody tr").count(), 1);
      assert.equal(await page.evaluate(() => (window as typeof window & { detailOpened: number }).detailOpened), 0);

      await page.locator("#btnConsultaMisCauSup").evaluate(button => {
        button.setAttribute("onclick", "document.querySelector('#tab1').insertAdjacentHTML('beforeend', '<div class=card id=freshWithoutLink>20-2024 | Corte Suprema</div>')");
      });
      await assert.rejects(
        delayed.fetchCausaDetail(cause, { materias: ["Corte Suprema"], responseTimeoutMs: 500, downloadDocuments: false }),
        (error: unknown) => error instanceof ManualOjvSessionError && error.code === "action-failed",
        "a fresh result without an exact detail control must not fall back to an old row in the same panel"
      );
      assert.equal(await page.locator("#freshWithoutLink").count(), 1);
      assert.equal(await page.evaluate(() => (window as typeof window & { detailOpened: number }).detailOpened), 0);
      assert.equal(await page.evaluate(() => "lexopenManualMisCausasFresh" in window), false);

      await page.locator("body").evaluate(body => {
        body.querySelector("#freshWithoutLink")?.remove();
        const row = body.querySelector("#dtaTableDetalleMisCauSup tbody tr")!.outerHTML;
        const first = JSON.stringify(row.replace("20-2024", "99-2024"));
        const second = JSON.stringify(row);
        body.querySelector("#btnConsultaMisCauSup")!.setAttribute("onclick", `document.querySelector('#dtaTableDetalleMisCauSup tbody').innerHTML=${first}`);
        const next = document.createElement("button");
        next.textContent = "Siguiente";
        next.setAttribute("onclick", `document.querySelector('#dtaTableDetalleMisCauSup tbody').innerHTML=${second}; this.disabled=true`);
        body.querySelector("#tab1")!.append(next);
        body.insertAdjacentHTML("afterbegin", '<button onclick="window.outsidePaginationUsed=true">Siguiente</button>');
      });
      const paginated = await delayed.fetchCausaDetail(cause, { materias: ["Corte Suprema"], responseTimeoutMs: 500, downloadDocuments: false });
      assert.equal(paginated.movimientos.length, 1, "read the exact fresh row on page two of the same panel");
      assert.equal(await page.evaluate(() => Boolean((window as typeof window & { outsidePaginationUsed?: boolean }).outsidePaginationUsed)), false);
    } finally {
      await delayed.close();
    }

    const focusFixture = await fixture();
    const focusSession = await createManualOjvSession({ optedIn: true, loginTimeoutMs: 5_000 }, { createOwnedContext: async () => focusFixture.owned });
    try {
      const page = focusFixture.context.pages()[0];
      assert.deepEqual(focusFixture.focusedPages(), [page], "the ready official form is activated when its owned session opens");
      const waiting = focusSession.waitForAuthentication();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([focusSession.showOfficialWindow!(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("focus queued behind authentication")), 1_500); })]);
      } finally { if (timeout) clearTimeout(timeout); }
      assert.equal(focusSession.status().phase, "waiting-login");
      assert.equal(focusSession.status().authenticated, false, "activating an official tab is not authentication");
      assert.equal(focusFixture.accountsVisits(), 1, "focus must not open another login or navigate");
      await page.goto(OJV_INDEX_N); await waiting;
      const items = await focusSession.listMisCausas({ materias: ["Corte Suprema"], responseTimeoutMs: 500 });
      const before = focusSession.status(); await focusSession.showOfficialWindow!();
      assert.deepEqual(focusSession.status(), before, "focus preserves the authenticated session and its creation time");
      assert.equal((await focusSession.fetchCausaDetail(cause)).movimientos.length, 1, "focus preserves the checked cause allowlist");
      assert.equal(items.length, 1); assert.equal(focusFixture.documentRequests(), 0);
      // An unrelated page is never activated, even when it is the newest tab.
      const unrelated = await focusFixture.context.newPage(); await unrelated.goto("https://unrelated.invalid");
      await focusSession.showOfficialWindow!();
      assert.equal(focusFixture.focusedPages().at(-1), page);
      await page.goto("https://unrelated.invalid");
      const focused = focusFixture.focusedPages().length;
      await assert.rejects(focusSession.showOfficialWindow!(), error => error instanceof ManualOjvSessionError && error.code === "window-unavailable");
      assert.equal(focusFixture.focusedPages().length, focused, "a context without an official page must not fall back to another site");
    } finally { await focusSession.close(); }
    await assert.rejects(focusSession.showOfficialWindow!(), error => error instanceof ManualOjvSessionError && error.code === "session-closed");

    const returningFixture = await fixture();
    const returningSession = await createManualOjvSession({ optedIn: true }, { createOwnedContext: async () => returningFixture.owned });
    try {
      const login = returningFixture.context.pages()[0];
      const callback = await returningFixture.context.newPage(); await callback.goto(OJV_INDEX_N);
      await returningSession.waitForAuthentication();
      await returningSession.listMisCausas({ materias: ["Corte Suprema"], responseTimeoutMs: 500 });
      await returningSession.showOfficialWindow!();
      assert.equal(returningFixture.focusedPages().at(-1), callback, "the identified callback wins while it remains authenticated");
      await callback.locator('a[href="#infousuario"]').evaluate(node => { node.textContent = "Invitado"; });
      const before = returningSession.status();
      await returningSession.showOfficialWindow!();
      assert.equal(returningFixture.focusedPages().at(-1), login, "an old OJV guest page must not obscure the owned login form");
      assert.deepEqual(returningSession.status(), before, "choosing a visible window never changes authentication or its lifetime");
      assert.equal(returningFixture.accountsVisits(), 1); assert.equal(returningFixture.documentRequests(), 0);
    } finally { await returningSession.close(); }

    const timeoutFixture = await fixture();
    const timed = await createManualOjvSession({ optedIn: true, loginTimeoutMs: 100 }, { createOwnedContext: async () => timeoutFixture.owned });
    await assert.rejects(timed.waitForAuthentication(), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "login-timeout");
    await timed.close();
    assert.equal(timeoutFixture.browser.isConnected(), false);

    const abortFixture = await fixture();
    const controller = new AbortController();
    const cancelled = await createManualOjvSession({ optedIn: true, signal: controller.signal }, { createOwnedContext: async () => abortFixture.owned });
    const waiting = cancelled.waitForAuthentication();
    controller.abort();
    await assert.rejects(waiting, (error: unknown) => error instanceof ManualOjvSessionError && error.code === "aborted");
    await cancelled.close();
    assert.equal(abortFixture.browser.isConnected(), false);

    const emptyForm = await fixture(true);
    await assert.rejects(createManualOjvSession({ optedIn: true, loginFormTimeoutMs: 100 }, { createOwnedContext: async () => emptyForm.owned }), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "login-unavailable");
    assert.equal(emptyForm.browser.isConnected(), false, "an accounts URL without visible fields is not a ready login form");

    const operationFixture = await fixture();
    const shortOperation = await createManualOjvSession({ optedIn: true, operationTimeoutMs: 100 }, { createOwnedContext: async () => operationFixture.owned });
    await operationFixture.context.pages()[0].goto(OJV_INDEX_N);
    await shortOperation.waitForAuthentication();
    await assert.rejects(shortOperation.listMisCausas({ materias: ["Corte Suprema"] }), (error: unknown) => error instanceof ManualOjvSessionError && error.code === "operation-timeout");
    await shortOperation.close();
    assert.equal(operationFixture.browser.isConnected(), false);

    const idleFixture = await fixture();
    const idle = await createManualOjvSession({ optedIn: true, maxLifetimeMs: 500 }, { createOwnedContext: async () => idleFixture.owned });
    try {
      // No authentication wait, read, or explicit close: the owned context must expire by itself.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("idle session did not expire")), 5_000);
        idleFixture.browser.once("disconnected", () => { clearTimeout(timeout); resolve(); });
      });
      assert.equal(idle.status().phase, "closed");
      assert.equal(idleFixture.browser.isConnected(), false);
    } finally {
      await idle.close();
    }
    console.log("pjud/manual-session.dom.test.ts OK (offline owned-session fixtures, no credentials or exports)");
  } finally {
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
