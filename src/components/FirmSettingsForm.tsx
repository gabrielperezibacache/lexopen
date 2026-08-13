"use client";

import { FormEvent, useState, type ReactNode } from "react";
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

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-[var(--ink)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--ink-soft)]/60">{hint}</span>}
    </label>
  );
}

export function FirmSettingsForm({ organization }: { organization: Settings }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setOk(false);
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
    setOk(res.ok);
    setMessage(res.ok ? "Configuración guardada" : "No se pudo guardar");
    if (res.ok) router.refresh();
  }

  const s = organization.settings;
  return (
    <form id="estudio" onSubmit={onSubmit} className="panel space-y-8 rounded-3xl p-5 md:p-6">
      <section>
        <h2 className="text-lg font-semibold">Datos del estudio</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Identidad visible en el portal y documentos internos.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre del estudio">
            <input className="input" name="name" required defaultValue={organization.name} />
          </Field>
          <Field label="RUT del estudio" hint="Formato 76.XXX.XXX-X">
            <input className="input" name="rut" defaultValue={organization.rut || ""} />
          </Field>
          <Field label="Email de contacto">
            <input
              className="input"
              name="email"
              type="email"
              defaultValue={organization.email || ""}
            />
          </Field>
          <Field label="Teléfono">
            <input className="input" name="telefono" defaultValue={organization.telefono || ""} />
          </Field>
          <Field label="Dirección" className="md:col-span-2">
            <input className="input" name="direccion" defaultValue={organization.direccion || ""} />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Emisor tributario</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Datos que aparecen en boletas y facturas.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Razón social emisora">
            <input
              className="input"
              name="emisorRazonSocial"
              defaultValue={s?.emisorRazonSocial || ""}
            />
          </Field>
          <Field label="RUT emisor">
            <input className="input" name="emisorRut" defaultValue={s?.emisorRut || ""} />
          </Field>
          <Field label="Giro">
            <input className="input" name="emisorGiro" defaultValue={s?.emisorGiro || ""} />
          </Field>
          <Field label="Dirección tributaria">
            <input
              className="input"
              name="emisorDireccion"
              defaultValue={s?.emisorDireccion || ""}
            />
          </Field>
          <Field label="Retención por defecto" hint="Ej. 0.1375 = 13,75%">
            <input
              className="input"
              type="number"
              step="0.0001"
              name="defaultRetencionPct"
              defaultValue={s?.defaultRetencionPct ?? 0.1375}
            />
          </Field>
          <Field label="IVA" hint="Ej. 0.19 = 19%">
            <input
              className="input"
              type="number"
              step="0.0001"
              name="ivaPct"
              defaultValue={s?.ivaPct ?? 0.19}
            />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Integraciones</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          El resto de conectores (IA, Obsidian, Google, PJUD) se editan en las secciones
          siguientes de esta página.
        </p>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            name="hermesAllowDemo"
            defaultChecked={s?.hermesAllowDemo ?? false}
          />
          <span>
            <span className="font-medium">Permitir respuestas demo del asistente IA</span>
            <span className="mt-0.5 block text-[var(--ink-soft)]/65">
              Fallback del estudio si el proveedor (OpenAI, Hermes, Ollama, etc.) no
              responde. También puede configurarse por proveedor en el panel de
              endpoints de IA más abajo.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-4">
        {message && (
          <span
            className={`text-sm ${ok ? "text-[var(--ok)]" : "text-red-700"}`}
            role="status"
          >
            {message}
          </span>
        )}
        <button className="btn btn-primary" type="submit">
          Guardar configuración
        </button>
      </div>
    </form>
  );
}
