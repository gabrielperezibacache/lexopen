import assert from "node:assert/strict";
import {
  canRegisterInvoicePayment,
  computeInvoiceTotals,
  expenseListWhere,
  formatHours,
  formatPercentRate,
  formatUf,
  invoiceListWhere,
  invoiceStatusAfterPayment,
  labelExpenseCategory,
  labelInvoiceStatus,
  labelLedgerTipo,
  timeEntryListWhere,
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

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "factura_afecta",
    lines: [{ amountClp: 100_000 }],
    ivaRate: 0.1,
  }),
  {
    subtotalClp: 100_000,
    ivaClp: 10_000,
    retencionClp: 0,
    totalClp: 110_000,
  }
);

assert.deepEqual(
  computeInvoiceTotals({
    tipoDocumento: "boleta_honorarios",
    lines: [{ amountClp: 100_000 }],
    retencionRate: 0.1,
  }),
  {
    subtotalClp: 100_000,
    ivaClp: 0,
    retencionClp: 10_000,
    totalClp: 90_000,
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

assert.equal(formatHours(0.25), "0,25 h");
assert.equal(formatHours(1), "1 h");
assert.equal(formatUf(1.5), "1,5 UF");
assert.equal(formatPercentRate(0.19), "19%");
assert.equal(formatPercentRate(0.1375), "13,75%");
assert.equal(labelInvoiceStatus("parcialmente_pagada"), "Parcialmente pagada");
assert.equal(labelInvoiceStatus("anulada"), "Anulada");
assert.equal(labelExpenseCategory("notario"), "Notaría");
assert.equal(labelLedgerTipo("provision"), "Provisión");
assert.equal(canRegisterInvoicePayment("borrador", 1000), false);
assert.equal(canRegisterInvoicePayment("anulada", 1000), false);
assert.equal(canRegisterInvoicePayment("emitida", 1000), true);
assert.equal(canRegisterInvoicePayment("vencida", 0), false);
assert.deepEqual(timeEntryListWhere("por_facturar"), { billable: true, billed: false });
assert.deepEqual(timeEntryListWhere("por_aprobar"), { approved: false, billed: false });
assert.deepEqual(timeEntryListWhere("no-existe"), {});
assert.deepEqual(expenseListWhere("interno"), { billable: false });
assert.deepEqual(invoiceListWhere("emitida", "factura_afecta"), {
  status: "emitida",
  tipoDocumento: "factura_afecta",
});
assert.deepEqual(invoiceListWhere("bitcoin", "dte"), {});

console.log("billing.test.ts OK");
