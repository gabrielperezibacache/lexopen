import { NextRequest } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { readAcademicArtifact } from "@/lib/altazor/academic";
import { exportAcademicDocx } from "@/lib/altazor/document-export";
import { httpError } from "@/lib/auth/access";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string;artifactId:string}>}){
  try{
    const user=await requireStaff(),{id,artifactId}=await params,artifact=await readAcademicArtifact(id,artifactId,user),format=req.nextUrl.searchParams.get("format")||"md";
    if(!["proposed","reviewed"].includes(artifact.status))throw httpError("El resultado todavía no está disponible para descargar",409);
    if(!["md","docx"].includes(format))throw httpError("Formato de descarga no admitido",400);
    const bytes=format==="docx"?exportAcademicDocx(artifact.body):Buffer.from(artifact.body,"utf8");
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":format==="docx"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"text/markdown; charset=utf-8","Content-Disposition":`attachment; filename="altazor-${artifact.id}.${format}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return handleRouteError(error);}
}
