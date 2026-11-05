"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import "../welcome.css";

function RecoveryContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();

  if (searchParams.get("ayuda") !== "1") return <RecoveryForm />;

  return (
    <section className="panel space-y-5 rounded-3xl p-6" aria-labelledby="recovery-title">
      <h1 id="recovery-title" className="display text-3xl">
        {t("recovery.helpTitle")}
      </h1>
      <div>
        <h2 className="font-medium">{t("recovery.teamTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {t("recovery.teamBody")}
        </p>
      </div>
      <div>
        <h2 className="font-medium">{t("recovery.administratorTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {t("recovery.administratorBody")}
        </p>
        <Link href="/recovery" className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] underline underline-offset-4">
          {t("recovery.manualTokenLink")}
        </Link>
      </div>
      <Link href="/login" className="btn btn-primary w-full">
        {t("recovery.backToLogin")}
      </Link>
    </section>
  );
}

function RecoveryForm() {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (newPassword !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres.");
      return;
    }

    setBusy(true);
    try {
      const manualToken = String(form.get("token") || "").trim();
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(manualToken ? { token: manualToken } : {}),
          email: form.get("email"),
          newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "No se pudo restablecer la contraseña.");
        return;
      }
      setComplete(true);
    } catch {
      setError("No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="panel rounded-3xl p-6">
        <h1 className="display text-3xl">Contraseña restablecida</h1>
        <p className="mt-3 text-sm text-[var(--ink-soft)]/80">
          Las sesiones anteriores fueron invalidadas. Inicie sesión con la nueva
          contraseña.
        </p>
        <Link href="/login" className="btn btn-primary mt-6 w-full">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 rounded-3xl p-6">
      <div>
        <h1 className="display text-3xl">Recuperar administrador</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
          Use esta pantalla únicamente desde el menú del Host local. El token se
          entrega en cookie httpOnly y no debe compartirse ni enviarse por
          correo.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Email del administrador</span>
        <input className="input" name="email" type="email" required maxLength={320} />
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
      <details className="text-sm text-[var(--ink-soft)]/75">
        <summary className="cursor-pointer">Token manual (servidor sin Desktop)</summary>
        <label className="mt-2 block">
          <span className="mb-1 block text-[var(--ink-soft)]/70">
            LEXOPEN_RECOVERY_TOKEN
          </span>
          <input
            className="input"
            name="token"
            type="password"
            maxLength={256}
            autoComplete="off"
          />
        </label>
      </details>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Restableciendo…" : "Restablecer contraseña"}
      </button>
    </form>
  );
}

export default function RecoveryPage() {
  return (
    <main className="lexopen-welcome">
      <div className="mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-4 py-10">
        <Link href="/" className="edition-wordmark mb-6 w-fit">
          <FolioSymbol className="h-10 w-10" />
          <span className="display">LexOpen</span>
        </Link>
        <Suspense fallback={<div className="panel h-[420px] rounded-3xl" aria-hidden="true" />}>
          <RecoveryContent />
        </Suspense>
      </div>
    </main>
  );
}
