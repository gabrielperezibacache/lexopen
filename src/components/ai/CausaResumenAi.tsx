"use client";

import { useState } from "react";
import { AiAssist } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

export function CausaResumenAi({
  causaId,
  titulo,
}: {
  causaId: string;
  titulo: string;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState("");

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
      <AiAssist
        action="causa.resumen"
        causaId={causaId}
        label={t("ai.causaResumen.label")}
        showNotes={false}
        extra={{ titulo }}
        onResult={(r) => setPreview(r.content || "")}
      />
      {preview && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {preview}
        </div>
      )}
    </div>
  );
}
