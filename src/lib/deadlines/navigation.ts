import { caseViewParams } from "@/lib/causas/portfolio-navigation";
import { isValidYmd } from "@/lib/chile-time";

export function deadlineHref(id: string, returnTo?: string) {
  const path = `/plazos/${encodeURIComponent(id)}`;
  return returnTo ? `${path}?${new URLSearchParams({ volver: returnTo })}` : path;
}

/** Rebuild the return URL from supported views. A copied link never grants access to its origin. */
export function deadlineOrigin(raw: unknown, deadlineId: string, causaId: string | null) {
  if (typeof raw !== "string" || raw.length > 1600 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw)) return null;
  const url = new URL(raw, "https://lexopen.local");
  const query = new URLSearchParams();
  function keep(name: string, pattern: RegExp) {
    const values = url.searchParams.getAll(name);
    if (values.length === 1 && pattern.test(values[0])) query.set(name, values[0]);
  }
  let anchor = "";
  if (url.pathname === "/calendario") {
    keep("vista", /^(mes|semana|agenda)$/);
    keep("ym", /^\d{4}-(0[1-9]|1[0-2])$/);
    const week = url.searchParams.get("semana");
    if (week && url.searchParams.getAll("semana").length === 1 && isValidYmd(week)) query.set("semana", week);
    keep("tipo", /^(todos|plazo|tarea|audiencia|evento)$/);
    for (const region of ["movil", "agenda", "tablero", "proximos"]) {
      if (url.hash === `#${region}-plazo-${deadlineId}`) anchor = url.hash;
    }
  } else if (url.pathname === "/plazos") {
    keep("mes", /^\d{4}-(0[1-9]|1[0-2])$/);
    keep("vista", /^(mis-vencidos|proximos)$/);
    keep("after", /^[a-zA-Z0-9_-]{1,512}$/);
    if (causaId && url.searchParams.get("causaId") === causaId) query.set("causaId", causaId);
    if (url.hash === `#plazo-${deadlineId}`) anchor = url.hash;
  } else if (causaId && [`/causas/${encodeURIComponent(causaId)}`, `/pjud/${encodeURIComponent(causaId)}`].includes(url.pathname)) {
    const context = caseViewParams(causaId, Object.fromEntries(url.searchParams));
    for (const [key, value] of context) query.set(key, value);
    if (["#plazos", "#actividad", `#plazo-${deadlineId}`].includes(url.hash)) anchor = url.hash;
  } else {
    return null;
  }
  return url.pathname + (query.size ? `?${query}` : "") + anchor;
}
