"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";

export function FacturaGlosaAi({
  invoiceId,
  clienteId,
  causaId,
  summary,
}: {
  invoiceId: string;
  clienteId: string;
  causaId?: string | null;
  summary: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [glosa, setGlosa] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onResult(result: AiActionResponse) {
    const data = result.data as { glosa?: string; notasInternas?: string } | null;
    const text = data?.glosa?.trim() || result.content?.trim() || "";
    setGlosa(text);
  }

  async function copyGlosa() {
    if (!glosa) return;
    await navigator.clipboard.writeText(glosa);
    setNote(t("ai.factura.copied"));
  }

  async function saveAsNotes() {
    const data = glosa;
    if (!data) return;
    setBusy(true);
    const res = await apiMutation(`/api/billing/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: data }),
    });
    setBusy(false);
    setNote(res.ok ? t("ai.factura.notesSaved") : res.error || t("ai.assist.errorQuery"));
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
      <AiAssist
        action="factura.glosa"
        label={t("ai.factura.label")}
        clienteId={clienteId}
        causaId={causaId || undefined}
        extra={{ resumen: summary }}
        showPreview={false}
        onResult={(r) => void onResult(r)}
      />
      {glosa && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 text-sm">
          <p className="whitespace-pre-wrap">{glosa}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost text-xs" onClick={() => void copyGlosa()}>
              Copiar
            </button>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              disabled={busy}
              onClick={() => void saveAsNotes()}
            >
              {t("ai.factura.applyNotes")}
            </button>
          </div>
        </div>
      )}
      {note && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
