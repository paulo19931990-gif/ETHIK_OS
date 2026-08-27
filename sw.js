const CACHE_NAME = 'multios-pro-v40';

const ASSETS_CRITICOS = [
  './',
  './index.html',
  './app.js',
  './style.css'
];

const ASSETS_OPCIONAIS = [
  './manifest.json',
  './icon-192.png',
  './icon-512_3.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const cacheCriticos = cache.addAll(ASSETS_CRITICOS);
      const cacheOpcionais = Promise.all(
        ASSETS_OPCIONAIS.map(asset =>
          cache.add(asset).catch(err =>
            console.warn(`Falha ao cachear asset opcional ${asset}:`, err)
          )
        )
      );
      return Promise.all([cacheCriticos, cacheOpcionais]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone)));
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request).then(cachedResponse => cachedResponse || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const networkPromise = fetch(e.request)
        .then(networkResponse => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseClone = networkResponse.clone();
            e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone)));
          }
          return networkResponse;
        }).catch(err => { throw err; });
      return cachedResponse || networkPromise;
    })
  );
});
