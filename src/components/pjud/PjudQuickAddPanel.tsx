"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { validarRit, validarRut } from "@/lib/chile";
import "./pjud-lookup.css";

type Mode = "rol" | "rut";
type Identity = { rit: string; tribunal: string };
type CausaHit = Identity & { caratula?: string | null };
type Preview = {
  provider?: string;
  count?: number;
  sala?: string | null;
  note?: string;
  sample?: Array<{ titulo: string; fecha: string; cuaderno?: string | null; esReceptor?: boolean }>;
  identity?: Identity;
  queriedAt?: string;
  status?: string;
  coverage?: { scope?: string; complete?: boolean; note?: string };
  advisory?: string;
};
type RutResult = { causas?: CausaHit[]; count?: number; queriedAt?: string; note?: string };
type Catalogue = {
  tribunales?: string[];
  capabilities?: { preview?: boolean; byRut?: boolean; create?: boolean };
  readiness?: { configured?: boolean; channel?: string; note?: string };
};
type Busy = "preview" | "rut" | "add" | null;
type ApiFailure = { error: string; status: number };

function formatDate(value?: string, withTime = false) {
  if (!value) return null;
  // Date-only movement dates belong to the judicial record, not the browser timezone.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function lookupError(result: ApiFailure, fallback: string) {
  if (result.status === 401) return "Su sesión terminó. Vuelva a iniciar sesión para consultar.";
  if (result.status === 403) return "Su cuenta no tiene permiso para esta acción. Consulte a quien administra el estudio.";
  if (result.status === 429) return "Se alcanzó el límite de consultas. Espere un momento y vuelva a intentarlo.";
  if (result.status === 0) return "No se pudo conectar con el servidor. Revise su conexión y vuelva a intentarlo.";
  return result.error && !/^Error \d+$/.test(result.error) ? result.error : fallback;
}

