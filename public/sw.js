// Show Bible — Service Worker for offline chart cache
// Only intercepts synthetic chart-cache URLs; all other requests pass through.

const CACHE_NAME = 'stageplot-charts-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle our synthetic chart-cache URLs
  if (!url.pathname.startsWith('/api/chart-cache/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        // Cache miss — these are synthetic URLs that don't resolve to real routes
        return new Response('Chart not available offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    )
  );
});
