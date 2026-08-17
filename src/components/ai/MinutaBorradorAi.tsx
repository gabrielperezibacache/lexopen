"use client";

import { useState } from "react";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

type MinutaDraft = {
  titulo?: string;
  resumenEjecutivo?: string;
  hechosRelevantes?: string;
  acuerdos?: string;
  estadoCausaNota?: string;
  riesgosAlertas?: string;
  acciones?: Array<{
    descripcion?: string;
    prioridad?: string;
    diasPlazo?: number;
    crearPlazo?: boolean;
    crearTask?: boolean;
  }>;
};

export function MinutaBorradorAi({
  causaId,
  onApply,
}: {
  causaId: string;
  onApply: (draft: MinutaDraft) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  function apply(result: AiActionResponse) {
    const data = result.data as MinutaDraft | null;
    if (!data?.resumenEjecutivo?.trim() && !data?.titulo?.trim()) return;
    onApply(data || {});
    setNote(t("ai.minuta.applied"));
  }

  return (
    <div className="mb-4 space-y-2">
      <AiAssist
        action="minuta.borrador"
        causaId={causaId}
        label={t("ai.minuta.label")}
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
