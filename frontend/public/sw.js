// KatChat self-destructing service worker
//
// A stale service worker from an earlier deployment is registered in some
// browsers and keeps serving OLD cached assets (broken JS, old styles),
// which makes the app appear broken even after updates.
//
// This worker replaces it, wipes all caches, unregisters itself and reloads
// any open pages so they fetch fresh files from the network. It has NO fetch
// handler, so it never intercepts requests.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () {
        return self.registration.unregister();
      })
      .then(function () {
        return self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (client) { client.navigate(client.url); });
        });
      })
      .then(function () { return self.clients.claim(); })
  );
});