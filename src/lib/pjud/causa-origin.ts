/** Human label for how a causa entered LexOpen (PJUD / manual). */
export function labelCausaOrigen(opts: {
  pjudFromMisCausas?: boolean | null;
  pjudSource?: string | null;
}): string | null {
  if (opts.pjudFromMisCausas || opts.pjudSource === "claveunica") {
    return "ClaveÚnica";
  }
  if (opts.pjudSource === "rol" || opts.pjudSource === "lookup") {
    return "ROL / OJV";
  }
  if (opts.pjudSource === "csv" || opts.pjudSource === "import") {
    return "CSV";
  }
  if (opts.pjudSource === "webhook") {
    return "Webhook";
  }
  if (opts.pjudSource) {
    return opts.pjudSource;
  }
  return null;
}

export function labelPjudSyncStatus(status: string | null | undefined): string {
  switch (status) {
    case "ok":
      return "Al día";
    case "demo":
      return "Demo";
    case "failed":
    case "error":
      return "Fallido";
    case "never":
      return "Sin sync";
    case "disabled":
      return "Pausado";
    case "running":
      return "En curso";
    case "partial":
      return "Parcial";
    case "cleared":
      return "Limpiado";
    case null:
    case undefined:
    case "":
      return "—";
    default:
      return status;
  }
}
