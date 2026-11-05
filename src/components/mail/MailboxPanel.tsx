"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { formatDate } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { mailKindLabel } from "@/lib/mail/labels";

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

export function MailboxPanel() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [connected, setConnected] = useState(false);
  const [selection, setSelection] = useState({ requestedId, id: requestedId });
  const [pickedCase, setPickedCase] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; message: MailMessage | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  if (selection.requestedId !== requestedId) {
    setSelection({ requestedId, id: requestedId });
    setPickedCase(null);
  }
  const selectedId = selection.id;
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
    setConnected(data.account?.status === "connected");
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch hydrates inbox
    void load();
  }, [load]);

  const listed = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );
  const remote = detail?.id === selectedId ? detail : null;
  const selected = listed || remote?.message || null;
  const causaPick = pickedCase ?? selected?.causaId ?? "";

  useEffect(() => {
    if (!selectedId || loading || listed) return;
    const controller = new AbortController();
    async function loadDetail(id: string) {
      let message: MailMessage | null = null;
      try {
        const res = await fetch(`/api/mail/messages/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { message?: MailMessage };
          if (data.message?.id === id) message = data.message;
        }
      } catch { /* The detail remains unavailable. */ }
      if (!controller.signal.aborted) setDetail({ id, message });
    }
    void loadDetail(selectedId);
    return () => controller.abort();
  }, [loading, listed, messages, selectedId]);

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
    const result = await apiMutation<{ message?: MailMessage }>(`/api/mail/messages/${encodeURIComponent(selected.id)}`, {
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
    if (result.data.message?.id === selected.id) setDetail({ id: selected.id, message: result.data.message });
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
    <div className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="panel min-w-0 space-y-4 rounded-[var(--radius-lg)] p-5">
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
          {error && (
            <p className="text-sm text-[var(--danger)]" role="alert" data-testid="mailbox-error">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-[var(--muted)]">{t("common.loading")}</p>
          ) : messages.length === 0 ? (
            <p className="grid min-h-40 place-items-center text-center text-sm leading-relaxed text-[var(--muted)]" data-testid="mailbox-empty">
              {t("mailbox.empty")}
            </p>
          ) : (
            <ul className="max-h-[40rem] divide-y divide-[var(--line)] overflow-auto">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`w-full rounded-[var(--radius-sm)] px-3 py-4 text-left transition-colors ${
                      selectedId === m.id
                        ? "bg-[var(--mist)] text-[var(--ink)]"
                        : "hover:bg-[var(--mist)]"
                    }`}
                    aria-pressed={selectedId === m.id}
                    onClick={() => {
                      setSelection({ requestedId, id: m.id });
                      setPickedCase(null);
                    }}
                  >
                    <div className="break-words font-semibold">{m.subject}</div>
                    <div className="mt-2 break-words text-xs leading-relaxed text-[var(--muted)]">
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

        <section className="panel min-w-0 space-y-5 rounded-[var(--radius-lg)] p-5">
          {!selected ? (
            <p className="grid min-h-60 place-items-center text-center text-sm leading-relaxed text-[var(--muted)]" role={selectedId ? "status" : undefined}>
              {!selectedId ? t("mailbox.selectHint") : remote ? (locale === "en" ? "This message could not be opened." : "No se pudo abrir este correo.") : t("common.loading")}
            </p>
          ) : (
            <>
              <div>
                <h2 className="break-words text-lg font-semibold">{selected.subject}</h2>
                <p className="mt-2 break-words text-sm leading-relaxed text-[var(--muted)]">
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
              <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                {selected.bodyText}
              </div>
              <label className="block text-sm">
                <span className="font-medium">{t("mailbox.linkCausa")}</span>
                <select
                  className="select mt-2"
                  value={causaPick}
                  onChange={(e) => setPickedCase(e.target.value)}
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
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t("mailbox.pasteHint")}
            </p>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              <span>{t("mailbox.pasteSubject")}</span>
            <input
              className="input"
              placeholder={t("mailbox.pasteSubject")}
              value={pasteSubject}
              onChange={(e) => setPasteSubject(e.target.value)}
            />
            </label>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              <span>{t("mailbox.pasteBody")}</span>
            <textarea
              className="textarea min-h-24"
              placeholder={t("mailbox.pasteBody")}
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
            />
            </label>
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
