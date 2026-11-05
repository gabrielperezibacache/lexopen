import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { bookAccessWhere } from "@/lib/books/access";
import { desktopScope } from "./escritorio-access";
import { workflowScope } from "./workflow-access";
import type { ToolContext } from "../types";
export async function assertLibrarySyncToolInputAccess(id:string,input:Record<string,unknown>,ctx:ToolContext,_write:boolean,db:Prisma.TransactionClient=prisma) {
  if(id==="sincronizacion.estado"){await workflowScope(ctx,db,true);return;}
  const scope=await desktopScope(ctx,db,true);
  if(scope.causaId)throw httpError("Consulta el catálogo desde tu espacio personal. Para fundamentar esta causa, elige pasajes de la biblioteca en Fuentes.",409);
  const ids=Array.isArray(input.bookIds)?input.bookIds:[];
  if(ids.length>50 || ids.some(id=>typeof id!=="string") || new Set(ids).size!==ids.length || await db.libraryBook.count({where:{AND:[bookAccessWhere(scope.actor),{id:{in:ids as string[]}}]}})!==ids.length)throw httpError("La selección de biblioteca cambió o ya no está disponible.",409);
}
