import assert from "node:assert/strict";
import {
  MAX_CSV_ROWS,
  MOVIMIENTOS_CSV_HEADER,
  parseMovimientosCsv,
} from "@/lib/pjud/import-csv";

assert.equal(MOVIMIENTOS_CSV_HEADER, "titulo,detalle,fecha,referencia,id");

const rows = parseMovimientosCsv(
  "\uFEFFtitulo,detalle,fecha,referencia,id\n" +
    '"Resolución, importante","Texto ""oficial""",2026-08-12,R-1,movement-1\n' +
    "Audiencia,,2026-08-13,,\n"
);

assert.equal(rows.length, 2);
assert.equal(rows[0].titulo, "Resolución, importante");
assert.equal(rows[0].detalle, 'Texto "oficial"');
assert.equal(rows[0].referencia, "R-1");
assert.equal(rows[0].externalId, "movement-1");
assert.equal(rows[1].fecha, "2026-08-13");
assert.equal(rows[1].externalId, "");

assert.throws(
  () =>
    parseMovimientosCsv(
      `titulo,fecha\n${Array.from(
        { length: MAX_CSV_ROWS + 1 },
        (_, index) => `Movimiento ${index},2026-08-12`
      ).join("\n")}`
    ),
  /supera el límite/
);

console.log("pjud/import-csv.test.ts OK");
