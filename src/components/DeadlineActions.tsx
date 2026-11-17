"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { CompletionSupportFields } from "./CompletionSupportFields";
import type { CompletionSupport } from "@/lib/deadlines/schemas";
import type { readDeadlineHistory } from "@/lib/deadlines/completion";
type History = Awaited<ReturnType<typeof readDeadlineHistory>>;
export function DeadlineActions({
  id,
  estado,
  version,
  causaId,
  canEdit,
  canClose,
}: {
  id: string;
  estado: string;
  version: string;
  causaId: string | null;
  canEdit: boolean;
  canClose: boolean;
}) {
  const router = useRouter(),
    keys = useRef(createSubmissionKeys()),
    [closing, setClosing] = useState(false),
    [support, setSupport] = useState<CompletionSupport>({
      kind: "manual",
      justification: "",
    }),
    [history, setHistory] = useState<History | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(after?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/plazos/${id}/history${after ? `?after=${after}` : ""}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "No se pudo consultar el historial");
      setHistory((old) =>
        after && old ? { ...d, events: [...old.events, ...d.events] } : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(state: string) {
    const payload = {
      id,
      estado: state,
      expectedVersion: version,
      ...(state === "cumplido" ? { completion: support } : {}),
    };
    setBusy(true);
    setError("");
    const r = await apiMutation("/api/plazos", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": keys.current.forPayload(payload),
      },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "No se pudo actualizar el plazo");
      return;
    }
    keys.current.complete(payload);
    setClosing(false);
    setSupport({ kind: "manual", justification: "" });
    await load();
    router.refresh();
  }
  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && estado !== "pendiente" && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void change("pendiente")}
          >
            Reabrir plazo
          </button>
        )}
        {canClose && estado !== "cumplido" && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setClosing(!closing)}
          >
            Registrar cumplimiento
          </button>
        )}
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void load()}
        >
          Ver historial del plazo
        </button>
      </div>
      {closing && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void change("cumplido");
          }}
        >
          <CompletionSupportFields
            value={support}
            onChange={setSupport}
            causaId={causaId}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy}>
              Confirmar cumplimiento
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setClosing(false)}
            >
              Volver
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-[var(--danger)]">
          {error}{" "}
          <button className="underline" onClick={() => router.refresh()}>
            Recargar datos
          </button>
        </p>
      )}
      {history && (
        <section aria-label="Historial del plazo" className="space-y-2 text-sm">
          {history.legacy && (
            <p>Cumplimiento histórico: sin respaldo ni autor registrados.</p>
          )}
          {!history.events.length && !history.legacy && (
            <p>Sin cambios de estado registrados.</p>
          )}
          {history.events.map((e) => (
            <article
              key={e.id}
              className="break-words rounded-xl border border-[var(--line)] p-3"
            >
              <p>
                {e.fromEstado || "Nuevo"} → {e.toEstado} · {e.actor} ·{" "}
                {new Date(e.createdAt).toLocaleString("es-CL")}
              </p>
              {e.supportKind === "manual" && (
                <p>
                  Justificación manual:{" "}
                  {e.justification || "Respaldo no disponible"}
                </p>
              )}
              {e.document && (
                <a className="underline" href={e.document.href}>
                  Documento: {e.document.name} · v{e.document.version}
                </a>
              )}
              {e.documentUnavailable && (
                <p>
                  Documento de respaldo no disponible con los permisos actuales.
                </p>
              )}
            </article>
          ))}
          {history.next && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void load(history.next!)}
            >
              Más cambios
            </button>
          )}
        </section>
      )}
    </div>
  );
}
