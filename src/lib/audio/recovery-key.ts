import { createHmac } from "node:crypto";
import { isStrongSessionSecret } from "@/lib/security/production-env";
/** Returned only after the workspace and confidential-document access checks. */
export function audioRecoveryKey(actorId: string, causaId: string, workspaceId: string, secret = process.env.SESSION_SECRET) {
  if (!isStrongSessionSecret(secret)) return null;
  return createHmac("sha256", secret!).update("lexopen.audio-recovery.v1:").update(JSON.stringify([actorId, causaId, workspaceId])).digest("base64url");
}
