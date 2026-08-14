"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

type ImportStatus = {
  causaId: string;
  status: "idle" | "running" | "done" | "failed";
  phase: "idle" | "scrape" | "download" | "done";
  total: number;
  completed: number;
  saved: number;
  skipped: number;
  failed: number;
  currentLabel: string | null;
  note: string | null;
  delayMs: number;
  maxPerRun: number;
  startedAt: string | null;
  finishedAt: string | null;
};

type Props = {
  causaId: string;
  className?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CausaDocumentImportButton({ causaId, className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetch(`/api/causas/${causaId}/documentos/import`)
        .then((r) => r.json())
        .then((body) => {
          if (!cancelled && body?.status) setStatus(body.status);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [causaId]);

  async function pollUntilDone() {
    for (let i = 0; i < 180; i += 1) {
      await sleep(2000);
      const res = await fetch(`/api/causas/${causaId}/documentos/import`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) continue;
      const st = body.status as ImportStatus | undefined;
      if (st) setStatus(st);
      if (st && st.status !== "running") return st;
    }
    return null;
  }

  async function startImport() {
    setBusy(true);
    setError("");
    const result = await apiMutation<{
      status?: ImportStatus;
      started?: boolean;
      alreadyRunning?: boolean;
      error?: string;
    }>(`/api/causas/${causaId}/documentos/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error || "No se pudo iniciar la descarga.");
      if (result.status === 409) {
        const st = await fetch(`/api/causas/${causaId}/documentos/import`)
          .then((r) => r.json())
          .catch(() => null);
        if (st?.status) setStatus(st.status);
      }
      return;
    }
    if (result.data.status) setStatus(result.data.status);

    if (result.data.status?.status === "running" || result.data.started) {
      const final = await pollUntilDone();
      if (final) setStatus(final);
      router.refresh();
    }
    setBusy(false);
  }

  const running = busy || status?.status === "running";
  const progress =
    status && status.total > 0
      ? `${Math.min(status.completed, status.total)}/${status.total}`
      : null;

  return (
    <div className={className}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={running}
        onClick={() => void startImport()}
        title="Descarga secuencial desde OJV e importa cada PDF a LexOpen de inmediato (expediente + timeline)"
      >
        {running
          ? progress
            ? `Importando ${progress}…`
            : "Importando documentos…"
          : "Importar documentos PJUD"}
      </button>
      {(status?.note || error || (running && status?.currentLabel)) && (
        <p
          className={`mt-2 text-xs ${
            error || status?.status === "failed"
              ? "text-rose-800"
              : "text-[var(--ink-soft)]/70"
          }`}
          role="status"
        >
          {error ||
            (running && status?.currentLabel
              ? `${status.currentLabel}${status.note ? ` · ${status.note}` : ""}`
              : status?.note)}
          {status && status.status !== "idle" && !error ? (
            <span className="mt-1 block text-[var(--ink-soft)]/55">
              Cola secuencial · máx. {status.maxPerRun} por corrida · pausa{" "}
              {status.delayMs} ms entre descargas
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
