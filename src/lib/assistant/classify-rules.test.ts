import { ruleClassify } from "./classify-rules";
import { normalizeAssistantInput } from "./normalize";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const NOW = new Date("2026-09-30T15:00:00.000Z");

function classify(text: string) {
  return ruleClassify(normalizeAssistantInput(text, NOW));
}

// nota.crear
{
  const r = classify("crea una nota diciendo que el cliente llamó");
  assert(r.intents.length === 1, "nota.crear: un solo intent");
  assert(r.intents[0].toolId === "nota.crear", `esperado nota.crear, obtuve ${r.intents[0].toolId}`);
  assert(!r.clarify, "nota.crear no debe pedir clarify");
}

// tarea.completar
{
  const r = classify("marca la tarea de revisión como completada");
  assert(r.intents[0].toolId === "tarea.completar", "tarea.completar");
}

// causa.resumen
{
  const r = classify("resume el estado de la causa RIT C-1234-2025");
  assert(
    r.intents.some((i) => i.toolId === "causa.resumen"),
    "causa.resumen detectado"
  );
  assert(r.intents[0].slots.rit === "C-1234-2025", "RIT propagado a los slots");
}

// plazo.estimar
{
  const r = classify("cuando vence un plazo de 5 días hábiles desde hoy");
  assert(r.intents[0].toolId === "plazo.estimar", "plazo.estimar");
}

// evento.crear
{
  const r = classify("agenda una audiencia para el lunes");
  assert(r.intents[0].toolId === "evento.crear", "evento.crear");
  assert(r.intents[0].slots.fecha, "fecha propagada al slot");
}

// jurisprudencia.buscar
{
  const r = classify("busca jurisprudencia sobre despido injustificado");
  assert(
    r.intents.some((i) => i.toolId === "jurisprudencia.buscar"),
    "jurisprudencia.buscar detectado"
  );
}

// multi-intent con conector "y"
{
  const r = classify("crea una tarea de seguimiento y agenda una reunión con el cliente");
  assert(r.intents.length >= 2, "multi-intent con conector 'y'");
  assert(!r.clarify, "multi-intent explícito no debe pedir clarify");
}

// nunca falla en silencio: texto sin ningún patrón conocido
{
  const r = classify("hola, ¿cómo estás hoy?");
  assert(r.intents.length >= 1, "siempre devuelve al menos un intent");
  assert(
    r.intents.every((i) => i.toolId === "respuesta.libre" || i.toolId === "buscar"),
    "texto sin patrón conocido cae a respuesta.libre/buscar"
  );
}

// texto vacío tras normalizar sigue devolviendo respuesta.libre
{
  const r = classify("   ");
  assert(r.intents.length === 1 && r.intents[0].toolId === "respuesta.libre", "texto vacío → respuesta.libre");
}

console.log("assistant/classify-rules.test.ts OK");
