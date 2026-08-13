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
  if (status.available) {
    return (
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        OCR local disponible ({status.provider}
        {status.version ? ` · ${status.version}` : ""}).
      </p>
    );
  }
  return (
    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      OCR local no disponible
      {status.reason ? ` (${status.reason})` : ""}. Los PDFs escaneados
      quedarán marcados para reintento.
      {status.hint ? (
        <>
          {" "}
          {status.hint}
        </>
      ) : null}
    </p>
  );
}
