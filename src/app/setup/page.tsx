"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";

function SetupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

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
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: form.get("name"),
          email: form.get("email"),
          password,
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
        <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
          Cree el primer administrador del estudio. Este paso solo funciona
          durante la primera ejecución del Host.
        </p>
      </div>
      {!token && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Abra esta pantalla desde el asistente del PC principal.
        </p>
      )}
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
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={!token || busy} type="submit">
        {busy ? "Configurando…" : "Crear administrador"}
      </button>
      <p className="text-xs text-[var(--ink-soft)]/60">
        No comparta el enlace de configuración ni use esta pantalla para una
        instalación ya configurada.
      </p>
    </form>
  );
}

export default function SetupPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(196,122,58,0.22),transparent_70%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] text-white">
            <Scale size={20} />
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
