"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type CausaOption = { id: string; titulo: string; rit: string | null };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source?: string;
};
type AgentChat = {
  id: string;
  title: string;
  messagesJson: string;
  demoMode: boolean;
  updatedAt: string;
  causaId?: string | null;
};

function sourceBadge(source?: string) {
  if (source === "demo") return "Hermes demo";
  if (source === "error") return "Hermes error";
  if (source === "hermes") return "Hermes";
  return "Hermes";
}

function AgenteInner() {
  const sp = useSearchParams();
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [causaId, setCausaId] = useState(sp.get("causaId") || "");
  const [prompt, setPrompt] = useState(
    "Redacta un memorial de alegatos preliminar y cita jurisprudencia útil para Chile."
  );
  const [meta, setMeta] = useState("");
  const [error, setError] = useState("");
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [demoAllowed, setDemoAllowed] = useState<boolean | null>(null);

  async function loadChats(forCausa?: string) {
    const q = forCausa
      ? `/api/integrations/hermes?chats=1&causaId=${encodeURIComponent(forCausa)}`
      : "/api/integrations/hermes?chats=1";
    const res = await fetch(q);
    if (res.ok) setChats(await res.json());
  }

  useEffect(() => {
    fetch("/api/causas")
      .then((r) => r.json())
      .then((data: CausaOption[]) => setCausas(Array.isArray(data) ? data : []))
      .catch(() => setCausas([]));
    fetch("/api/integrations/hermes")
      .then((r) => r.json())
      .then((d) => setDemoAllowed(Boolean(d.demoAllowed)))
      .catch(() => setDemoAllowed(null));
    loadChats(sp.get("causaId") || undefined).catch(() => setChats([]));
  }, [sp]);

  function resumeChat(chat: AgentChat) {
    setChatId(chat.id);
    setError("");
    if (chat.causaId) setCausaId(chat.causaId);
    const parsed = JSON.parse(chat.messagesJson || "[]") as ChatMessage[];
    setMessages(parsed);
    setMeta(
      chat.demoMode
        ? "Historial · incluye respuestas demo (no Hermes real)"
        : "Historial · Hermes Agent"
    );
  }

  function newChat() {
    setChatId("");
    setMessages([]);
    setMeta("");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("Escriba una instrucción.");
      return;
    }
    setBusy(true);
    setError("");
    setMeta("");
    const res = await fetch("/api/integrations/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        causaId: causaId || undefined,
        prompt,
        chatId: chatId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "No se pudo consultar Hermes");
      return;
    }

    if (data.source === "error") {
      setError(data.note || data.error || "Hermes no alcanzable");
      setMeta(data.statusLabel || "Error / no alcanzable");
      return;
    }

    if (data.chat) {
      setChatId(data.chat.id);
      setMessages(JSON.parse(data.chat.messagesJson || "[]"));
      await loadChats(causaId || undefined);
    }

    setMeta(
      [
        data.statusLabel ||
          (data.source === "hermes"
            ? "Hermes Agent (real)"
            : data.source === "demo"
              ? "Demo local (no Hermes)"
              : "Error"),
        data.requireApproval ? "Requiere aprobación humana" : null,
        data.note || null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          IA jurídica
        </p>
        <h1 className="display mt-2 text-4xl">Hermes Agent</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Conversación con historial por chat. El contexto de causa respeta
          confidencialidad de minutas. Las acciones sensibles requieren
          aprobación del abogado.
        </p>
        {demoAllowed !== null && (
          <p
            className={`mt-3 text-sm ${
              demoAllowed ? "text-[var(--copper)]" : "text-[var(--sea)]"
            }`}
            role="status"
          >
            {demoAllowed
              ? "Modo demo permitido si Hermes no responde (respuesta etiquetada)."
              : "Fail-closed: sin Hermes no hay borrador demo."}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Chats</h2>
            <button
              className="text-sm text-[var(--sea)]"
              type="button"
              onClick={newChat}
            >
              Nuevo
            </button>
          </div>
          <div className="space-y-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${
                  chat.id === chatId
                    ? "border-[var(--sea)] bg-[var(--sea)]/8"
                    : "border-[var(--line)] bg-white/70"
                }`}
                onClick={() => resumeChat(chat)}
              >
                <div className="font-medium">{chat.title}</div>
                <div className="text-xs text-[var(--ink-soft)]/60">
                  {chat.demoMode ? "demo" : "Hermes"} ·{" "}
                  {new Date(chat.updatedAt).toLocaleDateString("es-CL")}
                </div>
              </button>
            ))}
            {chats.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin chats guardados.
              </p>
            )}
          </div>
        </aside>

        <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Causa (contexto)
            </label>
            <select
              className="select"
              value={causaId}
              onChange={(e) => {
                setCausaId(e.target.value);
                loadChats(e.target.value || undefined).catch(() => undefined);
              }}
            >
              <option value="">Sin causa específica</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rit || c.titulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Instrucción</label>
            <textarea
              className="textarea min-h-[140px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={8000}
            />
          </div>
          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {meta && (
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--copper)]" role="status">
              {meta}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Consultando…" : "Enviar a Hermes"}
          </button>
        </form>
      </div>

      {messages.length > 0 && (
        <section className="panel rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-semibold">Historial del chat</h2>
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--line)] bg-white/70 p-3"
              >
                <div className="mb-1 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                  {m.role === "user" ? "Usuario" : sourceBadge(m.source)}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {m.content}
                </pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function AgentePage() {
  return (
    <Suspense fallback={<div className="panel h-40 animate-pulse rounded-3xl" />}>
      <AgenteInner />
    </Suspense>
  );
}
