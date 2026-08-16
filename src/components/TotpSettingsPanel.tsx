"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

export function TotpSettingsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/totp")
      .then((r) => r.json())
      .then((d) => setEnabled(Boolean(d.totpEnabled)))
      .catch(() => {});
  }, []);

  async function setup() {
    setBusy(true);
    setError("");
    setMsg("");
    setBackupCodes(null);
    const result = await apiMutation("/api/auth/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo iniciar 2FA");
      return;
    }
    const data = result.data as { secret?: string; otpauthUrl?: string };
    setSecret(data.secret || "");
    setOtpauthUrl(data.otpauthUrl || "");
    setMsg("Escanee el código o pegue el secreto en su app autenticadora.");
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation("/api/auth/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        code: String(fd.get("code") || ""),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Código inválido");
      return;
    }
    const data = result.data as { backupCodes?: string[] };
    setEnabled(true);
    setSecret("");
    setOtpauthUrl("");
    setBackupCodes(data.backupCodes || []);
    setMsg("2FA activado. Guarde los códigos de respaldo.");
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation("/api/auth/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "disable",
        code: String(fd.get("code") || ""),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo desactivar");
      return;
    }
    setEnabled(false);
    setBackupCodes(null);
    setMsg("2FA desactivado.");
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <div>
        <h2 className="text-lg font-semibold">Autenticación en dos pasos (2FA)</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          TOTP compatible con Google Authenticator / Authy. Estado:{" "}
          <strong>{enabled ? "activado" : "desactivado"}</strong>
        </p>
      </div>
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {msg && <p className="text-sm text-[var(--ink-soft)]/80">{msg}</p>}
      {backupCodes && (
        <div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm">
          <p className="font-medium">Códigos de respaldo (un uso):</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {!enabled && !secret && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={setup}
        >
          Configurar 2FA
        </button>
      )}
      {secret && (
        <form onSubmit={confirm} className="space-y-3">
          <p className="break-all text-xs text-[var(--ink-soft)]/70">
            Secreto: <code>{secret}</code>
          </p>
          {otpauthUrl && (
            <p className="break-all text-xs text-[var(--ink-soft)]/60">
              {otpauthUrl}
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block">Código de 6 dígitos</span>
            <input className="input" name="code" required inputMode="numeric" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Confirmar y activar
          </button>
        </form>
      )}
      {enabled && (
        <form onSubmit={disable} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">Código o respaldo para desactivar</span>
            <input className="input" name="code" required />
          </label>
          <button className="btn btn-ghost" disabled={busy} type="submit">
            Desactivar 2FA
          </button>
        </form>
      )}
    </section>
  );
}
