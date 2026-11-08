export const HOST_NAVIGATION_SECTIONS = ["causas", "agenda", "biblioteca", "academico", "clientes", "estudio"] as const;

export type HostNavigationSection = (typeof HOST_NAVIGATION_SECTIONS)[number];

/** A missing preference retains the default catalog. An empty selection hides every optional area. */
export function resolveHostNavigationSections(value: unknown): HostNavigationSection[] {
  return Array.isArray(value)
    ? HOST_NAVIGATION_SECTIONS.filter(section => value.includes(section))
    : [...HOST_NAVIGATION_SECTIONS];
}
