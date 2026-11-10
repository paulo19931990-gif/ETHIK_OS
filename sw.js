const CACHE_PREFIX = 'multios-pro-';
const CACHE_NAME = 'multios-pro-v111';
const CACHE_VERSION = '111';

const ASSETS_CRITICOS = [
  './index.html','./app.js','./style.css','./bancoPecas.js',
  './checklists/checklists.js','./checklists/FM-408-climatica.pdf','./checklists/FM-409-durometros.pdf',
  './checklists/FM-410-incubadora-estufa.pdf','./checklists/FM-411-banho-maria.pdf','./checklists/FM-411-dissolutor-desintegrador.pdf',
  './fonts/Carlito-Regular.ttf','./fonts/Carlito-Bold.ttf','./manifest.json','./icon-192.png','./icon-512_3.png',
  './vendor/tailwindcss.js','./vendor/jspdf.umd.min.js','./vendor/jspdf.plugin.autotable.min.js',
  './vendor/signature_pad.umd.min.js','./vendor/pdf-lib.min.js','./vendor/fontkit.umd.min.js',
  './vendor/localforage.min.js','./vendor/pdf.min.js','./vendor/pdf.worker.min.js'
];

function respostaCacheavel(response) { return Boolean(response) && response.ok; }
function assetVersionado(asset, versao = CACHE_VERSION) {
  const sep = asset.includes('?') ? '&' : '?';
  return `${asset}${sep}v=${encodeURIComponent(versao)}`;
}
function caminhoLocal(url) {
  const base = new URL('./', self.location.href);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const rel = decodeURIComponent(url.pathname.slice(base.pathname.length));
  return rel ? `./${rel}` : './index.html';
}
async function cachearAssetObrigatorio(cache, asset) {
  const resposta = await fetch(assetVersionado(asset), { cache: 'no-store' });
  if (!respostaCacheavel(resposta)) throw new Error(`Asset crítico indisponível: ${asset}`);
  await cache.put(asset, resposta.clone());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const asset of ASSETS_CRITICOS) await cachearAssetObrigatorio(cache, asset);
    } catch (e) {
      try { await caches.delete(CACHE_NAME); } catch (_) {}
      throw e;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Mantém snapshots anteriores para que uma página ainda aberta nunca misture arquivos de versões diferentes.
    // Quando a API de listagem existe, limita a quatro snapshots mais recentes para controlar o espaço.
    if (typeof caches.keys === 'function') {
      try {
        const keys = (await caches.keys()).filter(k => k.startsWith(CACHE_PREFIX));
        const ordenadas = keys.map(k => ({ k, v:Number((/v(\d+)$/.exec(k)||[])[1]||-1) })).sort((a,b)=>b.v-a.v);
        for (const item of ordenadas.slice(4)) await caches.delete(item.k);
      } catch (_) {}
    }
    if (self.clients?.claim) await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = caminhoLocal(url);
  if (!path) return;

  event.respondWith((async () => {
    // Navegação sempre abre o snapshot completo da versão ativa, sem buscar uma mistura nova na rede.
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('./index.html') || new Response('', { status:503, statusText:'App snapshot unavailable' });
    }

    // Arquivos versionados são resolvidos exclusivamente pelo cache correspondente à versão solicitada.
    // Isso permite que uma aba antiga continue íntegra enquanto a nova versão já foi instalada.
    const versaoPedida = url.searchParams.get('v');
    if (versaoPedida) {
      const cache = await caches.open(`${CACHE_PREFIX}v${versaoPedida}`);
      return await cache.match(path) || new Response('', { status:503, statusText:'Version snapshot unavailable' });
    }

    // Recursos sem ?v pertencem ao snapshot ativo e também são cache-only.
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(path) || new Response('', { status:503, statusText:'Resource unavailable' });
  })());
});
