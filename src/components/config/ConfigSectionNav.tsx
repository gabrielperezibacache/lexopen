"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "idioma", label: "Idioma" },
  { id: "estudio", label: "Estudio" },
  { id: "usuarios", label: "Usuarios" },
  { id: "transcription-settings", label: "Audios" },
  { id: "llm-settings", label: "IA" },
  { id: "obsidian-settings", label: "Obsidian" },
  { id: "google-settings", label: "Google" },
  { id: "notify-settings", label: "Notificaciones" },
  { id: "pjud-settings", label: "PJUD" },
  { id: "pjud-log", label: "Log PJUD" },
  { id: "runtime-settings", label: "Entorno" },
  { id: "integraciones-overview", label: "APIs" },
  { id: "host-status", label: "Host" },
  { id: "purge-demo", label: "Demo" },
] as const;

export function ConfigSectionNav() {
  const [active, setActive] = useState<string>("idioma");

  useEffect(() => {
    const sections = SECTIONS.flatMap(({ id }) => {
      const element = document.getElementById(id);
      return element ? [element] : [];
    });
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-5% 0px -70% 0px" });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      className="panel z-10 min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl p-2 [scrollbar-width:thin] md:sticky md:top-24"
      aria-label="Secciones de configuración"
    >
      <div className="flex min-w-max flex-nowrap gap-1">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? "location" : undefined}
            onClick={() => setActive(s.id)}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-medium transition-colors ${active === s.id ? "bg-[var(--sea-soft)] text-[var(--sea)]" : "text-[var(--ink-soft)] hover:bg-[var(--mist)] hover:text-[var(--ink)]"}`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
