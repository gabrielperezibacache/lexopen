"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDate } from "@/components/ui";
import { apiMutation } from "@/lib/api-mutation";
import type { PublicMailboxAccount } from "@/lib/mail/types";

export function MailboxSettingsPanel({ initialAccount, oauthStatus }: {
  initialAccount: PublicMailboxAccount;
  oauthStatus: string | null;
}) {
  const { t } = useI18n();
  const [account, setAccount] = useState(initialAccount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthStatus && oauthStatus !== "connected" ? t("mailbox.oauthError") : "");
  const [notice, setNotice] = useState(oauthStatus === "connected" ? t("mailbox.oauthConnected") : "");
  const [email, setEmail] = useState(account.email || "");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(account.imapHost || "imap.gmail.com");
  const [port, setPort] = useState(account.imapPort);
  const [preset, setPreset] = useState(() => account.presets.find(item => item.host === host)?.id || "custom");

  function begin() {
    setBusy(true);
    setError("");
    setNotice("");
  }

  async function startOauth(provider: "google" | "microsoft") {
    begin();
    const result = await apiMutation<{ authUrl?: string }>(`/api/mail/${provider}/start`, { method: "POST" });
    if (result.ok && result.data.authUrl) {
      window.location.assign(result.data.authUrl);
      return;
    }
    setError(result.ok ? t("mailbox.oauthError") : result.error);
    setBusy(false);
  }

  async function saveAccount(action: "save-imap" | "disconnect") {
    begin();
    const result = await apiMutation<{ account: PublicMailboxAccount }>("/api/mail/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "disconnect" ? { action } : {
        action, email, password: password || undefined, imapHost: host, imapPort: port, imapTls: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAccount(result.data.account);
    setPassword("");
    setNotice(t(action === "disconnect" ? "mailbox.disconnected" : "mailbox.imapSaved"));
  }

  function changePreset(id: string) {
    const next = account.presets.find(item => item.id === id);
    if (!next) return;
    setPreset(next.id);
    setHost(next.host);
    setPort(next.port);
  }

  function saveImap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveAccount("save-imap");
  }

  return (
    <section className="panel max-w-3xl space-y-5 rounded-[var(--radius-lg)] p-5 sm:p-6" data-testid="mailbox-connect" aria-labelledby="mailbox-settings-heading">
      <div>
        <h2 id="mailbox-settings-heading" className="text-lg font-semibold">{t("mailbox.connectTitle")}</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--muted)]">{t("mailbox.connectHint")}</p>
      </div>
      <p className="break-words rounded-[var(--radius-md)] bg-[var(--mist)] px-4 py-3 text-sm text-[var(--ink-soft)]" data-testid="mailbox-status" role="status">
        {account.email || t("mailbox.notConnected")} · {t(account.status === "connected" ? "mailbox.statusConnected" : account.status === "error" ? "mailbox.statusError" : "mailbox.statusDisconnected")}
        {account.lastSyncAt ? ` · ${t("mailbox.lastSync")} ${formatDate(account.lastSyncAt)}` : ""}
      </p>
      {notice && <p className="text-sm text-[var(--sea)]" role="status">{notice}</p>}
      {(error || account.lastError) && <p className="break-words text-sm text-[var(--danger)]" role="alert" data-testid="mailbox-error">{error || account.lastError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary text-sm" disabled={busy || !account.googleConfigured} data-testid="mailbox-connect-gmail" onClick={() => void startOauth("google")}>
          {t("mailbox.connectGmail")}
        </button>
        <button type="button" className="btn btn-secondary text-sm" disabled={busy || !account.microsoftConfigured} data-testid="mailbox-connect-microsoft" onClick={() => void startOauth("microsoft")}>
          {t("mailbox.connectMicrosoft")}
        </button>
        {(account.status === "connected" || account.hasOauth || account.hasPassword) && (
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void saveAccount("disconnect")}>
            {t("mailbox.disconnect")}
          </button>
        )}
      </div>
      {(!account.googleConfigured || !account.microsoftConfigured) && (
        <p className="text-sm text-[var(--muted)]">{t("mailbox.providerUnavailable")}</p>
      )}
      <details className="border-t border-[var(--line)] pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t("mailbox.imapSettings")}</summary>
        <form className="mt-2 space-y-4" onSubmit={saveImap} aria-busy={busy}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-sm">
              <span className="font-medium">{t("mailbox.imapPreset")}</span>
              <select className="select mt-2" value={preset} onChange={event => changePreset(event.target.value)} data-testid="mailbox-imap-preset">
                {account.presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block min-w-0 text-sm">
              <span className="font-medium">{t("mailbox.imapEmail")}</span>
              <input className="input mt-2" type="email" required value={email} onChange={event => setEmail(event.target.value)} data-testid="mailbox-imap-email" autoComplete="username" />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="font-medium">{t("mailbox.imapHost")}</span>
              <input className="input mt-2" required value={host} onChange={event => setHost(event.target.value)} data-testid="mailbox-imap-host" />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="font-medium">{t("mailbox.imapPassword")}</span>
              <input type="password" className="input mt-2" required={!account.hasPassword || host !== account.imapHost || email !== account.email} value={password} onChange={event => setPassword(event.target.value)} data-testid="mailbox-imap-password" autoComplete="current-password" />
            </label>
          </div>
          <button type="submit" className="btn btn-secondary text-sm" disabled={busy} data-testid="mailbox-imap-save">
            {t(busy ? "common.loading" : "mailbox.imapSave")}
          </button>
        </form>
      </details>
    </section>
  );
}
