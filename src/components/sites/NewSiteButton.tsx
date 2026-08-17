"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";

type ClienteOption = { id: string; razonSocial: string };
type CausaOption = {
  id: string;
  titulo: string;
  rit: string | null;
  clienteId: string | null;
  site?: { id: string } | null;
};

const SITE_TYPES = [
  "matter",
  "vdr",
  "client_portal",
  "project",
  "knowledge",
] as const;

export function NewSiteButton({
  defaultClienteId,
  defaultCausaId,
  defaultName,
  defaultTipo = "matter",
  label,
  isAdmin = false,
  clientes: clientesProp,
  causas: causasProp,
}: {
  defaultClienteId?: string;
  defaultCausaId?: string;
  defaultName?: string;
  defaultTipo?: string;
  label?: string;
  isAdmin?: boolean;
  clientes?: ClienteOption[];
  causas?: CausaOption[];
}) {
  const router = useRouter();
  const { t, dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState(defaultTipo);
  const [clienteId, setClienteId] = useState(defaultClienteId || "");
  const [clientes, setClientes] = useState<ClienteOption[]>(clientesProp || []);
  const [causas, setCausas] = useState<CausaOption[]>(causasProp || []);

  useEffect(() => {
    if (!open || (clientesProp && causasProp)) return;
    void (async () => {
      const [cRes, caRes] = await Promise.all([
        clientesProp ? null : fetch("/api/clientes"),
        causasProp ? null : fetch("/api/causas"),
      ]);
      if (cRes?.ok) {
        const data = (await cRes.json()) as ClienteOption[];
        setClientes(data.map((c) => ({ id: c.id, razonSocial: c.razonSocial })));
      }
      if (caRes?.ok) {
        const data = (await caRes.json()) as CausaOption[];
        setCausas(data);
      }
    })();
  }, [open, clientesProp, causasProp]);

  const filteredCausas = useMemo(() => {
    const list = causas.filter((c) => !c.site);
    if (!clienteId) return list;
    return list.filter((c) => c.clienteId === clienteId);
  }, [causas, clienteId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation<{ id: string }>("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        description: fd.get("description"),
        tipo: fd.get("tipo"),
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
    router.push(`/sites/${result.data.id}?welcome=1`);
    router.refresh();
  }

  const tipoHint = dict.sites.create.tipoHint[tipo as keyof typeof dict.sites.create.tipoHint];

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        {label || t("sites.newSite")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl p-6">
            <h2 className="text-xl font-semibold">{t("sites.createTitle")}</h2>
            <input
              className="input"
              name="name"
              required
              placeholder={t("sites.settings.name")}
              defaultValue={defaultName}
            />
            <textarea className="textarea" name="description" placeholder={t("sites.settings.description")} />
            <div>
              <select
                className="select w-full"
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                {SITE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {dict.siteTabs.types[value]}
                  </option>
                ))}
              </select>
              {tipoHint && <p className="mt-1 text-xs text-[var(--ink-soft)]/70">{tipoHint}</p>}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block">{t("sites.create.client")}</span>
              <select
                className="select w-full"
                name="clienteId"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">{t("sites.create.noClient")}</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">{t("sites.create.case")}</span>
              <select className="select w-full" name="causaId" defaultValue={defaultCausaId || ""}>
                <option value="">{t("sites.create.noCase")}</option>
                {filteredCausas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rit || c.titulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isClientVisible"
                disabled={!isAdmin}
                className="rounded border-[var(--line)]"
              />
              <span>
                {t("sites.create.portalVisible")}
                {!isAdmin && (
                  <span className="ml-1 text-[var(--ink-soft)]/65">
                    ({t("sites.create.portalAdminOnly")})
                  </span>
                )}
              </span>
            </label>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? t("sites.settings.saving") : t("sites.newSite")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function CreateSiteFromCausaButton({
  causaId,
  clienteId,
  suggestedName,
  isAdmin,
}: {
  causaId: string;
  clienteId?: string | null;
  suggestedName: string;
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  return (
    <NewSiteButton
      defaultCausaId={causaId}
      defaultClienteId={clienteId || undefined}
      defaultName={suggestedName}
      defaultTipo="matter"
      label={t("sites.causaPanel.createSite")}
      isAdmin={isAdmin}
    />
  );
}
