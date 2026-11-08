import assert from "node:assert/strict";
import { ROLES, STAFF_ROLES } from "../auth/roles";
import { canSome } from "../auth/permissions";
import { isClientAllowedPagePath } from "../auth/client-paths";
import { getDictionary, translate } from "../i18n";
import { activeNavigationArea, activeNavigationEntry, buildNavigation, navigationBreadcrumbs, navigationEntries, secondaryNavigation } from "./catalog";

for (const role of ROLES) {
  const model = buildNavigation({ role });
  const entries = navigationEntries(model);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length, `${role}: unique destinations`);
  if ((STAFF_ROLES as readonly string[]).includes(role)) {
    assert.equal(model.areas.length, canSome({ role }, "assistant.use") ? 7 : 6, `${role}: accessible work areas`);
    for (const area of model.areas) assert.ok(entries.some(entry => entry.href === area.href), `${role}: reachable area ${area.id}`);
    for (const href of ["/clientes", "/configuracion", "/facturacion", "/audiencias", "/biblioteca"]) assert.ok(entries.some(entry => entry.href === href), `${role}: read gate is staff ${href}`);
    assert.ok(entries.every(entry => !["/correo", "/mensajes", "/configuracion#comunicaciones"].includes(entry.href)), `${role}: communications absent from unconfigured discovery`);
    assert.equal(entries.some(entry => entry.href === "/auditoria"), canSome({ role }, "audit.read"));
  } else {
    assert.equal(model.mode, "portal");
    assert.equal(model.areas.length, 0);
    assert.ok(entries.length > 0);
    for (const entry of entries) assert.equal(isClientAllowedPagePath(entry.href), true, `${role}: portal allowlist ${entry.href}`);
    assert.equal(entries.some(entry => entry.href === "/agente"), false);
    assert.deepEqual(entries.map(entry => entry.href).sort(), ["/portal", "/sites", "/mensajes", "/buscar", "/notificaciones", "/cuenta"].sort());
  }
  for (const locale of ["es", "en"] as const) {
    const dict = getDictionary(locale);
    for (const item of [...model.areas, ...entries]) assert.notEqual(translate(dict, item.labelKey), item.labelKey, `translated ${locale}: ${item.labelKey}`);
  }
}
for (const subject of [null, undefined, { role: "" }, { role: "unknown" }]) assert.equal(navigationEntries(buildNavigation(subject)).length, 0);
const delegated = navigationEntries(buildNavigation({ role: "socio", capabilityGrants: "host.admin,audit.read" }));
assert.ok(delegated.some(entry => entry.id === "configuracion"), "delegated Host administrators can find firm settings");
assert.equal(delegated.some(entry => entry.id === "auditoria"), true, "audit is discoverable with its effective capability");
assert.equal(navigationEntries(buildNavigation({ role: "admin", capabilityRevokes: "audit.read" })).some(entry => entry.id === "auditoria"), false, "Host administration does not override audit revocation");
assert.equal(navigationEntries(buildNavigation({ role: "abogado", capabilityGrants: "audit.read" })).some(entry => entry.id === "auditoria"), true, "audit can be delegated independently of Host administration");
assert.equal(navigationEntries(buildNavigation({ role: "cliente", capabilityGrants: "audit.read,host.admin" })).some(entry => entry.id === "auditoria"), false, "portal access still excludes firm audit");
assert.equal(navigationEntries(buildNavigation({ role: "admin", capabilityRevokes: "host.admin" })).some(entry => entry.id === "configuracion"), true, "personal settings remain accessible when Host administration is revoked");
assert.equal(navigationEntries(buildNavigation({ role: "cliente", capabilityGrants: "host.admin" })).some(entry => entry.id === "configuracion"), false, "portal access never exposes firm settings");
assert.equal(navigationEntries(buildNavigation({ role: "abogado", capabilityRevokes: "assistant.use" })).some(entry => entry.id === "agente"), false);
assert.equal(buildNavigation({ role: "abogado", capabilityRevokes: "assistant.use" }).areas.some(area => area.id === "academico"), false);
assert.ok(buildNavigation({ role: "contabilidad" }).shortcuts.some(entry => entry.id === "facturacion"));
assert.equal(buildNavigation({ role: "procurador" }).shortcuts.length, 0);

