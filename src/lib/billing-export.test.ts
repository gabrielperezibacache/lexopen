import assert from "node:assert/strict";
import {
  CSV_UTF8_BOM,
  billingExportToCsv,
  billingExportToXml,
  buildBillingExportRows,
  csvCell,
} from "@/lib/billing-export";

const rows = buildBillingExportRows(
  [
    {
      number: "BH-2026-001",
      tipoDocumento: "boleta_honorarios",
      status: "emitida",
      issueDate: new Date("2026-08-01T12:00:00Z"),
      dueDate: new Date("2026-08-31T12:00:00Z"),
      subtotalClp: 100000,
      ivaClp: 0,
      retencionClp: 13750,
      totalClp: 86250,
      paidClp: 0,
      currency: "CLP",
      glosa: 'Honorarios "tutela"',
      notes: "Interno",
      cliente: { rut: "76.123.456-7", razonSocial: "Andes SpA" },
      causa: { rit: "C-1-2026" },
    },
  ],
  { rut: "76.999.888-1", razonSocial: "Estudio Demo" }
);

assert.equal(rows.length, 1);
assert.equal(rows[0].folioInterno, "BH-2026-001");
assert.equal(rows[0].rutEmisor, "76.999.888-1");
assert.equal(rows[0].netoClp, 100000);

const csv = billingExportToCsv(rows);
assert.ok(csv.startsWith(CSV_UTF8_BOM));
assert.ok(csv.includes("folioInterno,tipoDocumento"));
assert.ok(csv.includes('"Honorarios ""tutela"""'));
assert.ok(csv.includes("76.999.888-1"));
assert.equal(rows[0].fechaEmision, "2026-08-01");

const shifted = buildBillingExportRows(
  [
    {
      ...rows[0],
      number: "BH-2026-002",
      tipoDocumento: "boleta_honorarios",
      status: "emitida",
      issueDate: new Date("2026-10-01T01:00:00.000Z"),
      dueDate: new Date("2026-09-01T00:00:00.000Z"),
      subtotalClp: 100000,
      ivaClp: 0,
      retencionClp: 13750,
      totalClp: 86250,
      paidClp: 0,
      currency: "CLP",
      glosa: "=1+1",
      notes: "Andes & Cía",
      cliente: { rut: "76.123.456-7", razonSocial: "Andes & Cía" },
      causa: { rit: "C-1-2026" },
    },
  ],
  { rut: "76.999.888-1", razonSocial: "Estudio Demo" }
);
assert.equal(shifted[0].fechaEmision, "2026-09-30");
assert.equal(shifted[0].fechaVencimiento, "2026-09-01");
assert.equal(csvCell(shifted[0].glosa), "'=1+1");
const shiftedCsv = billingExportToCsv(shifted);
assert.ok(shiftedCsv.includes("'=1+1"));
assert.ok(!shiftedCsv.includes(",=1+1"));

const xml = billingExportToXml(rows);
assert.ok(xml.includes("<folioInterno>BH-2026-001</folioInterno>"));
assert.ok(xml.includes("Honorarios &quot;tutela&quot;"));
assert.ok(xml.includes("no es DTE SII"));
assert.ok(xml.includes('zonaHoraria="America/Santiago"'));
const shiftedXml = billingExportToXml(shifted);
assert.ok(shiftedXml.includes("<fechaEmision>2026-09-30</fechaEmision>"));
assert.ok(shiftedXml.includes("Andes &amp; Cía"));

console.log("billing-export.test.ts OK");
