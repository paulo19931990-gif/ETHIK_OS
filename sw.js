/* sw.js - MODO HÍBRIDO INTELIGENTE (Online + Offline) */
const CACHE_NAME = 'multi-os-pro-v26';
const ASSETS_TO_CACHE = [
    './index.html',
    './manifest.json',
    './style.css'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log("Cache init error:", err));
        })
    );
});

self.addEventListener('activate', (event) => {
    // Apaga caches antigos de versões anteriores para evitar conflitos
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Se houver rede, atualiza o cache silenciosamente com a versão mais recente
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Se estiver OFFLINE, vai buscar imediatamente ao cache guardado
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fallback para o index.html se for navegação direta offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
