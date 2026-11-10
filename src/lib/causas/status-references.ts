import type { CaseStatus } from "./status";

export type StatusReference = { text: string; href?: string; label?: string; unverified?: boolean };

/** Only references present in this actor's visible snapshot become links. Model URLs stay plain text. */
export function caseStatusReferences(text: string, status: CaseStatus): StatusReference[] {
  const known = new Map<string, { href: string; label: string }>();
  for (const p of status.deadlines) known.set(`plazo:${p.id}`, { href: "#plazos", label: `Plazo: ${p.title} · ${p.date}` });
  for (const t of status.steps) known.set(`tramite:${t.id}`, { href: "#tramites", label: `Trámite: ${t.title}` });
  for (const m of [...status.waiting, ...(status.latest ? [status.latest] : [])]) known.set(`movimiento:${m.id}`, { href: "#actividad", label: `Movimiento: ${m.title} · ${m.date}` });
  const taskHref = `/tareas?causaId=${encodeURIComponent(status.causaId)}`;
  for (const t of status.waitingTasks) known.set(`tarea:${t.id}`, { href: taskHref, label: `Tarea: ${t.title}` });
  for (const n of status.needs) if (n.source.startsWith("tarea:")) known.set(n.source, { href: taskHref, label: `Tarea: ${n.title}` });
  for (const r of status.fiscaliaRequests ?? []) known.set(`fiscalia:${r.id}`, { href: `/mi-fiscalia?causaId=${encodeURIComponent(status.causaId)}`, label: `Mi Fiscalía: ${r.title}` });
  const parts: StatusReference[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[(plazo|tramite|movimiento|tarea|fiscalia):([A-Za-z0-9_-]{1,120})\]/g)) {
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    const source = known.get(`${match[1]}:${match[2]}`);
    parts.push(source ? { text: match[0], ...source } : { text: match[0], unverified: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
