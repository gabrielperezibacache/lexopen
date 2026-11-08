import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { httpError } from "@/lib/auth/access";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export const icaroJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
export function icaroFailure(error: unknown) {
  const response = handleRouteError(error);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}
export async function icaroActor(request?: Request) {
  if (request) assertCsrf(request);
  const actor = await requireStaff();
  if (request && !(await rateLimitAsync(`altazor-icaros:${actor.id}`, 30, 60_000)).ok) throw httpError("Espera un momento antes de enviar otro encargo a los Ícaros", 429);
  return actor;
}
