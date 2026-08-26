const CACHE_NAME = 'multios-pro-v35';

// Falha em qualquer um destes ABORTA a instalação do Service Worker
const ASSETS_CRITICOS = [
  './',
  './index.html',
  './app.js',
  './style.css'
];

// Podem falhar individualmente sem impedir a instalação
const ASSETS_OPCIONAIS = [
  './manifest.json',
  './icon-512_3.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 1. Críticos: tudo ou nada (falhou um, cancela a atualização do SW)
      const cacheCriticos = cache.addAll(ASSETS_CRITICOS);

      // 2. Opcionais: tolerantes a falha
      const cacheOpcionais = Promise.all(
        ASSETS_OPCIONAIS.map(asset =>
          cache.add(asset).catch(err =>
            console.warn(`Falha ao cachear asset opcional ${asset}:`, err)
          )
        )
      );

      // Aguarda ambas as operações concluírem para finalizar a instalação
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

  // 1. HTML / navegação (Network-First com fallback para cache/index)
  if (
    e.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/'
  ) {
    e.respondWith(
      fetch(e.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();

            e.waitUntil(
              caches.open(CACHE_NAME)
                .then(cache =>
                  cache.put(e.request, responseClone)
                )
                .catch(err =>
                  console.warn('Erro ao atualizar cache de navegação:', err)
                )
            );
          }

          return networkResponse;
        })
        .catch(() =>
          caches.match(e.request)
            .then(cachedResponse =>
              cachedResponse || caches.match('./index.html')
            )
        )
    );

    return;
  }

  // 2. Assets estáticos e CDNs: Stale-While-Revalidate
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const networkPromise = fetch(e.request)
        .then(networkResponse => {
          if (
            networkResponse &&
            (
              networkResponse.status === 200 ||
              networkResponse.type === 'opaque'
            )
          ) {
            const responseClone = networkResponse.clone();

            e.waitUntil(
              caches.open(CACHE_NAME)
                .then(cache =>
                  cache.put(e.request, responseClone)
                )
                .catch(err =>
                  console.warn('Erro ao atualizar cache de asset:', err)
                )
            );
          }

          return networkResponse;
        })
        .catch(err => {
          console.warn('Falha de rede:', e.request.url, err);
          throw err; 
        });

      return cachedResponse || networkPromise;
    })
  );
});
