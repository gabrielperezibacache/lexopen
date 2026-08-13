"use client";

const SECTIONS = [
  { id: "estudio", label: "Estudio" },
  { id: "usuarios", label: "Usuarios" },
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
      className="panel z-10 -mx-1 overflow-x-auto overscroll-x-contain rounded-3xl p-3 [scrollbar-width:thin] md:sticky md:top-4 md:mx-0 md:overflow-visible"
      aria-label="Secciones de configuración"
    >
      <div className="flex min-w-max flex-nowrap gap-2 md:min-w-0 md:flex-wrap">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] transition hover:border-[var(--sea)]/40 hover:text-[var(--ink)]"
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
