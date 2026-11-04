import { normalizePjudCuaderno } from "@/lib/pjud/types";
import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import { PJUD_MAX_CAUSA_MOVIMIENTOS, PJUD_MAX_TRANSPORT_BYTES } from "@/lib/pjud/cuadernos-limits";

type Row = { cuaderno?: string | null };
type LookupPayload<T extends Row> = { movimientos: T[]; cuadernos?: unknown; note?: string };
const limitedNote = "La transferencia alcanzó su límite de tamaño o movimientos. La sincronización es parcial; vuelva a consultar los cuadernos pendientes.";

/** Bound a sidecar response before sending it, keeping an honest partial result. */
export function boundPjudLookupTransport<T extends Row, P extends LookupPayload<T>>(
  payload: P,
  maxBytes = PJUD_MAX_TRANSPORT_BYTES,
  maxRows = PJUD_MAX_CAUSA_MOVIMIENTOS,
) {
  const coverage = normalizeCuadernosCoverage(payload.cuadernos);
  const worstCoverage = {
    ...coverage,
    status: "partial" as const,
    read: 0,
    items: coverage.items.map(item => ({ ...item, status: "failed" as const, count: 0, note: limitedNote })),
  };
  const note = `${payload.note || ""} ${limitedNote}`.trim().slice(0, 2000);
  const overhead = Math.max(
    Buffer.byteLength(JSON.stringify({ ...payload, movimientos: [], cuadernos: coverage })),
    Buffer.byteLength(JSON.stringify({ ...payload, movimientos: [], cuadernos: worstCoverage, note })),
  ) + 1024;
  const rows: T[] = [];
  let bytes = overhead;
  for (const row of payload.movimientos.slice(0, maxRows)) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes + size > maxBytes) break;
    rows.push(row);
    bytes += size;
  }
  if (rows.length === payload.movimientos.length) return { ...payload, cuadernos: coverage };
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizePjudCuaderno(row.cuaderno);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const items = coverage.items.map(item => {
    const normalized = normalizePjudCuaderno(item.label);
    const movementKey = item.key === "cuaderno:1.0" && /^(?:1\.0\s*-\s*)?principal$/i.test(item.label)
      ? "principal" : normalized;
    const count = movementKey ? counts.get(movementKey) || 0 : 0;
    const transferred = item.status === "ok" && count === item.count;
    return { ...item, count, status: transferred ? "ok" as const : "failed" as const, ...(transferred ? {} : { note: limitedNote }) };
  });
  return {
    ...payload,
    movimientos: rows,
    note,
    cuadernos: { ...coverage, status: "partial" as const, read: items.filter(item => item.status === "ok").length, items },
  };
}
