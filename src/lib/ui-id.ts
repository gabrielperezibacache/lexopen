let sequence = 0;

/** Presentation IDs only. Works on the supported HTTP LAN origins as well. */
export function newUiId(prefix = "ui"): string {
  sequence += 1;
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return `${prefix}-${cryptoApi.randomUUID()}`;
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint32Array(2));
    return `${prefix}-${bytes[0].toString(36)}-${bytes[1].toString(36)}-${sequence.toString(36)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
