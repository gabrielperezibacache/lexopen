/** Idempotency identifiers are request identities, never authentication tokens. */
export function operationKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `op-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function fingerprint(payload: unknown): string {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]))
      : value;
  const text = JSON.stringify(normalize(payload)) ?? "undefined";
  // A compact non-secret tag keeps form data out of sessionStorage. This is
  // not an authorization hash: the server checks SHA-256 of the full input.
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  for (let index = 0; index < text.length; index += 1) for (let seed = 0; seed < hashes.length; seed += 1) {
    hashes[seed] = Math.imul(hashes[seed] ^ (text.charCodeAt(index) + seed), 16777619);
  }
  return `${text.length}:${hashes.map((hash) => (hash >>> 0).toString(16).padStart(8, "0")).join("")}`;
}

/** One instance per form/logical operation; keep it after every ambiguous error. */
export function createSubmissionKeys(newKey: () => string = operationKey, storageKey?: string) {
  let pending: { fingerprint: string; key: string } | null = null;
  const readSaved = () => {
    try {
      const raw = storageKey && globalThis.sessionStorage?.getItem(storageKey);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value.fingerprint === "string" && typeof value.key === "string" && /^[A-Za-z0-9._:-]{8,160}$/.test(value.key)
        ? value as { fingerprint: string; key: string } : null;
    } catch { return null; }
  };
  return {
    forPayload(payload: unknown): string {
      const next = fingerprint(payload);
      pending ||= readSaved();
      if (!pending || pending.fingerprint !== next) pending = { fingerprint: next, key: newKey() };
      try { if (storageKey) globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(pending)); } catch { /* Private mode retains the in-memory key. */ }
      return pending.key;
    },
    complete(payload: unknown) {
      if (pending?.fingerprint !== fingerprint(payload)) return;
      try { if (storageKey && readSaved()?.key === pending.key) globalThis.sessionStorage?.removeItem(storageKey); } catch { /* In-memory completion still works. */ }
      pending = null;
    },
  };
}