const staff = buildNavigation({ role: "socio" }, { caseManagementMode: "pjud_cl", communicationsAvailable: true });
assert.equal(staff.utilities.find(entry => entry.id === "mail-settings")?.href, "/configuracion#comunicaciones");
assert.ok(!navigationEntries(staff).some(entry => ["/correo", "/mensajes"].includes(entry.href)), "staff communications open from settings, not as separate navigation entries");
assert.ok(!navigationEntries(buildNavigation({ role: "cliente" }, { communicationsAvailable: true })).some(entry => entry.id === "mail-settings"));
assert.deepEqual(navigationBreadcrumbs(staff, "/correo?id=mail").map(crumb => crumb.href), ["/inicio", "/configuracion", "/configuracion#comunicaciones", "/correo"]);
assert.deepEqual(navigationBreadcrumbs(staff, "/mensajes").map(crumb => crumb.href), ["/inicio", "/configuracion", "/configuracion#comunicaciones", "/mensajes"]);
assert.equal(activeNavigationEntry(staff, "/configuracion/correo")?.id, "configuracion");
for (const [path, area, destination] of [
  ["/causas/a-case/escritos?draft=a-writing", "causas", "causas"],
  ["/causas/a-case/expediente?carpeta=prueba", "causas", "my-matters"],
  ["/causas/mis-causas?alta=1", "causas", "mis-causas"],
  ["/audiencias/a-workspace", "agenda", "audiencias"],
  ["/biblioteca/a-book?causa=a-case", "biblioteca", "biblioteca"],
  ["/jurisprudencia/fuentes/a-source", "biblioteca", "jurisprudencia"],
  ["/academico?trabajo=private", "academico", "academico"],
  ["/sincronizacion", "causas", "sincronizacion"],
  ["/facturacion/facturas/a-invoice", "estudio", "facturacion"],
  ["/sites/a-space/wiki", "estudio", "sites"],
] as const) {
  assert.equal(activeNavigationArea(staff, path)?.id, area);
  assert.equal(activeNavigationEntry(staff, path)?.id, destination);
  assert.ok(secondaryNavigation(staff, path).every(entry => entry.area === area), "secondary contains only the current area");
}
assert.equal(activeNavigationEntry(staff, "/causas-distintas"), undefined, "match full route segments");
assert.deepEqual(secondaryNavigation(staff, "/buscar"), []);
for (const path of ["/causas", "/causas/monitoreo/", "/causas/mis-causas?alta=1#estado"]) {
  assert.equal(secondaryNavigation(staff, path).some(entry => ["monitoreo", "mis-causas"].includes(entry.id)), false, "Case section tabs own these destinations on their three routes");
}
for (const path of ["/mis-causas", "/causas/nueva", "/causas/a-case", "/documentos", "/minutas"]) {
  assert.ok(secondaryNavigation(staff, path).some(entry => entry.id === "sincronizacion"));
  assert.equal(secondaryNavigation(staff, path).some(entry => ["pjud", "monitoreo", "mis-causas"].includes(entry.id)), false, "judicial tools do not replace the general case navigation");
}
assert.ok(navigationEntries(staff).some(entry => entry.id === "monitoreo"), "Quick navigation retains the monitoring destination");
assert.ok(navigationEntries(staff).some(entry => entry.id === "mis-causas"), "Quick navigation retains the ClaveÚnica destination");
assert.deepEqual(navigationBreadcrumbs(staff, "/inicio"), [{ href: "/inicio", labelKey: "nav.home" }], "no repeated home crumb");
assert.equal(navigationBreadcrumbs(staff, "/causas/a-case/escritos").at(-1)?.labelKey, "nav.details.writings");
assert.equal(navigationBreadcrumbs(staff, "/causas/a-case/mesa").at(-1)?.labelKey, "nav.details.workbench");
assert.equal(navigationBreadcrumbs(staff, "/causas/a-case/expediente").at(-2)?.href, "/mis-causas");
assert.equal(navigationBreadcrumbs(staff, "/biblioteca/a-book").at(-1)?.labelKey, "nav.details.book");
assert.deepEqual(navigationBreadcrumbs(buildNavigation({ role: "externo" }), "/portal"), [{ href: "/portal", labelKey: "nav.portal" }]);
assert.ok(navigationBreadcrumbs(staff, "/documentos/a-document/fuentes/a-source").every(crumb => !crumb.href.endsWith("/fuentes")), "no intermediate source list without a page");
assert.equal(navigationBreadcrumbs(staff, "/causas/%E0%A4%A").at(-1)?.labelKey, "nav.details.case", "opaque identifiers are never exposed or decoded");
const manual = buildNavigation({ role: "socio" }, { caseManagementMode: "manual" });
assert.equal(manual.areas.find(area => area.id === "causas")?.href, "/mis-causas");
assert.equal(staff.areas.find(area => area.id === "causas")?.href, "/mis-causas");
assert.equal(navigationEntries(manual).some(entry => ["pjud","monitoreo","mis-causas"].includes(entry.id)),false,"manual mode hides Chile-only destinations");
assert.ok(navigationEntries(staff).some(entry => entry.id === "causas"),"the connected mode retains access to manual files");
assert.equal(activeNavigationEntry(staff,"/pjud/a-case")?.id,"pjud");
console.log("navigation/catalog.test.ts OK");
