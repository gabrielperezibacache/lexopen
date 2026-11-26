import { caseRefreshWindow, CASE_REFRESH_LABEL } from "../src/lib/pjud/daily-schedule.mjs";
/**
 * Schedulers locales del Host (web:host y desktop host-runtime).
 * Se activan con INTERVAL_MINUTES > 0 y CRON_SECRET. Causas usa horarios fijos.
 */

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("El inicio de schedulers del Host se canceló.");
  error.code = "HOST_START_ABORTED";
  throw error;
}

function requestSignal(timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
}

async function waitForHost(url, attempts = 60, signal) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) return false;
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: requestSignal(2_000, signal),
        redirect: "error",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) return true;
    } catch {
      // Host still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function logFactory(prefix) {
  return {
    info: (msg) => console.log(`[${prefix}] ${msg}`),
    warn: (msg) => console.warn(`[${prefix}] ${msg}`),
  };
}

async function startIntervalJob(opts) {
  const {
    env,
    baseUrl,
    alreadyHealthy,
    intervalKey,
    label,
    log,
    run,
    timeoutMs = 120_000,
    runOnStart = true,
    signal,
  } = opts;
  throwIfAborted(signal);
  const intervalMinutes = Number(env[intervalKey] || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;

  const secret = env.CRON_SECRET;
  if (!secret) {
    log.warn(
      `${intervalKey} está configurado, pero falta CRON_SECRET; scheduler ${label} desactivado.`
    );
    return null;
  }

  if (!alreadyHealthy && !(await waitForHost(baseUrl, 60, signal))) {
    log.warn(`No se pudo iniciar el scheduler ${label}: health no disponible.`);
    return null;
  }

  let busy = false;
  const tick = async () => {
    if (busy || signal?.aborted) return;
    busy = true;
    try {
      await run({ baseUrl, secret, env, log, timeoutMs, signal });
    } catch (error) {
      if (signal?.aborted) return;
      log.warn(
        `${label} falló: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      busy = false;
    }
  };

  if (runOnStart) await tick();
  throwIfAborted(signal);
  const timer = setInterval(() => void tick(), intervalMinutes * 60_000);
  log.info(`Scheduler ${label} activo cada ${intervalMinutes} minutos.`);
  return timer;
}

async function postCron(opts) {
  const { url, secret, body = "{}", timeoutMs, log, failLabel, signal } = opts;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body,
    signal: requestSignal(timeoutMs, signal),
    redirect: "error",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    log.warn(`${failLabel}: ${data.error || response.status}`);
    return null;
  }
  return data;
}

/** A clock check is not a provider refresh. No startup catch-up outside the scheduled minute. */
export async function startDailyCaseRefreshJob({ env, baseUrl, alreadyHealthy, log, signal }) {
  throwIfAborted(signal);
  const monitored = Number(env.PJUD_SYNC_INTERVAL_MINUTES || 0) > 0;
  const portfolio = Number(env.PJUD_MIS_CAUSAS_INTERVAL_MINUTES || 0) > 0;
  if (!monitored && !portfolio) return null;
  const secret = env.CRON_SECRET;
  if (!secret) { log.warn("Actualización automática desactivada: falta CRON_SECRET."); return null; }
  if (!alreadyHealthy && !await waitForHost(baseUrl, 60, signal)) return null;
  let busy = false;
  let lastSlot = null;
  const tick = async () => {
    const window = caseRefreshWindow();
    if (busy || signal?.aborted || !window?.canStart || lastSlot === window.key) return;
    busy = true;
    lastSlot = window.key;
    try {
      if (portfolio) {
        try { await postCron({ url: `${baseUrl}/api/pjud/mis-causas`, secret,
        body: JSON.stringify({ syncMovimientos: true }), timeoutMs: 300_000, log, failLabel: "Mis Causas", signal }); }
        catch (error) { if (!signal?.aborted) log.warn(`Mis Causas: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (monitored) {
        while (caseRefreshWindow()?.key === window.key) {
          const result = await postCron({ url: `${baseUrl}/api/causas/monitoreo`, secret,
            body: JSON.stringify({ limit: 100 }), timeoutMs: 120_000, log, failLabel: "Sync PJUD", signal });
          if (!result || (!result.enqueued && !result.synced)) break;
        }
      }
    } catch (error) { if (!signal?.aborted) log.warn(`Actualización automática: ${error instanceof Error ? error.message : String(error)}`); }
    finally { busy = false; }
  };
  await tick();
  throwIfAborted(signal);
  const timer = setInterval(() => void tick(), 15_000);
  log.info(`Actualización automática: ${CASE_REFRESH_LABEL}.`);
  return timer;
}

/**
 * @param {{
 *   baseUrl: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   logPrefix?: string,
 *   alreadyHealthy?: boolean,
 * }} opts
 * @returns {Promise<{ stop: () => void, timers: Array<ReturnType<typeof setInterval>|null> }>}
 */
export async function startLocalHostSchedulers(opts) {
  const env = { ...process.env, ...(opts.env || {}) };
  const baseUrl = String(opts.baseUrl || "").replace(/\/$/, "");
  const log = logFactory(opts.logPrefix || "host-schedulers");
  const alreadyHealthy = Boolean(opts.alreadyHealthy);
  const signal = opts.signal;
  throwIfAborted(signal);

  const timers = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const timer of timers) if (timer) clearInterval(timer);
  };
  if (signal) signal.addEventListener("abort", stop, { once: true });
  const tracked = promise => promise.then(timer => {
    if (timer) {
      if (stopped) clearInterval(timer);
      else timers.push(timer);
    }
    return timer;
  });
  const results = await Promise.allSettled([
    startIntervalJob({
      env, baseUrl, alreadyHealthy, log, signal,
      intervalKey: "LEXOPEN_JORNADA_INTERVAL_MINUTES",
      label: "trabajo pendiente",
      timeoutMs: 300_000,
      runOnStart: false,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        await postCron({ url: `${url}/api/jornada/worker`, secret, timeoutMs, log: l, failLabel: "No se completó el ciclo de trabajo pendiente" });
      },
    }),
    startDailyCaseRefreshJob({ env, baseUrl, alreadyHealthy, log, signal }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "PJUD_DIGEST_INTERVAL_MINUTES",
      label: "digest PJUD",
      log,
      timeoutMs: 120_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/pjud/digest`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Digest PJUD falló",
        });
        if (body) {
          l.info(
            `Digest PJUD: ${body.causas || 0} causas · email ${body.emailed || 0} · in-app ${body.notified || 0}.`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "PLAZOS_ALERTAS_INTERVAL_MINUTES",
      label: "alertas de plazos",
      log,
      timeoutMs: 60_000,
      run: async ({ baseUrl: url, secret, env: e, log: l, timeoutMs }) => {
        const daysRaw = Number(e.PLAZOS_ALERTAS_DAYS || 3);
        const days = Number.isFinite(daysRaw)
          ? Math.max(0, Math.min(30, Math.trunc(daysRaw)))
          : 3;
        const body = await postCron({
          url: `${url}/api/plazos/alertas?days=${days}`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Alertas de plazos fallaron",
        });
        if (body) {
          l.info(
            `Alertas plazos: ${body.plazos || 0} plazos · ${body.notifications || 0} notificaciones · email ${body.emailed || 0} (ventana ${body.days ?? days}d).`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "UF_SYNC_INTERVAL_MINUTES",
      label: "sync UF",
      log,
      timeoutMs: 60_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/uf/sync`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Sync UF falló",
        });
        if (body) {
          l.info(
            `UF sync: ${body.upserted || 0} valores · último ${body.latest?.valueClp ?? "—"}`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "MAIL_SYNC_INTERVAL_MINUTES",
      label: "sync correo PJUD",
      log,
      timeoutMs: 120_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/mail/sync`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Sync correo falló",
        });
        if (body) {
          l.info(
            `Correo: ${body.inserted ?? 0} nuevos · ${body.users ?? 0} usuarios`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "NOTIFY_WORKER_INTERVAL_MINUTES",
      label: "notify outbox",
      log,
      timeoutMs: 120_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/notify/worker`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Notify worker falló",
        });
        if (body?.outbox) {
          l.info(
            `Notify outbox: ${body.outbox.sent || 0} enviados · ${body.outbox.failed || 0} fallidos · ${body.outbox.dead || 0} muertos`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "ESCALATION_INTERVAL_MINUTES",
      label: "escalamiento plazos",
      log,
      timeoutMs: 60_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/notify/escalamiento`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Escalamiento de plazos falló",
        });
        if (body) {
          l.info(
            `Escalamiento: hitos ${body.hitos?.generated || 0} · escalados ${body.escalamiento?.escalated || 0}`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      signal,
      intervalKey: "DIGEST_INTERVAL_MINUTES",
      label: "digest notificaciones",
      log,
      timeoutMs: 120_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/notify/digest`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Digest notificaciones falló",
        });
        if (body) {
          l.info(`Digest notificaciones: ${body.sent || 0} enviados`);
        }
      },
    }),
  ].map(tracked));
  const failed = results.find(result => result.status === "rejected");
  if (failed) {
    stop();
    signal?.removeEventListener("abort", stop);
    throw failed.reason;
  }
  throwIfAborted(signal);

  return {
    timers,
    stop,
  };
}

export { waitForHost };
