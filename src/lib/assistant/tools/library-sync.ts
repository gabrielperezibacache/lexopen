import { caseJudicialStatus } from "@/lib/causas/judicial-status";
import { z } from "zod";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { bookAccessWhere } from "@/lib/books/access";
import { assistantDb as db } from "../transaction-context";
import { secureTool } from "../secure-tool";
import type { ToolContext } from "../types";
import type { AssistantTool } from "./types";
import { desktopScope } from "./escritorio-access";
import { workflowScope } from "./workflow-access";
import { assertLibrarySyncToolInputAccess } from "./library-sync-access";
const books=z.object({bookIds:z.array(z.string().min(1).max(100)).max(50)}).strict(),empty=z.object({}).strict();
export async function resolveLibrarySyncInput(id:string,_input:Record<string,unknown>,ctx:ToolContext){
  if(id==="sincronizacion.estado"){await workflowScope(ctx,db);return{};}
  const scope=await desktopScope(ctx,db),rows=await db.libraryBook.findMany({where:bookAccessWhere(scope.actor),select:{id:true},orderBy:[{createdAt:"desc"},{id:"asc"}],take:50});
  const input={bookIds:rows.map(row=>row.id)};await assertLibrarySyncToolInputAccess(id,input,ctx,false,db);return input;
}
export const bibliotecaListarTool:AssistantTool<z.infer<typeof books>>=secureTool({id:"biblioteca.listar",kind:"read",roles:[...STAFF_ROLES],description:"Consulta hasta cincuenta títulos y autores accesibles en la biblioteca personal, sin leer pasajes ni crear citas.",inputSchema:books,preview:()=>"Consultar títulos y autores de tu biblioteca. No se leen los documentos ni se consulta una IA.",async execute(input,ctx){const scope=await desktopScope(ctx,db),rows=await db.libraryBook.findMany({where:{AND:[bookAccessWhere(scope.actor),{id:{in:input.bookIds}}]},select:{title:true,author:true},orderBy:{title:"asc"}});return{ok:true,message:rows.length?`${rows.map(row=>`${row.title}${row.author?` · ${row.author}`:""}`).join("\n")}\n\nCatálogo de hasta cincuenta libros accesibles; no acredita lectura de sus textos. Elige pasajes en Fuentes para citarlos.`:"Tu biblioteca aún no tiene libros accesibles. Añade tus documentos para preparar sus pasajes.",card:{type:"biblioteca",href:"/biblioteca"}};}});
export const sincronizacionEstadoTool: AssistantTool<z.infer<typeof empty>> = secureTool({
  id: "sincronizacion.estado", kind: "read", roles: [...STAFF_ROLES],
  description: "Consulta el seguimiento judicial y la sincronización de la carpeta Drive propia de la causa actual.",
  inputSchema: empty, preview: () => "Consultar el seguimiento de esta causa y las descargas registradas.",
  async execute(_input, ctx) {
    const scope = await workflowScope(ctx, db);
    const [cause, drive, pending] = await Promise.all([
      db.causa.findUniqueOrThrow({ where: { id: scope.causaId }, select: {
        pjudMonitoreoActivo: true, pjudLastSyncAt: true, pjudLastSyncStatus: true,
        pjudCuadernosCoverage: true, pjudDocumentDownloadsEnabled: true,
      } }),
      db.driveSyncSubscription.findFirst({ where: { causaId: scope.causaId, ownerId: scope.actor.id }, select: { enabled: true, lastRunAt: true } }),
      db.pjudDocumentJob.count({ where: { causaId: scope.causaId, status: { in: ["pending", "running"] } } }),
    ]);
    const judicial = caseJudicialStatus(cause);
    const format = (date: Date) => date.toLocaleString("es-CL", { timeZone: "America/Santiago" });
    const lines = [
      judicial.enabled ? "Seguimiento judicial activado." : "Seguimiento judicial desactivado.",
      judicial.notice || (judicial.attemptedAt && judicial.coverage === "complete" ? "Se registró la lectura completa de los cuadernos en esa consulta." : null),
      judicial.attemptedAt ? `Último intento de consulta el ${format(new Date(judicial.attemptedAt))}, hora de Chile.` : null,
      cause.pjudDocumentDownloadsEnabled ? `Descargas judiciales pendientes o en curso: ${pending}.` : "La descarga judicial automática está desactivada.",
      drive?.enabled ? `Mi carpeta de Drive tiene la actualización activada. ${drive.lastRunAt ? `Última revisión el ${format(drive.lastRunAt)}, hora de Chile.` : "Todavía no consta una revisión."}` : "Mi carpeta de Drive tiene la actualización automática desactivada.",
    ];
    return { ok: true, message: lines.filter(Boolean).join("\n"), card: { type: "sincronizacion", causaId: scope.causaId, href: `/causas/${scope.causaId}?tab=sincronizacion` } };
  },
});
