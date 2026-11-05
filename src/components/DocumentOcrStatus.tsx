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

  if (!status || !status.enabled || status.available) return null;
  return (
    <p role="status" className="text-sm text-[var(--ink-soft)]">
      El texto de los documentos escaneados quedará pendiente hasta activar el reconocimiento en <a href="/configuracion" className="underline underline-offset-4">Configuración</a>.
    </p>
  );
}
