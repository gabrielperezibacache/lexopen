/**
 * Schedulers locales del Host (web:host y desktop host-runtime).
 * Cada uno se activa solo si su INTERVAL_MINUTES > 0 y hay CRON_SECRET.
 */

async function waitForHost(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(2_000),
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
  } = opts;
  const intervalMinutes = Number(env[intervalKey] || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;

  const secret = env.CRON_SECRET;
  if (!secret) {
    log.warn(
      `${intervalKey} está configurado, pero falta CRON_SECRET; scheduler ${label} desactivado.`
    );
    return null;
  }

  if (!alreadyHealthy && !(await waitForHost(baseUrl))) {
    log.warn(`No se pudo iniciar el scheduler ${label}: health no disponible.`);
    return null;
  }

  const tick = async () => {
    try {
      await run({ baseUrl, secret, env, log, timeoutMs });
    } catch (error) {
      log.warn(
        `${label} falló: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  await tick();
  const timer = setInterval(() => void tick(), intervalMinutes * 60_000);
  log.info(`Scheduler ${label} activo cada ${intervalMinutes} minutos.`);
  return timer;
}

async function postCron(opts) {
  const { url, secret, body = "{}", timeoutMs, log, failLabel } = opts;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    log.warn(`${failLabel}: ${data.error || response.status}`);
    return null;
  }
  return data;
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

  const timers = await Promise.all([
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      intervalKey: "PJUD_SYNC_INTERVAL_MINUTES",
      label: "PJUD sync",
      log,
      timeoutMs: 120_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/causas/monitoreo`,
          secret,
          body: "{}",
          timeoutMs,
          log: l,
          failLabel: "Sync PJUD falló",
        });
        if (body) {
          l.info(`Sync PJUD local: ${body.synced || 0} causas procesadas.`);
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
      intervalKey: "PJUD_MIS_CAUSAS_INTERVAL_MINUTES",
      label: "Mis Causas",
      log,
      timeoutMs: 300_000,
      run: async ({ baseUrl: url, secret, log: l, timeoutMs }) => {
        const body = await postCron({
          url: `${url}/api/pjud/mis-causas`,
          secret,
          body: JSON.stringify({ syncMovimientos: true }),
          timeoutMs,
          log: l,
          failLabel: "Sync Mis Causas falló",
        });
        if (body) {
          l.info(
            `Mis Causas: ${body.listed || 0} listadas · ${body.created || 0} nuevas.`
          );
        }
      },
    }),
    startIntervalJob({
      env,
      baseUrl,
      alreadyHealthy,
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
  ]);

  return {
    timers,
    stop() {
      for (const timer of timers) {
        if (timer) clearInterval(timer);
      }
    },
  };
}

export { waitForHost };
