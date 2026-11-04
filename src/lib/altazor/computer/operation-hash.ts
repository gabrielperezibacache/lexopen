import { createHmac } from "node:crypto";
import { encryptionKey } from "@/lib/personal-connectors/core";

/** Keyed receipts must not expose an offline dictionary of manually typed passwords/OTPs. */
export function computerOperationHash(ownerId: string, sessionId: string, kind: string, input: unknown, material?: string) {
  const key = createHmac("sha256", encryptionKey(material)).update(`altazor-computer-operation:${ownerId}:${sessionId}`).digest();
  return createHmac("sha256", key).update(JSON.stringify({ kind, input })).digest("hex");
}
