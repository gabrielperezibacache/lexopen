/** Configuration evidence only: timers run in the parent Host process. */
export function getPjudSchedulerConfiguration(env: Record<string, string | undefined> = process.env) {
  const minutes = Number(env.PJUD_SYNC_INTERVAL_MINUTES || 0);
  const intervalMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const hostManaged = env.LEXOPEN_WEB_HOST === "1" ||
    (env.LEXOPEN_DESKTOP === "1" && env.LEXOPEN_DESKTOP_MODE === "host");
  const configured = intervalMinutes > 0 && Boolean(env.CRON_SECRET) && hostManaged;
  return {
    configured,
    intervalMinutes,
    hostManaged,
    runtime: "unverified" as const,
    note: configured
      ? `El Host tiene un intervalo de ${intervalMinutes} minutos configurado. La ejecución del programador no se ha verificado desde esta pantalla.`
      : intervalMinutes > 0
        ? "El intervalo está definido, pero falta completar o comprobar el programador del Host."
        : "La sincronización periódica no está configurada en este Host. Puede actualizar las causas desde su cartera.",
  };
}
