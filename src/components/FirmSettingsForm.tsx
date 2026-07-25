"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  name: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  settings: {
    emisorRazonSocial: string | null;
    emisorRut: string | null;
    emisorGiro: string | null;
    emisorDireccion: string | null;
    defaultRetencionPct: number;
    ivaPct: number;
    hermesAllowDemo: boolean;
  } | null;
};

export function FirmSettingsForm({ organization }: { organization: Settings }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/configuracion", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        rut: fd.get("rut") || null,
        email: fd.get("email") || null,
        telefono: fd.get("telefono") || null,
        direccion: fd.get("direccion") || null,
        emisorRazonSocial: fd.get("emisorRazonSocial") || null,
        emisorRut: fd.get("emisorRut") || null,
        emisorGiro: fd.get("emisorGiro") || null,
        emisorDireccion: fd.get("emisorDireccion") || null,
        defaultRetencionPct: Number(fd.get("defaultRetencionPct")),
        ivaPct: Number(fd.get("ivaPct")),
        hermesAllowDemo: fd.get("hermesAllowDemo") === "on",
      }),
    });
    setMessage(res.ok ? "Configuración guardada" : "No se pudo guardar");
    if (res.ok) router.refresh();
  }

  const s = organization.settings;
  return (
    <form onSubmit={onSubmit} className="panel grid gap-4 rounded-3xl p-5 md:grid-cols-2">
      <input className="input" name="name" defaultValue={organization.name} placeholder="Nombre estudio" />
      <input className="input" name="rut" defaultValue={organization.rut || ""} placeholder="RUT estudio" />
      <input className="input" name="email" defaultValue={organization.email || ""} placeholder="Email" />
      <input className="input" name="telefono" defaultValue={organization.telefono || ""} placeholder="Teléfono" />
      <input className="input md:col-span-2" name="direccion" defaultValue={organization.direccion || ""} placeholder="Dirección" />
      <input className="input" name="emisorRazonSocial" defaultValue={s?.emisorRazonSocial || ""} placeholder="Emisor razón social" />
      <input className="input" name="emisorRut" defaultValue={s?.emisorRut || ""} placeholder="Emisor RUT" />
      <input className="input" name="emisorGiro" defaultValue={s?.emisorGiro || ""} placeholder="Giro" />
      <input className="input" name="emisorDireccion" defaultValue={s?.emisorDireccion || ""} placeholder="Dirección tributaria" />
      <input className="input" type="number" step="0.0001" name="defaultRetencionPct" defaultValue={s?.defaultRetencionPct ?? 0.1375} placeholder="Retención" />
      <input className="input" type="number" step="0.0001" name="ivaPct" defaultValue={s?.ivaPct ?? 0.19} placeholder="IVA" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="hermesAllowDemo" defaultChecked={s?.hermesAllowDemo ?? true} />
        Permitir demo Hermes
      </label>
      <div className="flex items-center justify-end gap-3">
        {message && <span className="text-sm text-[var(--ink-soft)]/70">{message}</span>}
        <button className="btn btn-primary" type="submit">Guardar</button>
      </div>
    </form>
  );
}
