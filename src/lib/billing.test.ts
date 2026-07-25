import assert from "node:assert/strict";
import { computeInvoiceTotals } from "@/lib/billing";

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "factura_afecta",
    lines: [{ amountClp: 100_000 }],
    rates: { ivaPct: 0.2, retencionPct: 0.1 },
  }),
  { subtotalClp: 100_000, ivaClp: 20_000, retencionClp: 0, totalClp: 120_000 }
);

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "boleta_honorarios",
    lines: [{ amountClp: 100_000 }],
    rates: { ivaPct: 0.2, retencionPct: 0.1 },
  }),
  { subtotalClp: 100_000, ivaClp: 0, retencionClp: 10_000, totalClp: 90_000 }
);

console.log("billing.test.ts OK");
