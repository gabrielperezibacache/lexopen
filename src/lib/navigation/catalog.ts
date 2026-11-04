import { canSome, type PermissionSubject } from "../auth/permissions";
import { isClientAllowedPagePath } from "../auth/client-paths";
import { isRole, PORTAL_ROLES, STAFF_ROLES } from "../auth/roles";

export type NavigationAreaId = "jornada" | "causas" | "agenda" | "biblioteca" | "clientes" | "comunicaciones" | "estudio";
export type NavigationIcon = "home" | "cases" | "calendar" | "library" | "clients" | "inbox" | "studio" | "files" | "minutes" | "deadlines" | "tasks" | "hearings" | "research" | "portal" | "messages" | "billing" | "people" | "spaces" | "workflows" | "settings" | "integrations" | "audit" | "assistant" | "search" | "notifications" | "account" | "monitor";
export type NavigationEntry = {
  id: string;
  href: string;
  labelKey: string;
  icon: NavigationIcon;
  area?: NavigationAreaId;
  groupKey?: string;
  badge?: "mail";
  keywords?: string;
};
export type NavigationArea = { id: NavigationAreaId; labelKey: string; href: string; icon: NavigationIcon };
export type NavigationModel = {
  mode: "staff" | "portal" | "none";
  areas: NavigationArea[];
  entries: NavigationEntry[];
  utilities: NavigationEntry[];
  shortcuts: NavigationEntry[];
};

const AREAS: readonly NavigationArea[] = [
  { id: "jornada", labelKey: "nav.areas.jornada", href: "/inicio", icon: "home" },
  { id: "causas", labelKey: "nav.areas.causas", href: "/causas", icon: "cases" },
  { id: "agenda", labelKey: "nav.areas.agenda", href: "/calendario", icon: "calendar" },
  { id: "biblioteca", labelKey: "nav.areas.biblioteca", href: "/biblioteca", icon: "library" },
  { id: "clientes", labelKey: "nav.areas.clientes", href: "/clientes", icon: "clients" },
  { id: "comunicaciones", labelKey: "nav.areas.comunicaciones", href: "/correo", icon: "inbox" },
  { id: "estudio", labelKey: "nav.areas.estudio", href: "/dashboard", icon: "studio" },
];

