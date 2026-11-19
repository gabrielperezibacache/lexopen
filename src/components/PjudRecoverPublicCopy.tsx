"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function PjudRecoverPublicCopy({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function recover() {
    setBusy(true);
    setError("");
    const result = await apiMutation<{ id: string }>("/api/research/sources", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "url", url: `https://juris.pjud.cl/busqueda?Civiles#sentencia-${id}` }),
    });
    if (result.ok) router.push(`/jurisprudencia/fuentes/${encodeURIComponent(result.data.id)}`);
    else setError(result.error);
    setBusy(false);
  }
  return <div className="space-y-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void recover()}>{busy ? "Recuperando…" : "Recuperar versión pública"}</button>
    {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}</div>;
}
