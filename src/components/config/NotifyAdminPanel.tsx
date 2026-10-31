"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Snapshot = {
  smtp: {
    enabled: boolean;
    host: string | null;
    from: string | null;
    hasPass: boolean;
  };
  telegram: {
    enabled: boolean;
    botUsername: string | null;
    hasToken: boolean;
  };
  webpush: {
    enabled: boolean;
    publicKey: string | null;
    subject: string | null;
    hasPrivateKey: boolean;
  };
  whatsapp: { enabled: boolean; note: string };
};

export function NotifyAdminPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [outbox, setOutbox] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [smtp, setSmtp] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
    enabled: false,
  });
  const [telegram, setTelegram] = useState({
    botToken: "",
    botUsername: "",
    enabled: false,
  });
  const [webpush, setWebpush] = useState({
    subject: "mailto:admin@localhost",
    enabled: false,
  });

  async function load() {
    const res = await fetch("/api/integrations/notify");
    if (!res.ok) return;
    const data = await res.json();
    setSnapshot(data.snapshot);
    setHealth(data.health);
    setOutbox(data.outbox);
    if (data.snapshot?.smtp) {
      setSmtp((s) => ({
        ...s,
        host: data.snapshot.smtp.host || "",
        from: data.snapshot.smtp.from || "",
        enabled: Boolean(data.snapshot.smtp.enabled),
      }));
    }
    if (data.snapshot?.telegram) {
      setTelegram((t) => ({
        ...t,
        botUsername: data.snapshot.telegram.botUsername || "",
        enabled: Boolean(data.snapshot.telegram.enabled),
      }));
    }
    if (data.snapshot?.webpush) {
      setWebpush((w) => ({
        ...w,
        subject: data.snapshot.webpush.subject || w.subject,
        enabled: Boolean(data.snapshot.webpush.enabled),
      }));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const result = await apiMutation("/api/integrations/notify", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "smtp",
        enabled: smtp.enabled,
        smtp: {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          user: smtp.user,
          pass: smtp.pass || undefined,
          from: smtp.from,
        },
      }),
    });
    setMessage(result.ok ? "SMTP guardado" : result.error || "Error");
    await load();
  }

  async function saveTelegram(e: FormEvent) {
    e.preventDefault();
    const result = await apiMutation("/api/integrations/notify", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "telegram",
        enabled: telegram.enabled,
        telegram: {
          botToken: telegram.botToken || undefined,
          botUsername: telegram.botUsername,
        },
      }),
    });
    setMessage(result.ok ? "Telegram guardado" : result.error || "Error");
    setTelegram((t) => ({ ...t, botToken: "" }));
    await load();
  }

  async function saveWebPush(generate: boolean) {
    const result = await apiMutation("/api/integrations/notify", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "webpush",
        enabled: webpush.enabled || generate,
        webpush: { subject: webpush.subject, generate },
      }),
    });
    setMessage(
      result.ok
        ? generate
          ? "Claves VAPID generadas"
          : "Web Push guardado"
        : result.error || "Error"
    );
    await load();
  }

  async function testCanal(canal: "email" | "telegram" | "push") {
    const result = await apiMutation("/api/integrations/notify/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canal }),
    });
    setMessage(
      result.ok
        ? `Prueba ${canal}: enviada`
        : result.error || `Prueba ${canal} falló`
    );
    await load();
  }

  return (
    <div id="notify-settings" className="space-y-6">
      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-semibold">Notificaciones · proveedores</h2>
        <p className="text-sm text-[var(--ink-soft)]/70">
          SMTP genérico, Gmail OAuth (existente), Telegram long-poll, Web Push.
          WhatsApp: interfaz en 1.1, envío en 1.2.
        </p>
        {outbox && (
          <p className="text-xs text-[var(--ink-soft)]/60">
            Outbox — encolado: {String(outbox.encolado)} · fallido:{" "}
            {String(outbox.fallido)} · muerto: {String(outbox.muerto)}
          </p>
        )}
        {health && (
          <pre className="overflow-x-auto rounded-2xl bg-black/5 p-3 text-xs dark:bg-white/5">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
      </section>

      <form className="panel space-y-3 rounded-3xl p-5" onSubmit={saveSmtp}>
        <h3 className="font-medium">SMTP</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smtp.enabled}
            onChange={(e) => setSmtp({ ...smtp, enabled: e.target.checked })}
          />
          Habilitado (preferido sobre Gmail)
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          <input
            className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            placeholder="Host"
            value={smtp.host}
            onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
          />
          <input
            className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            placeholder="From"
            value={smtp.from}
            onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
          />
          <input
            className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            placeholder="Usuario"
            value={smtp.user}
            onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
          />
          <input
            className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            placeholder={
              snapshot?.smtp.hasPass ? "Contraseña (sin cambio)" : "Contraseña"
            }
            type="password"
            value={smtp.pass}
            onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit">
            Guardar SMTP
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => testCanal("email")}
          >
            Probar email
          </button>
        </div>
      </form>

      <form className="panel space-y-3 rounded-3xl p-5" onSubmit={saveTelegram}>
        <h3 className="font-medium">Telegram bot</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={telegram.enabled}
            onChange={(e) =>
              setTelegram({ ...telegram, enabled: e.target.checked })
            }
          />
          Habilitado (long-poll; TELEGRAM_POLLING=1)
        </label>
        <input
          className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          placeholder="Bot username (sin @)"
          value={telegram.botUsername}
          onChange={(e) =>
            setTelegram({ ...telegram, botUsername: e.target.value })
          }
        />
        <input
          className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          placeholder={
            snapshot?.telegram.hasToken
              ? "Bot token (sin cambio)"
              : "Bot token"
          }
          type="password"
          value={telegram.botToken}
          onChange={(e) =>
            setTelegram({ ...telegram, botToken: e.target.value })
          }
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit">
            Guardar Telegram
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => testCanal("telegram")}
          >
            Probar Telegram
          </button>
        </div>
      </form>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h3 className="font-medium">Web Push (VAPID)</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={webpush.enabled}
            onChange={(e) =>
              setWebpush({ ...webpush, enabled: e.target.checked })
            }
          />
          Habilitado
        </label>
        <input
          className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          placeholder="mailto: o https: subject"
          value={webpush.subject}
          onChange={(e) => setWebpush({ ...webpush, subject: e.target.value })}
        />
        {snapshot?.webpush.publicKey && (
          <p className="break-all text-xs text-[var(--ink-soft)]/60">
            Public key: {snapshot.webpush.publicKey}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => saveWebPush(false)}
          >
            Guardar
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => saveWebPush(true)}
          >
            Generar claves VAPID
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => testCanal("push")}
          >
            Probar push
          </button>
        </div>
      </section>

      <section className="panel space-y-2 rounded-3xl p-5 opacity-80">
        <h3 className="font-medium">WhatsApp (1.2)</h3>
        <p className="text-sm text-[var(--ink-soft)]/70">
          {snapshot?.whatsapp.note ||
            "Interfaz ChannelProvider lista; envío en la siguiente fase."}
        </p>
      </section>

      {message && <p className="text-sm text-[var(--ink-soft)]">{message}</p>}
    </div>
  );
}
