"use client";

import { FormEvent, useState } from "react";

export function PasswordChangeForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (newPassword !== confirmation) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (newPassword.length < 12) {
      setError("La nueva contraseña debe tener al menos 12 caracteres.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "No se pudo cambiar la contraseña.");
      return;
    }
    event.currentTarget.reset();
    setSuccess("Contraseña actualizada correctamente.");
  }

  return (
    <form onSubmit={submit} className="panel max-w-xl space-y-4 rounded-3xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
          Use una contraseña propia de al menos 12 caracteres. Las demás sesiones
          se invalidan; esta sesión se renueva automáticamente.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Contraseña actual</span>
        <input
          className="input"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Nueva contraseña</span>
        <input
          className="input"
          name="newPassword"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Repetir contraseña</span>
        <input
          className="input"
          name="confirmation"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {success}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
