import { CASE_REFRESH_HOURS, CASE_REFRESH_TIMEZONE, nextCaseRefreshAt } from "./daily-schedule.mjs";
/** Configuration evidence only: timers run in the parent Host process. */
export function getPjudSchedulerConfiguration(env: Record<string, string | undefined> = process.env) {
  const minutes = Number(env.PJUD_SYNC_INTERVAL_MINUTES || 0);
  const intervalMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const hostManaged = env.LEXOPEN_WEB_HOST === "1" ||
    (env.LEXOPEN_DESKTOP === "1" && env.LEXOPEN_DESKTOP_MODE === "host");
  const enabled = intervalMinutes > 0 || Number(env.PJUD_MIS_CAUSAS_INTERVAL_MINUTES || 0) > 0;
  const configured = enabled && Boolean(env.CRON_SECRET) && hostManaged;
  return {
    configured,
    scheduleHours: CASE_REFRESH_HOURS,
    timeZone: CASE_REFRESH_TIMEZONE,
    nextAutomaticAt: nextCaseRefreshAt().toISOString(),
    maxAutomaticPerDay: 2,
    manualAllowed: true,
    intervalMinutes,
    hostManaged,
    runtime: "unverified" as const,
    note: configured
      ? "El Host debe estar encendido a las 08:00 y 22:00, hora de Chile. El temporizador no se ha verificado desde esta pantalla."
      : enabled
        ? "El horario está definido, pero falta completar o comprobar el programador del Host."
        : "La sincronización periódica no está configurada en este Host. Puede actualizar las causas desde su cartera.",
  };
}
