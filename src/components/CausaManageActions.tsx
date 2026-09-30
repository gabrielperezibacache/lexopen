"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";

type Props = {
  causaId: string;
  titulo: string;
  estado: string;
  isAdmin: boolean;
  compact?: boolean;
};

export function CausaManageActions({
  causaId,
  titulo,
  estado,
  isAdmin,
  compact = false,
}: Props) {
  const router = useRouter();
  const { dict, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const archived = estado === "archivada";

  async function archiveOrRestore() {
    setBusy(true);
    setMsg("");
    const next = archived ? "activa" : "archivada";
    const result = await apiMutation(`/api/causas/${causaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: next }),
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error || "No se pudo actualizar el estado");
      return;
    }
    router.refresh();
    if (next === "archivada") {
      setMsg("Causa archivada.");
    } else {
      setMsg("Causa reactivada.");
    }
  }

  async function confirmRemoveCausa() {
    setBusy(true);
    setMsg("");
    const result = await apiMutation(`/api/causas/${causaId}`, {
      method: "DELETE",
    });
    setBusy(false);
    setConfirmOpen(false);
    if (!result.ok) {
      setMsg(result.error || "No se pudo eliminar");
      return;
    }
    router.push("/causas");
    router.refresh();
  }

  const btn = compact ? "text-xs text-[var(--sea)] underline-offset-2 hover:underline" : "btn btn-ghost";
  const btnDanger = compact
    ? "text-xs text-rose-700 underline-offset-2 hover:underline"
    : "btn btn-ghost text-rose-800";

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "sm:justify-end"}`}>
        <Link
          href={`/causas/${causaId}/editar`}
          className={compact ? btn : "btn btn-secondary"}
        >
          Editar
        </Link>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => void archiveOrRestore()}
        >
          {archived ? "Reactivar" : "Archivar"}
        </button>
        {isAdmin && (
          <button
            type="button"
            className={btnDanger}
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            {t("common.delete")}
          </button>
        )}
      </div>
      {msg && (
        <p className="text-xs text-[var(--ink-soft)]/75" role="status">
          {msg}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmRemoveCausa()}
        title={dict.confirm.deleteCausa.replace("{title}", titulo)}
        description={dict.confirm.deleteCausaDesc}
        busy={busy}
      />
    </div>
  );
}
