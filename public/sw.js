/* Only this public shell is cached. Authenticated pages, APIs and attachments never enter CacheStorage. */
const SHELL_CACHE = "lexopen-offline-shell-v8";
const SHELL_FILES = ["/offline.html", "/offline/workspace.css", "/offline/workspace.js", "/offline/vault.js", "/offline/records.js", "/offline/bindings.js", "/offline/memos.js", "/offline/files.js", "/offline/operations.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("lexopen-shell-") || key.startsWith("lexopen-offline-shell-") && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(cache => cache.match(url.pathname)).then(cached => cached || fetch(event.request)));
  } else if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || Response.error()));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "LexOpen", body: "Nueva notificación", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "LexOpen", {
      body: data.body || "",
      data: { url: data.url || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = new URL("/", self.location.origin).href;
  try { const target = new URL(event.notification.data?.url || "/", self.location.origin); if (target.origin === self.location.origin) url = target.href; } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
