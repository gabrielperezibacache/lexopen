"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { CONFIG_CATEGORIES, CONFIG_SECTIONS, configCategoryForSection, configSectionFromHash } from "./config-sections";
import styles from "./WorkspaceArea.module.css";

export function ConfigSectionNav() {
  const { locale } = useI18n();
  const english = locale === "en";
  const [active, setActive] = useState("estudio");
  const navRef = useRef<HTMLElement>(null);
  const category = configCategoryForSection(active);

  useEffect(() => {
    const nav = navRef.current;
    const workspace = nav?.closest<HTMLElement>("[data-settings-workspace]");
    if (!nav || !workspace) return;
    let frame = 0;
    let pendingHash: string | undefined;

    const inspect = () => {
      frame = 0;
      if (pendingHash) {
        const target = document.getElementById(pendingHash);
        if (!target) return; // Google/Obsidian can mount after their initial fetch.
        const id = pendingHash;
        pendingHash = undefined;
        target.scrollIntoView({ block: "start", behavior: "instant" });
        setActive(id);
        return;
      }
      const edge = nav.getBoundingClientRect().bottom + 20;
      const targets = CONFIG_SECTIONS.flatMap(section => {
        const element = document.getElementById(section.id);
        return element ? [{ id: section.id, top: element.getBoundingClientRect().top }] : [];
      });
      const current = targets.findLast(target => target.top <= edge) || targets[0];
      if (current) setActive(current.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(inspect); };
    const syncHash = () => {
      const section = configSectionFromHash(window.location.hash);
      pendingHash = section?.id;
      if (section) setActive(section.id);
      schedule();
    };
    const measure = () => {
      workspace.style.setProperty("--settings-nav-height", `${Math.ceil(nav.getBoundingClientRect().height)}px`);
      schedule();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(nav);
    // Reconcile async panel roots without moving, hiding or remounting forms.
    const mutations = new MutationObserver(records => {
      if (records.some(record => !nav.contains(record.target))) schedule();
    });
    mutations.observe(workspace, { childList: true, subtree: true });
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    syncHash();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); mutations.disconnect();
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      workspace.style.removeProperty("--settings-nav-height");
    };
  }, []);

  return (
    <nav ref={navRef} className={styles.sectionNav} aria-label={english ? "Settings sections" : "Secciones de configuración"}>
      <label className={styles.mobileCategory} htmlFor="settings-category">
        <span>{english ? "Settings category" : "Categoría de configuración"}</span>
        <select id="settings-category" className="select" value={category.id} onChange={event => {
          const selected = CONFIG_CATEGORIES.find(item => item.id === event.target.value);
          if (selected) window.location.hash = selected.sections[0].id;
        }}>
          {CONFIG_CATEGORIES.map(item => <option key={item.id} value={item.id}>{english ? item.labelEn : item.label}</option>)}
        </select>
      </label>
      <div className={styles.categoryLinks} role="group" aria-label={english ? "Categories" : "Categorías"}>
        {CONFIG_CATEGORIES.map(item => (
          <a key={item.id} href={`#${item.sections[0].id}`} className={styles.categoryLink} data-active={item.id === category.id ? "true" : undefined}>
            {english ? item.labelEn : item.label}
          </a>
        ))}
      </div>
      <div className={styles.sectionLinks} role="group" aria-label={english ? category.labelEn : category.label}>
        {category.sections.map(section => (
          <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} className={styles.sectionLink}>
            {english ? section.labelEn : section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
