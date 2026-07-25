import { renderMinutaMarkdown, labelTipoMinuta } from "./minutas";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(labelTipoMinuta("audiencia") === "Audiencia", "label audiencia");
assert(labelTipoMinuta("llamada") === "Llamada", "label llamada");

const md = renderMinutaMarkdown({
  tipo: "reunion",
  titulo: "Reunión estrategia",
  fecha: "2026-07-20T15:00:00.000Z",
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
assert(md.includes("handoff"), "handoff footer");

console.log("minutas.render.test.ts OK");
