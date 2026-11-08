import {
  formatLocalDate,
  isValidTipoMinuta,
  labelTipoMinuta,
  parseLocalDateInput,
  renderMinutaMarkdown,
} from "./minutas";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(labelTipoMinuta("audiencia") === "Audiencia", "label audiencia");
assert(labelTipoMinuta("llamada") === "Llamada", "label llamada");
assert(isValidTipoMinuta("reunion"), "valid reunion");
assert(!isValidTipoMinuta("zoom"), "invalid tipo");

// Date-only must not shift calendar day in local TZ
const local = parseLocalDateInput("2026-08-01");
assert(local !== null, "parse local");
assert(local!.getFullYear() === 2026, "year");
assert(local!.getMonth() === 7, "month august=7");
assert(local!.getDate() === 1, "day 1");
assert(formatLocalDate(local) === "2026-08-01", "format local date");

assert(renderMinutaMarkdown({ tipo: "reunion", titulo: "Fecha civil", fecha: "2026-11-08T15:00:00Z", resumenEjecutivo: "Prueba", causa: { titulo: "Ficticia" }, acciones: [{ descripcion: "Vencimiento", fechaLimite: new Date("2026-11-20T00:00:00.000Z") }] }).includes("2026-11-20"), "UTC midnight deadline keeps its civil day");

const md = renderMinutaMarkdown({
  tipo: "reunion",
  titulo: "Reunión estrategia",
  fecha: "2026-07-20T15:00",
  modalidad: "videollamada",
  lugar: "Meet",
  participantes: "Socio, Abogado",
  resumenEjecutivo: "Se acordó insistir en prueba documental.",
  acuerdos: "Cliente aprobará presupuesto de perito.",
  causa: {
    titulo: "Cobro de pesos",
    rit: "C-4521-2025",
    tribunal: "1º Civil",
    etapa: "prueba",
  },
  autorName: "Camila Rojas",
  acciones: [
    {
      descripcion: "Encargar perito",
      responsable: "Asistente",
      fechaLimite: "2026-07-28",
      prioridad: "alta",
    },
  ],
});

assert(md.includes("Minuta — Reunión"), "header tipo");
assert(md.includes("C-4521-2025"), "rit");
assert(md.includes("Encargar perito"), "accion");
assert(md.includes("2026-07-28"), "local due date in md");
assert(md.includes("handoff"), "handoff footer");
for (const [estado, label] of [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["hecha", "Hecha"], ["cancelada", "Cancelada"]]) {
  const text = renderMinutaMarkdown({ tipo: "reunion", titulo: "Estado de seguimiento", fecha: "2026-11-08", resumenEjecutivo: "Prueba", causa: { titulo: "Ficticia" }, acciones: [{ descripcion: "Revisar antecedentes", estado }] });
  assert(text.includes(`estado ${label}`), `exports action state ${estado}`);
}

console.log("minutas.render.test.ts OK");
