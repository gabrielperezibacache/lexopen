"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MATERIAS, ESTADOS_CAUSA } from "@/lib/chile";
import { FormEvent, Suspense } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

function FiltersInner({ defaultEstado }: { defaultEstado: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { t } = useI18n();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "materia", "estado", "origen", "monitoreo"]) {
      const v = String(fd.get(key) || "").trim();
      if (v) params.set(key, v);
    }
    router.push(`/causas?${params.toString()}`);
  }

  const estadoValue = sp.get("estado") || defaultEstado || "activa";

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      <input
        className="input sm:col-span-2"
        name="q"
        placeholder={t("causas.filterSearch")}
        defaultValue={sp.get("q") || ""}
      />
      <select
        className="select"
        name="materia"
        defaultValue={sp.get("materia") || ""}
      >
        <option value="">{t("causas.filterAllMatters")}</option>
        {MATERIAS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select className="select" name="estado" defaultValue={estadoValue}>
        <option value="all">{t("causas.filterAllProcedural")}</option>
        {ESTADOS_CAUSA.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        name="origen"
        defaultValue={sp.get("origen") || ""}
        aria-label={t("causas.colOrigin")}
      >
        <option value="">{t("causas.filterOrigin")}</option>
        <option value="manual">{t("causas.filterOriginManual")}</option>
        <option value="claveunica">{t("causas.filterOriginClaveunica")}</option>
        <option value="rol">{t("causas.filterOriginRol")}</option>
        <option value="csv">{t("causas.filterOriginCsv")}</option>
        <option value="webhook">{t("causas.filterOriginWebhook")}</option>
      </select>
      <div className="flex gap-2">
        <select
          className="select"
          name="monitoreo"
          defaultValue={sp.get("monitoreo") || ""}
          aria-label={t("causas.filterMonitor")}
        >
          <option value="">{t("causas.filterMonitorAll")}</option>
          <option value="on">{t("causas.filterMonitorOn")}</option>
          <option value="off">{t("causas.filterMonitorOff")}</option>
        </select>
        <button className="btn btn-secondary shrink-0" type="submit">
          {t("causas.filterSubmit")}
        </button>
      </div>
    </form>
  );
}

export function CausasFilters({
  defaultEstado = "activa",
}: {
  defaultEstado?: string;
}) {
  return (
    <Suspense fallback={<div className="panel h-16 rounded-3xl" />}>
      <FiltersInner defaultEstado={defaultEstado} />
    </Suspense>
  );
}
