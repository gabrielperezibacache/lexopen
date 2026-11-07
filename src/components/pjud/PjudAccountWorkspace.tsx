"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { validarRut } from "@/lib/chile";
import { PageHeader } from "@/components/sites/SiteNav";
import { apiMutation } from "@/lib/api-mutation";
import { PjudManualSessionPanel } from "@/components/pjud/PjudManualSessionPanel";
import "@/components/pjud/pjud-lookup.css";

type Status = {
  enabled: boolean;
  rutMasked: string | null;
  hasPassword: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncNote: string | null;
  scrapeFlag: boolean;
  sidecar: boolean;
  sidecarReachable?: boolean;
  publicScrape?: boolean;
  captchaConfigured?: boolean;
  readyToSync?: boolean;
  blockers?: string[];
  warnings?: string[];
  readinessLabel?: string;
  readinessHint?: string;
  channelLabel?: string;
};

type SyncResult = {
  listed: number;
  created: number;
  linked: number;
  enqueued?: number;
  syncOk?: number;
  syncFailed?: number;
  inserted?: number;
  items: Array<{
    rit: string;
    tribunal: string;
    caratula?: string | null;
    causaId?: string | null;
  }>;
};

function formatWhen(value: string | null | undefined) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

function lastSyncLabel(status: string | null | undefined) {
  switch (status) {
    case "ok":
      return "Última sincronización correcta";
    case "partial":
      return "Última sincronización parcial";
    case "failed":
      return "Última sincronización con errores";
    case "cleared":
      return "Credenciales eliminadas";
    case "running":
      return "Sincronización en curso";
    default:
      return status ? `Estado: ${status}` : null;
  }
}

