"use client";

import { useState } from "react";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

export function DocumentoAiActions({
  documentoId,
  causaId,
}: {
  documentoId: string;
  causaId?: string | null;
}) {
  const [note, setNote] = useState("");

  function onClassify(result: AiActionResponse) {
    const data = result.data as {
      tipo?: string;
      confidencial?: boolean;
      privilegio?: boolean;
      motivo?: string;
    } | null;
    if (!data) {
      setNote("Sin clasificación estructurada.");
      return;
    }
    setNote(
      [
        data.tipo ? `Tipo: ${data.tipo}` : null,
        data.confidencial ? "confidencial" : null,
        data.privilegio ? "privilegio" : null,
        data.motivo || null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <AiAssist
        action="documento.resumir"
        documentoId={documentoId}
        causaId={causaId || undefined}
        label="Resumir"
        showNotes={false}
      />
      <AiAssist
        action="documento.clasificar"
        documentoId={documentoId}
        causaId={causaId || undefined}
        label="Clasificar"
        showPreview={false}
        showNotes={false}
        onResult={onClassify}
      />
      {note && <p className="text-xs text-[var(--copper)]">{note}</p>}
    </div>
  );
}
