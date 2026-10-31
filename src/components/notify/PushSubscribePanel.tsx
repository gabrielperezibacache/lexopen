"use client";

import { useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export function PushSubscribePanel() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSupported(
        typeof window !== "undefined" &&
          "serviceWorker" in navigator &&
          "PushManager" in window
      );
      void (async () => {
        const res = await fetch("/api/notify/vapid-public");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setEnabled(Boolean(data.enabled && data.publicKey));
        if (data.enabled && "serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (!cancelled) setSubscribed(Boolean(sub));
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    setBusy(true);
    setMessage("");
    try {
      const vapid = await fetch("/api/notify/vapid-public").then((r) => r.json());
      if (!vapid.publicKey) {
        setMessage("Web Push no está habilitado en el Host");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      const result = await apiMutation("/api/notify/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!result.ok) {
        setMessage(result.error || "No se pudo registrar push");
        return;
      }
      setSubscribed(true);
      setMessage("Push activado en este dispositivo");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al suscribir");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await apiMutation("/api/notify/push/subscribe", { method: "DELETE" });
      setSubscribed(false);
      setMessage("Push desactivado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 rounded-3xl p-5">
      <h2 className="font-semibold">Web Push (PWA)</h2>
      <p className="text-sm text-[var(--ink-soft)]/70">
        Notificaciones del navegador / app instalada. Requiere VAPID en
        Configuración.
      </p>
      {!supported && (
        <p className="text-sm text-[var(--copper)]">
          Este navegador no soporta Push.
        </p>
      )}
      {supported && !enabled && (
        <p className="text-sm text-[var(--ink-soft)]">
          El administrador debe habilitar Web Push en el Host.
        </p>
      )}
      {supported && enabled && (
        <div className="flex flex-wrap gap-2">
          {!subscribed ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={subscribe}
            >
              Activar push
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={unsubscribe}
            >
              Desactivar push
            </button>
          )}
        </div>
      )}
      {message && <p className="text-sm text-[var(--ink-soft)]">{message}</p>}
    </section>
  );
}
