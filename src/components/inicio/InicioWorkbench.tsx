"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Mic, Paperclip, Send, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { withCsrfHeaders } from "@/lib/client-csrf";
import { apiMutation } from "@/lib/api-mutation";
import {
  HoyCard,
  PlazosCard,
  ActividadCard,
  CausasCard,
} from "@/components/inicio/InicioCards";
import { ResultCard, type AssistantResultItem } from "@/components/inicio/ResultCard";
import type { InicioInitialData } from "@/components/inicio/types";

const MAX_ATTACHMENTS = 5;
const TEXT_ATTACHMENT_TYPES = /^text\/|\/(json|xml|csv)$/;
const TEXT_ATTACHMENT_EXT = /\.(txt|md|csv|json|log|yml|yaml)$/i;

type AssistantPlanStepLite = { toolId: string; preview: string };
type AssistantPlanLite = { id: string; steps: AssistantPlanStepLite[]; needsConfirm: boolean };

type ChatEntry =
  | { kind: "user"; id: string; text: string; attachmentNames: string[] }
  | { kind: "clarify"; id: string; text: string }
  | { kind: "error"; id: string; text: string }
  | {
      kind: "plan";
      id: string;
      plan: AssistantPlanLite;
      resolved: boolean;
      cancelled: boolean;
    }
  | { kind: "results"; id: string; items: AssistantResultItem[] };

type PendingAttachment = { name: string; text: string };

type ToolResultLite = {
  ok: boolean;
  message: string;
  card?: Record<string, unknown> | null;
  undoToken?: string | null;
  entityId?: string | null;
};

let entryCounter = 0;
function nextId() {
  entryCounter += 1;
  return `entry-${entryCounter}`;
}

/** Parser mínimo de SSE sobre `fetch` + `ReadableStream` (sin librerías nuevas). */
async function streamAssistant(
  body: { text: string; attachments?: string[]; chatId?: string },
  handlers: {
    onStatus?: (message: string) => void;
    onClarify?: (message: string) => void;
    onPlan?: (plan: AssistantPlanLite) => void;
    onDone?: (data: {
      planId: string | null;
      chatId: string;
      needsConfirm: boolean;
      plan?: AssistantPlanLite | null;
      results: Array<{ toolId: string; result: ToolResultLite }>;
    }) => void;
    onError?: (message: string) => void;
  }
) {
  const headers = withCsrfHeaders({ "Content-Type": "application/json" });
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* respuesta no JSON */
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex = buffer.indexOf("\n\n");
    while (sepIndex !== -1) {
      const chunk = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      const event = eventLine?.slice("event:".length).trim();
      const dataRaw = dataLine?.slice("data:".length).trim();
      if (event && dataRaw) {
        try {
          const data = JSON.parse(dataRaw);
          if (event === "status") handlers.onStatus?.(data.message);
          else if (event === "clarify") handlers.onClarify?.(data.message);
          else if (event === "plan") handlers.onPlan?.(data.plan);
          else if (event === "done") handlers.onDone?.(data);
          else if (event === "error") handlers.onError?.(data.message);
        } catch {
          /* fragmento SSE incompleto: ignorar */
        }
      }
      sepIndex = buffer.indexOf("\n\n");
    }
  }
}

