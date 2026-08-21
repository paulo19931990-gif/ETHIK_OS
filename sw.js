const CACHE_NAME = 'multios-pro-v2'; // Mudei para v2 para forçar a atualização nos teus testes
const urlsToCache = [
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// 1. INSTALAÇÃO ROBUSTA (Tolerância a falhas na rede)
self.addEventListener('install', event => {
  self.skipWaiting(); // Força o novo Service Worker a instalar imediatamente
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Usa Promise.allSettled para garantir que ficheiros bem-sucedidos ficam no cache, 
      // mesmo que um ou outro CDN falhe.
      return Promise.allSettled(
        urlsToCache.map(url => 
          cache.add(url).catch(err => console.warn(`[SW] Falha isolada ao cachear ${url}:`, err))
        )
      );
    })
  );
});

// 2. ACTIVAÇÃO E LIMPEZA DE LIXO (Apaga caches antigas)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] A apagar versão antiga do cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Força o SW a assumir o controlo das abas abertas na hora!
  );
});

// 3. ESTRATÉGIA DE REDE (Cache-First)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se está no cache, serve imediatamente (Offline-first)
        if (response) {
          return response;
        }
        // Se não está, tenta ir buscar à rede
        return fetch(event.request).catch(err => {
          console.warn('[SW] Offline e recurso não cacheado:', event.request.url);
          // Como é um SPA de ficheiro único, não precisamos de retornar uma página offline genérica,
          // mas o catch previne que falhas de rede quebrem o fluxo do Service Worker.
        });
      })
  );
});

