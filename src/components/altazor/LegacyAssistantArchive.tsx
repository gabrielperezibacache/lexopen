"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import "./AltazorHome.css";
type Chat = { id: string; title: string; causaId: string | null; updatedAt: string };
type Message = { role?: string; content?: string; discarded?: boolean };
/** Read-only legacy history uses the original owner and live-source guarded API. */
export function LegacyAssistantArchive() {
  const search = useSearchParams(), [chats,setChats] = useState<Chat[]>([]), [id,setId] = useState(search.get("chatId") || ""), [messages,setMessages] = useState<Message[]>([]), [error,setError] = useState(""), [loading,setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/integrations/hermes?chats=1", {signal:controller.signal,cache:"no-store"}).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || "No se pudo abrir el archivo"); if (!controller.signal.aborted) setChats(data); }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); },[]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void fetch(`/api/integrations/hermes?chats=1&chatId=${encodeURIComponent(id)}`, {signal:controller.signal,cache:"no-store"}).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || "La conversación ya no está disponible"); const parsed = JSON.parse(data.messagesJson); if (!Array.isArray(parsed)) throw Error("No se pudo leer esta conversación"); if (!controller.signal.aborted) setMessages(parsed.slice(-100).filter((item:Message) => ["user","assistant"].includes(item.role || "") && typeof item.content === "string" && !item.discarded)); }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort();
  },[id]);
  return <div className="altazor-home"><header className="altazor-header"><div><h2>Conversaciones anteriores</h2><p>Tu archivo de Copiloto se conserva para consulta. Continúa el trabajo en ALTAZOR seleccionando de nuevo las fuentes vigentes.</p></div></header><Link href="/inicio" className="btn btn-outline">Volver a ALTAZOR</Link><section className="altazor-conversation"><label>Conversación<select value={id} onChange={event => { setMessages([]); setError(""); setLoading(Boolean(event.target.value)); setId(event.target.value); }}><option value="">Elegir conversación guardada</option>{chats.map(chat => <option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label>{error && <p role="alert" className="altazor-error">{error}</p>}{loading ? <p role="status">Recuperando archivo…</p> : messages.length ? <ol className="altazor-turns">{messages.map((message,index) => <li key={index} className={message.role === "user" ? "altazor-user-message" : "altazor-answer"}><strong>{message.role === "user" ? "Tú" : "Copiloto · archivo"}</strong><p className="altazor-prose">{message.content?.slice(0,32000)}</p></li>)}</ol> : <p className="altazor-muted">{id ? "No hay mensajes disponibles en esta conversación." : "Elige una conversación para leerla."}</p>}</section></div>;
}
