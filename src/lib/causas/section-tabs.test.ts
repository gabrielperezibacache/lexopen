import assert from "node:assert/strict";
import { portfolioReturn, caseViewParams, caseViewHref } from "./portfolio-navigation";
import { shouldShowCausasSectionTabs } from "./section-tabs";

assert.equal(shouldShowCausasSectionTabs("/causas"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/"), false);
assert.equal(shouldShowCausasSectionTabs("/causas?origen=rol"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/monitoreo"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/monitoreo?alta=1"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/mis-causas"), true);
assert.equal(shouldShowCausasSectionTabs("/causas/nueva"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/abc123"), false);
assert.equal(shouldShowCausasSectionTabs("/causas/abc123/editar"), false);
assert.equal(shouldShowCausasSectionTabs("/dashboard"), false);

const filtered = "/mis-causas?q=pago&estado=activa&page=2#causa-c1";
assert.equal(portfolioReturn("/mis-causas?q=pago&estado=activa&page=2&extra=ajeno#arbitrario", "c1"), filtered);
assert.equal(portfolioReturn("//example.com/causas", "c1"), undefined);
assert.equal(portfolioReturn("/causas/c2", "c1"), undefined);
const context = caseViewParams("c1", { volver: filtered, mesa: "mesa1", draft: "draft1" });
const archive = new URL(caseViewHref("/causas/c1/expediente", context), "https://lexopen.test");
assert.equal(archive.searchParams.get("volver"), filtered);
assert.equal(archive.searchParams.get("escrito"), "draft1");
assert.equal(archive.searchParams.get("mesa"), "mesa1");
assert.equal(caseViewParams("c1", { volver: "/clientes", mesa: ["privada"], draft: "draft/ajeno" }).size, 0);

console.log("causas/section-tabs.test.ts OK");
