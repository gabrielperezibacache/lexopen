import { prisma } from "@/lib/db";
import { parseLocalDateInput } from "@/lib/minutas";

type MindicadorSerie = {
  serie?: Array<{ fecha?: string; valor?: number }>;
};

/**
 * Fetch UF from mindicador.cl and upsert recent daily values.
 * External API; Host remains local for storage.
 */
export async function syncUfFromMindicador(opts?: { days?: number }) {
  const days = Math.min(Math.max(opts?.days ?? 30, 1), 90);
  const res = await fetch("https://mindicador.cl/api/uf", {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`mindicador HTTP ${res.status}`);
  }
  const data = (await res.json()) as MindicadorSerie;
  const serie = Array.isArray(data.serie) ? data.serie : [];
  let upserted = 0;
  for (const row of serie.slice(0, days)) {
    if (!row.fecha || typeof row.valor !== "number" || !Number.isFinite(row.valor)) {
      continue;
    }
    const datePart = row.fecha.slice(0, 10);
    const date = parseLocalDateInput(datePart);
    if (!date) continue;
    const valueClp = Math.round(row.valor);
    if (valueClp <= 0) continue;
    await prisma.ufRate.upsert({
      where: { date },
      create: { date, valueClp, source: "mindicador.cl" },
      update: { valueClp, source: "mindicador.cl" },
    });
    upserted += 1;
  }
  const latest = await prisma.ufRate.findFirst({ orderBy: { date: "desc" } });
  return { upserted, latest };
}
