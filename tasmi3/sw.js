const CACHE_NAME = 'tasmi3-v44-cache';
const urlsToCache = [
  './index.html',
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

  // NETWORK-FIRST STRATEGY:
  // Always try network first so users always get the latest code.
  // Only fall back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Clone and cache the fresh response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed — serve from cache (offline fallback)
        return caches.match(event.request);
      })
  );
});
