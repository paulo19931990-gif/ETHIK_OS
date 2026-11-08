const CACHE_PREFIX = 'multios-pro-';
const CACHE_NAME = 'multios-pro-v108';

// v81: todos os recursos necessários ao funcionamento do Multi-OS ficam no próprio projeto.
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

// Cada versão é instalada por completo e permanece imutável enquanto estiver em uso.
function respostaCacheavel(response) {
  return Boolean(response) && response.ok;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const respostas = await Promise.all(ASSETS_CRITICOS.map(async asset => {
      const url = new URL(asset, self.location.href);
      url.searchParams.set('v', '108');
      const resposta = await fetch(url.href, { cache: 'no-store' });
      if (!respostaCacheavel(resposta)) throw new Error(`Asset crítico indisponível: ${asset}`);
      return [asset, resposta];
    }));
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const [asset, resposta] of respostas) await cache.put(asset, resposta);
    } catch (erro) {
      await caches.delete(CACHE_NAME);
      throw erro;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Preserva caches anteriores: abas ainda abertas podem pedir scripts da versão anterior.
// Não assume controle de páginas abertas antes da primeira instalação.
self.addEventListener('activate', event => {
  event.waitUntil(Promise.resolve());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const base = new URL('./', self.location.href);
  const asset = ASSETS_CRITICOS.find(item => new URL(item, base).pathname === url.pathname);
  if (request.mode !== 'navigate' && !asset) return;
  if (request.mode === 'navigate' && url.pathname !== base.pathname && asset !== './index.html') return;

  event.respondWith((async () => {
    const versao = url.searchParams.get('v');
    const nomeCache = request.mode !== 'navigate' && /^\d+$/.test(versao || '')
      ? CACHE_PREFIX + 'v' + versao : CACHE_NAME;
    const cache = await caches.open(nomeCache);
    const resposta = await cache.match(request.mode === 'navigate' ? './index.html' : asset);
    // Nunca preenche um snapshot antigo com arquivos da publicação atual.
    return resposta || new Response('Versão offline indisponível. Reabra o aplicativo para atualizar.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

