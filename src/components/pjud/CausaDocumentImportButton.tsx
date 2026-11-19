"use client";

import { useEffect, useRef, useState } from "react";
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

export function CausaDocumentImportButton(props: Props) {
  return <ImportButton key={props.causaId} {...props} />;
}

function ImportButton({ causaId, className }: Props) {
  const router = useRouter();
  const endpoint = `/api/causas/${causaId}/documentos/import`;
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [readError, setReadError] = useState("");
  const [startError, setStartError] = useState("");
  const observedRunning = useRef(false);

  useEffect(() => {
    if (starting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function readStatus() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.redirected || [401, 403, 404, 409].includes(response.status)) {
          setStatus(null);
          setReadError(body?.error || "El estado de la descarga ya no está disponible.");
          return;
        }
        if (!response.ok || body?.status?.causaId !== causaId) throw new Error();
        const next: ImportStatus = body.status;
        setReadError("");
        setStatus(next);
        if (next.status === "running") {
          setStartError("");
          observedRunning.current = true;
          timer = setTimeout(readStatus, 2000);
        } else if (observedRunning.current) {
          observedRunning.current = false;
          router.refresh();
        }
      } catch {
        if (controller.signal.aborted) return;
        setReadError("No se pudo consultar la descarga. Volviendo a conectar…");
        timer = setTimeout(readStatus, 5000);
      }
    }
    void readStatus();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [causaId, endpoint, router, starting]);

  async function startImport() {
    setStarting(true);
    setStartError("");
    const result = await apiMutation<{ status: ImportStatus }>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (result.ok) {
      setStatus(result.data.status);
      observedRunning.current = result.data.status.status === "running";
    } else {
      setStartError(result.error || "No se pudo iniciar la descarga.");
    }
    setStarting(false);
  }

  const error = readError || startError;
  const running = starting || status?.status === "running";
  const progress =
    status && status.total > 0
      ? `${Math.min(status.completed, status.total)}/${status.total}`
      : null;

  return (
    <div className={className}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={running || !status}
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
