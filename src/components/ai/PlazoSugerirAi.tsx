"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { apiMutation } from "@/lib/api-mutation";
import { calcularVencimiento } from "@/lib/plazos";
import { useI18n } from "@/components/i18n/I18nProvider";

type PlazoSugerido = {
  titulo?: string;
  dias?: number;
  tipoComputo?: "habiles" | "corridos";
  esFatal?: boolean;
  tipo?: string;
  descripcion?: string;
};

export function PlazoSugerirAi({ causaId }: { causaId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sugeridos, setSugeridos] = useState<PlazoSugerido[]>([]);

  async function applyPlazos(result: AiActionResponse) {
    const data = result.data as { plazos?: PlazoSugerido[] } | null;
    const items = data?.plazos?.filter((p) => p.titulo?.trim()) || [];
    setSugeridos(items);
    if (!items.length) {
      setNote(t("ai.plazoSugerir.noneStructured"));
      return;
    }
    setBusy(true);
    setNote("");
    const hoy = new Date();
    let created = 0;
    for (const item of items) {
      const dias = typeof item.dias === "number" && item.dias > 0 ? item.dias : 5;
      const tipoComputo = item.tipoComputo === "corridos" ? "corridos" : "habiles";
      const fechaLimite = calcularVencimiento({ desde: hoy, dias, tipoComputo })
        .toISOString()
        .slice(0, 10);
      const res = await apiMutation("/api/plazos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causaId,
          titulo: item.titulo,
          descripcion: item.descripcion || null,
          tipo: item.tipo || "procesal",
          esFatal: Boolean(item.esFatal),
          tipoComputo,
          diasPlazo: dias,
          fechaNotificacion: hoy.toISOString().slice(0, 10),
          fechaLimite,
        }),
      });
      if (res.ok) created += 1;
    }
    setBusy(false);
    setNote(
      created > 0
        ? t("ai.plazoSugerir.created").replace("{count}", String(created))
        : t("ai.plazoSugerir.createFailed")
    );
    if (created > 0) router.refresh();
  }

  const label = busy
    ? t("ai.plazoSugerir.applying")
    : t("ai.plazoSugerir.label");

  return (
    <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
      <AiAssist
        action="plazo.sugerir"
        causaId={causaId}
        label={label}
        showPreview={false}
        onResult={(r) => void applyPlazos(r)}
      />
      {sugeridos.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--ink-soft)]/75">
          {sugeridos.map((p, i) => (
            <li key={i}>
              {p.titulo} ·{" "}
              {t("ai.plazoSugerir.days")
                .replace("{days}", String(p.dias ?? "?"))
                .replace(
                  "{computo}",
                  p.tipoComputo === "corridos"
                    ? t("ai.agente.corridos").toLowerCase()
                    : t("ai.agente.habiles").toLowerCase()
                )}
              {p.esFatal ? ` · ${t("ai.plazoSugerir.fatal")}` : ""}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
