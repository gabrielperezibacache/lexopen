import assert from "node:assert/strict";
import { shouldShowCausasSectionTabs } from "./section-tabs";

assert.equal(shouldShowCausasSectionTabs("/causas"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/"), true);
assert.equal(shouldShowCausasSectionTabs("/causas?origen=rol"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/monitoreo"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/monitoreo?alta=1"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/mis-causas"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/nueva"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/abc123"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/abc123/editar"), false);
assert.equal(shouldShowCausasSectionTabs("/dashboard"), false);

console.log("causas/section-tabs.test.ts OK");
