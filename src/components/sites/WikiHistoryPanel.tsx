"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

type Revision = {
  id: string;
  title: string;
  createdAt: string;
  author?: { name: string } | null;
};

export function WikiHistoryPanel({
  siteId,
  pageId,
}: {
  siteId: string;
  pageId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revisions, setRevisions] = useState<Revision[] | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${siteId}/wiki?id=${encodeURIComponent(pageId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo cargar el historial");
        setRevisions([]);
        return;
      }
      setRevisions(Array.isArray(data.revisions) ? data.revisions : []);
    } catch {
      setError("No se pudo cargar el historial");
      setRevisions([]);
    } finally {
      setBusy(false);
    }
  }

  async function openPanel() {
    setOpen(true);
    await load();
  }

  async function restore(revisionId: string) {
    if (!confirm("¿Restaurar esta revisión? Se guardará el estado actual como nueva revisión.")) {
      return;
    }
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/sites/${siteId}/wiki`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pageId,
        action: "restore",
        revisionId,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo restaurar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={openPanel}>
        Historial
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="panel w-full max-w-lg space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Historial de revisiones</h3>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {busy && !revisions && (
              <p className="text-sm text-[var(--ink-soft)]/70">Cargando…</p>
            )}
            {revisions && revisions.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/70">Sin revisiones aún.</p>
            )}
            <ul className="max-h-72 space-y-2 overflow-auto">
              {(revisions || []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-[var(--ink-soft)]/60">
                      {r.author?.name || "—"} ·{" "}
                      {new Date(r.createdAt).toLocaleString("es-CL")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    disabled={busy}
                    onClick={() => restore(r.id)}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
