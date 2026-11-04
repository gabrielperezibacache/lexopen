import { NextResponse } from "next/server";
import { ZodError } from "zod";
export const workbenchHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" };
export function workbenchError(error: unknown) {
  const status = Number((error as { status?: number })?.status);
  return NextResponse.json({ error: error instanceof ZodError ? "Revise el objetivo, el destino y las fuentes seleccionadas." : status >= 400 && status < 500 || status === 503 ? (error as Error).message : "No se pudo completar la operación de la Mesa. Conserve su selección y reintente." }, { status: error instanceof ZodError ? 400 : status >= 400 && status <= 503 ? status : 503, headers: workbenchHeaders });
}
