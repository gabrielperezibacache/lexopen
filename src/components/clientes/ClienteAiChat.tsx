"use client";

import { FormEvent, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Msg = { role: string; content: string; source?: string };

export function ClienteAiChat({
  clienteId,
  clienteNombre,
}: {
  clienteId: string;
  clienteNombre: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNote("");
    const userMsg = prompt.trim();
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setPrompt("");
    const result = await apiMutation<{
      chat?: { id?: string };
      content?: string;
      source?: string;
      note?: string;
    }>(`/api/clientes/${clienteId}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userMsg, chatId }),
    });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error || "Error al consultar IA");
      return;
    }
    const data = result.data;
    if (data.chat?.id) setChatId(data.chat.id);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: data.content || "(sin respuesta)",
        source: data.source,
      },
    ]);
    if (data.note) setNote(data.note);
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <div>
        <h2 className="text-lg font-semibold">Trabajar con IA</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
          El asistente usa la carpeta de {clienteNombre}: causas, trámites y
          documentos de texto. Configure el proveedor en Configuración.
        </p>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-[var(--line)] bg-white/50 p-3">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            Ejemplos: «Resume los trámites pendientes de este cliente», «Redacta
            un correo de avance con base en la carpeta».
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 bg-[var(--sea)]/10"
                : "mr-8 border border-[var(--line)] bg-white"
            }`}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/50">
              {m.role === "user" ? "Usted" : `IA${m.source ? ` · ${m.source}` : ""}`}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Pregunte sobre la carpeta del cliente…"
          disabled={busy}
        />
        <button className="btn btn-primary" disabled={busy || !prompt.trim()} type="submit">
          {busy ? "Pensando…" : "Preguntar"}
        </button>
      </form>
      {note && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
