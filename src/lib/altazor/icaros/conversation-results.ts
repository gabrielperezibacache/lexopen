import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import type { ToolResult } from "@/lib/assistant/types";
import type { AltazorClient } from "../types";
import { readIcaroJob } from "./service";
import type { IcaroJobView } from "./types";

type Result = { toolId: string; result: ToolResult };
const pending = new Set(["queued", "running"]);

/** A card is a pointer, never permission to import another task's private answer. */
export async function conversationIcaroResults(row: { id: string; conversationId: string; resultsJson: string }, actor: CausaAccessUser, client: AltazorClient) {
  const initial = JSON.parse(row.resultsJson) as Result[];
  const jobs: IcaroJobView[] = [], results: Result[] = [];
  for (const item of initial) {
    const card = item.result.card;
    if (card?.type !== "icaro") { results.push(item); continue; }
    const jobId = typeof card.jobId === "string" ? card.jobId : typeof card.id === "string" ? card.id : null;
    if (!jobId) throw httpError("La delegación no está vinculada a este mensaje", 409);
    const record = await client.altazorIcaroJob.findFirst({ where: { id: jobId, ownerId: actor.id }, select: { contextJson: true } });
    let origin: { turnId?: string; conversationId?: string } | undefined;
    try { origin = record ? JSON.parse(record.contextJson).origin : undefined; } catch { /* Invalid linkage fails closed. */ }
    if (origin?.turnId !== row.id || origin.conversationId !== row.conversationId) throw httpError("La delegación pertenece a otra conversación", 409);
    const { job } = await readIcaroJob(jobId, actor);
    if (!job.available) throw httpError("El resultado delegado ya no está disponible con tus permisos actuales", 409);
    jobs.push(job);
    const ok = job.status === "completed" || pending.has(job.status);
    const message = job.status === "completed" ? job.result : pending.has(job.status) ? `${job.icaroName}: ${job.status === "queued" ? "encargo en cola" : "trabajando"}.` : `${job.icaroName}: encargo detenido o no disponible (${job.status}).`;
    results.push({ ...item, result: { ...item.result, ok, message, card: { ...card, status: job.status, jobId: job.id, id: job.id } } });
  }
  return { results, jobs, working: jobs.some(job => pending.has(job.status)) };
}

export function completedIcaroText(jobs: readonly IcaroJobView[]) {
  return jobs.filter(job => job.status === "completed").map(job => `Resultado de Ícaro ${job.icaroName.replace(/[\r\n]/g, " ")}:\n${job.result}`).join("\n\n");
}
