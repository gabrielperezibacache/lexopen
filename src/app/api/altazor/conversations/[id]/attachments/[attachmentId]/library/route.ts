import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { attachmentFor } from "@/lib/altazor/attachments";
import { bookMetadataSchema } from "@/lib/books/ingest";
import { importBook, readBook } from "@/lib/books/service";
import { httpError } from "@/lib/auth/access";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
export const maxDuration=120;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string;attachmentId:string}>}){
  try{
    assertCsrf(req);const user=await requireStaff(),{id,attachmentId}=await params;
    await parseKnowledgeBody(req,z.object({}).strict());
    const {actor,row}=await attachmentFor(id,attachmentId,user);
    if(!["ready","partial"].includes(row.status))throw httpError("Espera a que termine la preparación del adjunto antes de guardarlo en la biblioteca",409);
    const requestId=`altazor-attachment-${attachmentId}`;
    const prior=await prisma.libraryBook.findUnique({where:{ownerId_requestId:{ownerId:actor.id,requestId}}});
    if(prior){if(prior.deletedAt||prior.sourceSha256!==row.sourceSha256)throw httpError("La incorporación anterior ya no está disponible. Puedes importar otra copia desde la biblioteca",409);return NextResponse.json({book:(await readBook(prior.id,actor)).book,reused:true});}
    const metadata=bookMetadataSchema.parse({title:row.sourceName.replace(/\.[^.]+$/," ").trim()||"Documento conservado"});
    // Retention/conversion follow the professional's existing library preferences.
    return NextResponse.json(await importBook({...metadata,requestId,name:row.sourceName,bytes:Buffer.from(row.originalData!)},actor),{status:201});
  }catch(error){return handleRouteError(error);}
}
