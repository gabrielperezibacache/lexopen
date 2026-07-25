"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "No se pudo iniciar sesión");
      return;
    }
    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] text-white">
          <Scale size={20} />
        </span>
        <div>
          <div className="display text-2xl">LexOpen</div>
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]/65">
            Acceso al estudio
          </div>
        </div>
      </Link>

      <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <div>
          <h1 className="display text-3xl">Iniciar sesión</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
            Demo: socio@estudio.cl / lexopen
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--ink-soft)]/70">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            defaultValue="socio@estudio.cl"
            autoComplete="username"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--ink-soft)]/70">Contraseña</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            defaultValue="lexopen"
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="panel m-8 h-40 rounded-3xl" />}>
      <LoginForm />
    </Suspense>
  );
}
