"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;

export function ClienteEditForm({
  cliente,
  abogados,
}: {
  cliente: {
    version?: string;
    id: string;
    razonSocial: string;
    rut: string | null;
    email: string | null;
    telefono: string | null;
    tipo: string;
    estado: string;
    notas: string | null;
    abogadoId: string | null;
  };
  abogados: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverNotReady);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false), saving = useRef(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, []);

  function openOffline() {
    // Public static HTML has no RSC route and needs a document navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign(`/offline.html?kind=cliente&record=${encodeURIComponent(cliente.id)}`);
  }
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || saving.current) return;
    const offline = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-offline") === "true";
    if (offline && !dirty.current) { openOffline(); return; }
    const fd = new FormData(e.currentTarget);
    saving.current = true; setBusy(true); setMsg("");
    const result = await apiMutation(`/api/clientes/${cliente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: cliente.version,
        razonSocial: fd.get("razonSocial"),
        rut: fd.get("rut") || null,
        email: fd.get("email") || null,
        telefono: fd.get("telefono") || null,
        tipo: fd.get("tipo"),
        estado: fd.get("estado"),
        notas: fd.get("notas") || null,
        abogadoId: fd.get("abogadoId") || null,
      }),
    });
    saving.current = false; setBusy(false);
    setMsg(result.ok ? "Guardado" : result.error);
    if (result.ok) {
      dirty.current = false;
      if (offline) openOffline(); else router.refresh();
    }
  }

  return (
    <form method="post" aria-label="Datos del cliente" aria-busy={!ready || busy} onSubmit={onSubmit} onChange={() => { dirty.current = true; }} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
      <label className="block space-y-2 text-sm font-medium sm:col-span-2">
        <span>Razón social / nombre</span>
        <input disabled={!ready || busy}
        className="input"
        name="razonSocial"
        required
        defaultValue={cliente.razonSocial}
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>RUT</span>
        <input disabled={!ready || busy} className="input" name="rut" defaultValue={cliente.rut || ""} placeholder="RUT" />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Tipo</span>
        <select disabled={!ready || busy} className="select" name="tipo" defaultValue={cliente.tipo}>
        <option value="persona">Persona natural</option>
        <option value="empresa">Empresa</option>
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Email</span>
        <input disabled={!ready || busy}
        className="input"
        name="email"
        type="email"
        defaultValue={cliente.email || ""}
        placeholder="Email"
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Teléfono</span>
        <input disabled={!ready || busy}
        className="input"
        name="telefono"
        defaultValue={cliente.telefono || ""}
        placeholder="Teléfono"
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Estado</span>
        <select disabled={!ready || busy} className="select" name="estado" defaultValue={cliente.estado}>
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Abogado responsable</span>
        <select disabled={!ready || busy}
        className="select"
        name="abogadoId"
        defaultValue={cliente.abogadoId || ""}
      >
        <option value="">Sin abogado responsable</option>
        {abogados.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium sm:col-span-2">
        <span>Notas</span>
        <textarea disabled={!ready || busy}
        className="textarea"
        name="notas"
        rows={2}
        defaultValue={cliente.notas || ""}
        placeholder="Notas"
      />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-secondary" type="submit" disabled={!ready || busy}>
          {busy ? "Guardando…" : "Guardar datos"}
        </button>
        <button className="btn btn-secondary" type="submit" data-offline="true" disabled={!ready || busy}>Trabajar sin conexión</button>
        {msg && <span className="text-sm text-[var(--muted)]">{msg}</span>}
      </div>
    </form>
  );
}
