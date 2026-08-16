"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

type Hit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
  source?: string;
};

export function ConflictReviewPanel({
  causaId,
  status,
  notes,
  initialHits = [],
}: {
  causaId: string;
  status: string | null;
  notes: string | null;
  initialHits?: Hit[];
}) {
  const router = useRouter();
  const [hits, setHits] = useState<Hit[]>(initialHits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function recheck() {
    setBusy(true);
    setError("");
    setMsg("");
    const result = await apiMutation(`/api/causas/${causaId}/conflict-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo revisar conflictos");
      return;
    }
    const data = result.data as {
      conflicts?: Hit[];
      conflictStatus?: string;
    };
    setHits(Array.isArray(data.conflicts) ? data.conflicts : []);
    setMsg(
      data.conflictStatus === "clear"
        ? "Sin hallazgos en la revisión."
        : `Revisión: ${data.conflicts?.length || 0} hallazgo(s).`
    );
    router.refresh();
  }

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Conflictos de interés</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Cruza RUT y nombres con causas activas y cerradas recientes. Estado:{" "}
            <strong>{status || "sin revisar"}</strong>
            {notes ? ` · Notas: ${notes}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={recheck}
        >
          {busy ? "Revisando…" : "Volver a revisar"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {msg && !error && (
        <p className="mt-3 text-sm text-[var(--ink-soft)]/80">{msg}</p>
      )}
      {hits.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {hits.map((h) => (
            <li
              key={`${h.causaId}:${h.match}`}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    h.severity === "blocked"
                      ? "badge badge-vencido"
                      : "badge badge-pendiente"
                  }
                >
                  {h.severity === "blocked" ? "bloqueante" : "advertencia"}
                </span>
                <Link
                  href={`/causas/${h.causaId}`}
                  className="font-medium text-[var(--sea)]"
                >
                  {h.rit || h.titulo}
                </Link>
              </div>
              <p className="mt-1 text-[var(--ink-soft)]/80">{h.match}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--ink-soft)]/65">
          Sin hallazgos listados. Use «Volver a revisar» tras cambiar partes.
        </p>
      )}
    </section>
  );
}
