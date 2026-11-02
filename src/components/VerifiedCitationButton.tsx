"use client";
import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";

export function VerifiedCitationButton({ fragmentId, quote, title, href }: { fragmentId: string; quote: string; title: string; href: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [manual, setManual] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    setBusy(true); setMessage("");
    const result = await apiMutation<{ verified: boolean }>("/api/research/citations/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "legal", fragmentId, quote }) });
    setBusy(false);
    if (!result.ok || !result.data.verified) { setMessage(result.ok ? "La cita no coincide con esta versión. Vuelva a cargar la fuente." : result.error); return; }
    const text = `“${quote}”\n${title}\n${new URL(href, window.location.origin).href}`;
    try { if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable"); await navigator.clipboard.writeText(text); setMessage("Cita del texto registrado copiada."); }
    catch { setManual(text); setMessage("La cita coincide con el texto registrado. Seleccione y copie el texto."); }
  }
  return <div className="space-y-2"><button type="button" className="btn btn-ghost" disabled={busy} onClick={copy}><Copy size={16} aria-hidden="true" />{busy ? "Comprobando…" : "Copiar cita"}</button>{message && <p role="status" className="text-sm">{message}</p>}{manual && <><label className="sr-only" htmlFor={`copy-${fragmentId}`}>Cita comprobada</label><textarea ref={ref} id={`copy-${fragmentId}`} className="textarea w-full" value={manual} readOnly rows={4} onFocus={() => ref.current?.select()} /></>}</div>;
}
