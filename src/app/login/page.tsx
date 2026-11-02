"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import "./login.css";
import { safeAppPath } from "@/lib/auth/safe-next";
import { resolvePostLoginPath } from "@/lib/auth/home-path";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Demo shortcuts are build-time stripped from production client bundles. */
const SHOW_DEMO_LOGIN = process.env.NODE_ENV !== "production";
const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

function LoginForm() {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/inicio";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(SHOW_DEMO_LOGIN ? "socio@estudio.cl" : "");
  const [needsTotp, setNeedsTotp] = useState(false);
  const { t } = useI18n();

  function goHome(role?: string | null) {
    router.push(safeAppPath(resolvePostLoginPath(role, next)));
    router.refresh();
  }

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
      if (needsTotp) {
        const res = await fetch("/api/auth/totp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "verify-login",
            code: fd.get("totp"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || t("login.error"));
          return;
        }
        goHome(data.user?.role);
        return;
      }
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
      if (data.needsTotp) {
        setNeedsTotp(true);
        return;
      }
      goHome(data.user?.role);
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-spread">
      <aside className="login-story">
        <Link href="/" className="login-wordmark"><FolioSymbol className="h-10 w-10" /><span className="display text-3xl">LexOpen</span></Link>
        <div className="login-emblem"><FolioSymbol className="h-full w-full" /></div>
        <div>
          <h2 className="display">{t("login.storyTitle")}</h2>
          <p>{t("login.storyBody")}</p>
          <div className="login-story-tools"><span>{t("nav.cases")}</span><span>{t("login.library")}</span><span>{t("nav.documents")}</span></div>
        </div>
      </aside>
      <div className="login-access">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher variant="compact" />
        </div>
        <Link href="/" className="login-brand-mobile mb-8 flex items-center gap-3">
          <span className="folio-brand grid h-11 w-11 place-items-center rounded-xl">
            <FolioSymbol className="h-8 w-8" />
          </span>
          <div>
            <div className="display text-2xl">LexOpen</div>
            <div className="text-sm text-[var(--muted)]">
              {t("login.access")}
            </div>
          </div>
        </Link>

        <form method="post" onSubmit={onSubmit} aria-busy={!hydrated || busy} className="space-y-5">
          <div>
            <h1 className="display text-3xl">{t("login.title")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {SHOW_DEMO_LOGIN ? t("login.subtitle") : t("login.subtitleProd")}
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">{t("login.email")}</span>
            <input
              className="input"
              name="email"
              type="email"
              required={!needsTotp}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={!hydrated || needsTotp}
            />
          </label>
          {!needsTotp ? (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">{t("login.password")}</span>
              <input
                className="input"
                name="password"
                type="password"
                required
                defaultValue={SHOW_DEMO_LOGIN ? "lexopen" : ""}
                autoComplete="current-password"
                disabled={!hydrated}
              />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">
                Código 2FA o respaldo
              </span>
              <input
                className="input"
                name="totp"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                disabled={!hydrated}
              />
            </label>
          )}
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={!hydrated || busy} type="submit">
            {!hydrated ? t("login.preparing") : busy
              ? t("login.submitting")
              : needsTotp
                ? "Verificar 2FA"
                : t("login.submit")}
          </button>
          {needsTotp && (
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => {
                setNeedsTotp(false);
                setError("");
              }}
            >
              Volver
            </button>
          )}
        </form>

        {SHOW_DEMO_LOGIN && (
          <div className="login-demo">
            <p className="text-sm text-[var(--muted)]">
              {t("login.demoUsers")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoUsers.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  disabled={!hydrated}
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
