"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";
import { safeAppPath } from "@/lib/auth/safe-next";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Demo shortcuts are build-time stripped from production client bundles. */
const SHOW_DEMO_LOGIN = process.env.NODE_ENV !== "production";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(SHOW_DEMO_LOGIN ? "socio@estudio.cl" : "");
  const { t } = useI18n();

  const demoUsers = useMemo(
    () => [
      { email: "socio@estudio.cl", label: t("login.roles.admin") },
      { email: "abogado@estudio.cl", label: t("login.roles.lawyer") },
      { email: "asistente@estudio.cl", label: t("login.roles.assistant") },
      { email: "cliente@andes.cl", label: t("login.roles.client") },
    ],
    [t]
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
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
      if (!res.ok) {
        setError(data.error || t("login.error"));
        return;
      }
      router.push(safeAppPath(next));
      router.refresh();
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(196,122,58,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-16 bottom-10 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(31,111,120,0.18),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher variant="compact" />
        </div>
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] text-white">
            <Scale size={20} />
          </span>
          <div>
            <div className="display text-2xl">LexOpen</div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]/65">
              {t("login.access")}
            </div>
          </div>
        </Link>

        <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
          <div>
            <h1 className="display text-3xl">{t("login.title")}</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
              {SHOW_DEMO_LOGIN ? t("login.subtitle") : t("login.subtitleProd")}
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">{t("login.email")}</span>
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
            <span className="mb-1 block text-[var(--ink-soft)]/70">{t("login.password")}</span>
            <input
              className="input"
              name="password"
              type="password"
              required
              defaultValue={SHOW_DEMO_LOGIN ? "lexopen" : ""}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        {SHOW_DEMO_LOGIN && (
          <div className="panel mt-4 rounded-3xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]/55">
              {t("login.demoUsers")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoUsers.map((u) => (
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
        )}
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
