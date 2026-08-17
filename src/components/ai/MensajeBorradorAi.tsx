"use client";

import { useState } from "react";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

export function MensajeBorradorAi({
  onApply,
}: {
  onApply: (draft: { subject: string; body: string }) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  function apply(result: AiActionResponse) {
    const data = result.data as { asunto?: string; cuerpo?: string } | null;
    if (!data?.cuerpo?.trim()) return;
    onApply({
      subject: data.asunto?.trim() || "",
      body: data.cuerpo.trim(),
    });
    setNote(t("ai.mensaje.applied"));
  }

  return (
    <div className="mb-3 space-y-2">
      <AiAssist
        action="mensaje.borrador"
        label={t("ai.mensaje.label")}
        showPreview={false}
        onResult={(r) => apply(r)}
      />
      {note && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
