"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function PdfEvidencePagePreview({ versionId, pageNumber, name }: { versionId: string; pageNumber: number; name: string }) {
  const [retry, setRetry] = useState(0);
  const key = `${versionId}:${pageNumber}:${retry}`;
  const [response, setResponse] = useState<{ key: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    fetch(`/api/evidence/versions/${versionId}/pages/${pageNumber}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo abrir esta página");
        if (!res.headers.get("content-type")?.startsWith("image/png")) throw new Error("La página recibida no es una imagen verificable");
        return res.blob();
      }).then(blob => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob); setResponse({ key, url });
      }).catch(error => { if (!controller.signal.aborted) setResponse({ key, error: error.message }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [versionId, pageNumber, key]);
  const current = response?.key === key ? response : null;
  return <figure className="min-w-0 space-y-3">
    <figcaption className="text-sm font-medium">Página {pageNumber} del original registrado</figcaption>
    {!current && <p role="status" className="text-sm text-[var(--ink-soft)]">Abriendo página…</p>}
    {current?.error && <div role="alert" className="space-y-3 text-sm"><p>{current.error}</p><button type="button" className="btn btn-secondary" onClick={() => setRetry(n => n + 1)}>Reintentar página</button></div>}
    {current?.url && <Image unoptimized src={current.url} alt={`Página ${pageNumber} de ${name}`} width={1600} height={2200} className="h-auto w-full rounded-lg border border-[var(--line)]" />}
  </figure>;
}
