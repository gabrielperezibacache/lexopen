import { z } from "zod";
import { httpError } from "@/lib/auth/access";

const requestSchema = z.object({
  action: z.enum(["sync", "clear_errors"]).optional(),
  syncMovimientos: z.boolean().optional(),
  wait: z.boolean().optional(),
}).strict();

/** Scheduled cron requests enqueue; only an explicit non-cron wait drains inline. */
export function shouldProcessMisCausasInline(input: { cron: boolean; wait?: boolean }) {
  return !input.cron && input.wait === true;
}

/** Cron puede omitir el cuerpo; un cuerpo inválido nunca inicia trabajo. */
export async function parseMisCausasRequest(req: Request) {
  const raw = await req.text();
  if (!raw.trim()) return requestSchema.parse({});
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw httpError("El cuerpo de la solicitud no es JSON válido.", 400);
  }
  return requestSchema.parse(body);
}
