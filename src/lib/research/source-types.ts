/** Source bytes and metadata obtained directly from an approved public authority. */
export type FetchedLegalSource = {
  canonicalUrl: string;
  retrievalUrl: string;
  title: string;
  organism: string;
  kind: "legislation" | "jurisprudence" | "administrative" | "doctrine";
  externalId?: string;
  publishedAt?: Date;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  text: string;
  mimeType: string;
  rawBytes: Buffer;
  coverageWarnings: string[];
  retrievedAt: Date;
};

export type PublicSourceFetchOptions = {
  signal?: AbortSignal;
  /** Test transport; production uses HTTPS with a checked DNS lookup. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};
