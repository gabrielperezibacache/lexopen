import { notaCrearSchema, notaEditarSchema } from "./tools/nota";
import { tareaCrearSchema, tareaCompletarSchema } from "./tools/tarea";
import {
  causaVincularSchema,
  causaBuscarSchema,
  causaResumenSchema,
  causaMovimientosSchema,
  causaEstadoSchema,
} from "./tools/causa";
import { minutaBorradorSchema, minutaCrearSchema } from "./tools/minuta";
import {
  documentoBuscarSchema,
  documentoDescargarSchema,
  documentoResumirSchema,
  documentoClasificarSchema,
} from "./tools/documento";
import { plazoCrearSchema, plazoEstimarSchema } from "./tools/plazo";
import { eventoCrearSchema, eventoEditarSchema, eventoEliminarSchema } from "./tools/evento";
import { buscarSchema } from "./tools/buscar";
import { jurisprudenciaBuscarSchema, jurisprudenciaBriefSchema } from "./tools/jurisprudencia";
import { respuestaLibreSchema } from "./tools/respuesta-libre";
import { TOOLS, getTool, listToolsForRole } from "./tools/registry";
import { ASSISTANT_TOOL_IDS } from "./types";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function expectValid(schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown, label: string) {
  const r = schema.safeParse(input);
  assert(r.success, `${label}: se esperaba válido — ${JSON.stringify(input)}`);
}

function expectInvalid(schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown, label: string) {
  const r = schema.safeParse(input);
  assert(!r.success, `${label}: se esperaba inválido — ${JSON.stringify(input)}`);
}

// nota.*
expectValid(notaCrearSchema, { causaId: "c1", contenido: "hola" }, "nota.crear");
expectInvalid(notaCrearSchema, { causaId: "c1", contenido: "" }, "nota.crear vacío");
expectInvalid(notaCrearSchema, { contenido: "hola" }, "nota.crear sin causaId");
expectValid(notaEditarSchema, { notaId: "n1", titulo: "nuevo" }, "nota.editar");
expectInvalid(notaEditarSchema, { notaId: "n1" }, "nota.editar sin cambios");

// tarea.*
expectValid(tareaCrearSchema, { title: "Revisar contrato" }, "tarea.crear");
expectInvalid(tareaCrearSchema, { title: "" }, "tarea.crear título vacío");
expectValid(tareaCompletarSchema, { taskId: "t1" }, "tarea.completar");
expectInvalid(tareaCompletarSchema, {}, "tarea.completar sin taskId");

// causa.*
expectValid(causaVincularSchema, { causaId: "c1", clienteId: "cl1" }, "causa.vincular");
expectInvalid(causaVincularSchema, { causaId: "c1" }, "causa.vincular sin cliente/abogado");
expectValid(causaBuscarSchema, { q: "Pérez" }, "causa.buscar");
expectInvalid(causaBuscarSchema, { q: "" }, "causa.buscar vacío");
expectValid(causaResumenSchema, { causaId: "c1" }, "causa.resumen");
expectValid(causaMovimientosSchema, { causaId: "c1", limit: 5 }, "causa.movimientos");
expectInvalid(causaMovimientosSchema, { causaId: "c1", limit: -1 }, "causa.movimientos limit inválido");
expectValid(causaEstadoSchema, { causaId: "c1" }, "causa.estado");

// minuta.*
expectValid(
  minutaBorradorSchema,
  { causaId: "c1", titulo: "Reunión", resumenEjecutivo: "resumen" },
  "minuta.borrador"
);
expectInvalid(minutaBorradorSchema, { causaId: "c1", titulo: "Reunión" }, "minuta.borrador sin resumen");
expectValid(
  minutaCrearSchema,
  { causaId: "c1", titulo: "Reunión", resumenEjecutivo: "resumen" },
  "minuta.crear"
);

// documento.*
expectValid(documentoBuscarSchema, { q: "contrato" }, "documento.buscar");
expectValid(documentoDescargarSchema, { documentoId: "d1" }, "documento.descargar");
expectValid(documentoResumirSchema, { documentoId: "d1" }, "documento.resumir");
expectValid(documentoClasificarSchema, { documentoId: "d1" }, "documento.clasificar");
expectInvalid(documentoDescargarSchema, {}, "documento.descargar sin id");

// plazo.*
expectValid(
  plazoCrearSchema,
  { titulo: "Contestar demanda", diasPlazo: 10 },
  "plazo.crear"
);
expectInvalid(plazoCrearSchema, { titulo: "x" }, "plazo.crear título muy corto");
expectValid(plazoEstimarSchema, { desde: "2026-10-01", dias: 5 }, "plazo.estimar");
expectInvalid(plazoEstimarSchema, { desde: "2026-10-01", dias: -1 }, "plazo.estimar dias inválido");

// evento.*
expectValid(eventoCrearSchema, { titulo: "Audiencia", inicio: "2026-10-05T10:00" }, "evento.crear");
expectInvalid(eventoCrearSchema, { titulo: "", inicio: "2026-10-05T10:00" }, "evento.crear título vacío");
expectValid(eventoEditarSchema, { eventoId: "e1", titulo: "Nueva" }, "evento.editar");
expectValid(eventoEliminarSchema, { eventoId: "e1" }, "evento.eliminar");

// buscar / jurisprudencia / respuesta.libre
expectValid(buscarSchema, { q: "algo" }, "buscar");
expectValid(jurisprudenciaBuscarSchema, { q: "despido" }, "jurisprudencia.buscar");
expectValid(jurisprudenciaBriefSchema, { jurisprudenciaId: "j1" }, "jurisprudencia.brief");
expectValid(respuestaLibreSchema, { texto: "hola" }, "respuesta.libre");
expectInvalid(respuestaLibreSchema, { texto: "" }, "respuesta.libre vacío");

// registry: cobertura completa + roles no vacíos
for (const id of ASSISTANT_TOOL_IDS) {
  const tool = getTool(id);
  assert(tool.id === id, `registry: id coincide para ${id}`);
  assert(tool.roles.length > 0, `registry: ${id} debe tener al menos un rol`);
  assert(tool.kind === "read" || tool.kind === "write", `registry: ${id} kind válido`);
}
assert(Object.keys(TOOLS).length === ASSISTANT_TOOL_IDS.length, "registry: cobertura 1:1 con ASSISTANT_TOOL_IDS");

const staffTools = listToolsForRole("abogado");
assert(staffTools.length === ASSISTANT_TOOL_IDS.length, "listToolsForRole('abogado') ve todas las tools (todas son staff)");
const clienteTools = listToolsForRole("cliente");
assert(clienteTools.length === 0, "listToolsForRole('cliente') no ve ninguna tool del asistente");

console.log("assistant/tools.zod.test.ts OK");
