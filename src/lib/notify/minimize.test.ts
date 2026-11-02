import assert from "node:assert/strict";
import { minimizeVars, minimoCopy } from "./minimize";

const vars = {
  title: "Plazo fatal",
  body: "Contestación",
  href: "/plazos",
  rit: "C-123-2026",
  tribunal: "1º Juzgado Civil",
  plazoTitulo: "Contestación demanda",
  fechaLimite: "2026-06-20",
  caratula: "Pérez con Sociedad",
  descripcion: "secreto",
};

{
  const mini = minimizeVars(vars, "minimo");
  assert.equal(mini.rit, undefined);
  assert.equal(mini.caratula, undefined);
  assert.equal(mini.fechaLimite, "2026-06-20");
}

{
  const std = minimizeVars(vars, "estandar");
  assert.equal(std.rit, "C-123-2026");
  assert.equal(std.caratula, undefined);
}

{
  const det = minimizeVars(vars, "detallado");
  assert.equal(det.caratula, "Pérez con Sociedad");
}

{
  const copy = minimoCopy(vars, "plazo.fatal");
  assert.match(copy.body, /plazo fatal/i);
  assert.doesNotMatch(copy.body, /Pérez|C-123/);
}

console.log("notify/minimize.test.ts OK");
