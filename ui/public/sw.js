// OPIFEX Paperclip — Service Worker v3
// Paperclip always needs the API, offline mode is useless.
// This SW only does cache-busting: clears old caches on activate, never caches new content.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Nuke ALL caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// No fetch interception — let everything go straight to network.
// This prevents stale cache from serving old JS bundles → black screen.
