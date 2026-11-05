"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useId, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { MATERIAS, ESTADOS_CAUSA } from "@/lib/chile";
import type { CaseManagementMode } from "@/lib/causas/management-mode";
import { useI18n } from "@/components/i18n/I18nProvider";

function FiltersInner({ defaultEstado, mode }: { defaultEstado: string; mode: CaseManagementMode }) {
  const router = useRouter(), sp = useSearchParams(), id = useId();
  const { t, locale } = useI18n(), tr = (es: string, en: string) => locale === "en" ? en : es;
  const [expanded, setExpanded] = useState(false);
  const connected = mode === "pjud_cl", base = connected ? "/pjud" : "/causas";
  const estadoValue = sp.get("estado") || defaultEstado || "activa";
  const activeFilters = Number(Boolean(sp.get("materia"))) + Number(estadoValue !== "activa") + (connected ? Number(Boolean(sp.get("origen"))) + Number(Boolean(sp.get("monitoreo"))) : 0);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget), params = new URLSearchParams();
    for (const key of ["q", "materia", "estado", ...(connected ? ["origen", "monitoreo"] : [])]) {
      const value = String(data.get(key) || "").trim();
      if (value) params.set(key, value);
    }
    router.push(params.size ? `${base}?${params}` : base);
  }
  const searchLabel = tr("Buscar causas", "Search matters");
  return <form method="get" action={base} onSubmit={onSubmit} className="space-y-3" aria-label={tr("Búsqueda de causas", "Matter search")}>
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-q`} className="sr-only">{searchLabel}</label>
      <input id={`${id}-q`} type="search" className="input min-w-0 flex-1 basis-64" name="q" defaultValue={sp.get("q") || ""} placeholder={connected ? tr("Buscar título, RIT/ROL o tribunal…", "Search title, RIT/ROL or court…") : tr("Buscar título, referencia u órgano…", "Search title, reference or organization…")} />
      <button className="btn btn-secondary" type="submit"><Search size={17} aria-hidden="true" />{tr("Buscar", "Search")}</button>
      <button className="btn btn-ghost" type="button" aria-expanded={expanded} aria-controls={`${id}-filters`} onClick={() => setExpanded(value => !value)}><SlidersHorizontal size={17} aria-hidden="true" />{tr("Filtrar", "Filter")}{activeFilters > 0 && <span className="text-xs">({activeFilters})</span>}</button>
    </div>
    <div id={`${id}-filters`} hidden={!expanded}>
      <fieldset className="grid gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-2 xl:grid-cols-4"><legend className="sr-only">{tr("Filtros de causas", "Matter filters")}</legend>
        <label className="grid gap-2 text-sm font-medium"><span>{t("causas.colMatter")}</span><select className="select" name="materia" defaultValue={sp.get("materia") || ""}><option value="">{t("causas.filterAllMatters")}</option>{MATERIAS.map(materia => <option key={materia.value} value={materia.value}>{materia.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium"><span>{t("causas.colProcedural")}</span><select className="select" name="estado" defaultValue={estadoValue}><option value="all">{t("causas.filterAllProcedural")}</option>{ESTADOS_CAUSA.map(estado => <option key={estado.value} value={estado.value}>{estado.label}</option>)}</select></label>
        {connected && <><label className="grid gap-2 text-sm font-medium"><span>{t("causas.colOrigin")}</span><select className="select" name="origen" defaultValue={sp.get("origen") || ""}><option value="">{t("causas.filterOrigin")}</option><option value="manual">{t("causas.filterOriginManual")}</option><option value="claveunica">{t("causas.filterOriginClaveunica")}</option><option value="rol">{t("causas.filterOriginRol")}</option><option value="csv">{t("causas.filterOriginCsv")}</option><option value="webhook">{tr("Integración automática", "Automatic integration")}</option></select></label>
        <label className="grid gap-2 text-sm font-medium"><span>{tr("Seguimiento", "Tracking")}</span><select className="select" name="monitoreo" defaultValue={sp.get("monitoreo") || ""}><option value="">{tr("Todas las causas", "All matters")}</option><option value="on">{tr("Con seguimiento", "Tracked")}</option><option value="off">{tr("Sin seguimiento", "Not tracked")}</option></select></label></>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4"><button className="btn btn-secondary" type="submit">{tr("Aplicar filtros", "Apply filters")}</button><Link className="inline-flex min-h-11 items-center text-sm text-[var(--sea)]" href={base}>{tr("Restablecer", "Reset")}</Link></div>
      </fieldset>
    </div>
  </form>;
}

export function CausasFilters({ defaultEstado = "activa", mode = "manual" }: { defaultEstado?: string; mode?: CaseManagementMode }) {
  return <Suspense fallback={<div className="h-12" />}><FiltersInner defaultEstado={defaultEstado} mode={mode} /></Suspense>;
}
