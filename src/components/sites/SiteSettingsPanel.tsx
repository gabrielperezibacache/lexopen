"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";

type ClienteOption = { id: string; razonSocial: string };
type CausaOption = {
  id: string;
  titulo: string;
  rit: string | null;
  clienteId: string | null;
  hasSite?: boolean;
};

type SiteData = {
  id: string;
  name: string;
  description: string | null;
  tipo: string;
  status: string;
  color: string;
  isClientVisible: boolean;
  clienteId: string | null;
  causaId: string | null;
};

const SITE_TYPES = [
  "matter",
  "vdr",
  "client_portal",
  "project",
  "knowledge",
] as const;

export function SiteSettingsPanel({
  site,
  clientes,
  causas,
  isAdmin,
  defaultOpen = false,
}: {
  site: SiteData;
  clientes: ClienteOption[];
  causas: CausaOption[];
  isAdmin: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const { t, dict } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const filteredCausas = useMemo(
    () =>
      causas.filter(
        (c) => !c.hasSite || c.id === site.causaId
      ),
    [causas, site.causaId]
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation(`/api/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        description: fd.get("description") || null,
        tipo: fd.get("tipo"),
        status: fd.get("status"),
        color: fd.get("color"),
        clienteId: String(fd.get("clienteId") || "") || null,
        causaId: String(fd.get("causaId") || "") || null,
        isClientVisible: fd.get("isClientVisible") === "on",
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || t("sites.settings.error"));
      return;
    }
    setOk(t("sites.settings.saved"));
    router.refresh();
  }

  return (
    <section className="panel mb-6 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("sites.settings.title")}</h2>
        <div className="flex gap-2">
          <Link href="/portal" className="btn btn-ghost text-sm">
            {t("sites.settings.portalPreview")}
          </Link>
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen(!open)}>
            {open ? t("sites.guide.collapse") : t("sites.guide.expand")}
          </button>
        </div>
      </div>
      {open && (
        <form onSubmit={onSubmit} className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.name")}</span>
            <input className="input w-full" name="name" required defaultValue={site.name} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.color")}</span>
            <input className="input w-full" name="color" type="color" defaultValue={site.color} />
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block font-medium">{t("sites.settings.description")}</span>
            <textarea
              className="textarea w-full"
              name="description"
              rows={2}
              defaultValue={site.description || ""}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.type")}</span>
            <select className="select w-full" name="tipo" defaultValue={site.tipo}>
              {SITE_TYPES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {dict.siteTabs.types[tipo]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.status")}</span>
            <select className="select w-full" name="status" defaultValue={site.status}>
              <option value="active">{t("sites.settings.statusActive")}</option>
              <option value="archived">{t("sites.settings.statusArchived")}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.client")}</span>
            <select className="select w-full" name="clienteId" defaultValue={site.clienteId || ""}>
              <option value="">{t("sites.settings.noClient")}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sites.settings.case")}</span>
            <select className="select w-full" name="causaId" defaultValue={site.causaId || ""}>
              <option value="">{t("sites.settings.noCase")}</option>
              {filteredCausas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rit || c.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm lg:col-span-2">
            <input
              type="checkbox"
              name="isClientVisible"
              defaultChecked={site.isClientVisible}
              disabled={!isAdmin}
              className="rounded border-[var(--line)]"
            />
            <span>
              {t("sites.settings.portalVisible")}
              {!isAdmin && (
                <span className="ml-2 text-[var(--ink-soft)]/65">({t("sites.settings.portalHint")})</span>
              )}
            </span>
          </label>
          {error && <p className="text-sm text-[var(--danger)] lg:col-span-2">{error}</p>}
          {ok && <p className="text-sm text-[var(--sea)] lg:col-span-2">{ok}</p>}
          <div className="lg:col-span-2">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? t("sites.settings.saving") : t("sites.settings.save")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
