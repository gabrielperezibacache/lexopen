"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type CausaOption = { id: string; titulo: string; rit: string | null };
type ClienteOption = { id: string; razonSocial: string };
type ChatMessage = { role: "user" | "assistant"; content: string; source?: string };
type AgentChat = {
  id: string;
  title: string;
  messagesJson: string;
  demoMode: boolean;
  updatedAt: string;
  clienteId?: string | null;
  causaId?: string | null;
};

function AgenteInner() {
  const sp = useSearchParams();
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [scope, setScope] = useState<"global" | "causa" | "cliente">(
    sp.get("clienteId") ? "cliente" : sp.get("causaId") ? "causa" : "global"
  );
  const [causaId, setCausaId] = useState(sp.get("causaId") || "");
  const [clienteId, setClienteId] = useState(sp.get("clienteId") || "");
  const [prompt, setPrompt] = useState(
    "Resume el estado y sugiere próximos pasos jurídicos para Chile."
  );
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState("");
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadChats() {
    const qs = new URLSearchParams({ chats: "1" });
    if (scope === "causa" && causaId) qs.set("causaId", causaId);
    if (scope === "cliente" && clienteId) qs.set("clienteId", clienteId);
    const res = await fetch(`/api/integrations/llm?${qs}`);
    if (res.ok) setChats(await res.json());
  }

  useEffect(() => {
    fetch("/api/causas")
      .then((r) => r.json())
      .then((data: CausaOption[]) => setCausas(data))
      .catch(() => setCausas([]));
    fetch("/api/clientes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClienteOption[]) => setClientes(data))
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    loadChats().catch(() => setChats([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, causaId, clienteId]);

  function resumeChat(chat: AgentChat) {
    setChatId(chat.id);
    const parsed = JSON.parse(chat.messagesJson || "[]") as ChatMessage[];
    setMessages(parsed);
    const lastAssistant = [...parsed].reverse().find((m) => m.role === "assistant");
    setReply(lastAssistant?.content || "");
    setMeta(chat.demoMode ? "Historial · modo demo" : "Historial · Asistente IA");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReply("");
    setMeta("");

    const endpoint =
      scope === "cliente" && clienteId
        ? `/api/clientes/${clienteId}/ai`
        : "/api/integrations/llm";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        chatId: chatId || undefined,
        ...(scope === "causa" && causaId ? { causaId } : {}),
        ...(scope === "cliente" && clienteId ? { clienteId } : {}),
      }),
    });
    const data = await res.json();
    setBusy(false);
    setReply(data.content || data.error || "Sin respuesta");
    if (data.chat) {
      setChatId(data.chat.id);
      setMessages(JSON.parse(data.chat.messagesJson || "[]"));
      await loadChats();
    }
    setMeta(
      [
        data.source === "llm" || data.source === "hermes"
          ? `Fuente: ${data.provider || "LLM"}`
          : data.source === "error"
            ? "Error de proveedor"
            : "Fuente: demo local",
        data.model ? `Modelo ${data.model}` : null,
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
        <h1 className="display mt-2 text-4xl">Asistente IA</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Conecte OpenAI u otro endpoint compatible en{" "}
          <Link href="/configuracion" className="text-[var(--sea)] underline-offset-2 hover:underline">
            Configuración
          </Link>
          . Puede trabajar en global, por causa o por carpeta de cliente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Chats</h2>
            <button
              className="text-sm text-[var(--sea)]"
              type="button"
              onClick={() => {
                setChatId("");
                setMessages([]);
                setReply("");
                setMeta("");
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
                  {chat.demoMode ? "demo" : "IA"} ·{" "}
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
            <label className="mb-1 block text-sm font-medium">Alcance</label>
            <select
              className="select"
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as "global" | "causa" | "cliente")
              }
            >
              <option value="global">Global (sin carpeta)</option>
              <option value="causa">Por causa</option>
              <option value="cliente">Por carpeta de cliente</option>
            </select>
          </div>
          {scope === "causa" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Causa</label>
              <select
                className="select"
                value={causaId}
                onChange={(e) => setCausaId(e.target.value)}
              >
                <option value="">Seleccione causa…</option>
                {causas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rit || c.titulo}
                  </option>
                ))}
              </select>
            </div>
          )}
          {scope === "cliente" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Cliente</label>
              <select
                className="select"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">Seleccione cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Instrucción</label>
            <textarea
              className="textarea min-h-[140px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Consultando…" : "Enviar al asistente"}
          </button>
        </form>
      </div>

      {messages.length > 0 && (
        <section className="panel rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-semibold">Historial</h2>
          {meta && (
            <p className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--copper)]">
              {meta}
            </p>
          )}
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--line)] bg-white/70 p-3"
              >
                <div className="mb-1 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                  {m.role === "user"
                    ? "Usuario"
                    : m.source === "demo"
                      ? "IA demo"
                      : m.source === "error"
                        ? "IA error"
                        : "IA"}
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
