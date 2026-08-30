const CACHE_PREFIX = 'multios-pro-';
const CACHE_NAME = 'multios-pro-v59';

// Arquivos indispensáveis para abrir e usar o núcleo do app offline.
const ASSETS_CRITICOS = [
  './index.html',
  './app.js',
  './style.css',
  './bancoPecas.js',
  './checklists/checklists.js',
  './checklists/FM-408-climatica.pdf',
  './checklists/FM-409-durometros.pdf',
  './checklists/FM-410-incubadora-estufa.pdf',
  './checklists/FM-411-banho-maria.pdf',
  './checklists/FM-411-dissolutor-desintegrador.pdf',
  './fonts/Carlito-Regular.ttf',
  './fonts/Carlito-Bold.ttf'
];

// A falha de um item opcional não impede a instalação do Service Worker.
const ASSETS_OPCIONAIS = [
  './manifest.json',
  './icon-192.png',
  './icon-512_3.png',

  // Dependências externas usadas pelo app. Quando o CDN permitir,
  // ficam disponíveis offline já a partir da instalação do SW.
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

const HOSTS_RUNTIME_PERMITIDOS = new Set([
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
]);

function respostaCacheavel(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Se um arquivo crítico falhar, é melhor manter o SW anterior funcionando.
    await cache.addAll(ASSETS_CRITICOS);

    // Recursos opcionais não podem derrubar toda a instalação.
    const resultados = await Promise.allSettled(
      ASSETS_OPCIONAIS.map(asset => cache.add(asset))
    );

    resultados.forEach((resultado, indice) => {
      if (resultado.status === 'rejected') {
        console.warn(`Falha ao cachear asset opcional ${ASSETS_OPCIONAIS[indice]}:`, resultado.reason);
      }
    });

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    // Apaga somente caches antigos deste app, sem afetar outros projetos
    // que eventualmente estejam publicados no mesmo domínio.
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const mesmaOrigem = url.origin === self.location.origin;
  const navegacao = request.mode === 'navigate';

  // HTML: rede primeiro para receber atualizações; cache como fallback offline.
  if (navegacao) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        // ignoreSearch permite que /index.html?v=55 use /index.html do pré-cache.
        const cachedRequest = await caches.match(request, { ignoreSearch: true });
        if (cachedRequest) return cachedRequest;

        const cachedIndex = await caches.match('./index.html', { ignoreSearch: true });
        if (cachedIndex) return cachedIndex;

        return new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Multi-OS Pro</title><body><h1>Multi-OS Pro</h1><p>Sem conexão e o aplicativo ainda não está disponível no cache.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Só fazemos cache de arquivos do próprio app e dos CDNs conhecidos.
  const podeUsarRuntimeCache = mesmaOrigem || HOSTS_RUNTIME_PERMITIDOS.has(url.hostname);
  if (!podeUsarRuntimeCache) return;

  event.respondWith((async () => {
    // Nos arquivos locais, ignora apenas a query de versão (?v=55).
    const cachedResponse = await caches.match(request, {
      ignoreSearch: mesmaOrigem
    });

    const atualizarEmSegundoPlano = async () => {
      try {
        const networkResponse = await fetch(request);
        if (!respostaCacheavel(networkResponse)) return null;

        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        return null;
      }
    };

    if (cachedResponse) {
      // Atualiza sem bloquear a abertura do app e sem gerar rejeição não tratada.
      event.waitUntil(atualizarEmSegundoPlano());
      return cachedResponse;
    }

    const networkResponse = await atualizarEmSegundoPlano();
    if (networkResponse) return networkResponse;

    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  })());
});