export function PjudQuickAddPanel() {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const rolInputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<Mode>("rol");
  const [rit, setRit] = useState("");
  const [tribunal, setTribunal] = useState("");
  const [titulo, setTitulo] = useState("");
  const [rut, setRut] = useState("");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [rolErrors, setRolErrors] = useState<{ rit?: string; tribunal?: string }>({});
  const [rutFieldError, setRutFieldError] = useState("");
  const [rolError, setRolError] = useState("");
  const [rutError, setRutError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<(Preview & { criteria: Identity }) | null>(null);
  const [rutResult, setRutResult] = useState<(RutResult & { criteria: string }) | null>(null);
  const [registerWithoutLookup, setRegisterWithoutLookup] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    async function loadCatalogue() {
      try {
        const response = await fetch("/api/pjud/lookup", { signal: controller.signal });
        if (!response.ok) throw new Error("catalogue");
        const data: Catalogue = await response.json();
        if (!Array.isArray(data.tribunales)) throw new Error("catalogue");
        if (controller.signal.aborted) return;
        setCatalogue(data);
        setCatalogueState("ready");
      } catch {
        // A timed-out request is recoverable; an unmount must not update state.
        if (!disposed) setCatalogueState("error");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    let disposed = false;
    void loadCatalogue();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [catalogueAttempt]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("alta") === "1") {
      sectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  function cancelRequest(message = "") {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(null);
    setNotice(message);
  }

  function changeMode(next: Mode) {
    if (next === mode || busy === "add") return;
    cancelRequest();
    setMode(next);
  }

  function invalidateRol() {
    if (busy === "preview") cancelRequest();
    setPreview(null);
    setRolError("");
    setRolErrors({});
    setNotice("");
    setRegisterWithoutLookup(false);
  }

  async function request<T>(payload: object, kind: Exclude<Busy, null>) {
    // The ref closes the gap before React renders the disabled button.
    if (activeRequest.current) return null;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(kind);
    setNotice("");
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    try {
      const result = await apiMutation<T>("/api/pjud/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (activeRequest.current !== controller) return null;
      if (controller.signal.aborted && !timedOut) return null;
      if (timedOut) return { ok: false as const, status: 504, error: kind === "add"
        ? "El registro tardó más de lo esperado. Revise su cartera antes de volver a agregar la causa."
        : "La consulta tardó más de lo esperado. Puede volver a intentarlo; sus criterios se conservaron." };
      return result;
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(null);
      }
    }
  }

  function validateRol(criteria: Identity) {
    const errors = {
      rit: !validarRit(criteria.rit) ? "Ingrese un RIT/ROL válido, por ejemplo C-100-2024." : undefined,
      tribunal: criteria.tribunal.trim().length < 3 ? "Indique el nombre del tribunal (al menos 3 caracteres)." : undefined,
    };
    setRolErrors(errors);
    if (errors.rit || errors.tribunal) {
      window.setTimeout(() => sectionRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(), 0);
      return false;
    }
    return true;
  }

  async function consultRol(criteria: Identity = { rit, tribunal }) {
    if (activeRequest.current || !validateRol(criteria)) return;
    setRolError("");
    setPreview(null);
    const result = await request<Preview>({ action: "preview-rol", ...criteria }, "preview");
    if (!result) return;
    if (!result.ok) {
      setRolError(lookupError(result, "OJV no pudo completar la consulta. Vuelva a intentarlo con los mismos criterios."));
      return;
    }
    setPreview({ ...result.data, criteria: { rit: criteria.rit.trim().toUpperCase(), tribunal: criteria.tribunal.trim() } });
  }

  async function registerCausa(syncNow: boolean) {
    const criteria = { rit, tribunal };
    if (activeRequest.current || !validateRol(criteria)) return;
    setRolError("");
    const result = await request<{
      note?: string;
      causaId?: string;
      sync?: { inserted?: number; status?: string } | null;
    }>({ action: "add-rol", ...criteria, titulo: titulo.trim() || undefined, syncNow }, "add");
    if (!result) return;
    if (!result.ok) {
      const message = lookupError(result, "No se pudo confirmar el registro.");
      setRolError((result.status === 0 || result.status >= 500) && !message.includes("Revise su cartera")
        ? `${message} Revise su cartera antes de volver a agregar la causa.`
        : message);
      return;
    }
    setNotice(result.data.note || "La causa quedó registrada en su cartera.");
    if (result.data.causaId) router.push(`/causas/${encodeURIComponent(result.data.causaId)}`);
  }

  async function consultRut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current) return;
    if (!validarRut(rut)) {
      setRutFieldError("Ingrese un RUT válido y revise su dígito verificador.");
      sectionRef.current?.querySelector<HTMLInputElement>('[name="rut"]')?.focus();
      return;
    }
    setRutFieldError("");
    setRutError("");
    setRutResult(null);
    const result = await request<RutResult>({ action: "buscar-rut", rut: rut.trim() }, "rut");
    if (!result) return;
    if (!result.ok) {
      setRutError(lookupError(result, "OJV no pudo completar la búsqueda por RUT. Vuelva a intentarlo."));
      return;
    }
    setRutResult({ ...result.data, criteria: rut.trim() });
  }

  function reviewHit(hit: CausaHit) {
    cancelRequest();
    setRit(hit.rit);
    setTribunal(hit.tribunal);
    setTitulo(hit.caratula || "");
    setPreview(null);
    setRolError("");
    setRolErrors({});
    setRegisterWithoutLookup(false);
    setMode("rol");
    void consultRol({ rit: hit.rit, tribunal: hit.tribunal });
    window.setTimeout(() => rolInputRef.current?.focus(), 0);
  }

  const identity = preview?.identity || preview?.criteria;
  const sample = preview?.sample || [];
  const hits = rutResult?.causas || [];
  const adding = busy === "add";
  const unavailable = mode === "rol" ? catalogue?.capabilities?.preview === false : catalogue?.capabilities?.byRut === false;
  const canCreate = catalogue?.capabilities?.create !== false;

  return (
    <section id="alta-rol" ref={sectionRef} className="pjud-lookup" aria-labelledby="pjud-lookup-title">
      <header className="pjud-lookup-header">
        <div>
          <h2 id="pjud-lookup-title">Consultar en OJV</h2>
          <p>Revise una causa antes de incorporarla a su cartera. Consultar no guarda causas ni activa el monitoreo.</p>
        </div>
        <div className="pjud-lookup-modes" role="group" aria-label="Criterio de consulta">
          <button type="button" aria-pressed={mode === "rol"} disabled={adding} onClick={() => changeMode("rol")}>Por RIT / ROL</button>
          <button type="button" aria-pressed={mode === "rut"} disabled={adding} onClick={() => changeMode("rut")}>Por RUT</button>
        </div>
      </header>

      {catalogue?.readiness?.note && <p className="pjud-lookup-channel">{catalogue.readiness.note}</p>}
      {unavailable && !catalogue?.readiness?.note && <p className="pjud-lookup-channel">Este canal de consulta no está disponible en el servidor. Puede volver a comprobarlo más tarde o usar <Link href="/causas/mis-causas">ClaveÚnica</Link>.</p>}

      {mode === "rol" ? (
        <>
          <form className="pjud-lookup-form" noValidate onSubmit={event => { event.preventDefault(); void consultRol(); }} aria-busy={busy === "preview" || adding}>
            <label className="pjud-lookup-field">
              <span>RIT / ROL <span className="pjud-lookup-required">(obligatorio)</span></span>
              <input ref={rolInputRef} className="input" name="rit" value={rit} required maxLength={40} autoComplete="off" spellCheck={false} placeholder="C-100-2024" disabled={adding} aria-invalid={Boolean(rolErrors.rit)} aria-describedby={rolErrors.rit ? "pjud-rit-error" : "pjud-rit-hint"} onChange={event => { invalidateRol(); setRit(event.target.value); }} />
              {rolErrors.rit ? <span id="pjud-rit-error" className="pjud-lookup-field-error">{rolErrors.rit}</span> : <span id="pjud-rit-hint" className="pjud-lookup-hint">Incluya el tipo de causa y el año.</span>}
            </label>
            <label className="pjud-lookup-field">
              <span>Tribunal <span className="pjud-lookup-required">(obligatorio)</span></span>
              <input className="input" name="tribunal" value={tribunal} required minLength={3} maxLength={255} list="pjud-tribunales" autoComplete="off" placeholder="Escriba el nombre del tribunal" disabled={adding} aria-invalid={Boolean(rolErrors.tribunal)} aria-describedby={rolErrors.tribunal ? "pjud-tribunal-error" : "pjud-tribunal-hint"} onChange={event => { invalidateRol(); setTribunal(event.target.value); }} />
              {rolErrors.tribunal ? <span id="pjud-tribunal-error" className="pjud-lookup-field-error">{rolErrors.tribunal}</span> : <span id="pjud-tribunal-hint" className="pjud-lookup-hint">Seleccione una sugerencia o escriba el nombre tal como aparece en OJV.</span>}
            </label>
            <datalist id="pjud-tribunales">{catalogue?.tribunales?.map(name => <option key={name} value={name} />)}</datalist>
            <div className="pjud-lookup-catalogue pjud-lookup-full">
              {catalogueState === "loading" && <p role="status">Cargando sugerencias de tribunales… Puede escribir el nombre mientras tanto.</p>}
              {catalogueState === "error" && <><p>No se pudieron cargar las sugerencias. Puede escribir el tribunal y consultar.</p><button type="button" className="pjud-lookup-text-action" onClick={() => { setCatalogueState("loading"); setCatalogueAttempt(value => value + 1); }}>Reintentar sugerencias</button></>}
            </div>
            <label className="pjud-lookup-field pjud-lookup-full">
              <span>Carátula <span className="pjud-lookup-required">(opcional, para su cartera)</span></span>
              <input className="input" name="titulo" value={titulo} maxLength={500} placeholder="Nombre con el que identificará la causa" disabled={adding} onChange={event => { setTitulo(event.target.value); setNotice(""); }} />
            </label>
            <div className="pjud-lookup-actions pjud-lookup-full">
              <button type="submit" className="btn btn-secondary" disabled={Boolean(busy) || unavailable}>{busy === "preview" ? "Consultando OJV…" : "Consultar movimientos"}</button>
              {busy === "preview" && <button type="button" className="btn btn-ghost" onClick={() => cancelRequest("Consulta cancelada. Puede volver a consultar con los mismos criterios.")}>Cancelar consulta</button>}
              {!busy && <span className="pjud-lookup-hint">Sólo lectura · RIT/ROL y tribunal identifican la consulta.</span>}
            </div>
          </form>

          {rolError && <div className="pjud-lookup-message" role="alert" data-error="true"><p>{rolError}</p><button type="button" className="pjud-lookup-text-action" disabled={Boolean(busy) || unavailable} onClick={() => void consultRol()}>Volver a consultar</button></div>}
          {busy === "preview" && <p className="pjud-lookup-progress" role="status">Estamos consultando la OJV. La respuesta puede tardar; puede cancelar o corregir los criterios.</p>}

          {preview && identity && <section className="pjud-lookup-result" aria-labelledby="pjud-result-title" aria-live="polite">
            <div className="pjud-lookup-result-heading"><h3 id="pjud-result-title">Resultado de la consulta</h3><span>Sin guardar en cartera</span></div>
            <dl className="pjud-lookup-identity">
              <div><dt>RIT / ROL consultado</dt><dd>{identity.rit}</dd></div>
              <div><dt>Tribunal consultado</dt><dd>{identity.tribunal}</dd></div>
              <div><dt>Consulta realizada</dt><dd>{formatDate(preview.queriedAt, true) || "Fecha no informada"}</dd></div>
              <div><dt>Proveedor</dt><dd>{preview.provider || "No informado"}</dd></div>
              {preview.sala && <div><dt>Sala</dt><dd>{preview.sala}</dd></div>}
            </dl>
            <p className="pjud-lookup-advisory">{preview.advisory || "Verifique que el RIT/ROL y el tribunal correspondan a la causa. Esta consulta muestra los datos recibidos y no acredita que el expediente esté completo."}{preview.coverage?.note && <span> {preview.coverage.note}</span>}</p>
            {preview.note && <p className="pjud-lookup-note">{preview.note}</p>}
            <h4>{typeof preview.count === "number" ? `${preview.count} ${preview.count === 1 ? "movimiento recuperado" : "movimientos recuperados"}` : "Movimientos recuperados"}</h4>
            {sample.length > 0 ? <>
              <p className="pjud-lookup-hint">Muestra de {sample.length} {sample.length === 1 ? "movimiento" : "movimientos"} devueltos por el proveedor.</p>
              <ol className="pjud-lookup-movements">{sample.map((row, index) => <li key={`${row.fecha}-${index}`}>
                <time dateTime={row.fecha}>{formatDate(row.fecha) || "Sin fecha"}</time>
                <div><p>{row.titulo}</p>{(row.cuaderno || row.esReceptor) && <span>{row.cuaderno ? `Cuaderno: ${row.cuaderno}` : ""}{row.cuaderno && row.esReceptor ? " · " : ""}{row.esReceptor ? "Actuación de receptor" : ""}</span>}</div>
              </li>)}</ol>
            </> : <p className="pjud-lookup-empty">No se recibieron movimientos para estos criterios. Esto no confirma que la causa no exista. Revise el RIT/ROL y el tribunal o vuelva a consultar más tarde.</p>}
            <div className="pjud-lookup-register">
              <div><h4>Incorporar a su cartera</h4><p>{canCreate ? "Crea o vincula la causa, activa su monitoreo y solicita una sincronización. Revise la identidad antes de continuar." : "Su cuenta puede consultar, pero no tiene permiso para registrar causas en la cartera."}</p></div>
              <button type="button" className="btn btn-primary" disabled={Boolean(busy) || !canCreate} onClick={() => void registerCausa(true)}>{adding ? "Agregando causa…" : "Agregar a mi cartera"}</button>
            </div>
          </section>}

          {!preview && <details className="pjud-lookup-manual" open={registerWithoutLookup} onToggle={event => setRegisterWithoutLookup(event.currentTarget.open)}>
            <summary>Registrar sin consulta previa</summary>
            <p>{canCreate ? "Si OJV no responde, puede crear o vincular la causa con estos datos y activar su monitoreo. No se consultarán ni confirmarán movimientos en este paso." : "Su cuenta puede consultar, pero no tiene permiso para registrar causas en la cartera."}</p>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy) || !canCreate} onClick={() => void registerCausa(false)}>{adding ? "Registrando causa…" : "Registrar sin consultar OJV"}</button>
          </details>}
        </>
      ) : (
        <>
          <form className="pjud-lookup-rut-form" noValidate onSubmit={consultRut} aria-busy={busy === "rut"}>
            <label className="pjud-lookup-field"><span>RUT del litigante</span><input className="input" name="rut" value={rut} required maxLength={20} inputMode="text" autoComplete="off" spellCheck={false} placeholder="RUT con dígito verificador" aria-invalid={Boolean(rutFieldError)} aria-describedby={rutFieldError ? "pjud-rut-error" : "pjud-rut-hint"} onChange={event => { if (busy === "rut") cancelRequest(); setRut(event.target.value); setRutResult(null); setRutError(""); setRutFieldError(""); setNotice(""); }} />{rutFieldError ? <span id="pjud-rut-error" className="pjud-lookup-field-error">{rutFieldError}</span> : <span id="pjud-rut-hint" className="pjud-lookup-hint">Con o sin puntos; incluya el dígito verificador.</span>}</label>
            <div className="pjud-lookup-actions"><button className="btn btn-secondary" disabled={Boolean(busy) || unavailable} type="submit">{busy === "rut" ? "Buscando en OJV…" : "Buscar causas por RUT"}</button>{busy === "rut" && <button type="button" className="btn btn-ghost" onClick={() => cancelRequest("Búsqueda cancelada. El RUT se conserva para volver a consultar.")}>Cancelar búsqueda</button>}</div>
          </form>
          {rutError && <div className="pjud-lookup-message" role="alert" data-error="true"><p>{rutError}</p><p>El RUT se conservó. Puede volver a buscar con los mismos datos.</p></div>}
          {busy === "rut" && <p className="pjud-lookup-progress" role="status">Buscando las causas que el proveedor devuelve para este RUT…</p>}
          {rutResult && <section className="pjud-lookup-result" aria-labelledby="pjud-rut-result-title" aria-live="polite">
            <div className="pjud-lookup-result-heading"><h3 id="pjud-rut-result-title">{hits.length} {hits.length === 1 ? "causa recibida" : "causas recibidas"}</h3><span>Sin guardar en cartera</span></div>
            <p className="pjud-lookup-note">RUT consultado: {rutResult.criteria}{rutResult.queriedAt ? ` · ${formatDate(rutResult.queriedAt, true)}` : ""}</p>
            {rutResult.note && <p className="pjud-lookup-note">{rutResult.note}</p>}
            {hits.length > 0 ? <><p className="pjud-lookup-advisory">Son resultados candidatos. Revise el RIT/ROL, el tribunal y la carátula antes de agregar una causa.</p><ul className="pjud-lookup-hits">{hits.map((hit, index) => <li key={`${hit.rit}-${hit.tribunal}-${index}`}><div><h4>{hit.rit}</h4><p>{hit.tribunal}</p>{hit.caratula && <p>{hit.caratula}</p>}</div><button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => reviewHit(hit)}>Consultar movimientos de {hit.rit}</button></li>)}</ul></> : <p className="pjud-lookup-empty">No se recibieron causas para este RUT. Revise el dígito verificador o consulte directamente por RIT/ROL y tribunal. La búsqueda no acredita ausencia de causas.</p>}
          </section>}
        </>
      )}
      {notice && <p className="pjud-lookup-progress" role="status">{notice}</p>}
      {adding && <p className="pjud-lookup-progress" role="status">Confirmando el registro de la causa. Espere antes de iniciar otra acción.</p>}
      <footer className="pjud-lookup-footer"><p>Para consultar las causas asociadas a su cuenta judicial, use <Link href="/causas/mis-causas">ClaveÚnica</Link>.</p></footer>
    </section>
  );
}
