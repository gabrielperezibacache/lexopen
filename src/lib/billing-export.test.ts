import assert from "node:assert/strict";
import {
  billingExportToCsv,
  billingExportToXml,
  buildBillingExportRows,
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
assert.ok(csv.includes("folioInterno,tipoDocumento"));
assert.ok(csv.includes('"Honorarios ""tutela"""'));
assert.ok(csv.includes("76.999.888-1"));

const xml = billingExportToXml(rows);
assert.ok(xml.includes("<folioInterno>BH-2026-001</folioInterno>"));
assert.ok(xml.includes("Honorarios &quot;tutela&quot;"));
assert.ok(xml.includes("no es DTE SII"));

console.log("billing-export.test.ts OK");
