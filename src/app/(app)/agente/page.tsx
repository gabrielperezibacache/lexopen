"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeJsonParse } from "@/lib/safe-json";

type CausaOption = { id: string; titulo: string; rit: string | null };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source?: string;
  utility?: string;
  sources?: SourceRef[];
  suggestedActions?: { label: string; href: string }[];
  alerts?: string[];
  requireApproval?: boolean;
  discarded?: boolean;
  approvedMinutaId?: string;
};
type AgentChat = {
  id: string;
  title: string;
  messagesJson: string;
  demoMode: boolean;
  updatedAt: string;
  causaId?: string | null;
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
  const [requireApproval, setRequireApproval] = useState(false);
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveMsg, setApproveMsg] = useState("");
  const [approveHref, setApproveHref] = useState("");
  const [plazoDesde, setPlazoDesde] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [plazoDias, setPlazoDias] = useState("5");
  const [plazoComputo, setPlazoComputo] = useState<"habiles" | "corridos">(
    "habiles"
  );
  const [plazoPreview, setPlazoPreview] = useState("");
  const [plazoVencimiento, setPlazoVencimiento] = useState("");
  const autoRan = useRef(false);

  async function loadChats(filterCausaId?: string) {
    const q = filterCausaId
      ? `?chats=1&causaId=${encodeURIComponent(filterCausaId)}`
      : "?chats=1";
    const res = await fetch(`/api/integrations/hermes${q}`);
    if (res.ok) setChats(await res.json());
  }

  useEffect(() => {
    let active = true;
    const boot = () => {
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
      loadChats(sp.get("causaId") || undefined).catch(() => {
        if (active) setChats([]);
      });
    };
    queueMicrotask(boot);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      loadChats(causaId || undefined).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [causaId]);

  function selectUtility(u: Utility) {
    setUtility(u.id);
    setPrompt(u.starter);
  }

  function applyAssistantMeta(last: ChatMessage | undefined, demo?: boolean) {
    setReply(last?.content || "");
    setSources(Array.isArray(last?.sources) ? last!.sources! : []);
    setActions(
      Array.isArray(last?.suggestedActions) ? last!.suggestedActions! : []
    );
    const canApprove =
      Boolean(last?.requireApproval) &&
      !last?.discarded &&
      !last?.approvedMinutaId &&
      last?.source !== "error";
    setRequireApproval(canApprove);
    setMeta(
      [
        last?.utility ? `Modo: ${last.utility}` : null,
        demo || last?.source === "demo"
          ? "Historial · modo demo"
          : last?.source === "error"
            ? "Error"
            : "Historial · copiloto",
        canApprove ? "Requiere aprobación humana" : null,
        last?.discarded ? "Borrador descartado" : null,
        last?.approvedMinutaId ? "Borrador aprobado" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }

  function resumeChat(chat: AgentChat) {
    setChatId(chat.id);
    if (chat.causaId) setCausaId(chat.causaId);
    const parsed = safeJsonParse<ChatMessage[]>(chat.messagesJson, []);
    const list = Array.isArray(parsed) ? parsed : [];
    setMessages(list);
    const lastAssistant = [...list]
      .reverse()
      .find((m) => m.role === "assistant");
    applyAssistantMeta(lastAssistant, chat.demoMode);
    setApproveMsg("");
  }

  async function sendPrompt(nextPrompt: string, nextUtility?: string) {
    const u = nextUtility || utility;
    setBusy(true);
    setReply("");
    setMeta("");
    setSources([]);
    setActions([]);
    setRequireApproval(false);
    setApproveMsg("");
    setApproveHref("");
    try {
      const res = await fetch("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causaId: causaId || undefined,
          prompt: nextPrompt,
          chatId: chatId || undefined,
          utility: u,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === "causa_mismatch") {
        setChatId("");
        setReply(data.error || "Inicie un chat nuevo para esta causa");
        setMeta("Causa distinta al chat");
        setRequireApproval(false);
        return;
      }
      setReply(data.content || data.error || "Sin respuesta");
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setActions(
        Array.isArray(data.suggestedActions) ? data.suggestedActions : []
      );
      const canApprove =
        Boolean(data.requireApproval) && data.source !== "error";
      setRequireApproval(canApprove);
      if (data.chat) {
        setChatId(data.chat.id);
        const parsed = safeJsonParse<ChatMessage[]>(data.chat.messagesJson, []);
        setMessages(Array.isArray(parsed) ? parsed : []);
        await loadChats(causaId || undefined);
      } else if (data.source === "error" || !res.ok) {
        // Mostrar el error en el hilo aunque no se persista
        setMessages((prev) => [
          ...prev,
          { role: "user", content: nextPrompt, utility: u },
          {
            role: "assistant",
            content: data.content || data.error || "Sin respuesta",
            source: "error",
            utility: u,
            requireApproval: false,
          },
        ]);
      }
      setMeta(
        [
          data.utility?.label ? `Modo: ${data.utility.label}` : null,
          data.source === "hermes"
            ? "Fuente: Hermes"
            : data.source === "error"
              ? "Error de Hermes"
              : "Fuente: demo local",
          canApprove ? "Requiere aprobación humana" : null,
          data.note || null,
        ]
          .filter(Boolean)
          .join(" · ")
      );
    } catch {
      setReply("No se pudo contactar al copiloto");
      setMeta("Error de red");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: nextPrompt, utility: u },
        {
          role: "assistant",
          content: "No se pudo contactar al copiloto",
          source: "error",
          utility: u,
          requireApproval: false,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await sendPrompt(prompt);
  }

  useEffect(() => {
    if (autoRan.current) return;
    if (sp.get("run") !== "1") return;
    if (!utilities.length) return;
    autoRan.current = true;
    const u =
      utilities.find((x) => x.id === (sp.get("utility") || utility)) ||
      utilities[0];
    const starter = prompt || u.starter;
    queueMicrotask(() => {
      setUtility(u.id);
      setPrompt(starter);
      void sendPrompt(starter, u.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilities]);

  async function approveToMinuta() {
    if (!causaId) {
      setApproveMsg("Seleccione una causa para guardar la minuta.");
      return;
    }
    if (!chatId) {
      setApproveMsg(
        "Genere primero una respuesta del copiloto (se requiere chat guardado)."
      );
      return;
    }
    setApproveBusy(true);
    setApproveMsg("");
    try {
      const res = await fetch("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve-to-minuta",
          causaId,
          chatId,
          utilityLabel:
            utilities.find((u) => u.id === utility)?.label || utility,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.href) {
        setRequireApproval(false);
        setApproveMsg(data.error || "Este borrador ya fue aprobado.");
        setApproveHref(data.href);
        return;
      }
      if (!res.ok) {
        setApproveMsg(data.error || "No se pudo guardar la minuta");
        setApproveHref("");
        return;
      }
      setRequireApproval(false);
      setApproveMsg("Minuta guardada a partir del borrador aprobado.");
      setApproveHref(data.href || "");
      if (data.href) {
        setActions((prev) => [
          { label: "Ver minuta aprobada", href: data.href },
          ...prev.filter((a) => a.href !== data.href),
        ]);
      }
      if (data.chat?.messagesJson) {
        const parsed = safeJsonParse<ChatMessage[]>(data.chat.messagesJson, []);
        if (Array.isArray(parsed)) setMessages(parsed);
      } else if (chatId) {
        await loadChats(causaId || undefined);
      }
    } catch {
      setApproveMsg("Error de red al guardar la minuta");
      setApproveHref("");
    } finally {
      setApproveBusy(false);
    }
  }

  async function discardDraft() {
    setRequireApproval(false);
    setApproveMsg("");
    setApproveHref("");
    setMeta((m) =>
      m
        .replace(/ · Requiere aprobación humana/, "")
        .concat(m.includes("descartado") ? "" : " · Borrador descartado")
    );
    if (!chatId) {
      setReply("");
      return;
    }
    try {
      const res = await fetch("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard-draft", chatId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.chat) {
        setChatId(data.chat.id);
        const parsed = safeJsonParse<ChatMessage[]>(data.chat.messagesJson, []);
        setMessages(Array.isArray(parsed) ? parsed : []);
        const lastAssistant = [...(Array.isArray(parsed) ? parsed : [])]
          .reverse()
          .find((m) => m.role === "assistant");
        applyAssistantMeta(lastAssistant, data.chat.demoMode);
      }
    } catch {
      /* local discard already applied */
    }
  }

  async function estimatePlazo() {
    setPlazoPreview("");
    setPlazoVencimiento("");
    const res = await fetch("/api/integrations/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "estimate-plazo",
        desde: plazoDesde,
        dias: Number(plazoDias || 0),
        tipoComputo: plazoComputo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      setPlazoPreview(data.error);
      return;
    }
    setPlazoVencimiento(data.vencimiento || "");
    setPlazoPreview(
      [
        `Vencimiento estimado: ${data.vencimiento}`,
        `Urgencia: ${data.urgencia}`,
        `Días restantes: ${data.diasRestantes}`,
        data.disclaimer,
      ]
        .filter(Boolean)
        .join("\n")
    );
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

      {utility === "plazos" && (
        <section className="panel space-y-3 rounded-3xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            Cálculo interno de plazo
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Desde</label>
              <input
                className="input"
                type="date"
                value={plazoDesde}
                onChange={(e) => setPlazoDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Días</label>
              <input
                className="input"
                type="number"
                min={1}
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cómputo</label>
              <select
                className="select"
                value={plazoComputo}
                onChange={(e) =>
                  setPlazoComputo(
                    e.target.value === "corridos" ? "corridos" : "habiles"
                  )
                }
              >
                <option value="habiles">Hábiles</option>
                <option value="corridos">Corridos</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="btn btn-secondary w-full"
                type="button"
                onClick={() => void estimatePlazo()}
              >
                Estimar
              </button>
            </div>
          </div>
          {plazoPreview && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-white/70 p-3 font-sans text-sm">
                {plazoPreview}
              </pre>
              {plazoVencimiento && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setPrompt(
                        (p) =>
                          `${p.trim()}\n\nVencimiento estimado LexOpen: ${plazoVencimiento} (${plazoDias} días ${plazoComputo} desde ${plazoDesde}).`
                      )
                    }
                  >
                    Insertar en la instrucción
                  </button>
                  <Link
                    href={`/plazos?${new URLSearchParams({
                      ...(causaId ? { causaId } : {}),
                      desde: plazoDesde,
                      dias: plazoDias,
                      computo: plazoComputo,
                      fechaLimite: plazoVencimiento,
                    }).toString()}`}
                    className="btn btn-secondary"
                  >
                    Ir a crear plazo
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
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
                setRequireApproval(false);
                setApproveMsg("");
              }}
            >
              Nuevo
            </button>
          </div>
          {causaId && (
            <p className="mb-2 text-xs text-[var(--ink-soft)]/65">
              Filtrado por causa seleccionada
            </p>
          )}
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
          {messages.length === 0 && !reply && !busy && (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-3 text-sm text-[var(--ink-soft)]/80">
              Elija una utilidad y una causa (recomendado). El copiloto ancla la
              respuesta a plazos, movimientos, wiki y documentos indexados del
              host.
            </div>
          )}
          {busy && (
            <div className="animate-pulse space-y-2 rounded-2xl border border-[var(--line)] bg-white/60 p-4">
              <div className="h-3 w-1/3 rounded bg-[var(--line)]" />
              <div className="h-3 w-full rounded bg-[var(--line)]" />
              <div className="h-3 w-5/6 rounded bg-[var(--line)]" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Causa (contexto del estudio)
            </label>
            <select
              className="select"
              value={causaId}
              onChange={(e) => {
                const next = e.target.value;
                setCausaId(next);
                // Evitar reutilizar un hilo de otra causa
                setChatId("");
                setMessages([]);
                setReply("");
                setMeta("");
                setSources([]);
                setActions([]);
                setRequireApproval(false);
                setApproveMsg("");
                setApproveHref("");
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

      {(requireApproval || approveMsg) && reply && (
        <section className="panel space-y-3 rounded-3xl border border-[var(--copper)]/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--copper)]">
            Revisión humana
          </h2>
          <p className="text-sm text-[var(--ink-soft)]/80">
            Este borrador no es asesoría automática. Apruébelo para guardarlo
            como minuta de la causa, o descártelo.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={approveBusy || !causaId}
              onClick={() => void approveToMinuta()}
            >
              {approveBusy ? "Guardando…" : "Aprobar y guardar minuta"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={discardDraft}
            >
              Descartar borrador
            </button>
          </div>
          {!causaId && (
            <p className="text-xs text-[var(--ink-soft)]/70">
              Seleccione una causa para habilitar el guardado como minuta.
            </p>
          )}
          {approveMsg && (
            <p className="text-sm text-[var(--sea)]">
              {approveMsg}{" "}
              {approveHref && (
                <Link href={approveHref} className="underline">
                  Abrir minuta
                </Link>
              )}
            </p>
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
                  {m.discarded ? " · descartado" : ""}
                  {m.approvedMinutaId ? " · aprobado" : ""}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {m.content}
                </pre>
                {m.role === "assistant" &&
                  Array.isArray(m.sources) &&
                  m.sources.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {m.sources.slice(0, 8).map((s) => (
                        <li key={`${i}-${s.type}-${s.id}`}>
                          {s.href ? (
                            <Link
                              href={s.href}
                              className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] text-[var(--sea)]"
                            >
                              {s.type}: {s.label}
                            </Link>
                          ) : (
                            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px]">
                              {s.type}: {s.label}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
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
