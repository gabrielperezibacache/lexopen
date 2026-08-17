"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";

export function DocumentoAiActions({
  documentoId,
  causaId,
}: {
  documentoId: string;
  causaId?: string | null;
}) {
  const { t } = useI18n();
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
      setNote(t("ai.documento.noClassify"));
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
      setNote(result.error || t("ai.assist.errorQuery"));
      return;
    }
    setNote(
      [
        t("ai.documento.saved"),
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
        label={t("ai.documento.resumir")}
        showNotes={false}
      />
      <AiAssist
        action="documento.clasificar"
        documentoId={documentoId}
        causaId={causaId || undefined}
        label={busy ? t("ai.documento.saving") : t("ai.documento.clasificar")}
        showPreview={false}
        showNotes={false}
        onResult={(r) => void onClassify(r)}
      />
      {note && <p className="text-xs text-[var(--copper)]">{note}</p>}
    </div>
  );
}
