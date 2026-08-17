"use client";

import { FacturaGlosaAi } from "@/components/ai/FacturaGlosaAi";

export function InvoiceAiPanel({
  invoiceId,
  clienteId,
  causaId,
  summary,
}: {
  invoiceId: string;
  clienteId: string;
  causaId?: string | null;
  summary: string;
}) {
  return (
    <FacturaGlosaAi
      invoiceId={invoiceId}
      clienteId={clienteId}
      causaId={causaId}
      summary={summary}
    />
  );
}
