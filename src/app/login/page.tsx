"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";

const DEMO_USERS = [
  { email: "socio@estudio.cl", label: "Socia / admin" },
  { email: "abogado@estudio.cl", label: "Abogado" },
  { email: "asistente@estudio.cl", label: "Asistente" },
  { email: "cliente@andes.cl", label: "Cliente (portal)" },
];

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("socio@estudio.cl");

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
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(196,122,58,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-16 bottom-10 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(31,111,120,0.18),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
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
              Use un usuario demo o sus credenciales del estudio.
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">Email</span>
            <input
              className="input"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="panel mt-4 rounded-3xl p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]/55">
            Usuarios demo · contraseña lexopen
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                className="btn btn-ghost"
                onClick={() => setEmail(u.email)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
          <div className="panel h-48 w-full animate-pulse rounded-3xl" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
