const CACHE_NAME = 'multios-pro-v29';
const ASSETS_FIXOS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_FIXOS)));
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

// Estratégia Stale-While-Revalidate Dinâmica (Guarda CDN em Cache)
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const fetchPromise = fetch(e.request).then(networkResponse => {
        // Se a resposta for válida (inclusive recursos externos como jsPDF e Tailwind), guarda no cache dinamicamente
        if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Ignora erros de fetch (quando está offline) e confia no cache
      });
      
      // Retorna o cache IMEDIATAMENTE (se existir), ou espera pela rede
      return cachedResponse || fetchPromise;
    })
  );
});
