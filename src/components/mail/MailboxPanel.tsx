"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { formatDate } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { mailKindLabel } from "@/lib/mail/labels";
import { IMAP_PRESETS, type PublicMailboxAccount } from "@/lib/mail/types";

type MailAttachment = {
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  documentoId: string | null;
};

type MailMessage = {
  id: string;
  subject: string;
  kind: string;
  status: string;
  rit?: string | null;
  fromAddress?: string | null;
  receivedAt: string;
  bodyText: string;
  causaId?: string | null;
  causa?: { id: string; titulo: string; rit: string | null } | null;
  attachments?: MailAttachment[];
};

type CausaOption = {
  id: string;
  titulo: string;
  rit: string | null;
  proximaTabla?: string | null;
};

const EMPTY_ACCOUNT: PublicMailboxAccount = {
  protocol: "imap",
  status: "disconnected",
  email: null,
  imapHost: null,
  imapPort: 993,
  imapTls: true,
  hasPassword: false,
  hasOauth: false,
  lastSyncAt: null,
  lastError: null,
  googleConfigured: false,
  microsoftConfigured: false,
  presets: IMAP_PRESETS,
};

export function MailboxPanel() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [account, setAccount] = useState<PublicMailboxAccount>(EMPTY_ACCOUNT);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("id")
  );
  const [causaPick, setCausaPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [imapPreset, setImapPreset] = useState("gmail");
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState("993");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError("");
    const res = await fetch("/api/mail");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || t("mailbox.loadError"));
      setLoading(false);
      return;
    }
    setMessages(data.messages || []);
    if (Array.isArray(data.causas)) setCausas(data.causas);
    if (data.account) {
      setAccount({ ...EMPTY_ACCOUNT, ...data.account });
      if (data.account.email) setImapEmail(data.account.email);
      if (data.account.imapHost) setImapHost(data.account.imapHost);
      if (data.account.imapPort) setImapPort(String(data.account.imapPort));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch hydrates inbox
    void load();
  }, [load]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    const microsoft = searchParams.get("microsoft");
    if (gmail === "connected" || microsoft === "connected") {
      setNotice(t("mailbox.oauthConnected"));
    } else if (gmail || microsoft) {
      setError(t("mailbox.oauthError"));
    }
  }, [searchParams, t]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  const connected = account.status === "connected";

  async function sync() {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/mail/sync", { method: "POST" });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load({ silent: true });
  }

  async function startOauth(provider: "google" | "microsoft") {
    setBusy(true);
    setError("");
    const result = await apiMutation<{ authUrl?: string }>(
      `/api/mail/${provider}/start`,
      { method: "POST" }
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.authUrl) {
      window.location.href = result.data.authUrl;
    }
  }

  async function saveImap() {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/mail/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-imap",
        email: imapEmail,
        password: imapPassword || undefined,
        imapHost,
        imapPort: Number(imapPort) || 993,
        imapTls: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImapPassword("");
    setNotice(t("mailbox.imapSaved"));
    await load({ silent: true });
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/mail/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load({ silent: true });
  }

  async function runAction(action: "apply" | "link" | "discard") {
    if (!selected) return;
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/mail/messages/${selected.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        causaId: causaPick || undefined,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load({ silent: true });
  }

  async function pasteMail() {
    if (!pasteBody.trim()) return;
    setBusy(true);
    const result = await apiMutation("/api/mail/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: pasteSubject,
        body: pasteBody,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPasteSubject("");
    setPasteBody("");
    await load({ silent: true });
  }

  function applyPreset(id: string) {
    setImapPreset(id);
    const preset = account.presets.find((p) => p.id === id);
    if (preset?.host) {
      setImapHost(preset.host);
      setImapPort(String(preset.port));
    }
  }

  return (
    <div className="space-y-6">
      <section
        className="panel space-y-4 rounded-3xl p-5"
        data-testid="mailbox-connect"
      >
        <div>
          <h2 className="text-lg font-semibold">{t("mailbox.connectTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            {t("mailbox.connectHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={busy}
            data-testid="mailbox-connect-gmail"
            onClick={() => void startOauth("google")}
          >
            {t("mailbox.connectGmail")}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={busy}
            data-testid="mailbox-connect-microsoft"
            onClick={() => void startOauth("microsoft")}
          >
            {t("mailbox.connectMicrosoft")}
          </button>
          {connected && (
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {t("mailbox.disconnect")}
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--ink-soft)]/75" data-testid="mailbox-status">
          {account.email || t("mailbox.notConnected")} ·{" "}
          {account.status === "connected"
            ? t("mailbox.statusConnected")
            : account.status === "error"
              ? t("mailbox.statusError")
              : t("mailbox.statusDisconnected")}
          {account.lastSyncAt
            ? ` · ${t("mailbox.lastSync")} ${formatDate(account.lastSyncAt)}`
            : ""}
        </p>
        {account.lastError && (
          <p className="text-sm text-[var(--danger)]">{account.lastError}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">{t("mailbox.imapPreset")}</span>
            <select
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2"
              value={imapPreset}
              onChange={(e) => applyPreset(e.target.value)}
              data-testid="mailbox-imap-preset"
            >
              {account.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("mailbox.imapEmail")}</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2"
              value={imapEmail}
              onChange={(e) => setImapEmail(e.target.value)}
              data-testid="mailbox-imap-email"
              autoComplete="username"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("mailbox.imapHost")}</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              data-testid="mailbox-imap-host"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t("mailbox.imapPassword")}</span>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2"
              value={imapPassword}
              onChange={(e) => setImapPassword(e.target.value)}
              data-testid="mailbox-imap-password"
              autoComplete="current-password"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={busy}
          data-testid="mailbox-imap-save"
          onClick={() => void saveImap()}
        >
          {t("mailbox.imapSave")}
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="panel space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("mailbox.inbox")}</h2>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={busy || !connected}
              onClick={() => void sync()}
            >
              {busy ? t("common.loading") : t("mailbox.sync")}
            </button>
          </div>
          {notice && (
            <p className="text-sm text-[var(--sea)]" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="text-sm text-[var(--danger)]" role="alert" data-testid="mailbox-error">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-[var(--ink-soft)]/70">{t("common.loading")}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]/70" data-testid="mailbox-empty">
              {t("mailbox.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedId === m.id
                        ? "border-[var(--sea)] bg-white/80"
                        : "border-[var(--line)] bg-white/60 hover:border-[var(--sea)]/40"
                    }`}
                    onClick={() => {
                      setSelectedId(m.id);
                      setCausaPick(m.causaId || "");
                    }}
                  >
                    <div className="font-medium">{m.subject}</div>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]/70">
                      {m.fromAddress || "—"} · {mailKindLabel(m.kind, locale)} ·{" "}
                      {m.rit || "—"} · {formatDate(m.receivedAt)} · {m.status}
                      {m.attachments?.length
                        ? ` · ${m.attachments.length} adj.`
                        : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel space-y-4 rounded-3xl p-5">
          {!selected ? (
            <p className="text-sm text-[var(--ink-soft)]/70">{t("mailbox.selectHint")}</p>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">{selected.subject}</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {selected.fromAddress || "—"} · {mailKindLabel(selected.kind, locale)} ·{" "}
                  {selected.rit || "—"}
                </p>
              </div>
              {selected.attachments && selected.attachments.length > 0 && (
                <ul className="text-sm text-[var(--ink-soft)]/80">
                  {selected.attachments.map((a) => (
                    <li key={`${a.filename}-${a.sizeBytes}`}>
                      {a.filename}
                      {a.documentoId ? ` · ${t("mailbox.archived")}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-xs">
                {selected.bodyText}
              </pre>
              <label className="block text-sm">
                <span className="font-medium">{t("mailbox.linkCausa")}</span>
                <select
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2"
                  value={causaPick}
                  onChange={(e) => setCausaPick(e.target.value)}
                >
                  <option value="">{t("mailbox.pickCausa")}</option>
                  {causas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.rit || c.titulo}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  disabled={busy}
                  onClick={() => void runAction("apply")}
                >
                  {t("mailbox.apply")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={busy || !causaPick}
                  onClick={() => void runAction("link")}
                >
                  {t("mailbox.linkOnly")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  disabled={busy}
                  onClick={() => void runAction("discard")}
                >
                  {t("mailbox.discard")}
                </button>
              </div>
            </>
          )}

          <div className="border-t border-[var(--line)] pt-4">
            <h3 className="font-semibold">{t("mailbox.pasteTitle")}</h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]/65">
              {t("mailbox.pasteHint")}
            </p>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              placeholder={t("mailbox.pasteSubject")}
              value={pasteSubject}
              onChange={(e) => setPasteSubject(e.target.value)}
            />
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              placeholder={t("mailbox.pasteBody")}
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary mt-2 text-sm"
              disabled={busy}
              onClick={() => void pasteMail()}
            >
              {t("mailbox.pasteSave")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
