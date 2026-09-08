const CACHE_PREFIX = 'multios-pro-';
const CACHE_NAME = 'multios-pro-v79';

// v79: todos os recursos necessários ao funcionamento do Multi-OS ficam no próprio projeto.
// A nova versão só instala se TODOS estes arquivos existirem. Isso evita instalar uma versão
// "meio offline" ou misturar bibliotecas antigas/externas com o código atual.
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
  './fonts/Carlito-Bold.ttf',
  './manifest.json',
  './icon-192.png',
  './icon-512_3.png',
  './vendor/tailwindcss.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/signature_pad.umd.min.js',
  './vendor/pdf-lib.min.js',
  './vendor/fontkit.umd.min.js',
  './vendor/localforage.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js'
];

function respostaCacheavel(response) {
  return Boolean(response) && response.ok;
}

async function cachearAssetObrigatorio(cache, asset) {
  const resposta = await fetch(asset, { cache: 'no-store' });
  if (!respostaCacheavel(resposta)) throw new Error(`Asset crítico indisponível: ${asset}`);
  await cache.put(asset, resposta.clone());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS_CRITICOS.map(asset => cachearAssetObrigatorio(cache, asset)));
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
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

  // Navegação: tenta a rede para descobrir atualizações; se estiver offline, abre o index cacheado.
  if (navegacao) {
    event.respondWith((async () => {
      try {
        const resposta = await fetch(request);
        if (respostaCacheavel(resposta)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', resposta.clone());
        }
        return resposta;
      } catch (_) {
        const cacheado = await caches.match('./index.html', { ignoreSearch: true });
        if (cacheado) return cacheado;
        return new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Multi-OS Pro</title><body><h1>Multi-OS Pro</h1><p>Sem conexão e o aplicativo ainda não concluiu a instalação offline.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // v78 não usa bibliotecas de terceiros em tempo de execução. Só intercepta recursos do próprio app.
  if (!mesmaOrigem) return;

  // Arquivos com ?v=78: rede primeiro para não misturar versões; cache local como fallback offline.
  if (url.searchParams.has('v')) {
    event.respondWith((async () => {
      try {
        const resposta = await fetch(request);
        if (respostaCacheavel(resposta)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, resposta.clone());
        }
        return resposta;
      } catch (_) {
        const cacheado = await caches.match(request, { ignoreSearch: true });
        return cacheado || new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    })());
    return;
  }

  // Demais arquivos locais: cache-first + atualização silenciosa em segundo plano.
  event.respondWith((async () => {
    const cacheado = await caches.match(request, { ignoreSearch: true });

    const atualizar = async () => {
      try {
        const resposta = await fetch(request);
        if (!respostaCacheavel(resposta)) return null;
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, resposta.clone());
        return resposta;
      } catch (_) {
        return null;
      }
    };

    if (cacheado) {
      event.waitUntil(atualizar());
      return cacheado;
    }

    const rede = await atualizar();
    return rede || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  })());
});
