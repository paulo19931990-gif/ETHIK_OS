const CACHE_NAME = 'multios-pro-v31';
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
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_FIXOS))
      .catch(err => console.warn('Cache init error (não bloqueia a instalação):', err))
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
  // Ignora requisições que não sejam GET
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 1. Estratégia Network-First para HTML / Navegação (Resolve o bug do cache preso)
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(networkResponse => {
          // Se a rede responder com sucesso, atualiza o cache dinamicamente
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Correção do Bug: Aguarda a Promise do caches.match resolver antes de fazer o fallback
          return caches.match(e.request).then(cachedResponse => {
            return cachedResponse || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. Estratégia Stale-While-Revalidate para Assets Estáticos e CDNs (jsPDF, Tailwind, etc.)
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const fetchPromise = fetch(e.request).then(networkResponse => {
        // Valida status 200 (recursos locais) e 0 (respostas opacas de CDNs externas)
        if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Ignora falhas de rede em assets secundários se houver cache local;
        // o SWR garante que a aplicação continua a funcionar offline.
      });

      // Retorna IMEDIATAMENTE o cache (se existir), ou aguarda pela rede
      return cachedResponse || fetchPromise;
    })
  );
});
