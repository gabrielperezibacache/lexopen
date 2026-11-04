import { createHash } from "node:crypto";
import type { ExternalShareDraft } from "@prisma/client";
import { ConnectorError } from "../core";
import type { Fetcher } from "./oauth";

export function publicationSnapshot(draft: Pick<ExternalShareDraft, "id" | "revision" | "body" | "sourceUrl" | "visibility"> & { originJson?: string }, accountId: string, subject: string) {
  const commentary = [draft.body.trim(), draft.sourceUrl].filter(Boolean).join("\n\n");
  if (!commentary || commentary.length > 3000) throw new ConnectorError("post_length", "El texto y enlace deben sumar entre 1 y 3000 caracteres.", 400);
  const content = { draftId: draft.id, revision: draft.revision, accountId, subject, commentary, visibility: draft.visibility, originJson: draft.originJson || "{}" };
  return { commentary, hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}
/** A single remote POST. Ambiguous outcomes must never be retried automatically. */
export async function sendLinkedInPost(input: { token: string; subject: string; commentary: string; visibility: string }, fetcher: Fetcher = fetch): Promise<{ status: "published" | "failed" | "unknown"; urn: string | null; url: string | null; errorCode: string | null }> {
  try {
    const response = await fetcher("https://api.linkedin.com/rest/posts", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json", "Linkedin-Version": "202610", "X-Restli-Protocol-Version": "2.0.0" }, body: JSON.stringify({ author: `urn:li:person:${input.subject}`, commentary: input.commentary, visibility: input.visibility, distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }) });
    const urn = response.headers.get("x-restli-id");
    if (response.status === 201 && urn && /^urn:li:(?:share|ugcPost):\d{1,30}$/.test(urn)) return { status: "published", urn, url: `https://www.linkedin.com/feed/update/${urn}/`, errorCode: null };
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return { status: "failed", urn: null, url: null, errorCode: response.status === 401 ? "needs_reconnect" : response.status === 403 ? "scope_or_product_denied" : response.status === 429 ? "rate_limited" : "post_rejected" };
    return { status: "unknown", urn: null, url: null, errorCode: "publication_unconfirmed" };
  } catch { return { status: "unknown", urn: null, url: null, errorCode: "publication_unconfirmed" }; }
}
