const $ = id => document.getElementById(id);
const day = s => s?.slice(0, 10), plusDay = (s, n) => new Date(Date.parse(s + "T00:00:00.000Z") + n * 86400000).toISOString().slice(0, 10);
function localDay(s) { const d = new Date(s), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
export const operationConfigs = {
    evento: { noun: "evento", plural: "Agenda", title: "titulo", defaults: { titulo: "", tipo: "reunion", inicio: "", fin: null, todoElDia: false, lugar: null, modalidad: null, enlace: null, notas: null, tipoAudiencia: null, tribunal: null, estado: "programado" }, fields: [
            ["titulo", "Título del evento", "text", 200], ["tipo", "Tipo de evento", [["audiencia", "Audiencia"], ["reunion", "Reunión"], ["recordatorio", "Recordatorio"], ["vencimiento", "Vencimiento"], ["otro", "Otro"]]],
            ["todoElDia", "Evento de día completo", [["false", "No"], ["true", "Sí"]]], ["inicio", "Inicio del evento", "event-time"], ["fin", "Fin del evento / último día incluido", "event-time"],
            ["lugar", "Lugar del evento", "text", 300], ["modalidad", "Modalidad del evento", [["", "Sin especificar"], ["presencial", "Presencial"], ["videollamada", "Videollamada"], ["telefonica", "Telefónica"], ["hibrida", "Híbrida"], ["tribunal", "Tribunal"]]],
            ["enlace", "Enlace del evento (HTTP o HTTPS)", "url", 2000], ["notas", "Notas del evento", "textarea", 5000], ["tipoAudiencia", "Tipo de audiencia", "text", 120], ["tribunal", "Tribunal de la audiencia", "text", 300], ["estado", "Estado del evento", [["programado", "Programado"], ["realizado", "Realizado"], ["cancelado", "Cancelado"]]],
        ] },
    tramite: { noun: "trámite", plural: "Trámites", title: "titulo", defaults: { titulo: "", detalle: null, estado: "pendiente", fechaLimite: null, orden: 0 }, fields: [
            ["titulo", "Título del trámite", "text", 300], ["detalle", "Detalle del trámite", "textarea", 10000], ["estado", "Estado del trámite", [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["hecho", "Hecho"], ["cancelado", "Cancelado"]]], ["fechaLimite", "Fecha límite del trámite", "civil"], ["orden", "Orden del trámite (0 al principio)", "number", 1000000],
        ] },
};
export function normalizeOperation(kind, values) { if (kind !== "evento")
    return values; for (const k of ["titulo", "lugar", "enlace", "notas", "tipoAudiencia", "tribunal"])
    if (typeof values[k] === "string")
        values[k] = values[k].trim() || (k === "titulo" ? "" : null); return values; }
export function eventInputValue(item, key, localDate) { if (!item.fields[key])
    return ""; return item.fields.todoElDia ? key === "fin" ? plusDay(day(item.fields[key]), -1) : day(item.fields[key]) : localDate(item.fields[key]); }
export function setEventTime(item, key, value) { item.fields[key] = value ? item.fields.todoElDia ? (key === "fin" ? plusDay(value, 1) : value) + "T00:00:00.000Z" : new Date(value).toISOString() : key === "inicio" ? "" : null; item.dateReviewed = false; }
export function toggleEventDay(item, allDay) {
    const f = item.fields;
    item.previousEventIntervals ||= {};
    item.previousEventIntervals[String(f.todoElDia)] = { inicio: f.inicio, fin: f.fin };
    f.todoElDia = allDay;
    const previous = item.previousEventIntervals[String(allDay)];
    if (previous) {
        f.inicio = previous.inicio;
        f.fin = previous.fin;
    }
    else if (f.inicio) {
        if (allDay) {
            const start = localDay(f.inicio), end = f.fin ? localDay(f.fin) : start;
            f.inicio = start + "T00:00:00.000Z";
            f.fin = plusDay(end < start ? start : end, 1) + "T00:00:00.000Z";
        }
        else {
            f.inicio = new Date(day(f.inicio) + "T00:00:00").toISOString();
            f.fin = f.fin ? new Date(day(f.fin) + "T00:00:00").toISOString() : null;
        }
    }
    item.dateReviewed = false;
}
export function renderOperation(item) {
    const active = ["evento", "tramite"].includes(item?.kind);
    $("operation-review").hidden = !active;
    $("operation-notice").textContent = "";
    $("operation-readback").textContent = "";
    $("operation-warning").textContent = "";
    $("operation-reviewed").checked = Boolean(item?.dateReviewed);
    if (!active)
        return;
    $("operation-notice").textContent = item.baseRelations?.readOnly ? "Copia de consulta. La edición de eventos de Google o registros sin permiso requiere conexión y autorización." : item.kind === "tramite" ? "El trámite y su tarea se confirman juntos. Las instrucciones y otros datos independientes de la tarea se conservan." : "Las horas se editan en la zona del navegador. El último día de un evento completo está incluido. Los solapamientos se revisan al sincronizar.";
    const f = item.fields;
    if (item.kind === "evento" && f.inicio) {
        const fmt = s => new Intl.DateTimeFormat("es-CL", { dateStyle: "full", ...(!f.todoElDia ? { timeStyle: "short" } : { timeZone: "UTC" }) }).format(new Date(s));
        $("operation-readback").textContent = f.todoElDia ? `Días completos: ${fmt(f.inicio)}${f.fin ? " — " + fmt(plusDay(day(f.fin), -1) + "T12:00:00.000Z") : ""}` : `Horario (${Intl.DateTimeFormat().resolvedOptions().timeZone}): ${fmt(f.inicio)}${f.fin ? " — " + fmt(f.fin) : ""}`;
    }
    if (item.kind === "tramite" && f.fechaLimite)
        $("operation-readback").textContent = "Fecha del trámite: " + new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: "UTC" }).format(new Date(day(f.fechaLimite) + "T12:00:00.000Z"));
    $("operation-warning").textContent = item.baseRelations?.warning || "";
    $("operation-date-confirm").hidden = item.kind === "tramite" && !f.fechaLimite;
}
