"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { formatDate } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { mailKindLabel } from "@/lib/mail/labels";

type MailMessage = {
  id: string;
  subject: string;
  kind: string;
  status: string;
  rit?: string | null;
  receivedAt: string;
  bodyText: string;
  causaId?: string | null;
  causa?: { id: string; titulo: string; rit: string | null } | null;
};

type CausaOption = {
  id: string;
  titulo: string;
  rit: string | null;
  proximaTabla?: string | null;
};

export function MailboxPanel() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("id")
  );
  const [causaPick, setCausaPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");

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
    if (Array.isArray(data.causas)) {
      setCausas(data.causas);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch hydrates inbox
    void load();
  }, [load]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="panel space-y-4 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("mailbox.inbox")}</h2>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={busy}
            onClick={() => void sync()}
          >
            {busy ? t("common.loading") : t("mailbox.sync")}
          </button>
        </div>
        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-[var(--ink-soft)]/70">{t("common.loading")}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]/70">{t("mailbox.empty")}</p>
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
                    {mailKindLabel(m.kind, locale)} · {m.rit || "—"} ·{" "}
                    {formatDate(m.receivedAt)} · {m.status}
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
                {mailKindLabel(selected.kind, locale)} · {selected.rit || "—"}
              </p>
            </div>
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
  );
}
