const portfolioPaths = ["/mis-causas", "/causas", "/pjud"];
const identifier = (value: unknown) => typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : undefined;

export function portfolioReturn(value: unknown, causaId: string) {
  if (typeof value !== "string" || value.length > 2500 || !/^\/(?:mis-causas|causas|pjud)(?:[?#]|$)/.test(value)) return undefined;
  const url = new URL(value, "http://lexopen.local");
  if (!portfolioPaths.includes(url.pathname)) return undefined;
  const filters = new URLSearchParams();
  for (const name of ["q", "materia", "estado", "origen", "monitoreo", "page"]) {
    const filter = url.searchParams.get(name);
    if (filter) filters.set(name, filter);
  }
  return url.pathname + (filters.size ? `?${filters}` : "") + `#causa-${encodeURIComponent(causaId)}`;
}

export type CaseViewContext = { volver?: unknown; mesa?: unknown; escrito?: unknown; draft?: unknown };

export function caseViewParams(causaId: string, input: CaseViewContext) {
  const params = new URLSearchParams();
  const draft = identifier(input.escrito) ?? identifier(input.draft);
  const desk = identifier(input.mesa);
  const back = portfolioReturn(input.volver, causaId);
  if (draft) params.set("escrito", draft);
  if (desk) params.set("mesa", desk);
  if (back) params.set("volver", back);
  return params;
}

export function caseViewHref(path: string, params: URLSearchParams, hash = "") {
  return path + (params.size ? `?${params}` : "") + hash;
}
