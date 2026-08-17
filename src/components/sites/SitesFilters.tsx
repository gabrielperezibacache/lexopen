"use client";

import { FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";

const SITE_TYPES = [
  "matter",
  "vdr",
  "client_portal",
  "project",
  "knowledge",
] as const;

function FiltersInner({ defaultStatus }: { defaultStatus: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { t, dict } = useI18n();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "tipo", "estado", "portal"]) {
      const v = String(fd.get(key) || "").trim();
      if (v) params.set(key, v);
    }
    router.push(`/sites?${params.toString()}`);
  }

  const estadoValue = sp.get("estado") || defaultStatus || "active";

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <input
        className="input lg:col-span-2"
        name="q"
        placeholder={t("sites.filters.search")}
        defaultValue={sp.get("q") || ""}
      />
      <select className="select" name="tipo" defaultValue={sp.get("tipo") || ""}>
        <option value="">{t("sites.filters.allTypes")}</option>
        {SITE_TYPES.map((tipo) => (
          <option key={tipo} value={tipo}>
            {dict.siteTabs.types[tipo]}
          </option>
        ))}
      </select>
      <select className="select" name="estado" defaultValue={estadoValue}>
        <option value="all">{t("sites.filters.allStatuses")}</option>
        <option value="active">{t("sites.filters.active")}</option>
        <option value="archived">{t("sites.filters.archived")}</option>
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 text-sm text-[var(--ink-soft)]/80">
          <input
            type="checkbox"
            name="portal"
            value="1"
            defaultChecked={sp.get("portal") === "1"}
            className="rounded border-[var(--line)]"
          />
          {t("sites.filters.portalOnly")}
        </label>
        <button className="btn btn-secondary shrink-0" type="submit">
          {t("sites.filters.filter")}
        </button>
      </div>
    </form>
  );
}

export function SitesFilters({ defaultStatus = "active" }: { defaultStatus?: string }) {
  return (
    <Suspense fallback={<div className="panel h-16 rounded-3xl" />}>
      <FiltersInner defaultStatus={defaultStatus} />
    </Suspense>
  );
}
