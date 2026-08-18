export type PjudOpsLogLevel = "info" | "warn" | "error";

export type PjudOpsLogEntry = {
  at: string;
  level: PjudOpsLogLevel;
  source: string;
  message: string;
};

export type PjudOpsLogInput = {
  generatedAt: string;
  honesty?: string | null;
  liveIngestConfigured?: boolean;
  sidecar?: {
    configured?: boolean;
    reachable?: boolean;
    scrapeReady?: boolean | null;
    error?: string | null;
  } | null;
  captcha?: { configError?: string | null } | null;
  claveUnica?: {
    lastSyncAt?: string | null;
    lastSyncStatus?: string | null;
    lastSyncNote?: string | null;
  } | null;
  digest?: {
    lastAt?: string | null;
    lastStatus?: string | null;
    lastNote?: string | null;
  } | null;
  failedJobs?: number | null;
  hostNotices?: string[] | null;
};

function pushUnique(
  entries: PjudOpsLogEntry[],
  entry: PjudOpsLogEntry
) {
  if (!entry.message.trim()) return;
  if (entries.some((e) => e.source === entry.source && e.message === entry.message)) {
    return;
  }
  entries.push(entry);
}

function honestyLevel(input: PjudOpsLogInput): PjudOpsLogLevel {
  const sidecar = input.sidecar;
  if (sidecar?.configured && !sidecar.reachable) {
    return input.liveIngestConfigured ? "warn" : "error";
  }
  if (input.captcha?.configError) return "warn";
  if (!input.liveIngestConfigured) return "warn";
  return "info";
}

/** Snapshot of Host/PJUD operational notices for Configuración (not the daily UI). */
export function buildPjudOpsLog(input: PjudOpsLogInput): PjudOpsLogEntry[] {
  const at = input.generatedAt;
  const entries: PjudOpsLogEntry[] = [];

  if (input.honesty) {
    pushUnique(entries, {
      at,
      level: honestyLevel(input),
      source: "canal",
      message: input.honesty,
    });
  }

  if (
    input.sidecar?.configured &&
    input.sidecar.error &&
    !/servicio auxiliar/i.test(input.honesty || "")
  ) {
    const raw = input.sidecar.error;
    const message = /fetch failed|ECONNREFUSED|no responde/i.test(raw)
      ? "El servicio auxiliar no responde."
      : raw;
    pushUnique(entries, {
      at,
      level: input.sidecar.reachable ? "warn" : "error",
      source: "auxiliar",
      message,
    });
  } else if (
    input.sidecar?.configured &&
    !input.sidecar.reachable &&
    !/servicio auxiliar/i.test(input.honesty || "")
  ) {
    pushUnique(entries, {
      at,
      level: input.liveIngestConfigured ? "warn" : "error",
      source: "auxiliar",
      message:
        "El servicio auxiliar no responde. Revise `PJUD_SCRAPER_URL` o arranque `npm run pjud:host`.",
    });
  }

  if (input.captcha?.configError) {
    pushUnique(entries, {
      at,
      level: "error",
      source: "captcha",
      message: input.captcha.configError,
    });
  }

  for (const notice of input.hostNotices || []) {
    if (
      /servicio auxiliar/i.test(notice) &&
      /servicio auxiliar/i.test(input.honesty || "")
    ) {
      continue;
    }
    pushUnique(entries, {
      at,
      level: "warn",
      source: "claveunica",
      message: notice,
    });
  }

  if (input.claveUnica?.lastSyncNote) {
    const failed =
      input.claveUnica.lastSyncStatus === "failed" ||
      input.claveUnica.lastSyncStatus === "error" ||
      input.claveUnica.lastSyncStatus === "partial";
    pushUnique(entries, {
      at: input.claveUnica.lastSyncAt || at,
      level: failed ? "warn" : "info",
      source: "claveunica-sync",
      message: input.claveUnica.lastSyncNote,
    });
  }

  if (input.digest?.lastNote) {
    const failed =
      input.digest.lastStatus === "failed" ||
      input.digest.lastStatus === "error";
    pushUnique(entries, {
      at: input.digest.lastAt || at,
      level: failed ? "warn" : "info",
      source: "digest",
      message: input.digest.lastNote,
    });
  }

  if ((input.failedJobs || 0) > 0) {
    pushUnique(entries, {
      at,
      level: "warn",
      source: "cola",
      message: `${input.failedJobs} job(s) de sync PJUD en estado fallido.`,
    });
  }

  return entries.sort((a, b) => {
    const rank = { error: 0, warn: 1, info: 2 };
    const byLevel = rank[a.level] - rank[b.level];
    if (byLevel !== 0) return byLevel;
    return b.at.localeCompare(a.at);
  });
}
