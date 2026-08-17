"use client";

import { Suspense } from "react";
import { AgenteInner } from "@/components/agente/AgenteInner";

export default function AgentePage() {
  return (
    <Suspense fallback={<div className="panel h-40 rounded-3xl" />}>
      <AgenteInner />
    </Suspense>
  );
}
