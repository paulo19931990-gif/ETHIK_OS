const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const quiet = { error() {}, warn() {}, log() {} };

function backupContext(extra = {}) {
  const messages = [], downloads = [];
  const context = {
    console: quiet, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { getElementById: () => ({ value: 'backup' }),
      createElement: () => ({ click: () => downloads.push(true) }), body: { appendChild() {}, removeChild() {} } },
    APP_VERSION: 108, registosBancoHoras: [], urlDownloadGerado: null,
    obterHistoricoSalvo: async () => [{ id: 'os1' }],
    localforage: { getItem: async () => null }, prepararDocumentoParaBackup: async doc => doc,
    fecharModalExportar() {}, mostrarToast: message => messages.push(message), registrarErroApp() {},
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('async function confirmarExportacao()'), app.indexOf('function validarDocumentoBackup(')), context);
  return { context, messages, downloads };
}

test('export cancels rather than downloads when an indexed document is missing', async () => {
  const { context, messages, downloads } = backupContext();
  await context.confirmarExportacao();
  assert.equal(downloads.length, 0);
  assert.match(messages.at(-1), /Não foi possível exportar/);
});

test('complete export still downloads successfully', async () => {
  const { context, messages, downloads } = backupContext({ localforage: { getItem: async () => ({ id: 'os1', ordens: [] }) } });
  await context.confirmarExportacao();
  assert.equal(downloads.length, 1);
  assert.equal(messages.at(-1), 'Backup Exportado!');
});

async function failedImport(failRollback) {
  const messages = [], writes = []; let reader;
  const context = {
    console: quiet, BACKUP_IMPORT_MAX_BYTES: 1000, registosBancoHoras: [],
    FileReader: class { constructor() { reader = this; } readAsText() {} },
    normalizarBackupImportado: value => value, validarDocumentoBackup: () => true, validarRegistoBancoHoras: () => true,
    obterHistoricoSalvo: async () => [{ id: 'old' }],
    localforage: { getItem: async () => null, setItem: async key => { writes.push(key); },
      removeItem: async key => { writes.push(key); if (failRollback && key === 'os_doc_a') throw Error('disk failed'); } },
    gerarMetadadosResumo: doc => ({ id: doc.id }), gravarHistoricoSalvo: async () => false,
    mostrarToast: message => messages.push(message)
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function importarBackupJSON('), app.indexOf('async function obterLixeiraOS(')), context);
  context.importarBackupJSON({ target: { files: [{ size: 100 }], value: 'backup' } });
  await reader.onload({ target: { result: JSON.stringify({ historicoOS: [{ id: 'a' }, { id: 'b' }], bancoHoras: [] }) } });
  return { messages, writes };
}

test('partial rollback warns and continues restoring remaining records and indexes', async () => {
  const { messages, writes } = await failedImport(true);
  assert.match(messages.at(-1), /falha ao restaurar parte/);
  assert.doesNotMatch(messages.at(-1), /Nenhum dado novo/);
  assert.deepEqual(writes.slice(-4), ['os_doc_a', 'os_doc_b', 'historico_os', 'banco_horas_data']);
});

test('successful rollback reports that imported data was not retained', async () => {
  const { messages } = await failedImport(false);
  assert.match(messages.at(-1), /Nenhum dado novo/);
});

function workerContext(failAsset = false) {
  const listeners = {}, stores = new Map(), requests = [];
  const base = 'https://example.test/ETHIK_OS/sw.js?v=108';
  const key = value => new URL(typeof value === 'string' ? value : value.url, base).href;
  const caches = {
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      return { put: async (url, response) => stores.get(name).set(key(url), response),
        match: async url => stores.get(name).get(key(url)) };
    },
    delete: async name => stores.delete(name)
  };
  vm.runInNewContext(sw, {
    URL, Response, caches,
    fetch: async url => { requests.push(url); return new Response('new:' + url, { status: failAsset && url.includes('app.js') ? 404 : 200 }); },
    self: { location: new URL(base), addEventListener: (event, fn) => { listeners[event] = fn; }, skipWaiting() {} }
  });
  const dispatch = async (name, request) => {
    let pending;
    listeners[name]({ request, waitUntil: promise => { pending = promise; }, respondWith: promise => { pending = promise; } });
    return await pending;
  };
  return { caches, requests, stores, dispatch };
}

test('failed installation never publishes a partial new cache or removes the previous one', async () => {
  const worker = workerContext(true);
  await worker.caches.open('multios-pro-v107');
  await assert.rejects(worker.dispatch('install'), /Asset crítico indisponível/);
  assert.equal(worker.stores.has('multios-pro-v108'), false);
  assert.equal(worker.stores.has('multios-pro-v107'), true);
});

test('navigation and versioned assets use immutable matching snapshots without network refresh', async () => {
  const worker = workerContext();
  const old = await worker.caches.open('multios-pro-v107');
  await old.put('./app.js', new Response('old-script'));
  await worker.dispatch('install');
  await worker.dispatch('activate');
  const before = worker.requests.length;
  const request = (url, mode = 'cors') => ({ method: 'GET', url: 'https://example.test/ETHIK_OS/' + url, mode });
  assert.equal(await (await worker.dispatch('fetch', request('app.js?v=107'))).text(), 'old-script');
  assert.match(await (await worker.dispatch('fetch', request('app.js?v=108'))).text(), /app.js\?v=108/);
  assert.match(await (await worker.dispatch('fetch', request('index.html', 'navigate'))).text(), /index.html\?v=108/);
  assert.equal((await worker.dispatch('fetch', request('app.js?v=106'))).status, 503);
  assert.equal(worker.requests.length, before);
});
