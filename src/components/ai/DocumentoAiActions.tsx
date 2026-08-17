"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { apiMutation } from "@/lib/api-mutation";

export function DocumentoAiActions({
  documentoId,
  causaId,
}: {
  documentoId: string;
  causaId?: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onClassify(aiResult: AiActionResponse) {
    const data = aiResult.data as {
      tipo?: string;
      confidencial?: boolean;
      privilegio?: boolean;
      motivo?: string;
    } | null;
    if (!data) {
      setNote("Sin clasificación estructurada.");
      return;
    }
    setBusy(true);
    const result = await apiMutation(`/api/documentos/${documentoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(data.tipo ? { tipo: data.tipo } : {}),
        ...(typeof data.confidencial === "boolean"
          ? { confidencial: data.confidencial }
          : {}),
        ...(typeof data.privilegio === "boolean"
          ? { privilegio: data.privilegio }
          : {}),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error || "No se pudo guardar la clasificación.");
      return;
    }
    setNote(
      [
        "Clasificación guardada",
        data.tipo ? `Tipo: ${data.tipo}` : null,
        data.confidencial ? "confidencial" : null,
        data.privilegio ? "privilegio" : null,
        data.motivo || null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
    router.refresh();
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
        label={busy ? "Guardando…" : "Clasificar"}
        showPreview={false}
        showNotes={false}
        onResult={(r) => void onClassify(r)}
      />
      {note && <p className="text-xs text-[var(--copper)]">{note}</p>}
    </div>
  );
}
