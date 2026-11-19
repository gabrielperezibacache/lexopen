import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";

export type CaseJudicialRecord = {
  pjudLastSyncAt: Date | null;
  pjudLastSyncStatus: string | null;
  pjudMonitoreoActivo: boolean;
  pjudCuadernosCoverage?: unknown;
};

const knownStatuses = ["ok", "partial", "error", "failed", "demo", "disabled", "never", "unverified", "running", "cleared"];

/** Only the outcome and validated extent of coverage belong in a case summary or model context. */
export function caseJudicialStatus(row: CaseJudicialRecord) {
  const status = row.pjudLastSyncStatus && knownStatuses.includes(row.pjudLastSyncStatus) ? row.pjudLastSyncStatus : null;
  const at = row.pjudLastSyncAt?.toISOString() ?? null;
  const coverage = normalizeCuadernosCoverage(row.pjudCuadernosCoverage);
  const read = status === "ok" || status === "partial";
  const attempted = read || status === "failed" || status === "error";
  let verifiedCoverage: typeof coverage.status = read && at ? coverage.status : "unknown";
  if (status === "partial" && verifiedCoverage === "complete") verifiedCoverage = "partial";
  let notice: string | null = null;
  if (status === "failed" || status === "error") {
    notice = "Falló la última consulta al PJUD. Los movimientos registrados en el estudio no permiten saber si hubo novedades en el tribunal.";
  } else if (status === "unverified") {
    notice = "Los datos importados al estudio no acreditan una consulta al PJUD. Las novedades judiciales siguen sin comprobar.";
  } else if (status === "partial" || status === "ok" && coverage.status === "partial") {
    notice = "La última consulta al PJUD fue parcial. Pueden faltar movimientos de los cuadernos pendientes de comprobar.";
  } else if (status === "ok" && (!at || coverage.status !== "complete")) {
    notice = "La consulta registrada no acredita una lectura completa de los cuadernos. Pueden faltar movimientos judiciales.";
  } else if (status === "demo") {
    notice = "Los datos de demostración no acreditan novedades en el tribunal.";
  } else if (row.pjudMonitoreoActivo && status !== "ok") {
    notice = "Todavía no consta una consulta judicial completa. Las novedades del tribunal siguen sin comprobar.";
  }
  return {
    status, enabled: row.pjudMonitoreoActivo, at, attemptedAt: attempted ? at : null,
    coverage: verifiedCoverage,
    notice,
  };
}
