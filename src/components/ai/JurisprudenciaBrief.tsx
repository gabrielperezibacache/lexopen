"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AiAssist } from "@/components/ai/AiAssist";

function Inner() {
  const sp = useSearchParams();
  const q = sp.get("q") || "";

  return (
    <div className="panel rounded-3xl p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">Brief IA</h2>
        <p className="text-xs text-[var(--ink-soft)]/70">
          Sintetiza hallazgos del corpus según la consulta actual.
        </p>
      </div>
      <AiAssist
        action="jurisprudencia.brief"
        label="Generar brief"
        prompt={q || undefined}
        extra={{ query: q }}
      />
    </div>
  );
}

export function JurisprudenciaBrief() {
  return (
    <Suspense fallback={<div className="panel h-24 rounded-3xl" />}>
      <Inner />
    </Suspense>
  );
}