export function InicioWorkbench({ initialData }: { initialData: InicioInitialData }) {
  const { t, dict } = useI18n();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<InstanceType<NonNullable<Window["SpeechRecognition"]>> | null>(
    null
  );

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [chatId, setChatId] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const placeholders = dict.inicio.composer.placeholders;

  useEffect(() => {
    if (placeholders.length <= 1) return;
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [placeholders.length]);

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection, client-only (SSR has no window)
    setSpeechSupported(Boolean(SpeechRecognitionCtor));
  }, []);

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, []);

  useEffect(() => {
    autosize();
  }, [text, autosize]);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    setAttachmentError("");
    for (const file of list) {
      if (attachments.length >= MAX_ATTACHMENTS) {
        setAttachmentError(t("inicio.attachments.max"));
        break;
      }
      const looksLikeText =
        TEXT_ATTACHMENT_TYPES.test(file.type) || TEXT_ATTACHMENT_EXT.test(file.name);
      if (looksLikeText) {
        try {
          const content = await file.text();
          setAttachments((prev) => [...prev, { name: file.name, text: content }]);
        } catch {
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              text: t("inicio.attachments.unsupportedNote").replace("{name}", file.name),
            },
          ]);
        }
      } else {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            text: t("inicio.attachments.unsupportedNote").replace("{name}", file.name),
          },
        ]);
      }
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave() {
    setDragActive(false);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleMic() {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "es-CL";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        parts.push(event.results[i]?.[0]?.transcript || "");
      }
      const transcript = parts.join(" ");
      setText((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function send(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatusMessage("");
    const attachmentStrings = attachments.map((a) => a.text);
    const attachmentNames = attachments.map((a) => a.name);
    setEntries((prev) => [
      ...prev,
      { kind: "user", id: nextId(), text: trimmed, attachmentNames },
    ]);
    setText("");
    setAttachments([]);

    let latestPlan: AssistantPlanLite | null = null;
    try {
      await streamAssistant(
        { text: trimmed, attachments: attachmentStrings, chatId: chatId || undefined },
        {
          onStatus: (message) => setStatusMessage(message),
          onClarify: (message) => {
            setEntries((prev) => [...prev, { kind: "clarify", id: nextId(), text: message }]);
          },
          onPlan: (plan) => {
            latestPlan = plan;
          },
          onDone: (data) => {
            if (data.chatId) setChatId(data.chatId);
            const plan = data.plan || latestPlan;
            if (data.needsConfirm && data.planId && plan) {
              setEntries((prev) => [
                ...prev,
                {
                  kind: "plan",
                  id: nextId(),
                  plan: { ...plan, id: data.planId || plan.id },
                  resolved: false,
                  cancelled: false,
                },
              ]);
            } else if (data.results?.length) {
              const items: AssistantResultItem[] = data.results.map((r) => ({
                toolId: r.toolId,
                ...r.result,
              }));
              setEntries((prev) => [...prev, { kind: "results", id: nextId(), items }]);
            }
          },
          onError: (message) => {
            setEntries((prev) => [...prev, { kind: "error", id: nextId(), text: message }]);
          },
        }
      );
    } catch {
      setEntries((prev) => [
        ...prev,
        { kind: "error", id: nextId(), text: t("inicio.error") },
      ]);
    } finally {
      setBusy(false);
      setStatusMessage("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await send(text);
  }

  function onTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(text);
    }
  }

  async function confirmPlan(entryId: string, confirm: boolean) {
    const entry = entries.find((x) => x.id === entryId);
    if (!entry || entry.kind !== "plan") return;
    setBusy(true);
    const result = await apiMutation<{
      ok: boolean;
      cancelled?: boolean;
      results?: AssistantResultItem[];
    }>("/api/assistant/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: entry.plan.id, confirm }),
    });
    setBusy(false);
    setEntries((prev) =>
      prev.map((x) =>
        x.id === entryId && x.kind === "plan"
          ? { ...x, resolved: true, cancelled: !confirm }
          : x
      )
    );
    if (confirm && result.ok && result.data.results) {
      setEntries((prev) => [
        ...prev,
        { kind: "results", id: nextId(), items: result.data.results! },
      ]);
      router.refresh();
    } else if (confirm && !result.ok) {
      setEntries((prev) => [
        ...prev,
        { kind: "error", id: nextId(), text: result.error },
      ]);
    }
  }

  function applySuggestion(prompt: string) {
    setText(prompt);
    textareaRef.current?.focus();
  }

  const hasHistory = entries.length > 0;

  return (
    <div className="space-y-6">
      <div
        className={`panel rounded-3xl p-4 sm:p-5 ${dragActive ? "ring-2 ring-[var(--sea)]" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <li
                  key={`${a.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs"
                >
                  <Paperclip size={12} />
                  <span className="max-w-[10rem] truncate">{a.name}</span>
                  <button
                    type="button"
                    aria-label="Quitar adjunto"
                    onClick={() => removeAttachment(i)}
                    className="text-[var(--ink-soft)]/70"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attachmentError && (
            <p className="text-xs text-[var(--danger)]">{attachmentError}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              className="textarea max-h-[260px] min-h-[52px] flex-1 resize-none"
              value={text}
              placeholder={placeholders[placeholderIndex]}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              aria-label={t("inicio.subtitle")}
              data-testid="inicio-composer"
              disabled={busy}
            />
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileInputChange}
              />
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={t("inicio.composer.attach")}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <Paperclip size={16} />
              </button>
              {speechSupported && (
                <button
                  type="button"
                  className={`btn ${listening ? "btn-primary" : "btn-ghost"}`}
                  aria-label={listening ? t("inicio.composer.micListening") : t("inicio.composer.mic")}
                  onClick={toggleMic}
                  disabled={busy}
                >
                  <Mic size={16} />
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="inicio-send"
                disabled={busy || !text.trim()}
              >
                {busy ? t("inicio.composer.sending") : t("inicio.composer.send")}
                <Send size={14} />
              </button>
            </div>
          </div>
          <p className="text-xs text-[var(--ink-soft)]/60">{t("inicio.composer.hint")}</p>
          {statusMessage && (
            <p className="text-xs text-[var(--sea)]" role="status">
              {statusMessage}
            </p>
          )}
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {initialData.suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-xs text-[var(--ink)] hover:border-[var(--sea)]/50"
              onClick={() => applySuggestion(s.prompt)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {hasHistory && (
        <section className="panel space-y-4 rounded-3xl p-5">
          {entries.map((entry) => (
            <div key={entry.id}>
              {entry.kind === "user" && (
                <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs uppercase tracking-[0.1em] text-[var(--ink-soft)]/55">
                    {t("inicio.you")}
                  </p>
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  {entry.attachmentNames.length > 0 && (
                    <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
                      {entry.attachmentNames.join(", ")}
                    </p>
                  )}
                </div>
              )}
              {entry.kind === "clarify" && (
                <div className="rounded-2xl border border-[var(--copper)]/40 bg-[var(--copper)]/5 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs uppercase tracking-[0.1em] text-[var(--copper)]">
                    {t("inicio.clarify")}
                  </p>
                  <p>{entry.text}</p>
                </div>
              )}
              {entry.kind === "error" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {entry.text}
                </div>
              )}
              {entry.kind === "plan" && (
                <div className="rounded-2xl border border-[var(--sea)]/30 bg-[var(--sea)]/5 px-3 py-3 text-sm">
                  <p className="mb-2 text-xs uppercase tracking-[0.1em] text-[var(--sea)]">
                    {t("inicio.plan.title")}
                  </p>
                  <ul className="space-y-1">
                    {entry.plan.steps.map((step, i) => (
                      <li key={`${entry.id}-${i}`} className="rounded-lg bg-white/70 px-2 py-1.5">
                        {step.preview}
                      </li>
                    ))}
                  </ul>
                  {!entry.resolved ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[var(--ink-soft)]/70">
                        {t("inicio.plan.needsConfirm")}
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        data-testid="plan-confirm"
                        disabled={busy}
                        onClick={() => void confirmPlan(entry.id, true)}
                      >
                        {busy ? t("inicio.plan.confirming") : t("inicio.plan.confirm")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        data-testid="plan-cancel"
                        disabled={busy}
                        onClick={() => void confirmPlan(entry.id, false)}
                      >
                        {t("inicio.plan.cancel")}
                      </button>
                    </div>
                  ) : entry.cancelled ? (
                    <p className="mt-2 text-xs text-[var(--ink-soft)]/70">
                      {t("inicio.plan.cancelled")}
                    </p>
                  ) : null}
                </div>
              )}
              {entry.kind === "results" && (
                <div className="space-y-2">
                  {entry.items.map((item, i) => (
                    <ResultCard key={`${entry.id}-${i}`} item={item} onUndone={() => router.refresh()} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {!hasHistory && (
        <p className="text-sm text-[var(--ink-soft)]/60">{t("inicio.empty")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HoyCard eventos={initialData.hoy.eventos} plazos={initialData.hoy.plazos} />
        <PlazosCard plazos={initialData.plazosProximos} />
        <ActividadCard items={initialData.actividad} />
        <CausasCard items={initialData.causasRecientes} />
      </div>
    </div>
  );
}
