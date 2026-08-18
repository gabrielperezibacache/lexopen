"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeJsonParse } from "@/lib/safe-json";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";
import type {
  AgentChat,
  ChatMessage,
  CausaOption,
  DocOption,
  SourceRef,
  Utility,
} from "@/components/agente/types";

export function useAgenteCopilot() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [utility, setUtility] = useState(sp.get("utility") || "copilot");
  const [causaId, setCausaId] = useState(sp.get("causaId") || "");
  const [documentoId, setDocumentoId] = useState(sp.get("documentoId") || "");
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [rutaPrefix, setRutaPrefix] = useState(sp.get("rutaPrefix") || "");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [allowDemoApproval, setAllowDemoApproval] = useState(false);
  const [lastSource, setLastSource] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    if (!causaId) {
      queueMicrotask(() => {
        if (!cancelled) setDocs([]);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      fetch(`/api/documentos?causaId=${encodeURIComponent(causaId)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: DocOption[]) => {
          if (cancelled) return;
          setDocs(
            Array.isArray(data)
              ? data.map((d) => ({
                  id: d.id,
                  nombre: d.nombre,
                  ruta: d.ruta ?? null,
                  tipo: d.tipo || "otro",
                  extractionStatus: d.extractionStatus ?? null,
                }))
              : []
          );
        })
        .catch(() => {
          if (!cancelled) setDocs([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [causaId]);

  const folderPrefixes = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) {
      if (!d.ruta) continue;
      const parts = d.ruta.replace(/\\/g, "/").split("/").filter(Boolean);
      if (parts[0]) set.add(parts[0]);
      if (parts.length > 1) set.add(parts.slice(0, 2).join("/"));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [docs]);

  const visibleDocs = useMemo(() => {
    if (!rutaPrefix) return docs;
    const needle = rutaPrefix.toLowerCase();
    return docs.filter((d) => {
      const ruta = (d.ruta || "").toLowerCase();
      return ruta === needle || ruta.startsWith(`${needle}/`);
    });
  }, [docs, rutaPrefix]);

  function selectUtility(u: Utility) {
    setUtility(u.id);
    setPrompt(u.starter);
  }

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 40)
    );
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

  async function resumeChat(chat: AgentChat) {
    setChatId(chat.id);
    if (chat.causaId) setCausaId(chat.causaId);
    let messagesJson = chat.messagesJson;
    if (!messagesJson) {
      const q = new URLSearchParams({ chats: "1", chatId: chat.id });
      if (chat.causaId) q.set("causaId", chat.causaId);
      const res = await fetch(`/api/integrations/hermes?${q.toString()}`);
      if (res.ok) {
        const full = (await res.json()) as AgentChat;
        messagesJson = full.messagesJson;
      }
    }
    const parsed = safeJsonParse<ChatMessage[]>(messagesJson || "[]", []);
    const list = Array.isArray(parsed) ? parsed : [];
    setMessages(list);
    const lastAssistant = [...list]
      .reverse()
      .find((m) => m.role === "assistant");
    const lastUser = [...list].reverse().find((m) => m.role === "user");
    const restoredUtility =
      lastAssistant?.utility || lastUser?.utility || utility;
    if (restoredUtility) setUtility(restoredUtility);
    applyAssistantMeta(lastAssistant, chat.demoMode);
    setLastSource(lastAssistant?.source || (chat.demoMode ? "demo" : ""));
    setAllowDemoApproval(false);
    setApproveMsg("");
    setApproveHref("");
    const scope = lastAssistant?.documentScope;
    if (scope?.rutaPrefix) setRutaPrefix(scope.rutaPrefix);
    else setRutaPrefix("");
    if (Array.isArray(scope?.documentoIds)) setSelectedDocIds(scope.documentoIds);
    else setSelectedDocIds([]);
  }

  async function sendPrompt(
    nextPrompt: string,
    nextUtility?: string,
    opts?: { chatIdOverride?: string | null; retrying?: boolean }
  ) {
    const u = nextUtility || utility;
    const activeChatId =
      opts && "chatIdOverride" in opts ? opts.chatIdOverride || "" : chatId;
    setBusy(true);
    setReply("");
    setMeta("");
    setSources([]);
    setActions([]);
    setRequireApproval(false);
    setApproveMsg("");
    setApproveHref("");
    try {
      const result = await apiMutation<{
        content?: string;
        note?: string;
        error?: string;
        code?: string;
        source?: string;
        sources?: SourceRef[];
        suggestedActions?: { label: string; href: string }[];
        requireApproval?: boolean;
        utility?: { id?: string; label?: string };
        chat?: { id: string; messagesJson: string; demoMode?: boolean };
      }>("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causaId: causaId || undefined,
          documentoId: documentoId || undefined,
          prompt: nextPrompt,
          chatId: activeChatId || undefined,
          utility: u,
          rutaPrefix: rutaPrefix || undefined,
          documentoIds: selectedDocIds.length ? selectedDocIds : undefined,
        }),
      });
      const data = result.ok ? result.data : result.data || {};
      if (!result.ok) {
        if (result.status === 409 && data.code === "causa_mismatch") {
          setChatId("");
          if (!opts?.retrying) {
            await sendPrompt(nextPrompt, u, {
              chatIdOverride: null,
              retrying: true,
            });
            return;
          }
          setReply(data.error || "Inicie un chat nuevo para esta causa");
          setMeta("Causa distinta al chat");
          setRequireApproval(false);
          return;
        }
        setReply(data.error || result.error || "Sin respuesta");
        setMeta("");
        setRequireApproval(false);
        return;
      }
      setReply(data.content || data.note || data.error || "Sin respuesta");
      setLastSource(data.source || "");
      setAllowDemoApproval(false);
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
      } else if (data.source === "error") {
        // Mostrar el error en el hilo aunque no se persista
        setMessages((prev) => {
          const next: ChatMessage[] = [
            ...prev,
            { role: "user", content: nextPrompt, utility: u },
            {
              role: "assistant",
              content:
                data.content || data.note || data.error || "Sin respuesta",
              source: "error",
              utility: u,
              requireApproval: false,
            },
          ];
          const pending = [...next]
            .reverse()
            .find(
              (m) =>
                m.role === "assistant" &&
                m.source !== "error" &&
                m.requireApproval &&
                !m.discarded &&
                !m.approvedMinutaId
            );
          if (pending) {
            setRequireApproval(true);
            setReply(pending.content);
            setLastSource(pending.source || "");
            setSources(Array.isArray(pending.sources) ? pending.sources : []);
          }
          return next;
        });
      }
      setMeta(
        [
          data.utility?.label ? `Modo: ${data.utility.label}` : null,
          data.source === "hermes"
            ? "Fuente: copiloto conectado"
            : data.source === "error"
              ? "Error del copiloto"
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
      const result = await apiMutation<{
        href?: string;
        error?: string;
        chat?: { messagesJson?: string };
      }>("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve-to-minuta",
          causaId,
          chatId,
          allowDemoApproval,
          utilityLabel:
            utilities.find((u) => u.id === utility)?.label || utility,
        }),
      });
      if (!result.ok) {
        if (result.status === 409) {
          setRequireApproval(false);
          setApproveMsg(result.error || "Este borrador ya fue aprobado.");
          setApproveHref("");
          return;
        }
        setApproveMsg(result.error || "No se pudo guardar la minuta");
        setApproveHref("");
        return;
      }
      const data = result.data;
      setRequireApproval(false);
      setApproveMsg("Minuta guardada a partir del borrador aprobado.");
      setApproveHref(data.href || "");
      if (data.href) {
        setActions((prev) => [
          { label: "Ver minuta aprobada", href: data.href! },
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
      const result = await apiMutation<{
        chat?: { id: string; messagesJson?: string; demoMode?: boolean };
      }>("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard-draft", chatId }),
      });
      if (result.ok && result.data.chat) {
        setChatId(result.data.chat.id);
        const parsed = safeJsonParse<ChatMessage[]>(
          result.data.chat.messagesJson,
          []
        );
        setMessages(Array.isArray(parsed) ? parsed : []);
        const lastAssistant = [...(Array.isArray(parsed) ? parsed : [])]
          .reverse()
          .find((m) => m.role === "assistant");
        applyAssistantMeta(lastAssistant, result.data.chat.demoMode);
      }
    } catch {
      /* local discard already applied */
    }
  }

  async function estimatePlazo() {
    setPlazoPreview("");
    setPlazoVencimiento("");
    const result = await apiMutation<{
      error?: string;
      vencimiento?: string;
      urgencia?: string;
      diasRestantes?: number;
      disclaimer?: string;
    }>("/api/integrations/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "estimate-plazo",
        desde: plazoDesde,
        dias: Number(plazoDias || 0),
        tipoComputo: plazoComputo,
      }),
    });
    const data = result.ok ? result.data : result.data || {};
    const errMsg = data.error || (!result.ok ? result.error : undefined);
    if (!result.ok || errMsg) {
      setPlazoPreview(errMsg || "Error");
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

  return {
    t,
    sp,
    causas,
    utilities,
    utility,
    setUtility,
    causaId,
    setCausaId,
    documentoId,
    setDocumentoId,
    docs,
    rutaPrefix,
    setRutaPrefix,
    selectedDocIds,
    setSelectedDocIds,
    allowDemoApproval,
    setAllowDemoApproval,
    lastSource,
    prompt,
    setPrompt,
    reply,
    meta,
    sources,
    actions,
    setActions,
    requireApproval,
    chatId,
    setChatId,
    chats,
    messages,
    setMessages,
    busy,
    approveBusy,
    approveMsg,
    setApproveMsg,
    approveHref,
    setApproveHref,
    setReply,
    setMeta,
    setSources,
    setRequireApproval,
    setDocs,
    plazoDesde,
    setPlazoDesde,
    plazoDias,
    setPlazoDias,
    plazoComputo,
    setPlazoComputo,
    plazoPreview,
    plazoVencimiento,
    folderPrefixes,
    visibleDocs,
    selectUtility,
    toggleDoc,
    resumeChat,
    sendPrompt,
    onSubmit,
    approveToMinuta,
    discardDraft,
    estimatePlazo,
    loadChats,
  };
}

export type AgenteCopilotState = ReturnType<typeof useAgenteCopilot>;
