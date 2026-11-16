"use client";
import { useId } from "react";
import type { CompletionSupport } from "@/lib/deadlines/schemas";
import { DeadlineOptions } from "./DeadlineOptions";
export function CompletionSupportFields({
  value,
  onChange,
  causaId,
}: {
  value: CompletionSupport;
  onChange: (v: CompletionSupport) => void;
  causaId?: string | null;
}) {
  const id = useId();
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-[var(--line)] p-3">
      <legend className="px-1 text-sm font-medium">
        Respaldo del cumplimiento
      </legend>
      <p className="text-sm text-[var(--muted)]">
        Registro interno del estudio. No acredita la aceptación del tribunal.
      </p>
      <label htmlFor={id} className="block text-sm">
        Tipo de respaldo
      </label>
      <select
        id={id}
        className="select"
        value={value.kind}
        onChange={(e) =>
          onChange(
            e.target.value === "manual"
              ? { kind: "manual", justification: "" }
              : { kind: "document", documentoId: "", version: 1 },
          )
        }
      >
        <option value="manual">Justificación manual</option>
        <option value="document">Documento o comprobante</option>
      </select>
      {value.kind === "manual" ? (
        <label className="block text-sm">
          Justificación
          <textarea
            required
            maxLength={2000}
            className="input mt-1 min-h-24"
            value={value.justification}
            onChange={(e) =>
              onChange({ ...value, justification: e.target.value })
            }
          />
        </label>
      ) : (
        <DeadlineOptions
          kind="document"
          causaId={causaId}
          label="Documento de la causa"
          empty="Busque y seleccione un documento"
          required
          value={value.documentoId}
          onChange={(documentoId, version) =>
            onChange({ kind: "document", documentoId, version: version || 1 })
          }
        />
      )}
    </fieldset>
  );
}
