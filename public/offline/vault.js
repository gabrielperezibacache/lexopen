/* Local-only vault. Its key never leaves this module or enters persistent storage. */
const DB = "lexopen-offline-v1", STORE = "vault", ID = "workspace";
const aad = new TextEncoder().encode("lexopen-offline-v1|" + globalThis.location?.origin);
export async function openVaultStore() {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error("El espacio sin conexión requiere HTTPS o localhost y almacenamiento del navegador habilitado.");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("No se pudo abrir el almacenamiento local. Compruebe los permisos del navegador."));
    request.onblocked = () => reject(new Error("Cierre otras pestañas de LexOpen para abrir el espacio local."));
  });
  const read = () => new Promise((resolve, reject) => { const tx = db.transaction(STORE); const req = tx.objectStore(STORE).get(ID); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  let key, salt, version, generation = 0;
  async function derive(password, value) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: value, iterations: 600000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  return {
    exists: async () => Boolean(await read()),
    async unlock(password) {
      this.lock(); const epoch = generation;
      const row = await read();
      if (!row) throw new Error("Este navegador aún no tiene un espacio local. Créelo con conexión.");
      const candidate = await derive(password, row.salt);
      let data;
      try { data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv, additionalData: aad }, candidate, row.bytes))); }
      catch { throw new Error("La clave no permite abrir la copia. Inténtelo de nuevo; el contenido sigue guardado."); }
      if (data.v !== 1 || !data.ownerId || !Array.isArray(data.entries)) throw new Error("La copia local no tiene un formato compatible.");
      if (epoch !== generation) throw new Error("El espacio se bloqueó mientras se abría. Vuelva a desbloquearlo.");
      key = candidate; salt = row.salt; version = row.version;
      return data;
    },
    async create(password, ownerId) {
      if (password.length < 12) throw new Error("Use una clave local de al menos 12 caracteres.");
      if (await read()) throw new Error("Ya existe una copia local. Desbloquéela para continuar.");
      this.lock(); const epoch = generation, value = crypto.getRandomValues(new Uint8Array(16));
      const candidate = await derive(password, value);
      if (epoch !== generation) throw new Error("El espacio se bloqueó mientras se creaba. Vuelva a intentarlo.");
      salt = value; key = candidate; version = 0;
      const data = { v: 1, ownerId, entries: [] };
      await this.write(data); return data;
    },
    async write(data) {
      if (!key) throw new Error("Desbloquee el espacio local antes de guardar.");
      if ((data.records || []).length + (data.files || []).length + data.entries.length > 100) throw new Error("El espacio admite 100 registros. Descargue y quite copias ya sincronizadas para preparar otras.");
      if (data.entries.length > 40) throw new Error("El espacio admite 40 escritos. Quite una copia ya sincronizada para preparar otra.");
      const plain = new TextEncoder().encode(JSON.stringify(data));
      if (plain.length > 16 * 1024 * 1024) throw new Error("La copia supera 16 MB. Descargue y quite escritos ya sincronizados.");
      const epoch = generation, writeKey = key, writeSalt = salt, expected = version;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, writeKey, plain);
      if (epoch !== generation) throw new Error("El espacio se bloqueó antes de completar el guardado. La copia anterior se conserva.");
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), req = store.get(ID);
        let conflict = false;
        req.onsuccess = () => { if (epoch !== generation) { tx.abort(); return; } if ((req.result?.version || 0) !== expected) { conflict = true; tx.abort(); } else { try { store.put({ salt: writeSalt, iv, bytes, version: expected + 1 }, ID); } catch { tx.abort(); } } };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(new Error("No se pudo guardar en este navegador. Descargue el texto antes de salir."));
        tx.onabort = () => reject(new Error(conflict ? "Otra pestaña cambió la copia local. Descargue su texto y vuelva a abrir el espacio." : "No se pudo guardar la copia local. Descargue su texto antes de salir."));
      });
      if (epoch === generation) version = expected + 1;
    },
    lock() { generation += 1; key = undefined; salt = undefined; version = undefined; },
    async remove() {
      if (!key) throw new Error("Desbloquee la versión actual antes de borrar la copia local.");
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), req = store.get(ID);
        req.onsuccess = () => { if (req.result?.version !== version) tx.abort(); else store.delete(ID); };
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(new Error("La copia cambió en otra pestaña. Vuelva a abrir el espacio antes de borrarlo."));
      });
      this.lock();
    },
  };
}
