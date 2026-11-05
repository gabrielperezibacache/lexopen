"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../welcome.css";
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
    <main className="lexopen-welcome login-page">
      <div className="login-spread">
        <aside className="login-story">
          <Link href="/" className="login-engraving-link" aria-label="LexOpen">
            <Image
              src="/icons/icon-512.png"
              width={512}
              height={512}
              sizes="(max-width: 767px) 1px, 320px"
              alt=""
              className="edition-engraving login-engraving"
            />
          </Link>
          <div className="login-story-copy">
            <p className="display login-story-heading">{t("login.storyTitle")}</p>
            <p>{t("login.storyBody")}</p>
            <ul className="login-story-tools">
              <li>{t("nav.cases")}</li>
              <li>{t("login.library")}</li>
              <li>{t("nav.documents")}</li>
            </ul>
          </div>
        </aside>
        <div className="login-access">
          <div className="login-toolbar">
            <Link href="/" className="edition-wordmark login-brand-mobile">
              <Image src="/icons/lexopen-reader-192.png" width={40} height={40} alt="" />
              <span className="display">LexOpen</span>
            </Link>
            <LanguageSwitcher variant="compact" />
          </div>

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
              <p className="login-error" role="alert">
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
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="lexopen-welcome login-page">
          <div className="panel login-loading" aria-hidden="true" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
