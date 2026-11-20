"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { searchCommands } from "@/lib/navigation/command-search";
import { type configCategoriesForMode, configSectionFromHash } from "./config-sections";
import styles from "./WorkspaceArea.module.css";

const keywords: Record<string, string> = {
  "google-settings": "Drive carpetas Organización Gmail Calendar calendario",
  "pjud-settings": "OJV ClaveÚnica tribunales courts",
  "llm-settings": "modelo model inteligencia intelligence API",
  "work-country": "país country Chile",
  usuarios: "permisos roles usuarios permissions users",
};

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

export function ConfigSectionNav({ categories, sections, initialSection }: {
  initialSection: string;
  categories: ReturnType<typeof configCategoriesForMode>;
  sections: Record<string, ReactNode>;
}) {
  const english = useI18n().locale === "en";
  const [query, setQuery] = useState("");
  const select = useRef<HTMLSelectElement>(null);
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const active = configSectionFromHash(hash || initialSection, categories)?.id ?? categories[0].sections[0].id;
  // Open a form on first visit. Keep it mounted afterwards to retain drafts and feedback.
  const [visited, setVisited] = useState(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));
  const entries = categories.flatMap(category => category.sections.map(section => ({
    id: section.id,
    label: english ? section.labelEn : section.label,
    group: english ? category.labelEn : category.label,
    keywords: keywords[section.id] ?? section.id,
  })));
  const results = query.trim() ? searchCommands(entries, query) : [];
  return <>
    <nav className={styles.sectionNav} aria-label={english ? "Settings sections" : "Secciones de configuración"}>
      <div className={styles.indexControls}>
        <div>
          <label htmlFor="settings-section">{english ? "Selected setting" : "Ajuste seleccionado"}</label>
          <select id="settings-section" ref={select} className="select" value={active} onChange={event => {
            setQuery("");
            window.location.hash = event.target.value;
          }}>
            {categories.map(category => <optgroup key={category.id} label={english ? category.labelEn : category.label}>
              {category.sections.map(section => <option key={section.id} value={section.id}>{english ? section.labelEn : section.label}</option>)}
            </optgroup>)}
          </select>
        </div>
        <div>
          <label htmlFor="settings-query">{english ? "Find a setting" : "Buscar un ajuste"}</label>
          <input id="settings-query" className="input" type="search" value={query} maxLength={100}
            placeholder={english ? "Google, permissions, court mail…" : "Google, permisos, correo judicial…"}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} />
        </div>
      </div>
      {query.trim() && <div className={styles.settingsResults}>
        <p role="status">{results.length === 0
          ? (english ? "No settings match your search." : "Ningún ajuste coincide con la búsqueda.")
          : (english ? `Matching settings: ${results.length}` : `Ajustes encontrados: ${results.length}`)}</p>
        {results.map(section => <a key={section.id} href={`#${section.id}`} aria-current={section.id === active ? "location" : undefined}
          onClick={event => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            setQuery("");
            select.current?.focus({ preventScroll: true });
          }}><strong>{section.label}</strong><small>{section.group}</small></a>)}
      </div>}
    </nav>
    {entries.map(({ id }) => {
      const scope = ["idioma", "apariencia"].includes(id) ? (english ? "This browser" : "Este navegador")
        : ["cuenta-personal", "preferencias-altazor", "autorizaciones-escritorio", "comunicaciones"].includes(id) ? (english ? "Your account" : "Tu usuario")
        : id === "cuentas-conectadas" ? (english ? "Scope shown on each account" : "Ámbito indicado en cada cuenta")
        : (english ? "Whole firm" : "Todo el estudio");
      if (!visited.has(id)) return <div key={id} id={id} hidden />;
      return <div key={id} data-config-section={id} hidden={active !== id}>
        <p className={styles.scopeLabel}>{scope}</p>
        {sections[id]}
      </div>;
    })}
  </>;
}
