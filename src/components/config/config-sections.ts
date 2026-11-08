export type ConfigSection = { id: string; label: string; labelEn: string };
export type SettingsVisibility = { canManage: boolean; canSetCountry: boolean; assistant: boolean; communications: boolean };

/** These fragment identifiers are public links; grouping never renames them. */
export const CONFIG_CATEGORIES = [
  {
    id: "preferencias-personales", label: "Preferencias personales", labelEn: "Personal preferences",
    description: "Cuenta, seguridad personal y preferencias de Altazor.",
    descriptionEn: "Account, personal security and Altazor preferences.",
    sections: [
      { id: "cuenta-personal", label: "Cuenta", labelEn: "Account" },
      { id: "preferencias-altazor", label: "Altazor", labelEn: "Altazor" },
      { id: "autorizaciones-escritorio", label: "Escritorio de Altazor", labelEn: "Altazor desktop" },
    ],
  },
  {
    id: "estudio-equipo", label: "Estudio y equipo", labelEn: "Firm and team",
    description: "Configuración compartida de todo el estudio, administrada por quienes tienen permiso de administrar el Host.",
    descriptionEn: "Settings shared by the whole firm, managed by people with Host administration permission.",
    sections: [
      { id: "estudio", label: "Estudio", labelEn: "Firm" },
      { id: "work-country", label: "País de trabajo", labelEn: "Work country" },
      { id: "case-management-settings", label: "Gestión de causas", labelEn: "Case management" },
      { id: "usuarios", label: "Usuarios", labelEn: "Users" },
    ],
  },
  {
    id: "comunicaciones", label: "Comunicaciones", labelEn: "Communications",
    description: "Correo judicial y mensajes del estudio.",
    descriptionEn: "Court mail and firm messages.",
    sections: [{ id: "comunicaciones", label: "Correo y mensajes", labelEn: "Mail and messages" }],
  },
  {
    id: "conexiones-ia", label: "Conexiones e IA", labelEn: "Connections and AI",
    description: "Cuentas conectadas y servicios compartidos del estudio. Tu cuenta personal de Codex se gestiona en Mi cuenta.",
    descriptionEn: "Connected accounts and shared firm services. Manage your personal Codex account under My account.",
    sections: [
      { id: "cuentas-conectadas", label: "Cuentas conectadas", labelEn: "Connected accounts" },
      { id: "llm-settings", label: "IA", labelEn: "AI" },
      { id: "google-settings", label: "Google del estudio", labelEn: "Firm Google" },
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
      { id: "apariencia", label: "Apariencia", labelEn: "Appearance" },
      { id: "apartados-visibles", label: "Apartados visibles", labelEn: "Visible sections" },
      { id: "runtime-settings", label: "Entorno", labelEn: "Environment" },
      { id: "host-status", label: "Host", labelEn: "Host" },
      { id: "purge-demo", label: "Demo", labelEn: "Demo" },
    ],
  },
] as const;

export const CONFIG_SECTIONS: readonly ConfigSection[] = CONFIG_CATEGORIES.flatMap<ConfigSection>(category => [...category.sections]);
export function configCategoriesForMode(mode: "manual" | "pjud_cl", visibility: SettingsVisibility) {
  return CONFIG_CATEGORIES.map(category => ({ ...category, sections: category.sections.filter(section => {
    if (section.id === "preferencias-altazor" || section.id === "autorizaciones-escritorio" || section.id === "cuentas-conectadas") return visibility.assistant;
    if (section.id === "comunicaciones") return visibility.communications;
    if (section.id === "work-country") return visibility.canSetCountry;
    if (section.id === "apartados-visibles") return visibility.canSetCountry;
    if (["cuenta-personal", "idioma", "apariencia"].includes(section.id)) return true;
    if (!visibility.canManage) return false;
    return mode === "pjud_cl" || !["pjud-settings", "pjud-log"].includes(section.id);
  }) })).filter(category => category.sections.length > 0);
}

export function configSectionFromHash(hash: string, categories: ReturnType<typeof configCategoriesForMode>) {
  let id;
  try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return undefined; }
  return categories.flatMap(category => category.sections).find(section => section.id === id);
}
