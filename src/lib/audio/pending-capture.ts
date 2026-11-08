/** Local recovery only. Verify the current actor/workspace before reading. */
export type PendingCaptureClip = { requestId: string; sequence: number; blob: Blob; name: string };
type StoredClip = { id: string; scope: string; sessionId: string; clip: PendingCaptureClip; expiresAt: number; savedAt: number };
const database = "lexopen-pending-capture", store = "clips";
const lifetime = 8 * 60 * 60 * 1000, budget = 64 * 1024 * 1024;
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("El navegador no permite conservar audio localmente.")); return; }
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: "id" }).createIndex("scope", "scope");
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Cierre otras pestañas para habilitar la recuperación de audio."));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (table: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode); let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("No se pudo conservar el audio localmente."));
      try { action(tx.objectStore(store), result => { value = result; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export function pendingCaptureScope(actorId: string, causaId: string, workspaceId: string) { return JSON.stringify([actorId, causaId, workspaceId]); }
export async function savePendingCapture(scope: string, sessionId: string, clip: PendingCaptureClip) {
  if (!scope || !sessionId || !clip.requestId || !clip.blob.size || clip.blob.size > 4 * 1024 * 1024) throw new Error("El tramo supera el espacio de recuperación local; descargue una copia.");
  await transaction<void>("readwrite", (table, done) => {
    const request = table.getAll();
    request.onsuccess = () => {
      const now = Date.now(), id = JSON.stringify([scope, sessionId, clip.requestId]);
      let bytes = clip.blob.size;
      for (const row of request.result as StoredClip[]) {
        if (row.expiresAt <= now) table.delete(row.id);
        else if (row.id !== id) bytes += row.clip.blob.size;
      }
      if (bytes > budget) { table.transaction.abort(); return; }
      table.put({ id, scope, sessionId, clip, savedAt: now, expiresAt: now + lifetime } satisfies StoredClip); done();
    };
  });
}
export async function loadPendingCaptures(scope: string) {
  return transaction<StoredClip[]>("readwrite", (table, done) => {
    const request = table.index("scope").getAll(scope);
    request.onsuccess = () => {
      const result: StoredClip[] = [];
      for (const row of request.result as StoredClip[]) {
        if (row.expiresAt <= Date.now()) table.delete(row.id); else result.push(row);
      }
      done(result.sort((a, b) => a.savedAt - b.savedAt || a.clip.sequence - b.clip.sequence));
    };
  });
}
export async function removePendingCapture(scope: string, sessionId: string, requestId: string) {
  await transaction<void>("readwrite", (table, done) => { table.delete(JSON.stringify([scope, sessionId, requestId])); done(); });
}
export async function clearPendingCaptures(scope: string) {
  await transaction<void>("readwrite", (table, done) => {
    const request = table.index("scope").getAllKeys(scope);
    request.onsuccess = () => { for (const key of request.result) table.delete(key); done(); };
  });
}
