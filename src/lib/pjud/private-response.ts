import { NextResponse } from "next/server";

/** Estados de cuenta y cartera PJUD sólo para la sesión que los solicitó. */
export function privatePjudResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function privatePjudJson(data: unknown, init?: ResponseInit) {
  return privatePjudResponse(NextResponse.json(data, init));
}
