"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale } from "@/lib/i18n/config";
import styles from "./global-error.module.css";

function browserLocale() {
  const cookie = document.cookie.split("; ").find(entry => entry.startsWith(LOCALE_COOKIE + "="))?.split("=")[1];
  return isLocale(cookie) ? cookie : negotiateLocale(navigator.language);
}
const subscribe = () => () => {};

export default function GlobalError({ error, retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale = useSyncExternalStore(subscribe, browserLocale, () => DEFAULT_LOCALE);
  const english = locale === "en";
  useEffect(() => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "global_error", err: error.message, digest: error.digest || null }));
  }, [error]);

  return <html lang={locale}>
    <body className={styles.body}>
      <main className={styles.main}>
        <h1>{english ? "This page could not be opened" : "No se pudo abrir esta página"}</h1>
        {error.digest && <p>{english ? "Support reference" : "Referencia para soporte"} <code>{error.digest}</code></p>}
        <div className={styles.actions}>
          <button type="button" onClick={retry}>{english ? "Try again" : "Reintentar"}</button>
          {/* Recovery must reload the document even if the app router failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">{english ? "Back to LexOpen" : "Volver a LexOpen"}</a>
        </div>
      </main>
    </body>
  </html>;
}
