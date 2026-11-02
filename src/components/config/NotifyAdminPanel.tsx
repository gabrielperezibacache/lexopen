"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { tipoDef } from "@/lib/notify/catalog";

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

type UncertainDelivery = { id: string; canal: string; plantilla: string; createdAt: string; envioIniciadoAt: string | null; proveedor: string | null };

export function NotifyAdminPanel() {
  const [uncertain, setUncertain] = useState<UncertainDelivery[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingUncertain, setLoadingUncertain] = useState(false);
  const [reconciliation, setReconciliation] = useState<{ row: UncertainDelivery; action: "confirmar_entrega" | "reenviar" } | null>(null);
  const [reason, setReason] = useState("");
  const [acceptDuplicateRisk, setAcceptDuplicateRisk] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState("");
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

  const loadUncertain = useCallback(async (after?: string) => {
    setLoadingUncertain(true);
    setReconcileError("");
    try {
      const res = await fetch(`/api/notify/outbox/reconcile${after ? `?after=${encodeURIComponent(after)}` : ""}`);
      if (!res.ok) throw new Error("No se pudieron cargar los envíos por revisar. Intente actualizar.");
      const data = await res.json() as { items: UncertainDelivery[]; nextCursor: string | null };
      setUncertain(previous => after ? [...previous, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (error) {
      setReconcileError(error instanceof Error ? error.message : "No se pudo actualizar la lista de envíos.");
    } finally { setLoadingUncertain(false); }
  }, []);

  function beginReconciliation(row: UncertainDelivery, action: "confirmar_entrega" | "reenviar") {
    setReconciliation({ row, action }); setReason(""); setAcceptDuplicateRisk(false); setReconcileError("");
  }
  async function confirmReconciliation(event: FormEvent) {
    event.preventDefault();
    if (!reconciliation || reason.trim().length < 8) return;
    setReconciling(true); setReconcileError("");
    try {
      const result = await apiMutation("/api/notify/outbox/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reconciliation.row.id, action: reconciliation.action, reason: reason.trim(), acceptDuplicateRisk }),
      });
      if (!result.ok) { setReconcileError(result.error); return; }
      setMessage(reconciliation.action === "reenviar" ? "Reenvío autorizado y puesto en cola." : "Entrega confirmada y registrada.");
      setReconciliation(null);
      await loadUncertain();
    } finally { setReconciling(false); }
  }

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load();
      void loadUncertain();
    });
    return () => {
      cancelled = true;
    };
  }, [load, loadUncertain]);

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
            {String(outbox.fallido)} · muerto: {String(outbox.muerto)} · por revisar: {String(outbox.incierto || 0)}
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
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
          <span>Host</span>
          <input
            className="input"
            placeholder="Host"
            value={smtp.host}
            onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
          />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
          <span>Remitente (From)</span>
          <input
            className="input"
            placeholder="From"
            value={smtp.from}
            onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
          />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
          <span>Usuario</span>
          <input
            className="input"
            placeholder="Usuario"
            value={smtp.user}
            onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
          />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
          <span>Contraseña</span>
          <input
            className="input"
            placeholder={
              snapshot?.smtp.hasPass ? "Contraseña (sin cambio)" : "Contraseña"
            }
            type="password"
            autoComplete="new-password"
            value={smtp.pass}
            onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
          />
          </label>
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
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
        <span>Usuario del bot (sin @)</span>
        <input
          className="input"
          placeholder="Bot username (sin @)"
          value={telegram.botUsername}
          onChange={(e) =>
            setTelegram({ ...telegram, botUsername: e.target.value })
          }
        />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
        <span>Token del bot</span>
        <input
          className="input"
          placeholder={
            snapshot?.telegram.hasToken
              ? "Bot token (sin cambio)"
              : "Bot token"
          }
          type="password"
          autoComplete="new-password"
          value={telegram.botToken}
          onChange={(e) =>
            setTelegram({ ...telegram, botToken: e.target.value })
          }
        />
        </label>
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
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]">
        <span>Contacto del servicio (mailto: o https:)</span>
        <input
          className="input"
          placeholder="mailto: o https: subject"
          value={webpush.subject}
          onChange={(e) => setWebpush({ ...webpush, subject: e.target.value })}
        />
        </label>
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

      <section className="panel space-y-4 rounded-3xl p-5" aria-labelledby="uncertain-deliveries-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="uncertain-deliveries-title" className="font-medium">Envíos por revisar</h3>
          <Button type="button" variant="secondary" loading={loadingUncertain} onClick={() => void loadUncertain()}>Actualizar lista</Button>
        </div>
        <p className="max-w-prose text-sm text-[var(--ink-soft)]">
          La conexión se interrumpió después de iniciar estos envíos. Revise si llegaron antes de confirmar la entrega o autorizar un reenvío.
        </p>
        {!uncertain.length && !loadingUncertain && <p className="text-sm">No hay envíos pendientes de revisión a los que tenga acceso.</p>}
        <ul className="divide-y divide-[var(--line)]">
          {uncertain.map(row => <li key={row.id} data-testid={`delivery-${row.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-medium break-words">{row.plantilla === "digest" ? "Resumen agrupado" : tipoDef(row.plantilla).label}</p>
              <p className="text-sm text-[var(--ink-soft)]">
                {{ email: "Correo", telegram: "Telegram", push: "Notificación push" }[row.canal] || "Notificación"} · {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(row.envioIniciadoAt || row.createdAt))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => beginReconciliation(row, "confirmar_entrega")}>Llegó al destinatario</Button>
              <Button type="button" variant="ghost" onClick={() => beginReconciliation(row, "reenviar")}>Autorizar reenvío</Button>
            </div>
          </li>)}
        </ul>
        {nextCursor && <Button type="button" variant="secondary" loading={loadingUncertain} onClick={() => void loadUncertain(nextCursor)}>Ver más envíos</Button>}
        {reconcileError && !reconciliation && <p role="alert" className="text-sm text-[var(--danger)]">{reconcileError}</p>}
      </section>
      <Dialog open={Boolean(reconciliation)} onClose={() => { if (!reconciling) setReconciliation(null); }}
        title={reconciliation?.action === "reenviar" ? "Autorizar reenvío" : "Confirmar entrega"}>
        <form onSubmit={confirmReconciliation} className="space-y-4">
          <p className="text-sm">{reconciliation?.action === "reenviar" ? "El aviso volverá a la cola. Si el envío anterior llegó, el destinatario podría recibirlo dos veces." : "El aviso se marcará como entregado y no se enviará otra vez."}</p>
          <label className="block text-sm" htmlFor="delivery-review-reason">Motivo de la decisión</label>
          <textarea id="delivery-review-reason" className="textarea w-full text-base" required minLength={8} maxLength={500}
            value={reason} onChange={event => setReason(event.target.value)} disabled={reconciling} rows={3}
            placeholder="Indique cómo comprobó la entrega o por qué requiere reenviar." />
          {reconciliation?.action === "reenviar" && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={acceptDuplicateRisk} disabled={reconciling} onChange={event => setAcceptDuplicateRisk(event.target.checked)} />
            Revisé la entrega y autorizo reenviar aunque pueda llegar una segunda copia.
          </label>}
          {reconcileError && <p role="alert" className="text-sm text-[var(--danger)]">{reconcileError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={reconciling} onClick={() => setReconciliation(null)}>Cancelar</Button>
            <Button type="submit" loading={reconciling} disabled={reason.trim().length < 8 || (reconciliation?.action === "reenviar" && !acceptDuplicateRisk)}>
              {reconciliation?.action === "reenviar" ? "Confirmar y reenviar" : "Registrar entrega"}
            </Button>
          </div>
        </form>
      </Dialog>

      <section className="panel space-y-2 rounded-3xl p-5 opacity-80">
        <h3 className="font-medium">WhatsApp (1.2)</h3>
        <p className="text-sm text-[var(--ink-soft)]/70">
          {snapshot?.whatsapp.note ||
            "Interfaz ChannelProvider lista; envío en la siguiente fase."}
        </p>
      </section>

      {message && <p role="status" className="text-sm text-[var(--ink-soft)]">{message}</p>}
    </div>
  );
}
