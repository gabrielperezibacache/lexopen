"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITY_CODES } from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";

export function TimeEntryForm({
  causas,
  clientes,
  users,
}: {
  causas: Array<{ id: string; titulo: string; rit: string | null; clienteId: string | null }>;
  clientes: Array<{ id: string; razonSocial: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const causaId = String(fd.get("causaId") || "");
    const causa = causas.find((c) => c.id === causaId);
    const result = await apiMutation("/api/billing/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fd.get("date"),
        hours: Number(fd.get("hours")),
        description: fd.get("description"),
        activityCode: fd.get("activityCode"),
        causaId: causaId || null,
        clienteId: fd.get("clienteId") || causa?.clienteId || null,
        userId: fd.get("userId") || null,
        billable: fd.get("billable") === "on",
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudieron registrar las horas");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 gap-3 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-3">
      {error && (
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-[var(--danger)]">{error}</p>
      )}
      <input className="input" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      <input className="input" type="number" step="0.25" min="0.25" name="hours" required placeholder="Horas" />
      <select className="select" name="activityCode" defaultValue="drafting">
        {ACTIVITY_CODES.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      <input className="input md:col-span-3" name="description" required placeholder="Descripción del trabajo" />
      <select className="select" name="causaId" defaultValue="">
        <option value="">Sin causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select>
      <select className="select" name="clienteId" defaultValue="">
        <option value="">Cliente (opcional)</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.razonSocial}
          </option>
        ))}
      </select>
      <select className="select" name="userId" defaultValue={users[0]?.id || ""}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="billable" defaultChecked /> Facturable
      </label>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Registrar horas"}
      </button>
    </form>
  );
}
