import assert from "node:assert/strict";
import {
  formatDigestText,
  isDigestRelevantMovimiento,
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

const items: DigestItem[] = [
  {
    causaId: "c1",
    rit: "C-1-2024",
    titulo: "Demo",
    tribunal: "1º Civil",
    semaforo: "amarillo",
    movimientos: [
      {
        titulo: "Proveído",
        fecha: new Date("2026-08-12T12:00:00.000Z"),
        tipo: "resolucion",
        esReceptor: false,
        relevante: true,
      },
    ],
  },
];

const text = formatDigestText(items, "https://app.example");
assert.match(text, /C-1-2024/);
assert.match(text, /https:\/\/app\.example\/causas\/c1/);
assert.match(text, /Proveído/);

console.log("pjud/digest.test.ts OK");
