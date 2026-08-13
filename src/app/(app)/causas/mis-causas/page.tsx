"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { validarRut } from "@/lib/chile";
import { PageHeader } from "@/components/sites/SiteNav";

type Status = {
  enabled: boolean;
  rutMasked: string | null;
  hasPassword: boolean;
  encryption?: string;
  secretsKey?: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncNote: string | null;
  scrapeFlag: boolean;
  sidecar: boolean;
};

type SyncResult = {
  listed: number;
  created: number;
  linked: number;
  items: Array<{ rit: string; tribunal: string; caratula?: string | null }>;
};

export default function MisCausasPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);

  async function load() {
    const res = await fetch("/api/pjud/mis-causas");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "No se pudo cargar el estado de ClaveÚnica");
      return;
    }
    setStatus(data.status || null);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCredentials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const rut = String(fd.get("rut") || "");
    const password = String(fd.get("password") || "");
    if (!validarRut(rut)) {
      setBusy(false);
      setMsg(
        "RUT ClaveÚnica inválido. Revise el dígito verificador (el ejemplo 12.345.678-9 no es un RUT válido)."
      );
      return;
    }
    const res = await fetch("/api/pjud/claveunica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        rut,
        password,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "No se pudieron guardar las credenciales");
      return;
    }
    setStatus(data);
    setMsg("Credenciales ClaveÚnica cifradas (AES-GCM) y guardadas.");
    e.currentTarget.reset();
  }

  async function clearCredentials() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/pjud/claveunica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Error al borrar");
      return;
    }
    setStatus(data);
    setMsg("Credenciales eliminadas.");
  }

  async function syncMisCausas() {
    setBusy(true);
    setMsg("");
    setResult(null);
    const res = await fetch("/api/pjud/mis-causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncMovimientos: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Error al sincronizar Mis Causas");
      await load();
      return;
    }
    setResult(data);
    setStatus(data.status || null);
    setMsg(
      `Mis Causas: ${data.listed} listadas · ${data.created} nuevas · ${data.linked} vinculadas.`
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ClaveÚnica · OJV"
        title="Mis Causas"
        subtitle="LexOpen corre en su host: la ClaveÚnica se cifra aquí (AES-GCM / Postgres) y no la custodia CausaMonitor ni otro SaaS. El login OJV y CAPTCHA sí usan APIs externas. Con las credenciales se lista Mis Causas y se enciende monitoreo + sync (scrape o sidecar)."
      />

      <div className="rounded-3xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        Riesgo ToS / seguridad: guardar RUT y contraseña habilita el login
        automatizado a OJV desde este Host. <code className="mx-1">PJUD_CLAVEUNICA_SCRAPE=0</code>
        lo bloquea. Si el sidecar (
        <code className="mx-1">PJUD_SCRAPER_URL</code>) no está corriendo, LexOpen
        usa scrape in-process (Playwright + CAPTCHA). La contraseña no sale en
        plaintext por API.
      </div>

      <section className="panel space-y-4 rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Credenciales ClaveÚnica</h2>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]/70">
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            {status?.enabled ? "Habilitada" : "Deshabilitada"}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            RUT: {status?.rutMasked || "—"}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            Password: {status?.hasPassword ? "guardada" : "ausente"}
          </span>
          {status?.hasPassword && (
            <span className="rounded-full border border-[var(--line)] px-2 py-1">
              Vault: {status.encryption || "aes-256-gcm"} · key{" "}
              {status.secretsKey || "—"}
            </span>
          )}
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            Flag scrape: {status?.scrapeFlag ? "ON" : "OFF"}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            Sidecar: {status?.sidecar ? "ON" : "OFF"}
          </span>
        </div>
        {status?.lastSyncNote && (
          <p className="text-xs text-[var(--copper)]">{status.lastSyncNote}</p>
        )}

        <form onSubmit={saveCredentials} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            className="input"
            name="rut"
            required
            placeholder="RUT ClaveÚnica (12.345.678-5)"
            autoComplete="username"
          />
          <input
            className="input"
            name="password"
            type="password"
            required
            placeholder="Contraseña ClaveÚnica"
            autoComplete="current-password"
          />
          <button className="btn btn-primary" disabled={busy} type="submit">
            Guardar cifrado
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !status?.hasPassword}
            onClick={syncMisCausas}
          >
            {busy ? "Sincronizando…" : "Sincronizar Mis Causas"}
          </button>
          {status?.hasPassword && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg("");
                const res = await fetch("/api/pjud/claveunica", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: status.enabled ? "disable" : "enable",
                  }),
                });
                const data = await res.json().catch(() => ({}));
                setBusy(false);
                if (!res.ok) {
                  setMsg(data.error || "No se pudo cambiar el estado");
                  return;
                }
                setStatus(data);
                setMsg(
                  status.enabled
                    ? "ClaveÚnica deshabilitada."
                    : "ClaveÚnica habilitada."
                );
              }}
            >
              {status.enabled ? "Deshabilitar" : "Habilitar"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !status?.hasPassword}
            onClick={clearCredentials}
          >
            Eliminar credenciales
          </button>
          <Link href="/causas/monitoreo" className="btn btn-ghost">
            Ir a monitoreo
          </Link>
        </div>
        {msg && (
          <p
            className="text-sm text-[var(--copper)]"
            role="status"
            data-testid="claveunica-msg"
          >
            {msg}
          </p>
        )}
      </section>

      {result && (
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">
            Resultado ({result.listed})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {result.items.map((item) => (
              <li
                key={`${item.rit}-${item.tribunal}`}
                className="border-b border-[var(--line)]/60 pb-2"
              >
                <div className="font-medium">{item.rit}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {item.tribunal}
                  {item.caratula ? ` · ${item.caratula}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
