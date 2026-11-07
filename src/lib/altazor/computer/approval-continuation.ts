import { setTimeout as pause } from "node:timers/promises";
import { ConnectorError } from "@/lib/personal-connectors/core";
import type { KittiesGateway } from "./gateway";

/** Called under the broker's owner/workspace/session locks, never as a detached job. */
export async function continueApprovedRead(
  client: Pick<KittiesGateway, "chat" | "send">,
  target: { chatId: string; kittyId: string; actionId: string; expiresAt: Date },
  authorize: () => Promise<void>,
  wait: (milliseconds: number) => Promise<unknown> = pause,
) {
  // The original worker may still be finishing its 'waiting for approval' reply.
  // Wait only for that worker; a new task or a retry is never launched in parallel.
  for (let attempt = 0; attempt < 9; attempt++) {
    if (target.expiresAt.getTime() <= Date.now()) return { continued: false, continuationPending: true };
    let working: boolean;
    try { working = (await client.chat(target.chatId, target.kittyId)).working; }
    catch { return { continued: false, continuationPending: true }; }
    if (!working) {
      await authorize();
      if (target.expiresAt.getTime() <= Date.now()) return { continued: false, continuationPending: true };
      try {
        await client.send(target.chatId, "continua", [], `approval_${target.actionId}`);
        return { continued: true };
      } catch {
        // Throw so executeAction marks this approval receipt unknown. Subsequent
        // messages are blocked until the person reviews or closes the desktop.
        throw new ConnectorError("continuation_unknown", "La consulta fue autorizada, pero no se confirmó que Altazor continuara. Revise el escritorio; no se volverá a enviar automáticamente.", 502);
      }
    }
    if (attempt < 8) await wait(500);
  }
  return { continued: false, continuationPending: true };
}
