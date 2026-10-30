import { normalizeAssistantInput } from "./normalize";
import { santiagoDateKey, addCivilDays } from "@/lib/chile-time";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const NOW = new Date("2026-09-30T15:00:00.000Z"); // miércoles en Santiago (invierno/verano da igual, es UTC-3/4)
const today = santiagoDateKey(NOW);

// hoy / mañana / pasado mañana
{
  const r = normalizeAssistantInput("agenda una reunión hoy", NOW);
  assert(r.dates.includes(today), "hoy → fecha de hoy");
}
{
  const r = normalizeAssistantInput("crea un plazo para mañana", NOW);
  assert(r.dates.includes(addCivilDays(today, 1)), "mañana → +1 día");
}
{
  const r = normalizeAssistantInput("nos vemos pasado mañana", NOW);
  assert(r.dates.includes(addCivilDays(today, 2)), "pasado mañana → +2 días");
  assert(!r.dates.includes(addCivilDays(today, 1)), "pasado mañana no debe matchear mañana");
}

// "el lunes"
{
  const r = normalizeAssistantInput("agenda audiencia el lunes", NOW);
  assert(r.dates.length === 1, "el lunes → una fecha detectada");
  const [y, m, d] = r.dates[0].split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  assert(dow === 1, "el lunes → día de semana lunes (1)");
}

// "en N días" / "en N días hábiles"
{
  const r = normalizeAssistantInput("recuérdame en 3 días", NOW);
  assert(r.dates.includes(addCivilDays(today, 3)), "en 3 días → +3 corridos");
}
{
  const r = normalizeAssistantInput("vence en 5 días hábiles", NOW);
  assert(r.dates.length === 1, "en 5 días hábiles → una fecha detectada");
  assert(r.dates[0] !== addCivilDays(today, 5), "días hábiles no es igual a corridos (salvo coincidencia)");
}

// RIT / RUC
{
  const r = normalizeAssistantInput("busca la causa C-4521-2025 por favor", NOW);
  assert(r.rit === "C-4521-2025", `RIT detectado: ${r.rit}`);
}
{
  const r = normalizeAssistantInput("sin identificadores válidos aquí", NOW);
  assert(r.rit === undefined, "sin RIT válido no debe extraer nada");
}
{
  const r = normalizeAssistantInput("ruc 1234567890-1 asociado", NOW);
  assert(r.ruc === "1234567890-1", `RUC detectado: ${r.ruc}`);
}

// menciones
{
  const r = normalizeAssistantInput("avisa a @juan.perez sobre esto", NOW);
  assert(r.mentions.includes("juan.perez"), "mención @juan.perez detectada");
}

// texto se preserva (trim, sin normalizar acentos en el campo `text`)
{
  const r = normalizeAssistantInput("  Crea una Nota con acentuación  ", NOW);
  assert(r.text === "Crea una Nota con acentuación", "text preserva mayúsculas/acentos tras trim");
}

// hora «a las N»
{
  const r = normalizeAssistantInput(
    "agenda una audiencia mañana a las 10 sobre prueba e2e",
    NOW
  );
  assert(r.dates.includes(addCivilDays(today, 1)), "mañana con hora");
  assert(r.time === "10:00", `hora detectada: ${r.time}`);
}

console.log("assistant/normalize.test.ts OK");
