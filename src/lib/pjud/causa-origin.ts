/** How a causa entered LexOpen. Distinct from `pjudSource` (last sync provider). */
export const CAUSA_ORIGINS = [
  "manual",
  "claveunica",
  "rol",
  "csv",
  "webhook",
] as const;

export type CausaOrigin = (typeof CAUSA_ORIGINS)[number];

const ORIGIN_SET = new Set<string>(CAUSA_ORIGINS);

const SOURCE_TO_ORIGIN: Record<string, CausaOrigin> = {
  claveunica: "claveunica",
  rol: "rol",
  lookup: "rol",
  csv: "csv",
  import: "csv",
  webhook: "webhook",
  manual: "manual",
};

export function isCausaOrigin(value: string | null | undefined): value is CausaOrigin {
  return Boolean(value && ORIGIN_SET.has(value));
}

export function resolveCausaOrigin(opts: {
  pjudOrigin?: string | null;
  pjudFromMisCausas?: boolean | null;
  pjudSource?: string | null;
}): CausaOrigin {
  if (isCausaOrigin(opts.pjudOrigin)) return opts.pjudOrigin;
  if (opts.pjudFromMisCausas) return "claveunica";
  const fromSource = opts.pjudSource
    ? SOURCE_TO_ORIGIN[opts.pjudSource]
    : undefined;
  if (fromSource) return fromSource;
  return "manual";
}

const ORIGIN_LABEL: Record<CausaOrigin, string> = {
  manual: "Manual",
  claveunica: "ClaveÚnica",
  rol: "ROL / OJV",
  csv: "CSV",
  webhook: "Webhook",
};

/** Human label for how a causa entered LexOpen (PJUD / manual). */
export function labelCausaOrigen(opts: {
  pjudOrigin?: string | null;
  pjudFromMisCausas?: boolean | null;
  pjudSource?: string | null;
}): string {
  return ORIGIN_LABEL[resolveCausaOrigin(opts)];
}

export function causaOrigenWhere(origen: string | undefined | null): Record<string, unknown> {
  if (!origen) return {};
  if (origen === "claveunica") {
    return {
      OR: [{ pjudOrigin: "claveunica" }, { pjudFromMisCausas: true }],
    };
  }
  if (origen === "rol") {
    return {
      OR: [
        { pjudOrigin: "rol" },
        {
          AND: [
            { pjudOrigin: null },
            { pjudSource: { in: ["rol", "lookup"] } },
          ],
        },
      ],
    };
  }
  if (origen === "csv") {
    return {
      OR: [
        { pjudOrigin: "csv" },
        {
          AND: [
            { pjudOrigin: null },
            { pjudSource: { in: ["csv", "import"] } },
          ],
        },
      ],
    };
  }
  if (origen === "webhook") {
    return {
      OR: [
        { pjudOrigin: "webhook" },
        { AND: [{ pjudOrigin: null }, { pjudSource: "webhook" }] },
      ],
    };
  }
  if (origen === "manual") {
    return {
      AND: [
        { pjudFromMisCausas: false },
        {
          OR: [
            { pjudOrigin: "manual" },
            {
              AND: [
                { pjudOrigin: null },
                {
                  OR: [
                    { pjudSource: null },
                    {
                      pjudSource: {
                        notIn: [
                          "rol",
                          "lookup",
                          "csv",
                          "import",
                          "webhook",
                          "claveunica",
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }
  return {};
}

type InsensitiveEquals = { equals: string; mode: "insensitive" };

/** Prisma `where` fragment to find an existing causa by rit+tribunal or ruc+tribunal. */
export function duplicateCausaWhere(input: {
  rit?: string | null;
  ruc?: string | null;
  tribunal?: string | null;
}): { OR: Array<{ rit: InsensitiveEquals; tribunal: InsensitiveEquals } | { ruc: InsensitiveEquals; tribunal: InsensitiveEquals }> } | null {
  const tribunal = input.tribunal?.trim();
  if (!tribunal) return null;
  const rit = input.rit?.trim();
  const ruc = input.ruc?.trim();
  const tribunalEq: InsensitiveEquals = {
    equals: tribunal,
    mode: "insensitive",
  };
  const or: Array<
    | { rit: InsensitiveEquals; tribunal: InsensitiveEquals }
    | { ruc: InsensitiveEquals; tribunal: InsensitiveEquals }
  > = [];
  if (rit) {
    or.push({
      rit: { equals: rit, mode: "insensitive" },
      tribunal: tribunalEq,
    });
  }
  if (ruc) {
    or.push({
      ruc: { equals: ruc, mode: "insensitive" },
      tribunal: tribunalEq,
    });
  }
  if (!or.length) return null;
  return { OR: or };
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
