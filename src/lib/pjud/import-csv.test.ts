import assert from "node:assert/strict";
import {
  MAX_CSV_ROWS,
  MOVIMIENTOS_CSV_HEADER,
  parseMovimientosCsv,
  parseReceptorFlag,
  serializeMovimientosCsv,
} from "@/lib/pjud/import-csv";

assert.equal(
  MOVIMIENTOS_CSV_HEADER,
  "titulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento"
);

const rows = parseMovimientosCsv(
  "\uFEFFtitulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento\n" +
    '"Resolución, importante","Texto ""oficial""",2026-08-12,R-1,movement-1,Principal,3,Traslado,Resolución,,\n' +
    "Audiencia,,2026-08-13,,,,4,,,,\n" +
    "Notificación receptor,Cédula,2026-08-14,NR-1,nr1,Principal,5,Notificación,Cédula,1,receptor/nr1\n"
);

assert.equal(rows.length, 3);
assert.equal(rows[0].titulo, "Resolución, importante");
assert.equal(rows[0].detalle, 'Texto "oficial"');
assert.equal(rows[0].referencia, "R-1");
assert.equal(rows[0].externalId, "movement-1");
assert.equal(rows[0].cuaderno, "Principal");
assert.equal(rows[0].folio, "3");
assert.equal(rows[1].fecha, "2026-08-13");
assert.equal(rows[1].externalId, "");
assert.equal(rows[2].receptor, "1");
assert.equal(rows[2].documento, "receptor/nr1");
assert.equal(parseReceptorFlag("1"), true);
assert.equal(parseReceptorFlag("sí"), true);
assert.equal(parseReceptorFlag(""), false);

const roundTrip = parseMovimientosCsv(
  serializeMovimientosCsv([
    {
      titulo: 'Escrito "principal"',
      detalle: "Texto, con coma",
      fecha: "2026-08-12",
      referencia: "R-2",
      externalId: "import:provider-2",
      cuaderno: "Apelación",
      folio: "1",
      etapa: "Apelación",
      tramite: "Escrito",
      esReceptor: false,
      documentoRef: "escrito/1",
    },
  ])
);
assert.deepEqual(roundTrip[0], {
  titulo: 'Escrito "principal"',
  detalle: "Texto, con coma",
  fecha: "2026-08-12",
  referencia: "R-2",
  externalId: "provider-2",
  cuaderno: "Apelación",
  folio: "1",
  etapa: "Apelación",
  tramite: "Escrito",
  receptor: "",
  documento: "escrito/1",
});

// Backward-compatible minimal CSV still parses
const legacy = parseMovimientosCsv(
  "titulo,detalle,fecha,referencia,id\nProveído,Texto,2026-08-01,P-1,legacy-1\n"
);
assert.equal(legacy.length, 1);
assert.equal(legacy[0].cuaderno, "");
assert.equal(legacy[0].externalId, "legacy-1");

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
