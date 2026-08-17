"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { apiMutation } from "@/lib/api-mutation";
import { calcularVencimiento } from "@/lib/plazos";

type PlazoSugerido = {
  titulo?: string;
  dias?: number;
  tipoComputo?: "habiles" | "corridos";
  esFatal?: boolean;
  tipo?: string;
  descripcion?: string;
};

export function PlazoSugerirAi({ causaId }: { causaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sugeridos, setSugeridos] = useState<PlazoSugerido[]>([]);

  async function applyPlazos(result: AiActionResponse) {
    const data = result.data as { plazos?: PlazoSugerido[] } | null;
    const items = data?.plazos?.filter((p) => p.titulo?.trim()) || [];
    setSugeridos(items);
    if (!items.length) {
      setNote("Sin plazos estructurados para aplicar.");
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
        ? `${created} plazo(s) creado(s). Revise fechas antes de confiar en fatales.`
        : "No se pudieron crear plazos."
    );
    if (created > 0) router.refresh();
  }

  return (
    <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
      <AiAssist
        action="plazo.sugerir"
        causaId={causaId}
        label={busy ? "Aplicando…" : "Sugerir plazos con IA"}
        showPreview={false}
        onResult={(r) => void applyPlazos(r)}
      />
      {sugeridos.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--ink-soft)]/75">
          {sugeridos.map((p, i) => (
            <li key={i}>
              {p.titulo} · {p.dias ?? "?"} días {p.tipoComputo || "hábiles"}
              {p.esFatal ? " · fatal" : ""}
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
