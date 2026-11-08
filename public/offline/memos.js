const $ = id => document.getElementById(id);
export const memoConfigs = {
  nota: { noun: "nota", plural: "Notas", title: "titulo", fields: [["titulo", "Título de la nota", "text", 200], ["contenido", "Contenido de la nota", "textarea", 20000], ["tags", "Etiquetas de la nota", "text", 300]], defaults: { titulo: "", contenido: "", tags: "" } },
  minuta: { noun: "minuta", plural: "Minutas", title: "titulo", fields: [
    ["tipo", "Tipo de minuta", [["reunion", "Reunión"], ["audiencia", "Audiencia"], ["llamada", "Llamada"]]], ["titulo", "Título de la minuta", "text", 300], ["fecha", "Fecha y hora de la minuta", "datetime-local"],
    ["modalidad", "Modalidad", [["presencial", "Presencial"], ["videollamada", "Videollamada"], ["telefonica", "Telefónica"], ["hibrida", "Híbrida"]]],
    ["lugar", "Lugar de la minuta", "text", 300], ["participantes", "Participantes", "text", 3000], ["resumenEjecutivo", "Resumen ejecutivo", "textarea", 50000], ["hechosRelevantes", "Hechos relevantes", "textarea", 20000], ["acuerdos", "Acuerdos", "textarea", 20000],
    ["proximosPasos", "Próximos pasos", "textarea", 20000], ["riesgosAlertas", "Riesgos y alertas", "textarea", 20000], ["estadoCausaNota", "Estado tras el acto", "textarea", 20000], ["etapaSugerida", "Etapa sugerida (anotación)", "text", 40], ["confidencial", "Confidencialidad de la minuta", [["false", "Compartida con el equipo autorizado"], ["true", "Confidencial"]]],
  ], defaults: () => ({ tipo: "reunion", titulo: "", fecha: new Date().toISOString(), modalidad: "presencial", lugar: null, participantes: "", resumenEjecutivo: "", hechosRelevantes: null, acuerdos: null, proximosPasos: null, riesgosAlertas: null, estadoCausaNota: null, etapaSugerida: null, confidencial: false, acciones: [] }) },
};
function civil(value) { if (!value) return ""; if (value.length === 10 || value.endsWith("T00:00:00.000Z")) return value.slice(0, 10); const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)); const get = t => parts.find(p => p.type === t).value; return `${get("year")}-${get("month")}-${get("day")}`; }
export function setupMemoActions({ getItem, markDirty, message, dateReadback }) {
  function resetReview(item, id) { item.reviewedActions = (item.reviewedActions || []).filter(value => value !== id); }
  function persisted(item, id) { return item.baseFields?.acciones?.find(a => a.id === id) || (!item.referenceFailure && item.pending?.fields.acciones?.find(a => a.id === id)); }
  function render(item) {
    $("memo-actions").hidden = item?.kind !== "minuta"; $("memo-action-list").replaceChildren();
    if (item?.kind !== "minuta") return;
    $("memo-action-summary").textContent = `Acciones y seguimiento (${item.fields.acciones.length})`;
    for (const [index, action] of item.fields.acciones.entries()) {
      const group = document.createElement("fieldset"), legend = document.createElement("legend"); group.dataset.actionId = action.id; legend.textContent = `Acción ${index + 1}`; group.append(legend);
      const inputs = [
        ["descripcion", "Descripción de la acción", "textarea", 10000], ["responsable", "Responsable indicado", "text", 300], ["fechaLimite", "Fecha de la acción", "date"],
        ["prioridad", "Prioridad de la acción", [["baja", "Baja"], ["media", "Media"], ["alta", "Alta"], ["urgente", "Urgente"]]], ["estado", "Estado de la acción", [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["hecha", "Hecha"], ["cancelada", "Cancelada"]]],
        ["crearTask", "Seguimiento como tarea", [["true", "Crear o conservar tarea"], ["false", "Sin tarea"]]], ["crearPlazo", "Seguimiento como plazo", [["false", "Sin plazo"], ["true", "Crear o conservar plazo"]]],
        ["tipoComputo", "Tipo de cómputo de la acción", [["habiles", "Hábiles"], ["corridos", "Corridos"]]], ["esFatal", "Plazo fatal de la acción", [["false", "No"], ["true", "Sí"]]],
      ];
      const readback = document.createElement("p"), reviewLabel = document.createElement("label"), check = document.createElement("input"), span = document.createElement("span");
      check.type = "checkbox"; check.checked = Boolean(item.reviewedActions?.includes(action.id)); span.textContent = "He revisado la fecha de esta acción para el país y el procedimiento aplicables."; reviewLabel.className = "binding-case"; reviewLabel.append(check, span);
      const reviewState = () => { check.checked = Boolean(item.reviewedActions?.includes(action.id)); readback.textContent = action.fechaLimite ? dateReadback(action.fechaLimite) : "Sin fecha indicada. Para crear un plazo, indique una fecha revisada."; reviewLabel.hidden = !action.fechaLimite; };
      for (const [key, text, type, max] of inputs) {
        const label = document.createElement("label"), control = document.createElement(Array.isArray(type) ? "select" : type === "textarea" ? "textarea" : "input"); control.id = `memo-action-${index}-${key}`; label.htmlFor = control.id; label.textContent = text;
        if (Array.isArray(type)) for (const [value, title] of type) { const option = document.createElement("option"); option.value = value; option.textContent = title; if (["crearTask", "crearPlazo"].includes(key) && (item.baseFields?.acciones?.find(a => a.id === action.id)?.[key] || !item.referenceFailure && item.pending?.fields.acciones?.find(a => a.id === action.id)?.[key]) && value === "false") option.disabled = true; control.append(option); }
        else if (type === "textarea") { control.rows = 3; control.maxLength = max; } else { control.type = type; if (max) control.maxLength = max; }
        control.dataset.actionField = key; control.value = key === "fechaLimite" ? civil(action[key]) : String(action[key] ?? "");
        control.addEventListener(Array.isArray(type) ? "change" : "input", () => { action[key] = ["crearTask", "crearPlazo", "esFatal"].includes(key) ? control.value === "true" : control.value || null; if (["fechaLimite", "tipoComputo", "crearTask", "crearPlazo"].includes(key)) resetReview(item, action.id); reviewState(); markDirty(); });
        group.append(label, control);
      }
      readback.className = "help"; reviewState(); check.onchange = () => { resetReview(item, action.id); if (check.checked) (item.reviewedActions ||= []).push(action.id); markDirty(); };
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button"; remove.textContent = "Quitar acción sin enviar"; remove.disabled = Boolean(persisted(item, action.id)); remove.dataset.persistedAction = String(remove.disabled);
      remove.onclick = () => { if (persisted(item, action.id)) { message("La acción ya se envió. Confirme la sincronización antes de cambiar su seguimiento.", true); return; } item.fields.acciones = item.fields.acciones.filter(a => a.id !== action.id); resetReview(item, action.id); markDirty(); render(item); };
      group.append(readback, reviewLabel, remove); $("memo-action-list").append(group);
    }
  }
  $("memo-action-add").onclick = () => { const item = getItem(); if (item?.kind !== "minuta") return; if (item.fields.acciones.length >= 50) { message("La minuta admite 50 acciones en esta copia.", true); return; }
    item.fields.acciones.push({ id: crypto.randomUUID(), descripcion: "", responsable: null, fechaLimite: null, prioridad: "media", estado: "pendiente", crearTask: true, crearPlazo: false, tipoComputo: "habiles", esFatal: false }); markDirty(); render(item); $("memo-action-list").lastElementChild?.querySelector("textarea")?.focus();
  };
  return { render, refreshActions() {
    const item = getItem(); if (item?.kind !== "minuta") return;
    for (const group of $("memo-action-list").querySelectorAll("fieldset[data-action-id]")) {
      const id = group.dataset.actionId; group.querySelector("button[data-persisted-action]").disabled = Boolean(persisted(item, id));
      for (const key of ["crearTask", "crearPlazo"]) group.querySelector(`select[data-action-field="${key}"] option[value="false"]`).disabled = Boolean(item.baseFields?.acciones?.find(a => a.id === id)?.[key] || !item.referenceFailure && item.pending?.fields.acciones?.find(a => a.id === id)?.[key]);
    }
  } };
}
