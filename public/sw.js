const CACHE = "lucy-shell-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/favicon.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : { title: "Lucy", body: "¿Quieres contarme cómo estuvo tu día?" };
  event.waitUntil(self.registration.showNotification(data.title || "Lucy", { body: data.body, icon: "/favicon.svg" }));
});
