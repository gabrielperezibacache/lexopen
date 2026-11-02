import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { citationText } from "./citations";
import { readHearingLiveForExport, type HearingLiveClock } from "./live-service";
import type { HearingLiveView } from "./live-types";
const duration = (seconds: number) => `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const phases = { idle: "Sin iniciar", running: "En curso", paused: "Pausada", finished: "Finalizada" };
export function renderHearingLive(live: HearingLiveView, title: string, causa: { id: string; titulo: string; rit: string | null }) {
  const plan = live.plan;
  const points = plan.noteIds.map((id, index) => {
    const note = live.notes.find(note => note.id === id);
    if (!note?.available) return `${index + 1}. Punto no disponible con los permisos actuales.`;
    return `${index + 1}. ${note.title}\nEstado registrado: ${plan.addressedNoteIds.includes(id) ? "Tratado por el profesional" : "Pendiente de revisión"}${live.changedNoteIds.includes(id) ? " · modificado después de preparar el guion" : ""}\n${note.body}${note.citation ? `\n\n${citationText(note.citation)}` : "\nObservación personal sin respaldo documental asociado."}`;
  });
  const entries = live.entries.map(entry => !entry.available ? "Registro no disponible con los permisos actuales." : `${entry.createdAt} · tiempo de trabajo ${duration(entry.elapsedSeconds)}\n${entry.title}\n${entry.body}${entry.citation ? `\n\n${citationText(entry.citation)}` : "\nObservación personal sin respaldo documental asociado."}${entry.revision > 1 ? "\nEste registro fue editado después de anotarse; la hora identifica su creación, no acredita el momento del hecho." : ""}`);
  return ["Registro de trabajo de audiencia", title, `${causa.titulo} · ${causa.rit || "Sin RIT"} · Causa ${causa.id}`, `Generado ${live.serverNow} · revisión del panel ${live.revision}`, `Sesión ${phases[live.phase]} · tiempo de trabajo ${duration(live.elapsedSeconds)}`, "Registro personal para revisión profesional. No constituye acta oficial ni acredita lo resuelto por el tribunal.", plan.opening && `APERTURA PROPIA\n${plan.opening}`, `GUION DE INTERVENCIÓN\n${points.join("\n\n") || "Sin puntos elegidos."}`, plan.closing && `PETICIÓN DE CIERRE PROPIA\n${plan.closing}`, `REGISTROS ANOTADOS\n${entries.join("\n\n") || "Sin registros anotados."}`, "ALCANCE", "Se incluyen hasta cien registros de esta mesa privada, sujetos a acceso actual. Los no disponibles se muestran sin texto ni títulos. Las notas ajenas al registro se incluyen sólo cuando están elegidas en el guion.", ...(live.limited ? ["El alcance excede el límite; esta salida no es un inventario completo."] : []), ...live.warnings].filter(Boolean).join("\n\n");
}
export async function exportHearingLive(causaId: string, workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()) {
  const { live, title, causa } = await readHearingLiveForExport(causaId, workspaceId, user, client, clock);
  return { name: "registro-audiencia.txt", text: renderHearingLive(live, title, causa) };
}
