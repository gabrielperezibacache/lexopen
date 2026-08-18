"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

type Mode = "rol" | "rut";

export function PjudQuickAddPanel() {
  const router = useRouter();
  const rolFormRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("rol");
  const [tribunales, setTribunales] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rutHits, setRutHits] = useState<
    Array<{ rit: string; tribunal: string; caratula?: string | null }>
  >([]);
  const [preview, setPreview] = useState<{
    count?: number;
    sala?: string | null;
    note?: string;
    sample?: Array<{ titulo: string; fecha: string; esReceptor?: boolean }>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/pjud/lookup")
      .then((r) => r.json())
      .then((d) => setTribunales(d.tribunales || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("alta") === "1") {
      document.getElementById("alta-rol")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  async function submitRol(action: "add-rol" | "preview-rol") {
    const form = rolFormRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    setBusy(true);
    setMsg("");
    if (action === "preview-rol") setPreview(null);
    const fd = new FormData(form);
    const payload = {
      action,
      rit: fd.get("rit"),
      tribunal: fd.get("tribunal"),
      titulo: fd.get("titulo") || undefined,
      syncNow: true,
    };
    if (action === "preview-rol") {
      const res = await fetch("/api/pjud/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setMsg(data.error || "No se pudo previsualizar");
        return;
      }
      setPreview(data);
      setMsg(
        `Preview ${data.provider || ""}: ${data.count ?? 0} movimientos${
          data.sala ? ` · sala ${data.sala}` : ""
        }`
      );
      return;
    }
    const result = await apiMutation<{
      note?: string;
      sync?: { inserted?: number; status?: string };
      causaId?: string;
    }>("/api/pjud/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error || "No se pudo agregar la causa");
      return;
    }
    const data = result.data;
    setMsg(
      `${data.note} Sync: +${data.sync?.inserted ?? 0} movimientos (${data.sync?.status || "—"})`
    );
    if (data.causaId) router.push(`/causas/${data.causaId}`);
  }

  async function onBuscarRut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setRutHits([]);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/pjud/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buscar-rut", rut: fd.get("rut") }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Búsqueda por RUT falló");
      return;
    }
    setRutHits(data.causas || []);
    setMsg(`${data.count || 0} causa(s) encontradas.`);
  }

  async function addFromHit(hit: {
    rit: string;
    tribunal: string;
    caratula?: string | null;
  }) {
    setBusy(true);
    setMsg("");
    const result = await apiMutation<{ causaId?: string }>("/api/pjud/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add-rol",
        rit: hit.rit,
        tribunal: hit.tribunal,
        titulo: hit.caratula || hit.rit,
        syncNow: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error || "No se pudo agregar");
      return;
    }
    if (result.data.causaId) router.push(`/causas/${result.data.causaId}`);
  }

  return (
    <section id="alta-rol" className="panel space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Alta rápida PJUD</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Flujo CausaMonitor: agregar por ROL o buscar por RUT, activar
            monitoreo y sincronizar de inmediato.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${
              mode === "rol"
                ? "border-[var(--sea)] bg-[var(--sea)]/10"
                : "border-[var(--line)]"
            }`}
            onClick={() => setMode("rol")}
          >
            Por ROL
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${
              mode === "rut"
                ? "border-[var(--sea)] bg-[var(--sea)]/10"
                : "border-[var(--line)]"
            }`}
            onClick={() => setMode("rut")}
          >
            Por RUT
          </button>
        </div>
      </div>

      {mode === "rol" ? (
        <form ref={rolFormRef} className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="input"
            name="rit"
            required
            placeholder="ROL/RIT (C-100-2024)"
          />
          <input
            className="input sm:col-span-2"
            name="tribunal"
            required
            list="pjud-tribunales"
            placeholder="Tribunal (escriba para buscar…)"
            autoComplete="off"
          />
          <datalist id="pjud-tribunales">
            {tribunales.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              disabled={busy}
              type="button"
              onClick={() => void submitRol("preview-rol")}
            >
              Preview
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              type="button"
              onClick={() => void submitRol("add-rol")}
            >
              {busy ? "…" : "Agregar y sync"}
            </button>
          </div>
          <input
            className="input sm:col-span-2 lg:col-span-4"
            name="titulo"
            placeholder="Carátula opcional"
          />
        </form>
      ) : (
        <form onSubmit={onBuscarRut} className="flex flex-wrap gap-2">
          <input
            className="input w-full max-w-xs"
            name="rut"
            required
            placeholder="RUT litigante (12.345.678-9)"
          />
          <button className="btn btn-secondary" disabled={busy} type="submit">
            {busy ? "Buscando…" : "Buscar causas"}
          </button>
        </form>
      )}

      {msg && (
        <p className="text-sm text-[var(--ink-soft)]/80" role="status">
          {msg}
        </p>
      )}

      {preview?.sample && preview.sample.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--ink-soft)]/75">
          {preview.sample.slice(0, 5).map((row, idx) => (
            <li key={`${row.fecha}-${idx}`}>
              {row.fecha} — {row.titulo}
              {row.esReceptor ? " (receptor)" : ""}
            </li>
          ))}
        </ul>
      )}

      {rutHits.length > 0 && (
        <ul className="space-y-2 text-sm">
          {rutHits.map((hit) => (
            <li
              key={`${hit.rit}-${hit.tribunal}`}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/60 pb-2"
            >
              <div>
                <div className="font-medium">{hit.rit}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {hit.tribunal}
                  {hit.caratula ? ` · ${hit.caratula}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => addFromHit(hit)}
              >
                Agregar
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--ink-soft)]/60">
        El tribunal se puede escribir libremente (coincida con OJV). También puede usar{" "}
        <Link href="/causas/mis-causas" className="text-[var(--sea)]">
          ClaveÚnica
        </Link>
        .
      </p>
    </section>
  );
}
