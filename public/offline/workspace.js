import { setupRecords } from "/offline/records.js";
import { openVaultStore } from "/offline/vault.js";
const $ = id => document.getElementById(id);
let vault, data, selected = "", dirty = false, editVersion = 0, busy = false, timer, writes = Promise.resolve();
const params = new URLSearchParams(location.search), caseId = params.get("case"), draftId = params.get("draft");
const validId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value || "");
const records = setupRecords({ getData: () => data, auth, flush, write, run, message, markDirty });
const entry = () => data?.entries.find(item => item.id === selected);
function message(text, error = false) { $("message").textContent = text; $("message").dataset.error = String(error); }
function network() { $("connection").textContent = navigator.onLine ? "Copia local · sincronización manual" : "Sin conexión · copia local"; }
function render() {
  records.render();
  document.querySelector(".intro").hidden = Boolean(data);
  $("gate").hidden = Boolean(data); $("workspace").hidden = !data;
  $("pin").hidden = !data || !validId(caseId) || !validId(draftId) || data.entries.some(item => item.id === draftId);
  if (!data) { $("title").value = ""; $("body").value = ""; $("drafts").replaceChildren(); return; }
  const options = data.entries.map(item => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.title + (item.pending || item.title !== item.baseTitle || item.body !== item.baseBody ? " · pendiente" : ""); return option; });
  if (!options.length) { const option = document.createElement("option"); option.textContent = "Prepare un escrito desde el editor de una causa"; option.value = ""; options.push(option); }
  $("drafts").replaceChildren(...options); $("drafts").value = selected;
  const item = entry(); $("editor").hidden = !item;
  if (item) { $("title").value = item.title; $("body").value = item.body; $("revision").textContent = `Versión de partida: ${item.revision}`; localState(); }
}
function storageState(text) { for (const id of ["local-state", "record-local-state", "file-local-state"]) $(id).textContent = text; }
function localState() { storageState(dirty ? "Guardando copia local…" : "Copia local guardada"); }
function markDirty() {
  dirty = true; editVersion += 1; localState(); clearTimeout(timer);
  timer = setTimeout(() => { void flush().catch(error => message(error.message, true)); }, 450);
}
async function auth() {
  const res = await fetch("/api/auth/me", { cache: "no-store", redirect: "error" });
  const value = await res.json();
  if (!res.ok || !value.user) throw new Error("Inicie sesión en LexOpen antes de preparar o sincronizar registros. Su copia local se conserva.");
  if (data && value.user.id !== data.ownerId) throw new Error("La sesión pertenece a otra cuenta. Inicie sesión con la cuenta que preparó este espacio; no se han enviado cambios.");
  return value.user;
}
async function getDraft(causa, draft) {
  const res = await fetch(`/api/causas/${encodeURIComponent(causa)}/writings/${encodeURIComponent(draft)}`, { cache: "no-store", redirect: "error" });
  const value = await res.json().catch(() => null);
  if (!res.ok || !value?.canWrite) throw new Error(value?.error || "El escrito ya no está disponible para edición. La copia local se conserva.");
  return value;
}
function write() {
  const snapshot = structuredClone(data);
  const task = writes.catch(() => {}).then(() => vault.write(snapshot));
  writes = task; return task.catch(error => { dirty = true; storageState("Copia local sin guardar · descargue el texto"); throw error; });
}
async function flush() { clearTimeout(timer); while (dirty) { const version = editVersion; await write(); if (version === editVersion) dirty = false; localState(); } await writes; }
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button,input,textarea,select").forEach(node => { node.disabled = true; });
  try { await action(); }
  catch (error) { message(error.message || "No se pudo completar la operación. La copia local se conserva.", true); }
  finally { busy = false; document.querySelectorAll("button,input,textarea,select").forEach(node => { node.disabled = false; }); records.refreshActions(); }
}
async function open(password, create = false) {
  if (!vault) throw new Error("El almacenamiento local no está disponible en este navegador.");
  if (create) { const user = await auth(); data = await vault.create(password, user.id); }
  else data = await vault.unlock(password);
  $("password").value = "";
  selected = data.entries.some(item => item.id === draftId) ? draftId : data.entries[0]?.id || "";
  data.records ||= [];
  dirty = false; $("create").hidden = true; $("unlock").hidden = false; render(); message("Espacio local abierto. Sincronice cada registro cuando tenga conexión.");
}
function createSpace() { return run(async () => {
  if ($("password").value.length < 12) throw new Error("Introduzca una clave local de al menos 12 caracteres.");
  if (!confirm("Conserve esta clave local: LexOpen no puede recuperarla. ¿Crear el espacio cifrado con la clave introducida?")) return;
  await open($("password").value, true);
}); }
$("unlock-form").addEventListener("submit", event => { event.preventDefault(); void ($("create").hidden ? run(() => open($("password").value)) : createSpace()); });
$("create").onclick = () => void createSpace();
$("pin").onclick = () => void run(async () => {
  await flush(); const user = await auth();
  if (data.entries.some(item => item.id === draftId)) { selected = draftId; render(); message("El escrito ya está preparado. Se ha conservado su copia local."); return; }
  const draft = await getDraft(caseId, draftId);
  if ((await auth()).id !== user.id) throw new Error("La sesión cambió. Vuelva a abrir el espacio local.");
  const item = { id: draft.id, causaId: draft.causaId, title: draft.title, body: draft.body, baseTitle: draft.title, baseBody: draft.body, revision: draft.revision };
  data.entries.push(item);
  try { await write(); } catch (error) { data.entries.pop(); throw error; }
  selected = item.id; render(); message("Escrito preparado. Puede desconectarse, cerrar la página y desbloquear esta copia al volver.");
});
$("drafts").onchange = () => { const next = $("drafts").value; void run(async () => { await flush(); selected = next; render(); }); };
function edit() {
  const item = entry(); if (!item) return;
  item.title = $("title").value; item.body = $("body").value; markDirty();
}
$("title").oninput = edit; $("body").oninput = edit;
$("download").onclick = () => {
  const item = entry(); if (!item) return;
  const link = document.createElement("a"), url = URL.createObjectURL(new Blob([item.title + "\n\n" + item.body], { type: "text/plain;charset=utf-8" }));
  link.href = url; link.download = "escrito-local.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("sync").onclick = () => void run(async () => {
  await flush(); await auth(); const item = entry(); if (!item) return;
  if (item.conflict) throw new Error("Hay cambios en otra sesión. Descargue su texto local y compárelo con el servidor antes de continuar.");
  if (!item.title.trim()) throw new Error("El escrito necesita un título para sincronizar.");
  if (!item.pending && item.title === item.baseTitle && item.body === item.baseBody) { message("Este escrito no tiene cambios locales pendientes."); return; }
  if (!item.pending) {
    item.pending = { requestId: crypto.randomUUID(), expectedRevision: item.revision, title: item.title.trim(), body: item.body };
    // The exact request must be durable before transport. A lost response replays it unchanged.
  }
  await write();
  const csrf = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith("lexopen_csrf="))?.slice("lexopen_csrf=".length);
  if (!csrf) throw new Error("Abra LexOpen e inicie sesión para renovar la protección de la sesión. Después reintente; su texto sigue guardado.");
  const res = await fetch(`/api/causas/${encodeURIComponent(item.causaId)}/writings/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(csrf) }, body: JSON.stringify(item.pending), redirect: "error", signal: AbortSignal.timeout(30000) });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.draft) {
    if (res.status === 409) { item.conflict = true; await write(); }
    throw new Error(res.status === 409 ? "Hay cambios en otra sesión. Su copia local se conserva: descárguela y compárela antes de reemplazarla." : result?.error || "Respuesta desconocida. Reintente la sincronización; se conservará el mismo identificador para evitar duplicados.");
  }
  const sent = item.pending, draft = result.draft;
  // A receipt replay can return a later server version. Never rebase local edits silently.
  if (draft.title !== sent.title || draft.body !== sent.body) {
    item.conflict = true; await write(); throw new Error("El servidor confirmó el envío anterior, pero ya existe una versión posterior. Descargue su texto local y compárelo.");
  }
  item.baseTitle = draft.title; item.baseBody = draft.body; item.revision = draft.revision;
  if (item.title.trim() === sent.title && item.body === sent.body) item.title = draft.title;
  delete item.pending; await write(); render();
  message(item.title === item.baseTitle && item.body === item.baseBody ? "Escrito sincronizado. Los cambios ya están en LexOpen." : "Envío anterior confirmado. Hay cambios locales posteriores: vuelva a sincronizar para enviarlos.");
});
$("refresh").onclick = () => void run(async () => {
  await flush(); await auth(); const item = entry(); if (!item) return;
  if ((item.pending || item.title !== item.baseTitle || item.body !== item.baseBody) && !confirm("Esta acción reemplaza el texto local y sus cambios pendientes. Descargue primero una copia si desea conservarlos. ¿Descargar la versión actual del servidor?")) return;
  const draft = await getDraft(item.causaId, item.id); await auth();
  Object.assign(item, { title: draft.title, body: draft.body, baseTitle: draft.title, baseBody: draft.body, revision: draft.revision }); delete item.pending; delete item.conflict;
  await write(); render(); message("Copia actualizada desde el servidor.");
});
$("remove").onclick = () => void run(async () => {
  await flush(); const item = entry(); if (!item) return;
  if (!confirm("¿Quitar este escrito del navegador? Descargue primero los cambios que necesite conservar.")) return;
  data.entries = data.entries.filter(value => value.id !== item.id); await write(); selected = data.entries[0]?.id || ""; render(); message("Copia local quitada. El escrito del servidor se conserva.");
});
function lock() { vault?.lock(); data = undefined; selected = ""; dirty = false; render(); $("password").focus(); }
$("lock").onclick = () => void run(async () => { await flush(); lock(); message("Espacio bloqueado. Introduzca la clave local para volver a abrirlo."); });
$("delete-vault").onclick = () => void run(async () => {
  await flush(); if (!confirm("¿Borrar todos los registros de este navegador, incluidos los cambios sin sincronizar? Descargue antes cualquier texto que necesite conservar.")) return;
  await vault.remove(); lock(); $("create").hidden = false; $("unlock").hidden = true; message("Espacio local borrado.");
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => { clearTimeout(timer); lock(); });
window.addEventListener("online", network); window.addEventListener("offline", network); network();
try {
  vault = await openVaultStore();
  const exists = await vault.exists(); $("create").hidden = exists; $("unlock").hidden = !exists;
  if (!exists) message("Cree el espacio con conexión y prepare las copias que necesite. Después puede continuar sin conexión.");
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
} catch (error) { message(error.message, true); $("create").disabled = true; $("unlock").disabled = true; }
