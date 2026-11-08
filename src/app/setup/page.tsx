"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import { HostSectionChoices } from "@/components/config/HostSectionChoices";
import { HOST_NAVIGATION_SECTIONS, type HostNavigationSection } from "@/lib/navigation/host-sections";

function SetupForm() {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visibleSections, setVisibleSections] = useState<HostNavigationSection[]>([...HOST_NAVIGATION_SECTIONS]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres.");
      return;
    }

    setBusy(true);
    try {
      const manualToken = String(form.get("token") || "").trim();
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(manualToken ? { token: manualToken } : {}),
          name: form.get("name"),
          email: form.get("email"),
          password,
          visibleSections,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "No se pudo configurar la instalación.");
        return;
      }
      setComplete(true);
    } catch {
      setError("No se pudo configurar la instalación.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="panel rounded-3xl p-6">
        <h1 className="display text-3xl">Instalación configurada</h1>
        <p className="mt-3 text-sm text-[var(--ink-soft)]/80">
          El administrador fue creado. Inicie sesión para terminar de configurar
          el estudio y crear sus usuarios.
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
        <h1 className="display text-3xl">Configurar LexOpen</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Crea tu cuenta de administrador y elige los apartados que quieres ver en el menú.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Nombre completo</span>
        <input className="input" name="name" required minLength={2} maxLength={120} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Email</span>
        <input className="input" name="email" type="email" required maxLength={320} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--ink-soft)]/70">Contraseña</span>
        <input
          className="input"
          name="password"
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
      <section aria-labelledby="setup-sections-title" className="space-y-2 border-t border-[var(--line)] pt-4">
        <h2 id="setup-sections-title" className="text-lg font-semibold">Apartados visibles</h2>
        <p className="text-sm text-[var(--ink-soft)]">Puedes cambiarlos después en Configuración del Host.</p>
        <HostSectionChoices visible={visibleSections} onChange={setVisibleSections} disabled={busy} />
      </section>
      <details className="text-sm text-[var(--ink-soft)]">
        <summary className="cursor-pointer">Código de instalación manual</summary>
        <label className="mt-2 block">
          <span className="mb-1 block text-[var(--ink-soft)]/70">
            Código de instalación
          </span>
          <input
            className="input"
            name="token"
            type="password"
            maxLength={256}
            autoComplete="off"
          />
        </label>
        <p className="mt-2 text-xs">Si administras un servidor sin LexOpen Desktop, usa el código definido al preparar el Host.</p>
      </details>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Configurando…" : "Crear administrador"}
      </button>
    </form>
  );
}

export default function SetupPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center">
            <FolioSymbol className="h-8 w-8" />
          </span>
          <div>
            <div className="display text-2xl">LexOpen</div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]/65">
              Primera configuración
            </div>
          </div>
        </Link>
        <Suspense fallback={<div className="panel h-[520px] animate-pulse rounded-3xl" />}>
          <SetupForm />
        </Suspense>
      </div>
    </div>
  );
}
