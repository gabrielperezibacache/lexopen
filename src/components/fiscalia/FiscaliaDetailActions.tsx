"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DeadlineOptions } from "@/components/DeadlineOptions";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { hasUnconfirmedOutcome } from "@/lib/command-status";
import { Dialog } from "@/components/ui/Dialog";
import { FiscaliaEditor, type FiscaliaItem } from "./FiscaliaWorkspace";

export function FiscaliaDetailActions({ item, userId }: { item: FiscaliaItem; userId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "correct" | "attach" | null>(null);
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [selected, setSelected] = useState<{ documentoId: string; version?: number }>({ documentoId: "" });
  const keys = useRef(createSubmissionKeys(undefined, `fiscalia-detail:${userId}:${item.id}`));
  const attempt = useRef<{ key: string; payload: Record<string, unknown> } | null>(null);
  const presented = ["submitted", "answered", "closed"].includes(item.status);
  function open(next: typeof mode) {
    if (saving || uncertain) return;
    setError(""); setConflict(false); setMessage(""); setSelected({ documentoId: "" }); setMode(next);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || conflict) return;
    if (!uncertain || !attempt.current) {
      const form = new FormData(event.currentTarget);
      const payload = mode === "correct"
        ? { action: mode, expectedUpdatedAt: item.updatedAt, folio: form.get("folio"), submittedAt: form.get("submittedAt"), reason: form.get("reason") }
        : { action: "attach", expectedUpdatedAt: item.updatedAt, evidenceKind: form.get("evidenceKind"), ...selected };
      attempt.current = { key: keys.current.forPayload(payload), payload };
    }
    setSaving(true); setError("");
    const pending = attempt.current;
    const result = await apiMutation<{ eventId: string }>(`/api/fiscalia/solicitudes/${encodeURIComponent(item.id)}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.key }, body: JSON.stringify(pending.payload),
    });
    setSaving(false);
    if (!result.ok || !result.data.eventId) {
      const unknown = result.ok || hasUnconfirmedOutcome(result);
      setUncertain(unknown);
      setConflict(!result.ok && !unknown && result.status === 409);
      setError(unknown ? "El guardado sigue sin confirmación. Comprueba el resultado con los mismos datos." : result.ok ? "" : result.error);
      return;
    }
    keys.current.complete(pending.payload); attempt.current = null;
    setMode(null); setUncertain(false); setMessage(mode === "attach" ? "Respaldo vinculado." : "Rectificación registrada.");
    router.refresh();
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {!["closed", "cancelled"].includes(item.status) && <button type="button" className="btn btn-primary" onClick={() => open("edit")}>Editar seguimiento</button>}
      {presented && <><button type="button" className="btn btn-secondary" onClick={() => open("attach")}>Vincular respaldo</button><button type="button" className="btn btn-ghost" onClick={() => open("correct")}>Rectificar presentación</button></>}
    </div>
    {message && <p role="status">{message}</p>}
    <Dialog open={mode !== null} title={mode === "edit" ? "Editar seguimiento" : mode === "correct" ? "Rectificar presentación" : "Vincular respaldo"} onClose={() => open(null)}>
      {mode === "edit" && <FiscaliaEditor item={item} userId={userId} initialCaseId={item.causaId} causes={[{ ...item.causa, ruc: item.ruc, canEdit: true }]} onClose={() => open(null)} onSaved={() => { setMode(null); setMessage("Seguimiento guardado."); router.refresh(); }} />}
      {(mode === "attach" || mode === "correct") && <form onSubmit={save} className="space-y-4 p-4">
        <fieldset disabled={saving || uncertain || conflict} className="space-y-3">
          {mode === "correct" ? <>
            <label className="block">Folio corregido<input name="folio" className="input" required maxLength={120} defaultValue={item.folio || ""} /></label>
            <label className="block">Fecha de presentación corregida<input type="date" name="submittedAt" className="input" required defaultValue={item.submittedAt?.slice(0, 10)} /></label>
            <label className="block">Motivo de rectificación<textarea name="reason" className="textarea" required minLength={3} maxLength={2000} /></label>
          </> : <>
            <label className="block">Tipo de respaldo<select name="evidenceKind" className="select"><option value="receipt">Comprobante de presentación</option>{item.answeredAt && <option value="answer">Respuesta de Fiscalía</option>}</select></label>
            <DeadlineOptions kind="document" causaId={item.causaId} value={selected.documentoId} onChange={(documentoId, version) => setSelected({ documentoId, version })} label="Documento del expediente" empty="Seleccionar documento" required />
          </>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {conflict ? <button type="button" className="btn btn-secondary" onClick={() => { open(null); router.refresh(); }}>Actualizar ficha</button>
          : <button className="btn btn-primary" disabled={saving || mode === "attach" && !selected.version} type="submit">{saving ? "Guardando…" : uncertain ? "Comprobar guardado" : mode === "correct" ? "Guardar rectificación" : "Guardar respaldo"}</button>}
      </form>}
    </Dialog>
  </div>;
}