function waitForPoll(signal: AbortSignal) {
  return new Promise<boolean>(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const finish = (proceed: boolean) => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(proceed);
    };
    const cancel = () => finish(false);
    const timer = window.setTimeout(() => finish(true), 3000);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

type Operation = "save" | "sync" | "clear" | "toggle" | "messages";
type Capabilities = { sync?: boolean; credentials?: boolean };

export default function MisCausasPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Operation | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "warn" | "err">("ok");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [adminOnly, setAdminOnly] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [rutError, setRutError] = useState("");
  const [credentialsRut, setCredentialsRut] = useState("");
  const [credentialsPassword, setCredentialsPassword] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setLoadError("");
    try {
      const [res, meRes] = await Promise.all([
        fetch("/api/pjud/mis-causas", { signal }),
        fetch("/api/auth/me", { signal }),
      ]);
      const data = await res.json().catch(() => null);
      const me = await meRes.json().catch(() => null);
      if (signal?.aborted || !mounted.current) return;
      if (me?.user?.role) setRole(me.user.role);
      if (!res.ok || !data?.status) {
        setLoadError(data?.error || "No se pudo cargar el estado de ClaveÚnica. Sus datos no se modificaron.");
        return;
      }
      setStatus(data.status);
      if (data.capabilities) setCapabilities(data.capabilities);
      setLinkedCount(typeof data.causasCount === "number" ? data.causasCount : Array.isArray(data.causas) ? data.causas.length : null);
    } catch {
      if (!signal?.aborted && mounted.current) setLoadError("No se pudo conectar para comprobar el estado. Revise su conexión y vuelva a consultar.");
    } finally {
      if (!signal?.aborted && mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => {
      mounted.current = false;
      controller.abort();
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  function beginOperation(operation: Operation) {
    if (activeRequest.current) return null;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(operation);
    setMsg("");
    return controller;
  }

  function finishOperation(controller: AbortController) {
    if (activeRequest.current === controller) {
      activeRequest.current = null;
      setBusy(null);
    }
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current) return;
    if (!validarRut(credentialsRut)) {
      setRutError("El RUT no es válido. Revise su dígito verificador.");
      event.currentTarget.querySelector<HTMLInputElement>('[name="rut"]')?.focus();
      return;
    }
    const controller = beginOperation("save");
    if (!controller) return;
    setRutError("");
    const response = await apiMutation<Status>("/api/pjud/claveunica", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ action: "save", rut: credentialsRut, password: credentialsPassword }),
    });
    if (controller.signal.aborted) return;
    finishOperation(controller);
    if (!response.ok) {
      setMsgTone("err");
      if (response.status === 403) setAdminOnly(true);
      setMsg(response.status === 403 ? "Solo quien administra el estudio puede guardar o cambiar la ClaveÚnica." : response.error || "No se pudieron guardar los datos de acceso. Puede volver a intentarlo.");
      return;
    }
    setAdminOnly(false);
    setStatus(response.data);
    setCredentialsPassword("");
    setMsgTone("ok");
    setMsg("Acceso guardado en este servidor. La contraseña se comprobará al sincronizar con OJV; guardarla no confirma que sea correcta.");
  }

  async function credentialAction(action: "clear" | "enable" | "disable") {
    const controller = beginOperation(action === "clear" ? "clear" : "toggle");
    if (!controller) return;
    const response = await apiMutation<Status>("/api/pjud/claveunica", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ action }),
    });
    if (controller.signal.aborted) return;
    finishOperation(controller);
    if (!response.ok) {
      setMsgTone("err");
      if (response.status === 403) setAdminOnly(true);
      setMsg(response.status === 403 ? "Solo quien administra el estudio puede cambiar o eliminar el acceso." : response.error || "No se pudo confirmar el cambio. Vuelva a consultar el estado antes de intentarlo otra vez.");
      return;
    }
    setStatus(response.data);
    setMsgTone("ok");
    setMsg(action === "clear" ? "Se eliminaron el RUT y la contraseña de este estudio. Las causas ya vinculadas se conservan." : action === "disable" ? "Conexión pausada. LexOpen no usará la ClaveÚnica hasta que la reanude." : "Conexión reanudada. Puede solicitar una sincronización si el canal está disponible.");
    if (action === "clear") { setResult(null); setCredentialsPassword(""); }
  }

  async function clearErrors() {
    const controller = beginOperation("messages");
    if (!controller) return;
    const response = await apiMutation<{ status?: Status }>("/api/pjud/mis-causas", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ action: "clear_errors" }),
    });
    if (controller.signal.aborted) return;
    finishOperation(controller);
    if (!response.ok) { setMsgTone("err"); setMsg(response.error || "No se pudieron limpiar los avisos. Puede reintentarlo."); return; }
    if (response.data.status) setStatus(response.data.status);
    else await load();
    setMsgTone("ok");
    setMsg("Avisos anteriores limpiados. No se inició una sincronización.");
  }

  async function syncMisCausas() {
    const controller = beginOperation("sync");
    if (!controller) return;
    setResult(null);
    setMsgTone("ok");
    setMsg("Sincronización solicitada. OJV puede tardar varios minutos. Las causas recuperadas se incorporan al estudio y sus movimientos se actualizan por separado.");
    const response = await apiMutation<SyncResult & { status?: Status; async?: boolean; started?: boolean }>("/api/pjud/mis-causas", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ syncMovimientos: true }),
    });
    if (controller.signal.aborted) return;
    if (!response.ok) {
      finishOperation(controller);
      setMsgTone("err");
      setMsg(response.error || "No se pudo confirmar la sincronización. Actualice el estado antes de volver a iniciarla.");
      await load();
      return;
    }
    const data = response.data;
    if (data.status) setStatus(data.status);
    if (data.async) {
      if (data.started === false) setMsg("Ya hay una sincronización en curso. Comprobando su resultado…");
      let finalStatus: Status | null = data.status || null;
      let obtainedFinalStatus = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (!await waitForPoll(controller.signal)) return;
        try {
          const res = await fetch("/api/pjud/mis-causas", { signal: controller.signal });
          const body = await res.json().catch(() => null);
          if (controller.signal.aborted) return;
          if (!res.ok || !body?.status) continue;
          const nextStatus = body.status as Status;
          setStatus(nextStatus);
          finalStatus = nextStatus;
          if (typeof body.causasCount === "number") setLinkedCount(body.causasCount);
          if (nextStatus.lastSyncStatus && nextStatus.lastSyncStatus !== "running") { obtainedFinalStatus = true; break; }
        } catch { if (controller.signal.aborted) return; }
      }
      finishOperation(controller);
      if (!obtainedFinalStatus) {
        setMsgTone("warn");
        setMsg("No se pudo comprobar el resultado final. La sincronización puede seguir en el servidor. Actualice el estado antes de volver a iniciarla.");
      } else if (finalStatus?.lastSyncStatus === "failed") {
        setMsgTone("err");
        setMsg(finalStatus.lastSyncNote || "La sincronización falló. Revise el acceso y el canal de consulta antes de reintentar.");
      } else if (finalStatus?.lastSyncStatus === "partial") {
        setMsgTone("warn");
        setMsg(finalStatus.lastSyncNote || "La sincronización terminó con resultados parciales. Revise las causas y los movimientos pendientes en Cartera PJUD.");
      } else if (finalStatus?.lastSyncStatus === "ok") {
        setMsgTone("ok");
        setMsg(finalStatus.lastSyncNote || "Terminó la consulta de causas. Revise en Cartera PJUD el procesamiento de sus movimientos.");
      } else {
        setMsgTone("warn");
        setMsg("El servidor respondió sin confirmar el resultado de la sincronización. Actualice el estado.");
      }
      return;
    }
    finishOperation(controller);
    setResult(data);
    const failed = Number(data.syncFailed || 0);
    const listed = Number(data.listed || 0);
    const created = Number(data.created || 0);
    const linked = Number(data.linked || 0);
    const enqueued = Number(data.enqueued || 0);
    const inserted = Number(data.inserted || 0);
    let summary = listed === 0 ? "OJV no devolvió causas en esta consulta. Esto no acredita que su cuenta no tenga causas." : `${listed === 1 ? "Se recuperó" : "Se recuperaron"} ${listed} causa${listed === 1 ? "" : "s"} (${created} nueva${created === 1 ? "" : "s"}, ${linked} ya vinculada${linked === 1 ? "" : "s"}).`;
    if (failed > 0) summary += ` ${failed} ${failed === 1 ? "causa no pudo" : "causas no pudieron"} actualizar sus movimientos. Revise Cartera PJUD.`;
    else if (enqueued > 0) summary += ` ${enqueued} quedaron en cola para recuperar sus movimientos.`;
    else if (inserted > 0) summary += ` Se agregaron ${inserted} movimiento${inserted === 1 ? "" : "s"} nuevo${inserted === 1 ? "" : "s"}.`;
    else if (listed > 0) summary += " No se informaron movimientos nuevos en esta respuesta.";
    setMsgTone(failed > 0 || listed === 0 ? "warn" : "ok");
    setMsg(summary);
    await load();
  }

  const canOperate = capabilities?.sync ?? (role === "admin" || role === "socio");
  const canManageCredentials = (capabilities?.credentials ?? role === "admin") && !adminOnly;
  const syncDisabled =
    Boolean(busy) ||
    loading ||
    !canOperate ||
    !status?.hasPassword ||
    status?.readyToSync === false ||
    status?.lastSyncStatus === "running";
  const ready = Boolean(status?.readyToSync);
  const when = formatWhen(status?.lastSyncAt);
  const syncTitle = lastSyncLabel(status?.lastSyncStatus);

  return (
    <div className="pjud-cu space-y-6">
      <PageHeader artwork="connections"
        title="Mis Causas en OJV"
        subtitle="Ingrese con ClaveÚnica, revise las causas y elija cuáles incorporar a su cartera con sus cuadernos."
      />

      <PjudManualSessionPanel />

      <details className="pjud-cu-advanced">
        <summary>Acceso guardado del estudio y sincronización programada</summary>
        <div className="space-y-6">

      {loadError && <div className="pjud-cu-message" data-tone="err" role="alert"><p>{loadError}</p><button type="button" className="btn btn-ghost" disabled={loading || Boolean(busy)} onClick={() => void load()}>Volver a consultar estado</button></div>}
      <section className="panel space-y-4 rounded-[var(--radius-lg)] p-5">
        <div
          className="pjud-cu-message"
          data-tone={ready ? "ok" : "warn"}
          role="status"
        >
          <p className="text-sm font-semibold">
            {loading && !status ? "Consultando el estado de ClaveÚnica…" : !status ? "Estado sin comprobar" : status.readinessLabel || (ready ? "Listo para sincronizar" : "Aún no se puede sincronizar")}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {status?.readinessHint || (status ? "Revise el acceso guardado y el canal de consulta antes de sincronizar." : "Espere la respuesta del servidor o vuelva a consultar si la carga falla.")}
          </p>
          {status?.channelLabel && ready ? (
            <p className="mt-2 text-xs opacity-80">
              Cómo consulta LexOpen: {status.channelLabel}
            </p>
          ) : null}
        </div>

        <ol className="pjud-cu-steps grid gap-4 text-sm sm:grid-cols-3">
          <li className="border-t border-[var(--line)] pt-3">
            <div className="text-sm font-semibold text-[var(--sea)]">
              1. Guardar acceso
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              Un administrador ingresa el RUT y la contraseña de ClaveÚnica. Quedan
              cifrados en este servidor; guardarlos no comprueba el acceso.
            </p>
          </li>
          <li className="border-t border-[var(--line)] pt-3">
            <div className="text-sm font-semibold text-[var(--sea)]">
              2. Sincronizar
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              LexOpen lista «Mis Causas» en la Oficina Judicial Virtual y las
              incorpora o actualiza en el estudio.
            </p>
          </li>
          <li className="border-t border-[var(--line)] pt-3">
            <div className="text-sm font-semibold text-[var(--sea)]">
              3. Seguir en el apartado
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              Revise el expediente en{" "}
              <Link href="/pjud?origen=claveunica" className="text-[var(--sea)]">
                Expediente
              </Link>{" "}
              y el pulso (semáforo / sync) en{" "}
              <Link href="/causas/monitoreo" className="text-[var(--sea)]">
                Cartera PJUD
              </Link>
              .
            </p>
          </li>
        </ol>
      </section>

      {!canOperate && role === "asistente" && (
        <p className="pjud-cu-message text-sm" data-tone="warn">
          Su perfil de asistente puede ver el estado, pero no guardar
          credenciales ni sincronizar. Pida ayuda a quien supervisa el estudio.
        </p>
      )}

      <section className="panel space-y-5 rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Estado actual</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Resumen de lo que LexOpen tiene configurado para este estudio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              Acceso:{" "}
              {status?.hasPassword
                ? `guardado${status.rutMasked ? ` (${status.rutMasked})` : ""}`
                : status ? "sin guardar" : "sin comprobar"}
            </span>
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              Conexión: {status ? status.enabled ? "activa" : "pausada" : "sin comprobar"}
            </span>
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              CAPTCHA: {status ? status.captchaConfigured ? "configurado" : "pendiente" : "sin comprobar"}
            </span>
          </div>
        </div>

        {(syncTitle || status?.lastSyncNote) && (
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-4 py-3 text-sm">
            <div className="pjud-cu-last-sync flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {syncTitle && (
                  <p className="font-medium">
                    {syncTitle}
                    {when ? ` · ${when}` : ""}
                  </p>
                )}
                {status?.lastSyncNote && (
                  <p className="mt-1 text-[var(--ink-soft)]/80">
                    {status.lastSyncNote}
                  </p>
                )}
              </div>
              {(status?.lastSyncNote ||
                status?.lastSyncStatus === "failed" ||
                status?.lastSyncStatus === "partial") && (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 text-xs"
                  disabled={Boolean(busy) || !canOperate || status?.lastSyncStatus === "running"}
                  onClick={clearErrors}
                >
                  Limpiar avisos
                </button>
              )}
            </div>
          </div>
        )}

        {status?.blockers && status.blockers.length > 0 && (
          <div
            className="pjud-cu-message text-sm" data-tone="err"
            role="status"
          >
            <p className="font-semibold">Qué falta para poder sincronizar</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {status.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Si el servidor no puede consultar el PJUD, el detalle está en{" "}
              <Link href="/configuracion#pjud-log" className="underline">
                Configuración → PJUD
              </Link>
              .
            </p>
          </div>
        )}

        {adminOnly && (
          <p className="pjud-cu-message text-sm" data-tone="warn">
            El servidor no autorizó el cambio de credenciales. Pida a quien administra el estudio que revise sus permisos.
          </p>
        )}

        <div className="space-y-3">
          <h3 className="text-base font-semibold">Guardar ClaveÚnica</h3>
          <p className="text-sm text-[var(--muted)]">
            Use la misma ClaveÚnica con la que entra a la Oficina Judicial Virtual.
            LexOpen la cifra y la guarda solo aquí; no la muestra después en
            pantalla.
          </p>
          <form
            onSubmit={saveCredentials}
            aria-busy={busy === "save"}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-[var(--muted)]">RUT</span>
              <input
                className="input"
                name="rut"
                required
                value={credentialsRut}
                maxLength={20}
                disabled={Boolean(busy) || loading || !canManageCredentials}
                aria-invalid={Boolean(rutError)}
                aria-describedby={rutError ? "cu-rut-error" : undefined}
                onChange={event => { setCredentialsRut(event.target.value); setRutError(""); }}
                placeholder="RUT con dígito verificador"
                autoComplete="username"
              />
              {rutError && <span id="cu-rut-error" className="pjud-lookup-field-error">{rutError}</span>}
            </label>
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-[var(--muted)]">
                Contraseña
              </span>
              <input
                className="input"
                name="password"
                type="password"
                required
                minLength={4}
                maxLength={200}
                value={credentialsPassword}
                onChange={event => setCredentialsPassword(event.target.value)}
                disabled={Boolean(busy) || loading || !canManageCredentials}
                placeholder="Contraseña ClaveÚnica"
                autoComplete="current-password"
              />
            </label>
            <div className="flex items-end">
              <button className="btn btn-primary w-full" disabled={Boolean(busy) || loading || !canManageCredentials} type="submit">
                {busy === "save" ? "Guardando acceso…" : "Guardar de forma segura"}
              </button>
            </div>
          </form>
          <p className="text-xs text-[var(--muted)]">
            Al guardar, autoriza a LexOpen a iniciar sesión en su nombre para listar causas. Sólo un administrador puede cambiar, pausar o eliminar este acceso. Las credenciales son del estudio.
          </p>
        </div>

        {!canManageCredentials && role && <p className="text-sm text-[var(--muted)]">Sólo quien administra el estudio puede guardar o cambiar estas credenciales.</p>}
        {!canOperate && role && role !== "asistente" && <p className="text-sm text-[var(--muted)]">La sincronización incorpora causas al estudio y requiere permiso de supervisión. Puede consultar el estado actual.</p>}
        <div className="pjud-cu-actions flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={syncDisabled}
            title={
              status?.blockers?.length
                ? status.blockers[0]
                : "Traer causas y actualizar movimientos"
            }
            onClick={syncMisCausas}
          >
            {busy === "sync" ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          {status?.hasPassword && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={Boolean(busy) || loading || !canManageCredentials}
              onClick={() => void credentialAction(status.enabled ? "disable" : "enable")}
            >
              {status.enabled ? "Pausar conexión" : "Reanudar conexión"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(busy) || loading || !status?.hasPassword || !canManageCredentials}
            onClick={() => void credentialAction("clear")}
          >
            Eliminar acceso guardado
          </button>
          <button type="button" className="btn btn-ghost" disabled={loading || Boolean(busy)} onClick={() => void load()}>{loading ? "Consultando estado…" : "Actualizar estado"}</button>
          <Link href="/pjud?origen=claveunica" className="btn btn-ghost">
            Ver en Expediente
          </Link>
          <Link href="/causas/monitoreo" className="btn btn-ghost">
            Ir a Cartera PJUD
          </Link>
        </div>

        {msg && (
          <div
            className="pjud-cu-message flex flex-wrap items-start justify-between gap-2"
            data-tone={msgTone}
            role={msgTone === "err" ? "alert" : "status"}
            data-testid="claveunica-msg"
          >
            <p className="min-w-0 flex-1">{msg}</p>
            <button
              type="button"
              className="pjud-cu-dismiss shrink-0 text-sm underline-offset-2 hover:underline"
              onClick={() => setMsg("")}
            >
              Cerrar
            </button>
          </div>
        )}
      </section>

      {result && (
        <section className="panel rounded-[var(--radius-lg)] p-5">
          <h2 className="text-lg font-semibold">
            Resultado de la sincronización ({result.listed})
          </h2>
          {result.syncFailed ? (
            <p className="mt-1 text-sm text-[var(--warn)]">
              {result.syncFailed} {result.syncFailed === 1 ? "causa no pudo" : "causas no pudieron"} actualizar sus movimientos. Puede reintentar desde Cartera PJUD.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Listado desde OJV. Abra las causas en Expediente; los movimientos
              se procesan en{" "}
              <Link href="/causas/monitoreo" className="text-[var(--sea)]">
                Cartera PJUD
              </Link>
              .
            </p>
          )}
          <p className="mt-2">
            <Link href="/pjud?origen=claveunica" className="btn btn-secondary">
              Ver en Expediente
            </Link>
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {(result.items || []).map((item) => (
              <li
                key={`${item.causaId || item.rit}-${item.tribunal}`}
                className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-4 py-3"
              >
                {item.causaId ? (
                  <Link
                    href={`/pjud/${encodeURIComponent(item.causaId)}`}
                    className="pjud-cu-case-link font-medium text-[var(--sea)]"
                  >
                    {item.rit}
                  </Link>
                ) : (
                  <div className="font-medium">{item.rit}</div>
                )}
                <div className="mt-0.5 break-words text-xs text-[var(--muted)]">
                  {item.tribunal}
                  {item.caratula ? ` · ${item.caratula}` : ""}
                </div>
              </li>
            ))}
            {(!result.items || result.items.length === 0) && (
              <li className="text-sm text-[var(--muted)]">
                No se recibieron causas en esta sincronización. Revise el acceso utilizado o vuelva a consultar más tarde; esto no acredita ausencia de causas.
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="panel rounded-[var(--radius-lg)] p-5">
        <h2 className="text-lg font-semibold">
          {linkedCount === null ? "Causas vinculadas desde ClaveÚnica: sin comprobar" : `${linkedCount} ${linkedCount === 1 ? "causa vinculada" : "causas vinculadas"} desde ClaveÚnica`}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Abra el filtro de origen en Expediente para revisar las causas ya incorporadas al estudio.
        </p>
        <Link href="/pjud?origen=claveunica" className="btn btn-secondary mt-4">
          Ver en Expediente
        </Link>
      </section>
        </div>
      </details>
    </div>
  );
}
