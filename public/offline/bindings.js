const $ = id => document.getElementById(id), copy = value => structuredClone(value);
const sameId = (a, b) => (a || null) === (b || null);
const token = ref => ({ id: ref.id, expectedVersion: ref.version });
const causeKind = item => ["task", "plazo", "nota", "minuta", "evento", "tramite"].includes(item.kind);
export function setupBindings({ getData, getItem, auth, flush, write, run, message, markDirty, getRemote, isCausePending }) {
  let results = [], nextAfter = null, proposal = null, lastItem = "";
  const shelf = () => { const data = getData(); if (!data) return { user: [], cause: [] }; return data.references ||= { user: [], cause: [] }; };
  function cache(type, ref, explicit = false) {
    if (!ref?.id || !ref.version) return;
    const items = shelf()[type], i = items.findIndex(x => x.id === ref.id);
    if (i >= 0) items[i] = copy(ref);
    else if (items.length < 100) items.push(copy(ref));
    else if (explicit) throw new Error("Hay 100 opciones preparadas de este tipo. Quite una antes de preparar otra.");
  }
  const base = item => item.baseRelations || { responsible: { id: getData().ownerId, label: "Mi cuenta" }, cause: null, cases: [], self: shelf().user.find(u => u.id === getData().ownerId) };
  const choices = item => item.relationChoices ||= {};
  const knownUsers = item => unique([base(item).self, base(item).responsible, ...shelf().user, choices(item).responsible?.reference].filter(Boolean));
  const localCauses = () => (getData()?.records || []).filter(r => r.kind === "causa").map(r => ({ id: "local:" + r.localId, label: "Copia local · " + (r.fields.titulo || "Causa sin título"), localId: r.localId }));
  const knownCauses = item => unique([base(item).cause, ...(base(item).cases || []), ...shelf().cause, ...(choices(item).cases || []).map(x => x.reference), choices(item).cause?.reference, ...(causeKind(item) ? localCauses() : [])].filter(Boolean));
  function unique(items) { const map = new Map(); for (const x of items) if (!map.has(x.id) || x.version) map.set(x.id, x); return [...map.values()]; }
  function resolvedCause(choice, validate) {
    if (!choice?.id?.startsWith("local:")) return choice;
    const local = (getData()?.records || []).find(r => "local:" + r.localId === choice.id && r.kind === "causa");
    if (!local?.remoteId || !local.baseRelations?.caseReference || local.pending || local.conflict || isCausePending(local)) {
      if (validate) throw new Error("Sincronice primero la causa local y confirme su resultado. El registro y sus cambios se conservan.");
      return choice;
    }
    return { id: local.remoteId, reference: local.baseRelations.caseReference };
  }
  function changes(item, validate = false) {
    const b = base(item), c = choices(item), result = {};
    if (!["nota", "minuta"].includes(item.kind) && c.responsible && !sameId(c.responsible.id, b.responsible?.id)) {
      if (validate && c.responsible.id && !c.responsible.reference?.version) throw new Error("Prepare la ficha del responsable con conexión antes de asignarlo.");
      result.responsible = c.responsible.id ? token(c.responsible.reference || { id: c.responsible.id }) : { id: null };
    }
    const cause = resolvedCause(c.cause, validate);
    if (causeKind(item) && cause && !sameId(cause.id, b.cause?.id)) {
      if (validate && (b.causeLocked || item.kind === "task" && item.remoteId && !b.contextVersion)) throw new Error("Actualice las referencias o conserve el vínculo de origen de la tarea.");
      if (validate && cause.id && !cause.reference?.version) throw new Error("Prepare primero la causa seleccionada.");
      result.cause = { ...(cause.id ? token(cause.reference || { id: cause.id }) : { id: null }), ...(b.cause ? { previous: token(b.cause) } : {}) };
    }
    if (item.kind === "cliente") {
      const links = (c.cases || []).filter(x => {
        const linked = Boolean((b.cases || []).some(r => r.id === x.id) || item.remoteId && x.reference?.clientId === item.remoteId);
        return x.link !== linked;
      }).map(x => ({ ...token(x.reference), link: x.link }));
      if (links.length) result.caseLinks = links;
    }
    if (Object.keys(result).length && item.kind === "task" && item.remoteId) {
      if (validate && !b.contextVersion) throw new Error("Prepare las referencias actuales de la tarea antes de cambiar sus vínculos.");
      result.contextVersion = b.contextVersion;
    }
    return Object.keys(result).length ? result : undefined;
  }
  function invalidate() { proposal = null; $("binding-review").hidden = true; }
  function pick() { invalidate(); markDirty(); render(getItem()); }
  function option(select, value, text, disabled = false) { const node = document.createElement("option"); node.value = value; node.textContent = text; node.disabled = disabled; select.append(node); }
  function render(item) {
    if (!item) {
      results = []; nextAfter = null; proposal = null; lastItem = ""; $("reference-results").replaceChildren(); $("binding-cases").replaceChildren();
      $("binding-responsible").replaceChildren(); $("binding-cause").replaceChildren(); $("reference-query").value = ""; $("binding-review-list").replaceChildren(); $("binding-review").hidden = true; return;
    }
    if (lastItem !== item.localId) { invalidate(); lastItem = item.localId; }
    $("binding-panel").hidden = item.kind === "causa";
    const b = base(item), c = choices(item), stale = Boolean(item.remoteId && !item.baseRelations);
    $("binding-notice").textContent = item.referenceFailure ? "La petición anterior fue rechazada sin aplicar cambios. Revise las referencias o deshaga sus elecciones; sus campos locales se conservan."
      : stale ? "Esta copia anterior aún no tiene referencias. Use Preparar opciones con conexión para añadirlas sin reemplazar sus campos."
      : "Seleccione opciones preparadas. Sus permisos y versiones se comprobarán al sincronizar. La asignación del cliente no modifica el equipo de sus causas.";
    const userSelect = $("binding-responsible"); userSelect.replaceChildren();
    option(userSelect, "", "Sin responsable", Boolean(b.responsibleRequired || item.kind === "evento" || item.remoteId && b.responsible && b.canAssignOthers === false));
    const users = knownUsers(item);
    for (const ref of users) option(userSelect, ref.id, ref.label, Boolean(item.kind === "task" && b.canAssignOthers === false && ref.id !== getData().ownerId && ref.id !== b.responsible?.id));
    if (!users.some(u => u.id === getData().ownerId)) option(userSelect, getData().ownerId, "Mi cuenta");
    userSelect.value = c.responsible ? c.responsible.id || "" : b.responsible?.id || ""; userSelect.disabled = stale || Boolean(b.sourceLocked || b.readOnly);
    $("binding-owner").hidden = ["nota", "minuta"].includes(item.kind);
    $("binding-cause-label").textContent = ({ plazo: "Causa del plazo", task: "Causa de la tarea", nota: "Causa de la nota", minuta: "Causa de la minuta", evento: "Causa del evento", tramite: "Causa del trámite" })[item.kind] || "Causa"; $("binding-task-cause").hidden = !causeKind(item); $("binding-client-cases").hidden = item.kind !== "cliente";
    const causeSelect = $("binding-cause"); causeSelect.replaceChildren(); option(causeSelect, "", ["nota", "minuta"].includes(item.kind) ? "Seleccione una causa preparada" : "Sin causa");
    for (const ref of knownCauses(item)) option(causeSelect, ref.id, ref.label);
    causeSelect.value = c.cause ? c.cause.id || "" : b.cause?.id || ""; causeSelect.disabled = stale || Boolean(b.causeLocked || b.readOnly);
    $("binding-cause-note").textContent = b.causeLocked ? "La causa está fijada por el origen de este registro." : "Al mover el registro se revisan la causa anterior, la nueva y el acceso del responsable.";
    $("binding-cases").replaceChildren();
    $("binding-more-cases").hidden = item.kind !== "cliente" || !b.moreCases;
    if (item.kind === "cliente") for (const ref of knownCauses(item)) {
      const choice = (c.cases || []).find(x => x.id === ref.id), original = Boolean((b.cases || []).some(x => x.id === ref.id) || item.remoteId && ref.clientId === item.remoteId);
      const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
      input.type = "checkbox"; input.checked = choice ? choice.link : original; input.disabled = stale;
      span.textContent = ref.label + (ref.clientId && ref.clientId !== item.remoteId ? ` · cliente actual: ${ref.clientLabel || "otro cliente"}` : "");
      input.onchange = () => {
        c.cases ||= []; const at = c.cases.findIndex(x => x.id === ref.id); const value = { id: ref.id, link: input.checked, reference: copy(ref) };
        if (at < 0) c.cases.push(value); else c.cases[at] = value; pick();
      };
      label.className = "binding-case"; label.append(input, span); $("binding-cases").append(label);
    }
    $("binding-review-start").hidden = !item.referenceFailure;
    $("binding-undo").disabled = false;
    renderShelf();
  }
  function renderShelf() {
    const type = $("reference-type").value, node = $("reference-results"); node.replaceChildren();
    const items = results.length ? results : shelf()[type];
    if (!items.length) { const p = document.createElement("p"); p.className = "help"; p.textContent = "Busque con conexión y prepare las opciones que necesite."; node.append(p); }
    for (const ref of items) {
      const row = document.createElement("div"), text = document.createElement("span"), button = document.createElement("button");
      row.className = "reference-row"; text.textContent = ref.label; button.type = "button"; button.className = "secondary";
      const saved = shelf()[type].some(x => x.id === ref.id && x.version === ref.version); button.textContent = results.length ? saved ? "Preparada" : "Preparar opción" : "Quitar opción";
      button.disabled = Boolean(results.length && saved); button.setAttribute("aria-label", `${button.textContent}: ${ref.label}`);
      button.onclick = () => void run(async () => { await flush(); if (results.length) cache(type, ref, true); else getData().references[type] = shelf()[type].filter(x => x.id !== ref.id); await write(); render(getItem()); message("Opciones locales actualizadas. Las elecciones de sus borradores se conservan."); });
      row.append(text, button); node.append(row);
    }
    $("reference-more").hidden = !nextAfter;
  }
  $("binding-responsible").onchange = () => { const item = getItem(), id = $("binding-responsible").value || null; choices(item).responsible = { id, reference: copy(knownUsers(item).find(u => u.id === id) || null) }; pick(); };
  $("binding-cause").onchange = () => { const item = getItem(), id = $("binding-cause").value || null; choices(item).cause = { id, reference: copy(knownCauses(item).find(c => c.id === id) || null) }; pick(); };
  $("binding-undo").onclick = () => { const item = getItem(); if (!item) return;
    const b = base(item); item.relationChoices = { responsible: { id: b.responsible?.id || null, reference: copy(b.responsible || null) }, cause: { id: b.cause?.id || null, reference: copy(b.cause || null) }, cases: (choices(item).cases || []).map(x => ({ ...x, link: Boolean((b.cases || []).some(r => r.id === x.id) || item.remoteId && x.reference?.clientId === item.remoteId) })) }; pick();
  };
  function active(state) { if (!state || getData() !== state) throw new Error("El espacio se bloqueó o cambió mientras se revisaban las opciones. Vuelva a abrirlo."); }
  async function fetchReference(type, id) {
    const res = await fetch(`/api/offline/references?type=${type}&id=${encodeURIComponent(id)}`, { cache: "no-store", redirect: "error" }); const value = await res.json().catch(() => null);
    if (!res.ok || !value?.items?.[0]) throw new Error(value?.error || "No se pudo revisar la referencia"); return value.items[0];
  }
  async function search(more = false) {
    const state = getData();
    await flush(); await auth(); const item = getItem(); if (!item) return;
    if (item.remoteId && !item.baseRelations && !item.pending) { const remote = await getRemote(item.kind, item.remoteId); active(state); if (remote.version !== item.version) throw new Error("El registro cambió en el servidor. Compare sus copias antes de añadir referencias."); accept(item, remote); }
    const type = $("reference-type").value, params = new URLSearchParams({ type, q: $("reference-query").value }); if (more && nextAfter) params.set("after", nextAfter);
    const res = await fetch("/api/offline/references?" + params, { cache: "no-store", redirect: "error" }), value = await res.json().catch(() => null);
    if (!res.ok || !value?.items) throw new Error(value?.error || "No se pudieron buscar las opciones"); await auth();
    active(state); cache("user", value.self); results = value.items; nextAfter = value.nextAfter; await write(); render(item); message("Elija qué opciones guardar cifradas para utilizarlas sin conexión.");
  }
  $("reference-search").onclick = () => void run(() => search()); $("reference-more").onclick = () => void run(() => search(true));
  $("reference-type").onchange = () => { results = []; nextAfter = null; renderShelf(); };
  $("binding-review-start").onclick = () => void run(async () => {
    const state = getData();
    await flush(); await auth(); const item = getItem(); if (!item?.referenceFailure) return;
    const remote = item.remoteId ? await getRemote(item.kind, item.remoteId) : null;
    if (remote && remote.version !== item.version) throw new Error("También cambiaron los campos del registro. Conserve su copia y compare la versión del servidor antes de continuar.");
    const next = copy(choices(item)), delta = changes(item), refs = [], lines = [];
    if (remote && item.kind === "task" && remote.relations?.contextVersion !== base(item).contextVersion) lines.push(`Origen actual de la tarea: ${remote.relations?.cause?.label || "sin causa"}. ${remote.relations?.causeLocked ? "El vínculo está fijado por su origen." : "Se comprobará este contexto al sincronizar."}`);
    if (delta?.responsible?.id) { const ref = await fetchReference("user", next.responsible.id); lines.push(`Responsable: ${next.responsible.reference?.label || ref.label} → ${ref.label}`); next.responsible.reference = ref; refs.push({ type: "user", ...ref }); }
    if (delta?.cause?.id) { const ref = await fetchReference("cause", resolvedCause(next.cause, true).id); lines.push(`${ref.label}: cliente actual ${ref.clientLabel || "sin cliente"}`); next.cause = { id: ref.id, reference: ref }; refs.push({ type: "cause", ...ref }); }
    for (const choice of (next.cases || []).filter(x => delta?.caseLinks?.some(c => c.id === x.id))) { const ref = await fetchReference("cause", choice.id); lines.push(`${ref.label}: ${choice.link ? "vincular" : "desvincular"}; cliente actual ${ref.clientLabel || "sin cliente"}`); choice.reference = ref; refs.push({ type: "cause", ...ref }); }
    await auth(); active(state); proposal = { localId: item.localId, next, remote, refs };
    $("binding-review-list").replaceChildren(); for (const line of lines.length ? lines : ["Se conservarán sus campos locales y se retirarán las elecciones de vínculos deshechas."]) { const p = document.createElement("p"); p.textContent = line; $("binding-review-list").append(p); }
    $("binding-review").hidden = false; message("Revise las referencias actuales. Confirmarlas conserva sus campos y prepara una nueva petición.");
  });
  $("binding-review-confirm").onclick = () => void run(async () => {
    const item = getItem(); if (!proposal || proposal.localId !== item?.localId || !item.referenceFailure) return;
    item.lastRejectedRequest = item.pending; delete item.pending; delete item.referenceFailure;
    if (proposal.remote) item.baseRelations = copy(proposal.remote.relations);
    item.relationChoices = proposal.next; for (const ref of proposal.refs) cache(ref.type, ref);
    invalidate(); await write(); render(item); message("Referencias revisadas. Sus campos y elecciones se conservan; pulse Sincronizar registro para enviarlos.");
  });
  function accept(item, remote, refs = []) {
    if (remote.relations) item.baseRelations = copy(remote.relations);
    cache("user", remote.relations?.self); cache("user", remote.relations?.responsible);
    cache("cause", remote.relations?.caseReference);
    for (const r of remote.relations?.cases || []) cache("cause", r); if (remote.relations?.cause) cache("cause", remote.relations.cause);
    for (const ref of refs) {
      cache(ref.type, ref);
      // These are proven results of our own acknowledged operation, not a
      // refresh of an unknown request. Preserve the user's later desired IDs.
      const c = choices(item);
      if (ref.type === "cause") { if (c.cause?.id?.startsWith("local:") && resolvedCause(c.cause, false)?.id === ref.id) c.cause = { id: ref.id, reference: copy(ref) }; if (c.cause?.id === ref.id) c.cause.reference = copy(ref); for (const choice of c.cases || []) if (choice.id === ref.id) choice.reference = copy(ref); }
      if (ref.type === "user" && c.responsible?.id === ref.id) c.responsible.reference = copy(ref);
    }
  }
  return { render, accept,
    matches(value) {
      if (value.receipt.contextVersion && value.entity.relations?.contextVersion !== value.receipt.contextVersion) return false;
      if (!value.receipt.referenceVersions) return true;
      const current = new Map((value.references || []).map(r => [r.type + ":" + r.id, r.version]));
      return value.receipt.referenceVersions.length === current.size && value.receipt.referenceVersions.every(r => current.get(r.type + ":" + r.id) === r.version);
    }, changes: item => changes(item, true), hasChanges: item => Boolean(changes(item)),
    refreshActions() { const item = getItem(); if (!item) return; const stale = Boolean(item.remoteId && !item.baseRelations); $("binding-responsible").disabled = stale || Boolean(base(item).sourceLocked || base(item).readOnly); $("binding-cause").disabled = stale || Boolean(base(item).causeLocked || base(item).readOnly); for (const n of $("binding-cases").querySelectorAll("input")) n.disabled = stale; $("binding-undo").disabled = false; }
  };
}
