"use client";

import { useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Canal = { id: string; canal: string; estado: string };

export function TelegramLinkPanel() {
  const [canales, setCanales] = useState<Canal[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/notify/preferences");
    if (!res.ok) return;
    const data = await res.json();
    setCanales(
      (data.canales || []).filter((c: Canal) => c.canal === "telegram")
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  const activo = canales.find((c) => c.estado === "activo");

  async function connect() {
    setBusy(true);
    setMessage("");
    const result = await apiMutation("/api/notify/telegram/link", {
      method: "POST",
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "No se pudo generar el código");
      return;
    }
    const data = result.data as {
      code?: string;
      deepLink?: string | null;
      expiresAt?: string;
      instruction?: string;
    };
    setCode(data.code || null);
    setDeepLink(data.deepLink || null);
    setExpiresAt(data.expiresAt || null);
    setMessage(data.instruction || "Código generado (15 min)");
    await refresh();
  }

  async function disconnect() {
    setBusy(true);
    const result = await apiMutation("/api/notify/telegram/link", {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "No se pudo desvincular");
      return;
    }
    setCode(null);
    setDeepLink(null);
    setMessage("Telegram desvinculado");
    await refresh();
  }

  return (
    <section className="panel space-y-3 rounded-3xl p-5">
      <h2 className="font-semibold">Telegram</h2>
      <p className="text-sm text-[var(--ink-soft)]/70">
        Long-poll desde el Host (sin endpoint público). Nivel de detalle
        mínimo por defecto.
      </p>
      {activo ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--sea)]">Vinculado</span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={disconnect}
          >
            Desvincular
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={connect}
        >
          {busy ? "Generando…" : "Conectar Telegram"}
        </button>
      )}
      {code && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-3 text-sm dark:bg-black/20">
          <p>
            Código: <code className="font-mono">{code}</code>
          </p>
          {deepLink ? (
            <p className="mt-2">
              <a className="text-[var(--sea)] underline" href={deepLink}>
                Abrir bot de Telegram
              </a>
            </p>
          ) : (
            <p className="mt-2">Envía al bot: /start {code}</p>
          )}
          {expiresAt && (
            <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
              Expira: {new Date(expiresAt).toLocaleString("es-CL")}
            </p>
          )}
        </div>
      )}
      {message && <p className="text-sm text-[var(--ink-soft)]">{message}</p>}
    </section>
  );
}
