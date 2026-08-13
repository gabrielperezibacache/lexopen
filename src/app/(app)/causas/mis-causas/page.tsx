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
  sidecarReachable?: boolean;
  publicScrape?: boolean;
  captchaConfigured?: boolean;
  readyToSync?: boolean;
  blockers?: string[];
};

type SyncResult = {
  listed: number;
  created: number;
  linked: number;
  enqueued?: number;
  syncOk?: number;
  syncFailed?: number;
  inserted?: number;
  items: Array<{ rit: string; tribunal: string; caratula?: string | null }>;
};

export default function MisCausasPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "warn" | "err">("ok");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [adminOnly, setAdminOnly] = useState(false);

  async function load() {
    const res = await fetch("/api/pjud/mis-causas");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsgTone("err");
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
      setMsgTone("err");
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
      setMsgTone("err");
      if (res.status === 403) {
        setAdminOnly(true);
        setMsg(
          "Solo un administrador puede guardar o borrar credenciales ClaveÚnica. Puede sincronizar si ya están configuradas."
        );
      } else {
        setMsg(data.error || "No se pudieron guardar las credenciales");
      }
      return;
    }
    setAdminOnly(false);
    setStatus(data);
    setMsgTone("ok");
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
      setMsgTone("err");
      if (res.status === 403) {
        setAdminOnly(true);
        setMsg("Solo un administrador puede eliminar las credenciales.");
      } else {
        setMsg(data.error || "Error al borrar");
      }
      return;
    }
    setStatus(data);
    setMsgTone("ok");
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
      setMsgTone("err");
      setMsg(data.error || "Error al sincronizar Mis Causas");
      await load();
      return;
    }
    setResult(data);
    setStatus(data.status || null);
    const failed = Number(data.syncFailed || 0);
    const parts = [
      `Mis Causas: ${data.listed} listadas`,
      `${data.created} nuevas`,
      `${data.linked} vinculadas`,
    ];
    if (data.enqueued != null) parts.push(`${data.enqueued} encoladas`);
    if (data.syncOk != null || failed) {
      parts.push(
        `movimientos ${data.syncOk || 0} ok / ${failed} fallidas (+${data.inserted || 0})`
      );
    }
    setMsgTone(failed > 0 ? "warn" : "ok");
    setMsg(`${parts.join(" · ")}.`);
  }

  const syncDisabled =
    busy || !status?.hasPassword || status?.readyToSync === false;
  const lastStatus = status?.lastSyncStatus;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ClaveÚnica · OJV"
        title="Mis Causas"
        subtitle="LexOpen corre en su host: la ClaveÚnica se cifra aquí (AES-GCM / Postgres) y no la custodia CausaMonitor ni otro SaaS. El login OJV y CAPTCHA sí usan APIs externas. Con las credenciales se lista Mis Causas y se enciende monitoreo + sync (scrape o sidecar)."
      />

      <div className="rounded-3xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        Riesgo ToS / seguridad: guardar RUT y contraseña habilita el login
        automatizado a OJV desde este Host.{" "}
        <code className="mx-1">PJUD_CLAVEUNICA_SCRAPE=0</code>
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
            Sidecar:{" "}
            {!status?.sidecar
              ? "OFF"
              : status.sidecarReachable
                ? "ready"
                : "DOWN"}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            Scrape local: {status?.publicScrape ? "ON" : "OFF"}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            CAPTCHA: {status?.captchaConfigured ? "ON" : "OFF"}
          </span>
          {lastStatus && (
            <span
              className={`rounded-full border px-2 py-1 ${
                lastStatus === "ok"
                  ? "border-emerald-300/70 text-emerald-800"
                  : lastStatus === "partial"
                    ? "border-amber-300/70 text-amber-900"
                    : lastStatus === "failed"
                      ? "border-rose-300/70 text-rose-800"
                      : "border-[var(--line)]"
              }`}
            >
              Último sync: {lastStatus}
            </span>
          )}
        </div>
        {status?.lastSyncNote && (
          <p className="text-xs text-[var(--copper)]">{status.lastSyncNote}</p>
        )}

        {status?.blockers && status.blockers.length > 0 && (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-950"
            role="status"
          >
            <strong className="mr-1">No listo para sincronizar:</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {status.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {adminOnly && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            La gestión de credenciales requiere rol <strong>admin</strong>. Un
            abogado puede sincronizar Mis Causas si el admin ya guardó RUT y
            contraseña.
          </p>
        )}

        <form
          onSubmit={saveCredentials}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
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
            disabled={syncDisabled}
            title={
              status?.blockers?.length
                ? status.blockers.join(" ")
                : "Listar Mis Causas y encolar sync de movimientos"
            }
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
                  setMsgTone("err");
                  if (res.status === 403) {
                    setAdminOnly(true);
                    setMsg("Solo un administrador puede habilitar/deshabilitar.");
                  } else {
                    setMsg(data.error || "No se pudo cambiar el estado");
                  }
                  return;
                }
                setStatus(data);
                setMsgTone("ok");
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
            className={`text-sm ${
              msgTone === "err"
                ? "text-rose-800"
                : msgTone === "warn"
                  ? "text-amber-900"
                  : "text-[var(--copper)]"
            }`}
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
            {result.syncFailed ? (
              <span className="ml-2 text-sm font-normal text-amber-800">
                · {result.syncFailed} sync de movimientos fallidas
              </span>
            ) : null}
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
