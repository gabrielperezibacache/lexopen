import assert from "node:assert/strict";
import {
  formatDigestText,
  isDigestRelevantMovimiento,
  selectDigestCausa,
  type DigestItem,
} from "@/lib/pjud/digest";

assert.equal(
  isDigestRelevantMovimiento({ relevante: true, esReceptor: false }, "verde"),
  true
);
assert.equal(
  isDigestRelevantMovimiento({ relevante: false, esReceptor: true }, "verde"),
  true
);
assert.equal(
  isDigestRelevantMovimiento({ relevante: false, esReceptor: false }, "rojo"),
  true
);
assert.equal(
  isDigestRelevantMovimiento(
    { relevante: false, esReceptor: false },
    "verde"
  ),
  false
);

// Quiet red causa (no recent movs) must still be included via lastMovimientoAt age.
const quietRed = selectDigestCausa({
  recentMovimientos: [],
  lastMovimientoAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
});
assert.equal(quietRed.include, true);
assert.equal(quietRed.semaforo, "rojo");

const freshGreen = selectDigestCausa({
  recentMovimientos: [],
  lastMovimientoAt: new Date(),
});
assert.equal(freshGreen.include, false);
assert.equal(freshGreen.semaforo, "verde");

const withRelevant = selectDigestCausa({
  recentMovimientos: [
    {
      titulo: "Proveído",
      fecha: new Date(),
      tipo: "resolucion",
      esReceptor: false,
      relevante: true,
    },
  ],
  lastMovimientoAt: new Date(),
});
assert.equal(withRelevant.include, true);
assert.equal(withRelevant.movimientos.length, 1);

const items: DigestItem[] = [
  {
    causaId: "c1",
    rit: "C-1-2024",
    titulo: "Demo",
    tribunal: "1º Civil",
    semaforo: "rojo",
    movimientos: [],
  },
];

assert.equal(
  isDigestRelevantMovimiento(
    { relevante: false, esReceptor: false, pendienteResolucion: true },
    "verde"
  ),
  true
);

const text = formatDigestText(items, "https://app.example");
assert.match(text, /C-1-2024/);
assert.match(text, /semáforo rojo/);

const sectioned = formatDigestText(
  [
    {
      causaId: "c2",
      rit: "C-2-2024",
      titulo: "Demo 2",
      tribunal: "Civil",
      semaforo: "verde",
      movimientos: [
        {
          titulo: "Cédula de notificación",
          fecha: new Date("2026-08-01"),
          tipo: "notificacion",
          esReceptor: true,
          relevante: true,
        },
        {
          titulo: "Escrito por resolver",
          fecha: new Date("2026-08-02"),
          tipo: "escrito",
          esReceptor: false,
          relevante: true,
          pendienteResolucion: true,
        },
      ],
    },
  ],
  "https://app.example"
);
assert.match(sectioned, /Receptor:/);
assert.match(sectioned, /Escritos por resolver:/);

console.log("pjud/digest.test.ts OK");
