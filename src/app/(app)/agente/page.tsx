"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type CausaOption = { id: string; titulo: string; rit: string | null };

function AgenteInner() {
  const sp = useSearchParams();
  const [causas, setCausas] = useState<CausaOption[]>([]);
  const [causaId, setCausaId] = useState(sp.get("causaId") || "");
  const [prompt, setPrompt] = useState(
    "Redacta un memorial de alegatos preliminar y cita jurisprudencia útil para Chile."
  );
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/causas")
      .then((r) => r.json())
      .then((data: CausaOption[]) => setCausas(data))
      .catch(() => setCausas([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReply("");
    setMeta("");
    const res = await fetch("/api/integrations/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ causaId: causaId || undefined, prompt }),
    });
    const data = await res.json();
    setBusy(false);
    setReply(data.content || data.error || "Sin respuesta");
    setMeta(
      [
        data.source === "hermes" ? "Fuente: Hermes Agent" : "Fuente: demo local",
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
          Integra el API server OpenAI-compatible de Hermes. Las acciones sensibles quedan
          sujetas a aprobación del abogado.
        </p>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Causa (contexto)</label>
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
          {busy ? "Consultando…" : "Enviar a Hermes"}
        </button>
      </form>

      {(reply || meta) && (
        <section className="panel rounded-3xl p-6">
          {meta && <p className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--copper)]">{meta}</p>}
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{reply}</pre>
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
