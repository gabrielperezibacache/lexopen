"use client";

import { useEffect } from "react";

/** Registra el service worker de LexOpen (PWA + push). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_PWA_DEV !== "1") {
      return;
    }
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Host sin SW (p. ej. entorno restringido): silencioso.
    });
  }, []);
  return null;
}
