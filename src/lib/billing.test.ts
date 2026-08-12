import assert from "node:assert/strict";
import {
  computeInvoiceTotals,
  invoiceStatusAfterPayment,
} from "@/lib/billing";
import {
  invoiceCreateSchema,
  invoiceUpdateSchema,
  paymentCreateSchema,
} from "@/lib/schemas";

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "factura_afecta",
    lines: [{ amountClp: 100_000 }, { amountClp: 25_000 }],
  }),
  {
    subtotalClp: 125_000,
    ivaClp: 23_750,
    retencionClp: 0,
    totalClp: 148_750,
  }
);

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "boleta_honorarios",
    lines: [{ amountClp: 100_000 }],
  }),
  {
    subtotalClp: 100_000,
    ivaClp: 0,
    retencionClp: 13_750,
    totalClp: 86_250,
  }
);

assert.equal(invoiceStatusAfterPayment(100_000, 0), "emitida");
assert.equal(invoiceStatusAfterPayment(100_000, 40_000), "parcialmente_pagada");
assert.equal(invoiceStatusAfterPayment(100_000, 100_000), "pagada");
assert.throws(() => invoiceStatusAfterPayment(100_000, 100_001), /entre cero/);
assert.throws(
  () => computeInvoiceTotals({ tipoDocumento: "factura_exenta", lines: [{ amountClp: -1 }] }),
  /no negativos/
);

assert.equal(
  invoiceCreateSchema.safeParse({
    clienteId: "cliente_1",
    status: "emitida",
    tipoDocumento: "factura_afecta",
    lines: [{ description: "Servicio", quantity: 1, unitAmountClp: 100_000 }],
  }).success,
  true
);
assert.equal(
  invoiceCreateSchema.safeParse({
    clienteId: "cliente_1",
    status: "pagada",
    lines: [{ description: "Servicio", unitAmountClp: -1 }],
  }).success,
  false
);
assert.equal(
  invoiceUpdateSchema.safeParse({ paidClp: 1 }).success,
  false
);
assert.equal(
  paymentCreateSchema.safeParse({
    clienteId: "cliente_1",
    amountClp: 100_000,
    method: "transferencia",
  }).success,
  true
);
assert.equal(
  paymentCreateSchema.safeParse({
    clienteId: "cliente_1",
    amountClp: 100_000,
    method: "bitcoin",
  }).success,
  false
);

console.log("billing.test.ts OK");
