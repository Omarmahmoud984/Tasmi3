const CACHE_NAME = 'tasmi3-v47-cache';
const urlsToCache = [
  './index.html',
  './search.html',
  './tasbeeh.html',
  './needs_review.html',
  './good.html',
  './perfect.html',
  './style.css',
  './app.js',
  './offline_quran.js',
  './review_boards.js',
  './adhkar.html',
  './adhkar.js',
  './adhkar_data.js',
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Cairo:wght@400;600;700&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.endsWith('.mp3')) return;
  if (event.request.url.includes('api.alquran.cloud') || event.request.url.includes('api.quran.com')) return;

  // CACHE-FIRST STRATEGY:
  // Try to find the matching request in the cache.
  // ignoreSearch prevents query params (?surah=X) from failing the cache match.
  // ignoreVary bypasses header mismatches (like Accept-Encoding differences).
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true, ignoreVary: true })
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        // Fallback: If Vercel redirected /page.html to /page and messed up the cache keys,
        // we explicitly check the clean relative path.
        const url = new URL(event.request.url);
        if (url.pathname === '/' || url.pathname.endsWith('.html')) {
          const pathName = url.pathname.endsWith('.html') ? url.pathname.split('/').pop() : 'index.html';
          return caches.match('./' + pathName, { ignoreSearch: true, ignoreVary: true })
            .then(res => res || caches.match('./', { ignoreSearch: true, ignoreVary: true }));
        }
        return null;
      })
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        // If not in cache, fetch from network
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        }).catch(err => {
          console.error('[SW] Offline fetch failed:', err);
          throw err;
        });
      })
  );
});
