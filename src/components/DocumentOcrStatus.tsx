"use client";

import { useEffect, useState } from "react";

type OcrStatus = {
  enabled: boolean;
  available: boolean;
  provider: string;
  version?: string;
  reason?: string;
  hint?: string;
};

export function DocumentOcrStatus() {
  const [status, setStatus] = useState<OcrStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => {
        if (active && data.ocr) setStatus(data.ocr);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!status || !status.enabled) return null;
  return (
    <details className="border-y border-[var(--line)] py-3 text-sm text-[var(--ink-soft)]">
      <summary className="cursor-pointer font-medium">{status.available ? "Lectura de documentos escaneados disponible" : "Los documentos escaneados necesitan revisión"}</summary>
      <p className="mt-2">{status.available ? "Podemos reconocer el texto de archivos escaneados. Revisa los pasajes junto al original antes de citarlos." : "El reconocimiento de texto no está disponible en este momento. Puedes conservar y consultar los originales; su preparación quedará pendiente."}</p>
      <details className="mt-2"><summary className="cursor-pointer">Información para configurar el reconocimiento</summary><p className="mt-2">OCR local · {status.provider}{status.version ? ` · ${status.version}` : ""}</p>{status.reason && <p>{status.reason}</p>}{status.hint && <p>{status.hint}</p>}</details>
    </details>
  );
}
