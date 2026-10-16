"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/sites/SiteNav";
import {
  ESTADOS_CAUSA,
  ETAPAS,
  MATERIAS,
  TRIBUNALES_CHILE,
  validarRit,
  validarRuc,
} from "@/lib/chile";
import { apiMutation } from "@/lib/api-mutation";

type Option = { id: string; label: string };

type Props = {
  causa: {
    id: string;
    titulo: string;
    rit: string | null;
    ruc: string | null;
    tribunal: string;
    materia: string;
    procedimiento: string | null;
    estado: string;
    etapa: string;
    caratula: string | null;
    resumen: string | null;
    sala: string | null;
    cuaderno: string | null;
    abogadoContraparte: string | null;
    clienteId: string | null;
    abogadoId: string | null;
  };
  clientes: Option[];
  abogados: Option[];
};

export function CausaEditForm({ causa, clientes, abogados }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const rit = String(fd.get("rit") || "").trim();
    const ruc = String(fd.get("ruc") || "").trim();
    if (rit && !validarRit(rit)) {
      setError("RIT inválido. Use formatos como C-1234-2026.");
      setLoading(false);
      return;
    }
    if (ruc && !validarRuc(ruc)) {
      setError("RUC inválido.");
      setLoading(false);
      return;
    }

    const payload = {
      titulo: String(fd.get("titulo") || "").trim(),
      rit: rit || null,
      ruc: ruc || null,
      tribunal: String(fd.get("tribunal") || "").trim(),
      materia: String(fd.get("materia") || "").trim(),
      procedimiento: String(fd.get("procedimiento") || "").trim() || null,
      estado: String(fd.get("estado") || "").trim(),
      etapa: String(fd.get("etapa") || "").trim(),
      caratula: String(fd.get("caratula") || "").trim() || null,
      resumen: String(fd.get("resumen") || "").trim() || null,
      sala: String(fd.get("sala") || "").trim() || null,
      cuaderno: String(fd.get("cuaderno") || "").trim() || null,
      abogadoContraparte:
        String(fd.get("abogadoContraparte") || "").trim() || null,
      clienteId: String(fd.get("clienteId") || "").trim() || null,
      abogadoId: String(fd.get("abogadoId") || "").trim() || null,
    };

    const result = await apiMutation(`/api/causas/${causa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "No se pudo guardar");
      return;
    }
    router.push(`/causas/${causa.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Edición"
        title="Editar causa"
        subtitle={causa.rit || causa.titulo}
        actions={
          <Link href={`/causas/${causa.id}`} className="btn btn-ghost">
            Volver a la ficha
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <div>
          <label htmlFor="titulo" className="mb-1 block text-sm font-medium">Título</label>
          <input
            id="titulo"
            className="input"
            name="titulo"
            required
            defaultValue={causa.titulo}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rit" className="mb-1 block text-sm font-medium">RIT</label>
            <input
              id="rit"
              className="input"
              name="rit"
              defaultValue={causa.rit || ""}
              placeholder="C-1234-2026"
            />
          </div>
          <div>
            <label htmlFor="ruc" className="mb-1 block text-sm font-medium">RUC</label>
            <input
              id="ruc"
              className="input"
              name="ruc"
              defaultValue={causa.ruc || ""}
              placeholder="2500123456-7"
            />
          </div>
        </div>
        <div>
          <label htmlFor="tribunal" className="mb-1 block text-sm font-medium">Tribunal</label>
          <input
            id="tribunal"
            className="input"
            name="tribunal"
            required
            list="tribunales-chile-edit"
            defaultValue={causa.tribunal}
            autoComplete="off"
          />
          <datalist id="tribunales-chile-edit">
            {TRIBUNALES_CHILE.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="materia" className="mb-1 block text-sm font-medium">Materia</label>
            <select
              id="materia"
              className="select"
              name="materia"
              defaultValue={causa.materia}
            >
              {MATERIAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etapa" className="mb-1 block text-sm font-medium">Etapa</label>
            <select id="etapa" className="select" name="etapa" defaultValue={causa.etapa}>
              {ETAPAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="estado" className="mb-1 block text-sm font-medium">Estado</label>
            <select
              id="estado"
              className="select"
              name="estado"
              defaultValue={causa.estado}
            >
              {ESTADOS_CAUSA.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="procedimiento" className="mb-1 block text-sm font-medium">Procedimiento</label>
            <input
              id="procedimiento"
              className="input"
              name="procedimiento"
              defaultValue={causa.procedimiento || ""}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="sala" className="mb-1 block text-sm font-medium">Sala</label>
            <input
              id="sala"
              className="input"
              name="sala"
              defaultValue={causa.sala || ""}
            />
          </div>
          <div>
            <label htmlFor="cuaderno" className="mb-1 block text-sm font-medium">Cuaderno</label>
            <input
              id="cuaderno"
              className="input"
              name="cuaderno"
              defaultValue={causa.cuaderno || ""}
            />
          </div>
        </div>
        <div>
          <label htmlFor="caratula" className="mb-1 block text-sm font-medium">Carátula</label>
          <input
            id="caratula"
            className="input"
            name="caratula"
            defaultValue={causa.caratula || ""}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="clienteId" className="mb-1 block text-sm font-medium">Cliente</label>
            <select
              id="clienteId"
              className="select"
              name="clienteId"
              defaultValue={causa.clienteId || ""}
            >
              <option value="">Sin cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="abogadoId" className="mb-1 block text-sm font-medium">
              Abogado responsable
            </label>
            <select
              id="abogadoId"
              className="select"
              name="abogadoId"
              defaultValue={causa.abogadoId || ""}
            >
              <option value="">Sin asignar</option>
              {abogados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="abogadoContraparte" className="mb-1 block text-sm font-medium">
            Abogado contraparte
          </label>
          <input
            id="abogadoContraparte"
            className="input"
            name="abogadoContraparte"
            defaultValue={causa.abogadoContraparte || ""}
          />
        </div>
        <div>
          <label htmlFor="resumen" className="mb-1 block text-sm font-medium">Resumen</label>
          <textarea
            id="resumen"
            className="textarea min-h-28"
            name="resumen"
            defaultValue={causa.resumen || ""}
          />
        </div>
        {error && (
          <p className="text-sm text-rose-800" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Guardando…" : "Guardar cambios"}
          </button>
          <Link href={`/causas/${causa.id}`} className="btn btn-ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
