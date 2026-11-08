import { operationConfigs, normalizeOperation, eventInputValue, setEventTime, toggleEventDay, renderOperation } from "/offline/operations.js";
import { memoConfigs, setupMemoActions } from "/offline/memos.js";
import { setupBindings } from "/offline/bindings.js";
import { setupFiles } from "/offline/files.js";
const $ = id => document.getElementById(id);
const copy = value => structuredClone(value);
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sorted(item)])) : value;
const canonical = value => JSON.stringify(sorted(value));
const same = (a, b) => canonical(a) === canonical(b);
const clienteFields = [
  ["razonSocial", "Razón social / nombre", "text", 300], ["rut", "RUT", "text", 32],
  ["email", "Correo electrónico", "email", 320], ["telefono", "Teléfono", "tel", 60],
  ["tipo", "Tipo de cliente", [["persona", "Persona"], ["empresa", "Empresa"]]],
  ["estado", "Estado del cliente", [["activo", "Activo"], ["inactivo", "Inactivo"]]],
  ["notas", "Notas del cliente", "textarea", 10000],
];
const taskFields = [
  ["title", "Título de la tarea", "text", 300], ["description", "Descripción", "textarea", 20000],
  ["instructions", "Instrucciones", "textarea", 20000], ["considerations", "Consideraciones", "textarea", 20000],
  ["status", "Estado de la tarea", [["todo", "Pendiente"], ["in_progress", "En curso"], ["blocked", "Bloqueada"], ["waiting_client", "Espera al cliente"], ["done", "Completada"], ["cancelled", "Cancelada"]]],
  ["priority", "Prioridad", [["low", "Baja"], ["medium", "Media"], ["high", "Alta"], ["urgent", "Urgente"]]],
  ["dueDate", "Vencimiento (hora local)", "datetime-local"], ["remindAt", "Recordatorio (hora local)", "datetime-local"],
  ["waitingOn", "A la espera de", [["", "Sin espera"], ["cliente", "Cliente"], ["tribunal", "Tribunal"], ["contraparte", "Contraparte"], ["interno", "Interno"]]],
];
const causaFields = [
  ["titulo", "Título de la causa", "text", 500], ["rit", "RIT / ROL", "text", 100], ["ruc", "RUC", "text", 100],
  ["tribunal", "Tribunal u órgano", "text", 300], ["materia", "Materia", "text", 120], ["procedimiento", "Procedimiento", "text", 200],
  ["estado", "Estado de la causa", "text", 40], ["etapa", "Etapa de la causa", "text", 40], ["caratula", "Carátula", "text", 500],
  ["resumen", "Resumen de la causa", "textarea", 20000], ["sala", "Sala", "text", 120], ["cuaderno", "Cuaderno", "text", 120],
  ["abogadoContraparte", "Abogado de contraparte", "text", 300], ["fechaNotificacion", "Notificación de la causa", "civil"],
];
const plazoFields = [
  ["titulo", "Título del plazo", "text", 300], ["descripcion", "Descripción del plazo", "textarea", 20000],
  ["fechaLimite", "Fecha límite revisada", "civil"], ["fechaNotificacion", "Notificación del plazo", "civil"],
  ["tipoComputo", "Tipo de cómputo registrado", [["habiles", "Hábiles"], ["corridos", "Corridos"]]],
  ["esFatal", "Plazo fatal", [["false", "No"], ["true", "Sí"]]], ["tipo", "Tipo de plazo", "text", 80],
  ["estado", "Estado del plazo", [["pendiente", "Pendiente"], ["cumplido", "Cumplido"], ["vencido", "Vencido"], ["suspendido", "Suspendido"]]],
];
const config = {
  ...memoConfigs,
  ...operationConfigs,
  cliente: { noun: "cliente", plural: "Clientes", fields: clienteFields, title: "razonSocial", defaults: { razonSocial: "", rut: null, email: null, telefono: null, tipo: "persona", estado: "activo", notas: null } },
  task: { noun: "tarea", plural: "Tareas", fields: taskFields, title: "title", defaults: { title: "", description: null, instructions: null, considerations: null, status: "todo", priority: "medium", dueDate: null, remindAt: null, waitingOn: null } },
  causa: { noun: "causa", plural: "Causas", fields: causaFields, title: "titulo", defaults: { titulo: "", rit: null, ruc: null, tribunal: "", materia: "civil", procedimiento: null, estado: "activa", etapa: "ingreso", caratula: null, resumen: null, sala: null, cuaderno: null, abogadoContraparte: null, fechaNotificacion: null, partes: [] } },
  plazo: { noun: "plazo", plural: "Plazos", fields: plazoFields, title: "titulo", defaults: { titulo: "", descripcion: null, fechaLimite: "", fechaNotificacion: null, tipoComputo: "habiles", esFatal: false, tipo: "procesal", estado: "pendiente" } },
};
const defaults = kind => copy(typeof config[kind].defaults === "function" ? config[kind].defaults() : config[kind].defaults);
const canonicalParts = parts => copy(parts).sort((a,b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
const normalize = (kind, fields) => normalizeOperation(kind, Object.fromEntries(Object.keys(defaults(kind)).map(key => [key,
  ["tags", "participantes"].includes(key) ? fields[key] ?? "" : key === "acciones" ? fields[key].map(a => ({ ...a, descripcion: a.descripcion?.trim() || "", responsable: a.responsable || null, fechaLimite: a.fechaLimite?.length === 10 ? new Date(a.fechaLimite + "T00:00:00.000Z").toISOString() : a.fechaLimite || null })) : key === "partes" ? canonicalParts(fields[key]) : key.startsWith("fecha") && fields[key] && fields[key].length === 10 ? new Date(fields[key] + "T00:00:00.000Z").toISOString()
  : [config[kind].title, "tribunal", "materia"].includes(key) && typeof fields[key] === "string" ? fields[key].trim() : key === "email" ? fields[key]?.trim() || null : fields[key] === "" ? null : fields[key]])));
function civilDate(value) {
  if (!value || value.length === 10) return value || "";
  if (value.endsWith("T00:00:00.000Z")) return value.slice(0,10);
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = type => parts.find(p => p.type === type).value; return `${get("year")}-${get("month")}-${get("day")}`;
}
function dateReadback(value) {
  const civil = civilDate(value);
  return civil ? "Fecha seleccionada: " + new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: "UTC" }).format(new Date(civil + "T12:00:00.000Z")) : "Seleccione una fecha límite revisada.";
}
function localDate(value) {
  if (!value) return "";
  const d = new Date(value), two = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
export function setupRecords({ getData, auth, flush, write, run, message, markDirty }) {
  const query = new URLSearchParams(location.search), requestedKind = query.get("kind"), requestedId = query.get("record");
  let kind = [...Object.keys(config), "documento", "adjunto"].includes(requestedKind) ? requestedKind : "writing", selected = "";
  const fileArea = setupFiles({ getData, auth, flush, write, run, message, markDirty, isCausePending: item => !same(normalize(item.kind, item.fields), item.baseFields) });
  const list = () => getData()?.records || [];
  const entry = () => list().find(item => item.localId === selected && item.kind === kind);
  const memoActions = setupMemoActions({ getItem: entry, markDirty, message, dateReadback });
  const bindings = setupBindings({ getData, getItem: entry, auth, flush, write, run, message, markDirty, getRemote, isCausePending: item => !same(normalize(item.kind, item.fields), item.baseFields) });
  const noun = () => config[kind]?.noun;
  const dirty = item => Boolean(item.pending || bindings.hasChanges(item) || !same(normalize(item.kind, item.fields), item.baseFields));
  const label = item => item.fields[config[item.kind].title] || "Registro sin título";
  function fields(item) {
    $("record-fields").replaceChildren(); memoActions.render(item);
    for (const [key, text, type, max] of config[kind].fields) {
      const label = document.createElement("label"), control = document.createElement(Array.isArray(type) ? "select" : type === "textarea" ? "textarea" : "input");
      const id = "record-" + key; label.htmlFor = id; label.textContent = text; control.id = id;
      if (Array.isArray(type)) for (const [value, title] of type) { const option = document.createElement("option"); option.value = value; option.textContent = title; if (kind === "minuta" && key === "confidencial" && (item.baseFields?.confidencial && value === "false" || item.baseRelations?.canConfidential === false && value === "true")) option.disabled = true; control.append(option); }
      else if (type === "textarea") { control.rows = 4; control.maxLength = max; }
      else { control.type = type === "event-time" ? item.fields.todoElDia ? "date" : "datetime-local" : type === "civil" ? "date" : type; if (max && type !== "number") control.maxLength = max; if (type === "number") { control.min = "0"; control.max = String(max); control.step = "1"; } if (type === "datetime-local" || type === "event-time") control.step = "1"; }
      control.value = type === "event-time" ? eventInputValue(item, key, localDate) : type === "datetime-local" ? localDate(item.fields[key]) : type === "civil" ? civilDate(item.fields[key]) : String(item.fields[key] ?? "");
      control.disabled = Boolean(item.baseRelations?.readOnly || item.kind === "plazo" && item.baseRelations?.sourceLocked && key !== "estado");
      control.addEventListener(Array.isArray(type) ? "change" : "input", () => {
        if (type === "event-time") { setEventTime(item, key, control.value); renderOperation(item); markDirty(); return; }
        if (key === "todoElDia") { toggleEventDay(item, control.value === "true"); markDirty(); fields(item); return; }
        item.fields[key] = type === "number" ? Number(control.value) : type === "datetime-local" ? control.value ? new Date(control.value).toISOString() : null : ["esFatal", "confidencial"].includes(key) ? control.value === "true" : control.value;
        if (item.kind === "plazo" && ["fechaLimite", "tipoComputo", "fechaNotificacion"].includes(key)) { item.dateReviewed = false; $("deadline-reviewed").checked = false; }
        if (item.kind === "plazo" && key === "fechaLimite") $("deadline-date-readback").textContent = dateReadback(item.fields[key]);
        if (item.kind === "tramite" && key === "fechaLimite") item.dateReviewed = false;
        renderOperation(item); markDirty();
      });
      $("record-fields").append(label, control);
      if (item.kind === "plazo" && key === "fechaLimite") { const p = document.createElement("p"); p.id = "deadline-date-readback"; p.className = "help"; p.textContent = dateReadback(item.fields[key]); $("record-fields").append(p); }
    }
    renderOperation(item);
    $("cause-parties").hidden = kind !== "causa"; $("deadline-review").hidden = kind !== "plazo";
    $("deadline-reviewed").checked = Boolean(item.dateReviewed); $("deadline-source-note").textContent = item.baseRelations?.sourceLocked ? "Los datos están fijados por tareas o minutas de origen. Puede actualizar su estado con los permisos correspondientes." : item.baseRelations?.calculationRegime ? "Esta fecha tiene un cálculo registrado. Cambiar las fechas o el tipo de cómputo lo sustituye por una fecha revisada manualmente." : "No se calcula un vencimiento sin conexión. Revise país, procedimiento y fecha antes de confirmar.";
    $("party-list").replaceChildren();
    if (kind === "causa") for (const [index, party] of item.fields.partes.entries()) {
      const group = document.createElement("fieldset"), legend = document.createElement("legend"); legend.textContent = `Parte ${index + 1}`; group.append(legend);
      for (const [key, text, max] of [["nombre", "Nombre de la parte", 300], ["rut", "Identificación de la parte", 100], ["rol", "Rol de la parte", 80], ["domicilio", "Domicilio de la parte", 1000]]) {
        const label = document.createElement("label"), input = document.createElement("input"); input.id = `party-${index}-${key}`; input.value = party[key] || ""; input.maxLength = max; label.htmlFor = input.id; label.textContent = text;
        input.oninput = () => { party[key] = input.value || (key === "nombre" || key === "rol" ? "" : null); markDirty(); }; group.append(label, input);
      }
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button"; remove.textContent = "Quitar esta parte"; remove.onclick = () => { item.fields.partes.splice(index, 1); markDirty(); fields(item); }; group.append(remove); $("party-list").append(group);
    }
  }
  function render() {
    const data = getData(); $("writing-space").hidden = kind !== "writing"; $("records-space").hidden = kind === "writing" || fileArea.isKind(kind); fileArea.render(kind);
    for (const [id, value] of [["tab-writings", "writing"], ["tab-clientes", "cliente"], ["tab-tasks", "task"], ["tab-causes", "causa"], ["tab-deadlines", "plazo"], ["tab-notes", "nota"], ["tab-minutes", "minuta"], ["tab-documents", "documento"], ["tab-attachments", "adjunto"], ["tab-events", "evento"], ["tab-procedures", "tramite"]]) $(id).setAttribute("aria-pressed", String(kind === value));
    if (!data) { renderOperation(null); bindings.render(null); memoActions.render(null); selected = ""; $("record-picker").replaceChildren(); $("record-fields").replaceChildren(); $("party-list").replaceChildren(); $("deadline-reviewed").checked = false; return; }
    data.records ||= [];
    if (kind === "writing" || fileArea.isKind(kind)) { renderOperation(null); bindings.render(null); memoActions.render(null); return; }
    const rows = list().filter(item => item.kind === kind);
    if (!rows.some(item => item.localId === selected)) selected = rows.find(item => item.remoteId === requestedId)?.localId || rows[0]?.localId || "";
    $("records-heading").textContent = config[kind].plural;
    $("record-new").textContent = ({ cliente: "Nuevo cliente local", task: "Nueva tarea local", causa: "Nueva causa local", plazo: "Nuevo plazo local", nota: "Nueva nota local", minuta: "Nueva minuta local", evento: "Nuevo evento local", tramite: "Nuevo trámite local" })[kind];
    $("record-pin").textContent = "Preparar " + noun();
    $("record-pin").hidden = kind !== requestedKind || !/^[A-Za-z0-9_-]{1,100}$/.test(requestedId || "") || rows.some(item => item.remoteId === requestedId);
    $("record-picker-label").textContent = kind === "evento" ? "Eventos locales" : config[kind].plural + " locales";
    const options = rows.map(item => { const option = document.createElement("option"); option.value = item.localId; option.textContent = label(item) + (dirty(item) ? " · pendiente" : ""); return option; });
    if (!options.length) { const option = document.createElement("option"); option.value = ""; option.textContent = "Prepare un registro o cree uno nuevo"; options.push(option); }
    $("record-picker").replaceChildren(...options); $("record-picker").value = selected;
    const item = entry(); $("record-editor").hidden = !item;
    bindings.render(item);
    if (item) { $("record-local-state").textContent = "Copia local guardada"; fields(item); $("record-revision").textContent = item.remoteId ? "Copia vinculada al servidor" : "Nuevo registro · aún no enviado"; $("record-refresh").disabled = !item.remoteId; }
  }
  async function getRemote(itemKind, id) {
    const res = await fetch(`/api/offline/entities?kind=${itemKind}&id=${encodeURIComponent(id)}`, { cache: "no-store", redirect: "error" });
    const value = await res.json().catch(() => null);
    if (!res.ok || !value?.version) throw new Error(value?.error || "No se pudo preparar el registro. Compruebe su sesión y sus permisos.");
    return value;
  }
  for (const [id, value] of [["tab-writings", "writing"], ["tab-clientes", "cliente"], ["tab-tasks", "task"], ["tab-causes", "causa"], ["tab-deadlines", "plazo"], ["tab-notes", "nota"], ["tab-minutes", "minuta"], ["tab-documents", "documento"], ["tab-attachments", "adjunto"], ["tab-events", "evento"], ["tab-procedures", "tramite"]]) $(id).onclick = () => void run(async () => { await flush(); kind = value; selected = ""; render(); });
  $("record-new").onclick = () => void run(async () => {
    await flush(); const item = { localId: crypto.randomUUID(), kind, fields: defaults(kind), baseFields: null };
    getData().records ||= []; getData().records.push(item);
    try { await write(); } catch (error) { getData().records.pop(); throw error; }
    selected = item.localId; render(); message("Borrador local creado. Complete los datos y sincronice cuando tenga conexión."); $("record-fields").querySelector("input")?.focus();
  });
  $("record-pin").onclick = () => void run(async () => {
    await flush(); await auth(); const remote = await getRemote(kind, requestedId); await auth();
    const item = { localId: crypto.randomUUID(), kind, remoteId: remote.id, version: remote.version, fields: remote.fields, baseFields: normalize(kind, remote.fields) };
    getData().records ||= []; getData().records.push(item); bindings.accept(item, remote);
    try { await write(); } catch (error) { getData().records.pop(); throw error; }
    selected = item.localId; render(); message("Registro preparado y cifrado. Puede continuar sin conexión.");
  });
  $("record-picker").onchange = () => { const next = $("record-picker").value; void run(async () => { await flush(); selected = next; render(); }); };
  $("record-sync").onclick = () => void run(async () => {
    await flush(); await auth(); const item = entry(); if (!item) return;
    if (item.baseRelations?.readOnly) throw new Error("Esta copia es de consulta. Sus permisos se comprueban con conexión.");
    if (item.referenceFailure) throw new Error("Revise las referencias rechazadas o deshaga sus elecciones antes de preparar otra petición. Sus cambios se conservan.");
    if (item.conflict) throw new Error(item.conflictReason || "Hay cambios en otra sesión. Descargue su copia local y compárela antes de continuar.");
    if (!dirty(item)) { message("Este registro no tiene cambios locales pendientes."); return; }
    const current = normalize(kind, item.fields);
    if (!current[config[kind].title]) throw new Error("Complete el nombre o título del registro antes de sincronizar.");
    const relationChanges = item.pending ? undefined : bindings.changes(item);
    if (!item.pending && ["nota", "minuta", "tramite"].includes(kind) && !item.remoteId && !relationChanges?.cause?.id) throw new Error("Seleccione una causa preparada antes de sincronizar este registro.");
    if (!item.pending) item.pending = { requestId: crypto.randomUUID(), kind, action: item.remoteId ? "update" : "create", ...(item.remoteId ? { entityId: item.remoteId, expectedVersion: item.version } : {}), fields: copy(current), ...(relationChanges ? { relations: relationChanges } : {}), ...(["plazo", "evento", "tramite"].includes(kind) ? { dateReviewed: Boolean(item.dateReviewed) } : {}), ...(kind === "minuta" ? { reviewedActions: copy(item.reviewedActions || []) } : {}) };
    await write();
    const csrf = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith("lexopen_csrf="))?.slice(13);
    if (!csrf) throw new Error("Abra LexOpen e inicie sesión para renovar la protección de la sesión. La copia local se conserva.");
    const res = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(csrf) }, body: JSON.stringify(item.pending), redirect: "error", signal: AbortSignal.timeout(30000) });
    const value = await res.json().catch(() => null);
    if (!res.ok || !value?.receipt || !value?.entity) {
      if (value?.code === "offline_reference_conflict" && value.unapplied === true) { item.referenceFailure = true; await write(); bindings.render(item); }
      else if (res.status === 409) { item.conflict = true; item.conflictReason = value?.error; await write(); }
      // These validation rejections precede the command transaction. Preserve
      // the working fields, but let a corrected request receive a new identity.
      if ([400, 413, 422].includes(res.status)) { delete item.pending; await write(); }
      throw new Error(value?.code === "offline_reference_conflict" ? value.error : res.status === 409 ? value?.error || "Hay cambios en otra sesión. Su copia local se conserva; descárguela y compárela con el servidor." : value?.error || "Respuesta desconocida. Reintente: se conserva la misma petición para evitar duplicados.");
    }
    const sent = item.pending, remote = value.entity;
    item.remoteId = value.receipt.entityId;
    if (remote.version !== value.receipt.version || !same(normalize(kind, remote.fields), normalize(kind, sent.fields)) || !bindings.matches(value)) {
      item.conflict = true; await write(); throw new Error("El envío anterior está confirmado, pero el servidor conserva otra versión. Su texto local sigue protegido; descargue y compare las copias.");
    }
    item.version = remote.version; item.baseFields = normalize(kind, remote.fields);
    if (same(normalize(kind, item.fields), sent.fields)) item.fields = copy(remote.fields);
    bindings.accept(item, remote, value.references);
    delete item.pending; await write(); render();
    message((dirty(item) ? "Envío anterior confirmado. Hay cambios locales posteriores: vuelva a sincronizar para enviarlos." : "Registro sincronizado. Los cambios ya están en LexOpen.") + (remote.relations?.warning ? " " + remote.relations.warning : ""));
  });
  $("record-refresh").onclick = () => void run(async () => {
    await flush(); await auth(); const item = entry(); if (!item?.remoteId) throw new Error("Este registro aún no tiene una identidad confirmada en el servidor. Reintente su sincronización.");
    if (dirty(item) && !confirm("Esta acción reemplaza los cambios locales. Descargue una copia antes de continuar. ¿Descargar la versión del servidor?")) return;
    const remote = await getRemote(kind, item.remoteId); await auth();
    item.fields = remote.fields; item.baseFields = normalize(kind, remote.fields); item.version = remote.version; bindings.accept(item, remote); delete item.relationChoices; delete item.referenceFailure; delete item.pending; delete item.conflict; delete item.conflictReason;
    await write(); render(); message("Copia local actualizada desde el servidor.");
  });
  $("record-download").onclick = () => {
    const item = entry(); if (!item) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind, fields: item.fields, pending: item.pending, remoteId: item.remoteId, version: item.version, relations: item.relationChoices, baseRelations: item.baseRelations, lastRejectedRequest: item.lastRejectedRequest, reviewedActions: item.reviewedActions, dateReviewed: item.dateReviewed }, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = noun() + "-local.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("record-remove").onclick = () => void run(async () => {
    await flush(); const item = entry(); if (!item) return;
    if (!confirm("¿Quitar esta copia local, incluidos sus cambios pendientes? Descargue antes los datos que necesite conservar.")) return;
    getData().records = list().filter(value => value.localId !== selected); await write(); selected = ""; render(); message("Copia local quitada. El registro del servidor se conserva.");
  });
  $("party-add").onclick = () => { const item = entry(); if (item?.kind !== "causa") return; if (item.fields.partes.length >= 50) { message("La causa admite 50 partes en esta copia.", true); return; } item.fields.partes.push({ nombre: "", rut: null, rol: "demandante", domicilio: null }); markDirty(); fields(item); };
  $("deadline-reviewed").onchange = () => { const item = entry(); if (item) { item.dateReviewed = $("deadline-reviewed").checked; markDirty(); } };
  $("operation-reviewed").onchange = () => { const item = entry(); if (item && !item.baseRelations?.readOnly) { item.dateReviewed = $("operation-reviewed").checked; markDirty(); } };
  return { render, refreshActions() { fileArea.refresh(); $("record-refresh").disabled = !entry()?.remoteId; bindings.refreshActions(); memoActions.refreshActions(); if (entry()?.baseRelations?.readOnly) { for (const n of $("record-fields").querySelectorAll("input,select,textarea")) n.disabled = true; $("record-sync").disabled = true; $("operation-reviewed").disabled = true; } if (entry()?.kind === "plazo" && entry().baseRelations?.sourceLocked) for (const key of plazoFields.map(f => f[0]).filter(k => k !== "estado")) $("record-" + key).disabled = true; } };
}
