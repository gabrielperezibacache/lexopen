export type ResearchWorkspaceView = "query" | "sources" | "history";
export function researchWorkspaceView(value: unknown): ResearchWorkspaceView {
  return value === "sources" || value === "history" ? value : "query";
}

/** Keep saved-query and catalogue filters when navigating to a workspace section. */
export function researchWorkspaceHref(target: "unified" | "sources" | "history", context: { q?: string; materia?: string; investigacion?: string } = {}) {
  const query = new URLSearchParams();
  for (const key of ["q", "materia", "investigacion"] as const) {
    const value = context[key];
    if (value) query.set(key, value);
  }
  query.set("vista", target === "history" ? "history" : "sources");
  const anchor = target === "unified" ? "unificado" : target === "sources" ? "fuentes-estudio" : "investigaciones";
  return `/jurisprudencia?${query}#${anchor}`;
}
