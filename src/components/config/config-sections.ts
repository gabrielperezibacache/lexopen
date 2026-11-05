export type ConfigSection = { id: string; label: string; labelEn: string };

/** These fragment identifiers are public links; grouping never renames them. */
export const CONFIG_CATEGORIES = [
  {
    id: "estudio-equipo", label: "Estudio y equipo", labelEn: "Firm and team",
    description: "Datos del estudio, políticas de IA y personas que trabajan en él.",
    descriptionEn: "Firm details, AI policies and the people who work here.",
    sections: [
      { id: "estudio", label: "Estudio", labelEn: "Firm" },
      { id: "case-management-settings", label: "Gestión de causas", labelEn: "Case management" },
      { id: "usuarios", label: "Usuarios", labelEn: "Users" },
    ],
  },
  {
    id: "conexiones-ia", label: "Conexiones e IA", labelEn: "Connections and AI",
    description: "Proveedor de IA, Google y seguimiento judicial.",
    descriptionEn: "AI provider, Google and court monitoring.",
    sections: [
      { id: "llm-settings", label: "IA", labelEn: "AI" },
      { id: "google-settings", label: "Google", labelEn: "Google" },
      { id: "pjud-settings", label: "PJUD", labelEn: "PJUD" },
      { id: "integraciones-overview", label: "APIs", labelEn: "APIs" },
    ],
  },
  {
    id: "audios-documentos", label: "Audios y documentos", labelEn: "Audio and documents",
    description: "Transcripción y exportación de notas y documentos.",
    descriptionEn: "Transcription and exporting notes and documents.",
    sections: [
      { id: "transcription-settings", label: "Audios", labelEn: "Audio" },
      { id: "obsidian-settings", label: "Obsidian", labelEn: "Obsidian" },
    ],
  },
  {
    id: "seguridad-avisos", label: "Seguridad y avisos", labelEn: "Security and notices",
    description: "Canales del estudio y avisos de seguimiento judicial.",
    descriptionEn: "Firm notification channels and court monitoring notices.",
    sections: [
      { id: "notify-settings", label: "Notificaciones", labelEn: "Notifications" },
      { id: "pjud-log", label: "Log PJUD", labelEn: "PJUD log" },
    ],
  },
  {
    id: "aplicacion-datos", label: "Aplicación y datos", labelEn: "Application and data",
    description: "Idioma, diagnóstico del Host y datos de demostración.",
    descriptionEn: "Language, Host diagnostics and demonstration data.",
    sections: [
      { id: "idioma", label: "Idioma", labelEn: "Language" },
      { id: "runtime-settings", label: "Entorno", labelEn: "Environment" },
      { id: "host-status", label: "Host", labelEn: "Host" },
      { id: "purge-demo", label: "Demo", labelEn: "Demo" },
    ],
  },
] as const;

export const CONFIG_SECTIONS: readonly ConfigSection[] = CONFIG_CATEGORIES.flatMap<ConfigSection>(category => [...category.sections]);
export function configCategoriesForMode(mode: "manual" | "pjud_cl") {
  return CONFIG_CATEGORIES.map(category => ({ ...category, sections: category.sections.filter(section => mode === "pjud_cl" || !["pjud-settings", "pjud-log"].includes(section.id)) }));
}

export function configSectionFromHash(hash: string, mode: "manual" | "pjud_cl" = "pjud_cl") {
  let id;
  try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return undefined; }
  return configCategoriesForMode(mode).flatMap(category => category.sections).find(section => section.id === id);
}

export function configCategoryForSection(id: string, mode: "manual" | "pjud_cl" = "pjud_cl") {
  const categories = configCategoriesForMode(mode);
  return categories.find(category => category.sections.some(section => section.id === id)) || categories[0];
}
