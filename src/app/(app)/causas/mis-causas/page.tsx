"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { validarRut } from "@/lib/chile";
import { PageHeader } from "@/components/sites/SiteNav";
import { apiMutation } from "@/lib/api-mutation";

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
    return new Date(value).toLocaleString("es-CL", {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MisCausasPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "warn" | "err">("ok");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);
  const [adminOnly, setAdminOnly] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  async function load() {
    const [res, meRes] = await Promise.all([
      fetch("/api/pjud/mis-causas"),
      fetch("/api/auth/me"),
    ]);
    const data = await res.json().catch(() => ({}));
    const me = await meRes.json().catch(() => ({}));
    if (me?.user?.role) setRole(me.user.role);
    if (!res.ok) {
      setMsgTone("err");
      setMsg(data.error || "No se pudo cargar el estado de ClaveÚnica.");
      return;
    }
    setStatus(data.status || null);
    setLinkedCount(
      typeof data.causasCount === "number"
        ? data.causasCount
        : Array.isArray(data.causas)
          ? data.causas.length
          : 0
    );
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCredentials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const rut = String(fd.get("rut") || "");
    const password = String(fd.get("password") || "");
    if (!validarRut(rut)) {
      setBusy(false);
      setMsgTone("err");
      setMsg(
        "El RUT no es válido. Revise el dígito verificador (el ejemplo 12.345.678-9 no sirve: use un RUT real)."
      );
      return;
    }
    const result = await apiMutation<{
      error?: string;
      enabled?: boolean;
      rutMasked?: string | null;
      hasPassword?: boolean;
    }>("/api/pjud/claveunica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        rut,
        password,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setMsgTone("err");
      if (result.status === 403) {
        setAdminOnly(true);
        setMsg(
          "Solo quien administra el estudio puede guardar o borrar la ClaveÚnica. Si ya está guardada, usted sí puede sincronizar."
        );
      } else {
        setMsg(result.error || "No se pudieron guardar los datos de acceso.");
      }
      return;
    }
    setAdminOnly(false);
    setStatus(result.data as Status);
    setMsgTone("ok");
    setMsg(
      "Listo: su ClaveÚnica quedó guardada de forma segura en este servidor. Ya puede sincronizar."
    );
    e.currentTarget.reset();
  }

  async function clearCredentials() {
    setBusy(true);
    setMsg("");
    const result = await apiMutation<Status>("/api/pjud/claveunica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    setBusy(false);
    if (!result.ok) {
      setMsgTone("err");
      if (result.status === 403) {
        setAdminOnly(true);
        setMsg("Solo quien administra el estudio puede eliminar la ClaveÚnica.");
      } else {
        setMsg(result.error || "No se pudieron eliminar los datos.");
      }
      return;
    }
    setStatus(result.data);
    setResult(null);
    setMsgTone("ok");
    setMsg("Se eliminaron el RUT y la contraseña de este estudio.");
  }

  async function clearErrors() {
    setBusy(true);
    setMsg("");
    setResult(null);
    const result = await apiMutation<{ ok?: boolean; status?: Status }>(
      "/api/pjud/mis-causas",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_errors" }),
      }
    );
    setBusy(false);
    if (!result.ok) {
      setMsgTone("err");
      setMsg(result.error || "No se pudieron limpiar los avisos.");
      return;
    }
    if (result.data.status) setStatus(result.data.status);
    else await load();
    setMsg("");
  }

  async function syncMisCausas() {
    setBusy(true);
    setMsg("");
    setResult(null);
    setMsgTone("ok");
    setMsg(
      "Sincronización iniciada. Puede tardar varios minutos (login ClaveÚnica + listado); no cierre esta página."
    );
    const result = await apiMutation<
      SyncResult & {
        status?: Status;
        async?: boolean;
        started?: boolean;
      }
    >("/api/pjud/mis-causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncMovimientos: true }),
    });
    if (!result.ok) {
      setBusy(false);
      setMsgTone("err");
      setMsg(
        result.error ||
          "No se pudo sincronizar. Revise los pasos pendientes más abajo e intente de nuevo."
      );
      await load();
      return;
    }
    const data = result.data;
    if (data.status) setStatus(data.status);

    // 202 async: poll until status leaves "running" (avoids Cloudflare 524).
    if (data.async) {
      if (data.started === false) {
        setMsg(
          "Ya hay una sincronización en curso. Esperando el resultado…"
        );
      }
      let finalStatus: Status | null = data.status || null;
      for (let i = 0; i < 120; i++) {
        await sleep(3000);
        try {
          const res = await fetch("/api/pjud/mis-causas");
          const body = await res.json().catch(() => ({}));
          if (!res.ok) continue;
          const st = (body as { status?: Status }).status || null;
          if (st) {
            setStatus(st);
            finalStatus = st;
          }
          if (st?.lastSyncStatus && st.lastSyncStatus !== "running") {
            break;
          }
        } catch {
          /* keep polling */
        }
      }
      setBusy(false);
      const note = finalStatus?.lastSyncNote || "";
      const st = finalStatus?.lastSyncStatus;
      if (st === "failed") {
        setMsgTone("err");
        setMsg(note || "La sincronización falló.");
      } else if (st === "partial") {
        setMsgTone("warn");
        setMsg(note || "Sincronización parcial.");
      } else if (st === "running") {
        setMsgTone("warn");
        setMsg(
          "La sincronización sigue en curso en el servidor. Recargue en unos minutos o revise el monitoreo."
        );
      } else {
        setMsgTone("ok");
        setMsg(
          note ||
            "Sincronización terminada. Los movimientos se actualizan en segundo plano vía la cola de monitoreo."
        );
      }
      await load();
      return;
    }

    setBusy(false);
    setResult(data);
    setStatus(data.status || null);
    const failed = Number(data.syncFailed || 0);
    const listed = Number(data.listed || 0);
    const created = Number(data.created || 0);
    const linked = Number(data.linked || 0);
    const enqueued = Number(data.enqueued || 0);
    const inserted = Number(data.inserted || 0);
    let summary = `Se encontraron ${listed} causa${listed === 1 ? "" : "s"}`;
    if (created || linked) {
      summary += ` (${created} nueva${created === 1 ? "" : "s"}, ${linked} ya estaban en LexOpen)`;
    }
    if (enqueued > 0 && failed === 0 && inserted === 0) {
      summary += `. ${enqueued} puesta${enqueued === 1 ? "" : "s"} en cola para movimientos.`;
      setMsgTone("ok");
    } else if (failed > 0) {
      summary += `. Algunas no pudieron actualizar sus movimientos (${failed}). Revise el monitoreo.`;
      setMsgTone("warn");
    } else if (inserted > 0) {
      summary += `. Se agregaron ${inserted} movimiento${inserted === 1 ? "" : "s"} nuevo${inserted === 1 ? "" : "s"}.`;
      setMsgTone("ok");
    } else {
      summary += ". Todo al día.";
      setMsgTone("ok");
    }
    setMsg(summary);
    await load();
  }

  const canOperate = role === "admin" || role === "abogado";
  const syncDisabled =
    busy ||
    !canOperate ||
    !status?.hasPassword ||
    status?.readyToSync === false ||
    status?.lastSyncStatus === "running";
  const ready = Boolean(status?.readyToSync);
  const when = formatWhen(status?.lastSyncAt);
  const syncTitle = lastSyncLabel(status?.lastSyncStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Poder Judicial"
        title="ClaveÚnica"
        subtitle="Credenciales y sync de cartera OJV. Las causas quedan en Expediente; los movimientos, en Cartera PJUD."
      />

      <section className="panel space-y-4 rounded-3xl p-5">
        <div
          className={`rounded-2xl border px-4 py-3 ${
            ready
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
              : "border-amber-200 bg-amber-50/70 text-amber-950"
          }`}
          role="status"
        >
          <p className="text-sm font-semibold">
            {status?.readinessLabel ||
              (ready ? "Listo para sincronizar" : "Aún no se puede sincronizar")}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {status?.readinessHint ||
              "Complete los pasos de abajo para conectar su ClaveÚnica."}
          </p>
          {status?.channelLabel && ready ? (
            <p className="mt-2 text-xs opacity-80">
              Cómo consulta LexOpen: {status.channelLabel}
            </p>
          ) : null}
        </div>

        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sea)]">
              1. Guardar acceso
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              Un administrador ingresa el RUT y la contraseña de ClaveÚnica. Quedan
              cifrados en este Host.
            </p>
          </li>
          <li className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sea)]">
              2. Sincronizar
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              LexOpen lista «Mis Causas» en la Oficina Judicial Virtual y las
              incorpora o actualiza en el estudio.
            </p>
          </li>
          <li className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sea)]">
              3. Seguir en el apartado
            </div>
            <p className="mt-2 text-[var(--ink-soft)]/80">
              Revise el expediente en{" "}
              <Link href="/causas?origen=claveunica" className="text-[var(--sea)]">
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
        <p className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          Su perfil de asistente puede ver el estado, pero no guardar
          credenciales ni sincronizar. Pida a un abogado o administrador.
        </p>
      )}

      <section className="panel space-y-5 rounded-3xl p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Estado actual</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
              Resumen de lo que LexOpen tiene configurado para este estudio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              Acceso:{" "}
              {status?.hasPassword
                ? `guardado${status.rutMasked ? ` (${status.rutMasked})` : ""}`
                : "sin guardar"}
            </span>
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              Conexión: {status?.enabled ? "activa" : "pausada"}
            </span>
            <span className="rounded-full border border-[var(--line)] px-3 py-1">
              CAPTCHA: {status?.captchaConfigured ? "configurado" : "pendiente"}
            </span>
          </div>
        </div>

        {(syncTitle || status?.lastSyncNote) && (
          <div className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
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
                  disabled={busy || !canOperate || status?.lastSyncStatus === "running"}
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
            className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-950"
            role="status"
          >
            <p className="font-semibold">Qué falta para poder sincronizar</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {status.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-rose-900/80">
              Si necesita ayuda técnica del servidor, revise también{" "}
              <Link href="/integraciones" className="underline">
                Integraciones
              </Link>{" "}
              o Configuración → PJUD.
            </p>
          </div>
        )}

        {status?.warnings &&
          status.warnings.length > 0 &&
          !(status.blockers && status.blockers.length > 0) && (
            <div
              className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">Aviso del Host</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                {status.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

        {adminOnly && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            Su usuario puede sincronizar, pero no cambiar el RUT ni la contraseña.
            Pida a un administrador del estudio que guarde la ClaveÚnica.
          </p>
        )}

        <div className="space-y-3">
          <h3 className="text-base font-semibold">Guardar ClaveÚnica</h3>
          <p className="text-sm text-[var(--ink-soft)]/75">
            Use la misma ClaveÚnica con la que entra a la Oficina Judicial Virtual.
            LexOpen la cifra y la guarda solo aquí; no la muestra después en
            pantalla.
          </p>
          <form
            onSubmit={saveCredentials}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-[var(--ink-soft)]/70">RUT</span>
              <input
                className="input"
                name="rut"
                required
                placeholder="Ej. 12.345.678-5"
                autoComplete="username"
              />
            </label>
            <label className="block text-sm sm:col-span-1">
              <span className="mb-1 block text-[var(--ink-soft)]/70">
                Contraseña
              </span>
              <input
                className="input"
                name="password"
                type="password"
                required
                placeholder="Contraseña ClaveÚnica"
                autoComplete="current-password"
              />
            </label>
            <div className="flex items-end">
              <button className="btn btn-primary w-full" disabled={busy || !canOperate} type="submit">
                Guardar de forma segura
              </button>
            </div>
          </form>
          <p className="text-xs text-[var(--ink-soft)]/65">
            Al guardar, LexOpen podrá iniciar sesión automáticamente en su nombre
            para listar causas. Puede pausar o borrar el acceso cuando quiera.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
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
            {busy ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          {status?.hasPassword && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !canOperate}
              onClick={async () => {
                setBusy(true);
                setMsg("");
                const result = await apiMutation<Status>("/api/pjud/claveunica", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: status.enabled ? "disable" : "enable",
                  }),
                });
                setBusy(false);
                if (!result.ok) {
                  setMsgTone("err");
                  if (result.status === 403) {
                    setAdminOnly(true);
                    setMsg(
                      "Solo quien administra el estudio puede pausar o reanudar la conexión."
                    );
                  } else {
                    setMsg(result.error || "No se pudo cambiar el estado.");
                  }
                  return;
                }
                setStatus(result.data);
                setMsgTone("ok");
                setMsg(
                  status.enabled
                    ? "Conexión pausada. LexOpen no usará la ClaveÚnica hasta que la reanude."
                    : "Conexión reanudada. Ya puede sincronizar de nuevo."
                );
              }}
            >
              {status.enabled ? "Pausar conexión" : "Reanudar conexión"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !status?.hasPassword || !canOperate}
            onClick={clearCredentials}
          >
            Eliminar acceso guardado
          </button>
          <Link href="/causas?origen=claveunica" className="btn btn-ghost">
            Ver en Expediente
          </Link>
          <Link href="/causas/monitoreo" className="btn btn-ghost">
            Ir a Cartera PJUD
          </Link>
        </div>

        {msg && (
          <div
            className={`flex flex-wrap items-start justify-between gap-2 rounded-2xl border px-4 py-3 text-sm ${
              msgTone === "err"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : msgTone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
            role="status"
            data-testid="claveunica-msg"
          >
            <p className="min-w-0 flex-1">{msg}</p>
            <button
              type="button"
              className="shrink-0 text-xs underline-offset-2 hover:underline"
              onClick={() => setMsg("")}
            >
              Cerrar
            </button>
          </div>
        )}
      </section>

      {result && (
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">
            Resultado de la sincronización ({result.listed})
          </h2>
          {result.syncFailed ? (
            <p className="mt-1 text-sm text-amber-800">
              {result.syncFailed} no pudieron actualizar sus movimientos. Puede
              reintentar desde Cartera PJUD.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
              Listado desde OJV. Abra las causas en Expediente; los movimientos
              se procesan en{" "}
              <Link href="/causas/monitoreo" className="text-[var(--sea)]">
                Cartera PJUD
              </Link>
              .
            </p>
          )}
          <p className="mt-2">
            <Link href="/causas?origen=claveunica" className="btn btn-secondary">
              Ver en Expediente
            </Link>
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {result.items.map((item) => (
              <li
                key={`${item.causaId || item.rit}-${item.tribunal}`}
                className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
              >
                {item.causaId ? (
                  <Link
                    href={`/causas/${item.causaId}?from=mis-causas`}
                    className="font-medium text-[var(--sea)]"
                  >
                    {item.rit}
                  </Link>
                ) : (
                  <div className="font-medium">{item.rit}</div>
                )}
                <div className="mt-0.5 break-words text-xs text-[var(--ink-soft)]/65">
                  {item.tribunal}
                  {item.caratula ? ` · ${item.caratula}` : ""}
                </div>
              </li>
            ))}
            {result.items.length === 0 && (
              <li className="text-sm text-[var(--ink-soft)]/65">
                No aparecieron causas en esta sincronización.
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">
          {linkedCount} causa{linkedCount === 1 ? "" : "s"} vinculada
          {linkedCount === 1 ? "" : "s"} desde ClaveÚnica
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
          No es un segundo expediente: abra el filtro de origen en Expediente.
        </p>
        <Link href="/causas?origen=claveunica" className="btn btn-secondary mt-4">
          Ver en Expediente
        </Link>
      </section>
    </div>
  );
}
