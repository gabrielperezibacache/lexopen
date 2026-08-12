"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeJsonParse } from "@/lib/safe-json";

type CausaOption = { id: string; titulo: string; rit: string | null };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source?: string;
  utility?: string;
};
type AgentChat = {
  id: string;
  title: string;
  messagesJson: string;
  demoMode: boolean;
  updatedAt: string;
};
type Utility = {
  id: string;
  label: string;
  short: string;
  starter: string;
};
type SourceRef = {
  type: string;
  id: string;
  label: string;
  href?: string;
};

function AgenteInner() {
  const sp = useSearchParams();
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [utility, setUtility] = useState(sp.get("utility") || "copilot");
  const [causaId, setCausaId] = useState(sp.get("causaId") || "");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState("");
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [actions, setActions] = useState<{ label: string; href: string }[]>([]);
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadChats() {
    const res = await fetch("/api/integrations/hermes?chats=1");
    if (res.ok) setChats(await res.json());
  }

  useEffect(() => {
    let active = true;
    fetch("/api/causas")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      })
      .then((data: CausaOption[]) => {
        if (active) setCausas(data);
      })
      .catch(() => {
        if (active) setCausas([]);
      });
    fetch("/api/integrations/hermes?utilities=1")
      .then((r) => (r.ok ? r.json() : { utilities: [] }))
      .then((data: { utilities?: Utility[] }) => {
        if (!active) return;
        const list = Array.isArray(data.utilities) ? data.utilities : [];
        setUtilities(list);
        if (!prompt && list.length) {
          const current =
            list.find((u) => u.id === (sp.get("utility") || "copilot")) ||
            list[0];
          setPrompt(current.starter);
          setUtility(current.id);
        }
      })
      .catch(() => undefined);
    fetch("/api/integrations/hermes?chats=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AgentChat[]) => {
        if (active) setChats(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setChats([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectUtility(u: Utility) {
    setUtility(u.id);
    setPrompt(u.starter);
  }

  function resumeChat(chat: AgentChat) {
    setChatId(chat.id);
    const parsed = safeJsonParse<ChatMessage[]>(chat.messagesJson, []);
    setMessages(Array.isArray(parsed) ? parsed : []);
    const lastAssistant = [...(Array.isArray(parsed) ? parsed : [])]
      .reverse()
      .find((m) => m.role === "assistant");
    setReply(lastAssistant?.content || "");
    setMeta(chat.demoMode ? "Historial · modo demo" : "Historial · copiloto");
    setSources([]);
    setActions([]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReply("");
    setMeta("");
    setSources([]);
    setActions([]);
    try {
      const res = await fetch("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causaId: causaId || undefined,
          prompt,
          chatId: chatId || undefined,
          utility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setReply(data.content || data.error || "Sin respuesta");
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setActions(
        Array.isArray(data.suggestedActions) ? data.suggestedActions : []
      );
      if (data.chat) {
        setChatId(data.chat.id);
        const parsed = safeJsonParse<ChatMessage[]>(data.chat.messagesJson, []);
        setMessages(Array.isArray(parsed) ? parsed : []);
        await loadChats();
      }
      setMeta(
        [
          data.utility?.label ? `Modo: ${data.utility.label}` : null,
          data.source === "hermes"
            ? "Fuente: Hermes"
            : data.source === "error"
              ? "Error de Hermes"
              : "Fuente: demo local",
          data.requireApproval ? "Requiere aprobación humana" : null,
          data.note || null,
        ]
          .filter(Boolean)
          .join(" · ")
      );
    } catch {
      setReply("No se pudo contactar al copiloto");
      setMeta("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Copiloto legal
        </p>
        <h1 className="display mt-2 text-4xl">Asistente LexOpen</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Entiende lo que pide, recuerda el hilo, busca en la causa y documentos
          del estudio, y responde con fuentes verificables del host. Borradores
          siempre sujetos a revisión humana (estilo Julia.cl / Hermes).
        </p>
      </div>

      {utilities.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {utilities.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => selectUtility(u)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                utility === u.id
                  ? "border-[var(--sea)] bg-[rgba(31,122,140,0.08)]"
                  : "border-[var(--line)] bg-white/70 hover:border-[var(--sea)]/40"
              }`}
            >
              <div className="font-semibold">{u.label}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]/75">
                {u.short}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Conversaciones</h2>
            <button
              className="text-sm text-[var(--sea)]"
              type="button"
              onClick={() => {
                setChatId("");
                setMessages([]);
                setReply("");
                setMeta("");
                setSources([]);
                setActions([]);
              }}
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
          {messages.length === 0 && !reply && (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-3 text-sm text-[var(--ink-soft)]/80">
              Elija una utilidad y una causa (recomendado). El copiloto ancla la
              respuesta a plazos, movimientos y documentos indexados del host.
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Causa (contexto del estudio)
            </label>
            <select
              className="select"
              value={causaId}
              onChange={(e) => setCausaId(e.target.value)}
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
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Trabajando…" : "Enviar al copiloto"}
          </button>
        </form>
      </div>

      {(sources.length > 0 || actions.length > 0) && (
        <section className="panel space-y-3 rounded-3xl p-5">
          {sources.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                Fuentes del estudio
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sources.slice(0, 16).map((s) => (
                  <li key={`${s.type}-${s.id}`}>
                    {s.href ? (
                      <Link
                        href={s.href}
                        className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs text-[var(--sea)]"
                      >
                        {s.type}: {s.label}
                      </Link>
                    ) : (
                      <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">
                        {s.type}: {s.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Link key={a.href} href={a.href} className="btn btn-secondary">
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {messages.length > 0 && (
        <section className="panel rounded-3xl p-6">
          {meta && (
            <p className="mb-4 text-xs uppercase tracking-[0.12em] text-[var(--copper)]">
              {meta}
            </p>
          )}
          <h2 className="mb-4 text-lg font-semibold">Conversación</h2>
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--line)] bg-white/70 p-3"
              >
                <div className="mb-1 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                  {m.role === "user"
                    ? "Usted"
                    : m.source === "demo"
                      ? "Copiloto demo"
                      : m.source === "error"
                        ? "Error"
                        : "Copiloto"}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {m.content}
                </pre>
              </div>
            ))}
          </div>
        </section>
      )}

      {(reply || meta) && messages.length === 0 && (
        <section className="panel rounded-3xl p-6">
          {meta && (
            <p className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--copper)]">
              {meta}
            </p>
          )}
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {reply}
          </pre>
        </section>
      )}
    </div>
  );
}

export default function AgentePage() {
  return (
    <Suspense fallback={<div className="panel h-40 rounded-3xl" />}>
      <AgenteInner />
    </Suspense>
  );
}
