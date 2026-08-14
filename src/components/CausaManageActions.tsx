"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
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

  async function removeCausa() {
    if (
      !window.confirm(
        `¿Eliminar permanentemente «${titulo}»?\nSe borrarán movimientos, documentos vinculados y el historial. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    const result = await apiMutation(`/api/causas/${causaId}`, {
      method: "DELETE",
    });
    setBusy(false);
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
            onClick={() => void removeCausa()}
          >
            Eliminar
          </button>
        )}
      </div>
      {msg && (
        <p className="text-xs text-[var(--ink-soft)]/75" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