type CatalogEntry = NavigationEntry & { access: "staff" | "signed-in" | "admin"; capability?: "assistant.use" };
const ENTRIES: readonly CatalogEntry[] = [
  { id: "inicio", href: "/inicio", labelKey: "nav.home", icon: "home", area: "jornada", access: "staff" },
  { id: "causas", href: "/causas", labelKey: "nav.caseFiles", icon: "cases", area: "causas", access: "staff", keywords: "expediente cartera RIT ROL" },
  { id: "monitoreo", href: "/causas/monitoreo", labelKey: "nav.pjudMonitor", icon: "monitor", area: "causas", access: "staff", keywords: "OJV sincronizar seguimiento" },
  { id: "mis-causas", href: "/causas/mis-causas", labelKey: "nav.misCausas", icon: "portal", area: "causas", access: "staff", keywords: "ClaveÚnica OJV importar" },
  { id: "documentos", href: "/documentos", labelKey: "nav.caseDocuments", icon: "files", area: "causas", access: "staff" },
  { id: "minutas", href: "/minutas", labelKey: "nav.minutes", icon: "minutes", area: "causas", access: "staff" },
  { id: "calendario", href: "/calendario", labelKey: "nav.calendar", icon: "calendar", area: "agenda", access: "staff" },
  { id: "audiencias", href: "/audiencias", labelKey: "nav.hearings", icon: "hearings", area: "agenda", access: "staff", keywords: "panel en vivo transcripción grabación" },
  { id: "plazos", href: "/plazos", labelKey: "nav.deadlines", icon: "deadlines", area: "agenda", access: "staff" },
  { id: "tareas", href: "/tareas", labelKey: "nav.tasks", icon: "tasks", area: "agenda", access: "staff" },
  { id: "biblioteca", href: "/biblioteca", labelKey: "nav.ownedLibrary", icon: "library", area: "biblioteca", access: "staff", keywords: "libros sentencias resoluciones colecciones fuentes PDF EPUB citas" },
  { id: "jurisprudencia", href: "/jurisprudencia", labelKey: "nav.officialResearch", icon: "research", area: "biblioteca", access: "staff", keywords: "jurisprudencia fuentes oficiales BCN" },
  { id: "clientes", href: "/clientes", labelKey: "nav.clientDirectory", icon: "clients", area: "clientes", access: "staff" },
  { id: "portal", href: "/portal", labelKey: "nav.portal", icon: "portal", area: "clientes", access: "signed-in" },
  { id: "correo", href: "/correo", labelKey: "nav.mailbox", icon: "inbox", area: "comunicaciones", access: "staff", badge: "mail", keywords: "bandeja PJUD" },
  { id: "mensajes", href: "/mensajes", labelKey: "nav.messages", icon: "messages", area: "comunicaciones", access: "signed-in" },
  { id: "dashboard", href: "/dashboard", labelKey: "nav.firmOverview", icon: "studio", area: "estudio", groupKey: "nav.secondary.management", access: "staff" },
  { id: "facturacion", href: "/facturacion", labelKey: "nav.fees", icon: "billing", area: "estudio", groupKey: "nav.secondary.management", access: "staff", keywords: "honorarios facturación horas gastos cobros cuenta corriente tarifas UF" },
  { id: "personas", href: "/personas", labelKey: "nav.team", icon: "people", area: "estudio", groupKey: "nav.secondary.collaboration", access: "staff" },
  { id: "sites", href: "/sites", labelKey: "nav.sites", icon: "spaces", area: "estudio", groupKey: "nav.secondary.collaboration", access: "signed-in" },
  { id: "flujos", href: "/flujos", labelKey: "nav.workflows", icon: "workflows", area: "estudio", groupKey: "nav.secondary.collaboration", access: "staff" },
  // These pages use requireRole("admin"), not the broader host.admin/audit.read capabilities.
  { id: "configuracion", href: "/configuracion", labelKey: "nav.settings", icon: "settings", area: "estudio", groupKey: "nav.secondary.administration", access: "admin" },
  { id: "integraciones", href: "/integraciones", labelKey: "nav.integrations", icon: "integrations", area: "estudio", groupKey: "nav.secondary.administration", access: "staff" },
  { id: "auditoria", href: "/auditoria", labelKey: "nav.audit", icon: "audit", area: "estudio", groupKey: "nav.secondary.administration", access: "admin" },
  { id: "agente", href: "/agente", labelKey: "nav.assistant", icon: "assistant", access: "staff", capability: "assistant.use", keywords: "IA asistente" },
  { id: "buscar", href: "/buscar", labelKey: "nav.search", icon: "search", access: "signed-in" },
  { id: "notificaciones", href: "/notificaciones", labelKey: "nav.notifications", icon: "notifications", access: "signed-in" },
  { id: "cuenta", href: "/cuenta", labelKey: "nav.account", icon: "account", access: "signed-in" },
];

/** Discovery only: pages and APIs remain responsible for enforcing access and scope. */
export function buildNavigation(subject: PermissionSubject | null | undefined): NavigationModel {
  if (!subject || !isRole(subject.role)) return { mode: "none", areas: [], entries: [], utilities: [], shortcuts: [] };
  const role = subject.role;
  const staff = (STAFF_ROLES as readonly string[]).includes(role);
  const portal = (PORTAL_ROLES as readonly string[]).includes(role);
  const allowed = ENTRIES.filter(entry => {
    if (portal) return entry.access === "signed-in" && isClientAllowedPagePath(entry.href);
    if (!staff || (entry.access === "admin" && role !== "admin")) return false;
    return !entry.capability || canSome(subject, entry.capability);
  }).map(({ id, href, labelKey, icon, area, groupKey, badge, keywords }) => ({ id, href, labelKey, icon, area, groupKey, badge, keywords }));
  const utilities = allowed.filter(entry => !entry.area);
  if (portal) return { mode: "portal", areas: [], entries: allowed.filter(entry => entry.area), utilities, shortcuts: [] };
  return {
    mode: "staff",
    areas: AREAS.map(area => ({ ...area })),
    entries: allowed.filter(entry => entry.area),
    utilities,
    shortcuts: canSome(subject, "billing.manage") ? allowed.filter(entry => entry.id === "facturacion") : [],
  };
}

