/** Deterministic event fixtures; no browser, network, credentials or database. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Page } from "playwright";
import { pjudValidationErrorCode, redactedPjudValidationUrl, waitForOidcPageAfterTrigger } from "@/lib/pjud/ojv-oidc";

class FixturePage extends EventEmitter {
  address = "https://oficinajudicialvirtual.pjud.cl/home/index.php";
  frame = {};
  constructor(readonly fixtureContext: EventEmitter) { super(); }
  context() { return this.fixtureContext; }
  mainFrame() { return this.frame; }
  url() { return this.address; }
  isClosed() { return false; }
  asPage() { return this as unknown as Page; }
}

async function main() {
  const sensitiveUrl = "https://accounts.claveunica.gob.cl/accounts/login/?next=OIDC_PRIVATE&state=PRIVATE#PRIVATE";
  assert.equal(redactedPjudValidationUrl(sensitiveUrl), "https://accounts.claveunica.gob.cl/accounts/login/");
  assert.equal(redactedPjudValidationUrl("https://private:password@oficinajudicialvirtual.pjud.cl/indexN.php?code=PRIVATE#PRIVATE"), "https://oficinajudicialvirtual.pjud.cl/indexN.php");
  assert.equal(redactedPjudValidationUrl("https://oficinajudicialvirtual.pjud.cl/private-case-title/12345678-5?private=yes"), "https://oficinajudicialvirtual.pjud.cl/[redacted-path]");
  assert.equal(redactedPjudValidationUrl("https://accounts.claveunica.gob.cl.attacker.test/login?token=PRIVATE"), null);
  assert.equal(redactedPjudValidationUrl("https://unrelated.test/?next=https://accounts.claveunica.gob.cl"), null);
  assert.equal(redactedPjudValidationUrl("not a URL PRIVATE"), null);
  const secretError = new Error(`locator.fill(PRIVATE_PASSWORD) ${sensitiveUrl}`);
  assert.equal(pjudValidationErrorCode(secretError), "browser-action-failed");
  secretError.name = "TimeoutError";
  assert.equal(pjudValidationErrorCode(secretError), "timeout");

  const context = new EventEmitter();
  const original = new FixturePage(context);
  const popup = new FixturePage(context);
  popup.address = sensitiveUrl;
  // Emit synchronously inside the trigger: listeners installed afterward miss it.
  const immediate = await waitForOidcPageAfterTrigger(original.asPage(), async () => {
    context.emit("page", popup);
    return "popup";
  }, { timeoutMs: 100 });
  assert.equal(immediate.page, popup);
  assert.equal(immediate.triggerResult, "popup");
  assert.equal(context.listenerCount("page"), 0);
  assert.equal(original.listenerCount("framenavigated"), 0);
  assert.equal(popup.listenerCount("framenavigated"), 0);

  const sameTab = await waitForOidcPageAfterTrigger(original.asPage(), async () => {
    original.address = sensitiveUrl;
    original.emit("framenavigated", original.mainFrame());
    return "same-tab";
  }, { timeoutMs: 100 });
  assert.equal(sameTab.page, original);
  assert.equal(sameTab.triggerResult, "same-tab");
  assert.equal(context.listenerCount("close"), 0);

  original.address = "https://oficinajudicialvirtual.pjud.cl/home/index.php";
  const missing = await waitForOidcPageAfterTrigger(original.asPage(), async () => undefined, { timeoutMs: 10 });
  assert.equal(missing.page, null);
  await assert.rejects(() => waitForOidcPageAfterTrigger(original.asPage(), async () => { throw new Error("fixture failure"); }, { timeoutMs: 10 }), /fixture failure/);
  assert.equal(context.listenerCount("page"), 0);
  assert.equal(context.listenerCount("close"), 0);
  assert.equal(original.listenerCount("framenavigated"), 0);
  console.log("pjud/ojv-oidc.test.ts OK (offline event fixtures)");
}

main().catch(() => { console.error("pjud/ojv-oidc.test.ts FAILED"); process.exitCode = 1; });
