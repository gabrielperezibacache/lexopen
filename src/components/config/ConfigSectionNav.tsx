"use client";

const SECTIONS = [
  { id: "estudio", label: "Estudio" },
  { id: "llm-settings", label: "IA" },
  { id: "obsidian-settings", label: "Obsidian" },
  { id: "google-settings", label: "Google" },
  { id: "pjud-settings", label: "PJUD" },
  { id: "runtime-settings", label: "Entorno" },
  { id: "integraciones-overview", label: "APIs" },
  { id: "host-status", label: "Host" },
  { id: "purge-demo", label: "Demo" },
] as const;

export function ConfigSectionNav() {
  return (
    <nav
      className="panel sticky top-4 z-10 flex flex-wrap gap-2 rounded-3xl p-3"
      aria-label="Secciones de configuración"
    >
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] transition hover:border-[var(--sea)]/40 hover:text-[var(--ink)]"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
