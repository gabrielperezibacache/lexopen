import type { NextRequest } from "next/server";
import { z } from "zod";
import { computerActor, requestIdSchema } from "../computer/http";
import { localSetupAllowed } from "../computer/policy";
import { ConnectorError } from "@/lib/personal-connectors/core";
export const connectorRequest = { workspaceId: z.string().min(1).max(100), requestId: requestIdSchema, confirmed: z.literal(true) };
export async function connectorActor(request: NextRequest, mutation = false) {
  const actor = await computerActor(request, mutation);
  if (mutation && !localSetupAllowed(request)) throw new ConnectorError("local_setup_only", "Configure las conexiones desde LexOpen en el equipo local, con el Host escuchando sólo en loopback.", 403);
  return actor;
}
