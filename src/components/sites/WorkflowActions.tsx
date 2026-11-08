"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";

type Props =
  | { advance: true; instanceId: string; currentStep: number; workflowId?: never; active?: boolean }
  | { advance?: false; workflowId: string; instanceId?: never; currentStep?: never; active?: boolean };
type Action = "approve" | "reject" | "start";
type Payload = { action: "start"; workflowId: string }
  | { action: "advance"; instanceId: string; decision: "approve" | "reject"; expectedStep: number };

export function WorkflowActions({ workflowId, instanceId, advance, currentStep, active = true }: Props) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const [loadingAction, setLoadingAction] = useState<Action | null>(null);
  const [retryAction, setRetryAction] = useState<Action | null>(null);
  const [confirmedStep, setConfirmedStep] = useState<string | null>(null);
  const [error, setError] = useState("");
  const submission = useRef(createSubmissionKeys(undefined, `workflow:${instanceId || workflowId}:${currentStep ?? "start"}`));
  const pending = useRef<{ key: string; payload: Payload } | null>(null);
  const inFlight = useRef(false);
  const stepIdentity = `${instanceId}:${currentStep}`;
  const busy = loadingAction !== null || refreshing || (advance && confirmedStep === stepIdentity);

  async function send(action: Action) {
    if (inFlight.current || busy || (retryAction && retryAction !== action) || (action === "start" && !active)) return;
    const payload: Payload = advance
      ? { action: "advance", instanceId: instanceId!, decision: action as "approve" | "reject", expectedStep: currentStep! }
      : { action: "start", workflowId: workflowId! };
    if (!retryAction || !pending.current) pending.current = { payload, key: submission.current.forPayload(payload) };
    const attempt = pending.current;
    inFlight.current = true;
    setLoadingAction(action);
    setError("");
    const result = await apiMutation<{ id?: string; status?: string; currentStep?: number }>("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
      body: JSON.stringify(attempt.payload),
    });
    inFlight.current = false;
    setLoadingAction(null);
    if (!result.ok) {
      const uncertain = retryAction !== null || result.status === 0 || result.status === 408 || result.status >= 500;
      if (uncertain) setRetryAction(action);
      setError(uncertain ? "No se pudo confirmar el flujo. Reintente la misma acción para comprobarla." : result.error);
      return;
    }
    if (!result.data?.id || !result.data.status || !Number.isInteger(result.data.currentStep)) {
      setRetryAction(action); setError("El servidor no confirmó el flujo. Reintente la misma acción."); return;
    }
    submission.current.complete(attempt.payload);
    pending.current = null;
    setRetryAction(null);
    if (attempt.payload.action === "advance") setConfirmedStep(`${attempt.payload.instanceId}:${attempt.payload.expectedStep}`);
    refresh(() => router.refresh());
  }

  return (
    <div className="min-w-0 max-w-full">
      {advance ? (
        <div className="flex flex-wrap gap-1">
          <button className="btn btn-ghost" type="button" disabled={busy || retryAction === "reject"} onClick={() => void send("approve")}>
            {loadingAction === "approve" ? "Aprobando…" : retryAction === "approve" ? "Reintentar aprobación" : "Aprobar"}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy || retryAction === "approve"} onClick={() => void send("reject")}>
            {loadingAction === "reject" ? "Rechazando…" : retryAction === "reject" ? "Reintentar rechazo" : "Rechazar"}
          </button>
        </div>
      ) : (
        <button className="btn btn-secondary" type="button" disabled={busy || !active} onClick={() => void send("start")}>
          {!active ? "Desactivado" : loadingAction === "start" ? "Iniciando…" : retryAction === "start" ? "Reintentar inicio" : "Iniciar"}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
