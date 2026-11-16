export async function importAudioRecoveryKey(value?: string | null) {
  if (!value || !/^[\w-]{43}$/.test(value)) throw new Error("Vuelva a conectar con el Host para proteger el audio pendiente.");
  const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptPendingAudio(key: CryptoKey, identity: string, blob: Blob) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(JSON.stringify([identity, blob.type])) }, key, await blob.arrayBuffer());
  return { iv, encrypted, mimeType: blob.type };
}
export async function decryptPendingAudio(key: CryptoKey, identity: string, value: { iv: Uint8Array<ArrayBuffer>; encrypted: ArrayBuffer; mimeType: string }) {
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv, additionalData: new TextEncoder().encode(JSON.stringify([identity, value.mimeType])) }, key, value.encrypted);
  return new Blob([bytes], { type: value.mimeType });
}