export function navigationEntries(model: NavigationModel): NavigationEntry[] {
  return [...model.entries, ...model.utilities];
}

function cleanPath(path: string) { return path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/"; }
export function activeNavigationEntry(model: NavigationModel, pathname: string): NavigationEntry | undefined {
  const path = cleanPath(pathname);
  return navigationEntries(model).filter(entry => path === entry.href || path.startsWith(`${entry.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
export function activeNavigationArea(model: NavigationModel, pathname: string): NavigationArea | undefined {
  const entry = activeNavigationEntry(model, pathname);
  return model.areas.find(area => area.id === entry?.area);
}
export function secondaryNavigation(model: NavigationModel, pathname: string): NavigationEntry[] {
  const area = activeNavigationArea(model, pathname);
  const path = cleanPath(pathname);
  const hasCaseSectionTabs = ["/causas", "/causas/monitoreo", "/causas/mis-causas"].includes(path);
  return area ? model.entries.filter(entry => entry.area === area.id && !(hasCaseSectionTabs && ["monitoreo", "mis-causas"].includes(entry.id))) : [];
}

export type NavigationCrumb = { href: string; labelKey: string };
const DETAIL_KEYS: Record<string, string> = {
  editar: "nav.details.edit", nueva: "nav.details.new", nuevo: "nav.details.new", escritos: "nav.details.writings", mesa: "nav.details.workbench",
  audiencias: "nav.hearings", archivos: "nav.details.files", personas: "nav.team", horas: "nav.details.hours", gastos: "nav.details.expenses",
  tarifas: "nav.details.rates", uf: "nav.details.uf", facturas: "nav.details.invoices", "cuenta-corriente": "nav.details.ledger",
  isheets: "nav.details.tables", wiki: "nav.details.wiki", blog: "nav.details.blog", qa: "nav.details.questions", fuentes: "nav.details.sources",
};
const ENTITY_KEYS: Record<string, string> = { causas: "nav.details.case", audiencias: "nav.details.hearing", clientes: "nav.details.client", sites: "nav.details.space", biblioteca: "nav.details.book", fuentes: "nav.details.source", facturas: "nav.details.invoice", minutas: "nav.details.minute", isheets: "nav.details.table", archivos: "nav.details.file", documentos: "nav.details.document" };

export function navigationBreadcrumbs(model: NavigationModel, pathname: string): NavigationCrumb[] {
  const parts = cleanPath(pathname).split("/").filter(Boolean);
  if (!parts.length) return [];
  const entries = navigationEntries(model);
  const home = model.mode === "portal" ? "/portal" : "/inicio";
  const crumbs: NavigationCrumb[] = [{ href: home, labelKey: model.mode === "portal" ? "nav.portal" : "nav.home" }];
  for (let index = 0; index < parts.length; index++) {
    const href = "/" + parts.slice(0, index + 1).join("/");
    if (href === home) continue;
    const entry = entries.find(item => item.href === href);
    // Document/source identifiers have no own page at these intermediate paths.
    if ((parts[0] === "documentos" && parts[2] === "fuentes" && (index === 1 || index === 2)) || (parts[0] === "jurisprudencia" && parts[1] === "fuentes" && index === 1)) continue;
    const labelKey = entry?.labelKey || DETAIL_KEYS[parts[index]] || ENTITY_KEYS[parts[index - 1]] || "nav.details.detail";
    crumbs.push({ href, labelKey });
  }
  return crumbs;
}
