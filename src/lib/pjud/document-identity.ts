import { createHmac } from "node:crypto";
/** Bound to the local vault key and row identity; never store another copy of signed portal URLs. */
export function pjudDocumentRefHash(causaId: string, movimientoId: string, ref: string) {
  const key = process.env.PJUD_SECRETS_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (!key && process.env.NODE_ENV === "production") throw new Error("La protección de documentos requiere configurar el Host.");
  return createHmac("sha256", key || "lexopen-development-only-document-receipts").update(JSON.stringify([causaId, movimientoId, ref])).digest("hex");
}
