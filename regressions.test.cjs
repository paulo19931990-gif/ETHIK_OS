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
    APP_VERSION: 109, registosBancoHoras: [], urlDownloadGerado: null,
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
    executarComBloqueioBancoHoras: async fn => fn(), console: quiet, BACKUP_IMPORT_MAX_BYTES: 1000, registosBancoHoras: [],
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
  const base = 'https://example.test/ETHIK_OS/sw.js?v=109';
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
  assert.equal(worker.stores.has('multios-pro-v109'), false);
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
  assert.match(await (await worker.dispatch('fetch', request('app.js?v=109'))).text(), /app.js\?v=109/);
  assert.match(await (await worker.dispatch('fetch', request('index.html', 'navigate'))).text(), /index.html\?v=109/);
  assert.equal((await worker.dispatch('fetch', request('app.js?v=106'))).status, 503);
  assert.equal(worker.requests.length, before);
});


{
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
function fn(name) {
  const start = source.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/^(?:async )?function /m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function context(names, mocks) {
  const c = vm.createContext({ console: quiet, ...mocks });
  names.forEach(name => vm.runInContext(fn(name), c));
  return c;
}
function storage(entries = []) {
  const data = new Map(entries);
  return { data, getItem: async k => structuredClone(data.get(k) ?? null),
    setItem: async (k, v) => { data.set(k, structuredClone(v)); }, removeItem: async k => data.delete(k) };
}

// Regression checks for the audit findings, requiring corrected behavior.
test('trash deletion preserves media still referenced by drafts', async () => {
  const doc = { id: 'os1', ordens: [{ fotos: [{ mediaId: 'photo1' }] }] };
  const db = storage([['trash_os_doc_os1', doc], ['draft_doc_os1', doc], ['photo_photo1', 'bytes']]);
  const c = context(['apagarDocumentoDefinitivo'], {
    localforage: db, idLocalSeguro: () => true, confirm: () => true,
    obterLixeiraOS: async () => [{ id: 'os1' }], idsMidiaDocumento: () => new Set(['photo_photo1']),
    removerChaveMidiaComRelacionados: key => db.removeItem(key), carregarLixeira: async () => {},
    mostrarToast() {}, agendarLimpezaMidiasOrfas() {}
  });
  await c.apagarDocumentoDefinitivo('os1');
  assert.ok(db.data.has('draft_doc_os1'));
  assert.equal(db.data.has('photo_photo1'), true);
});

test('edits during save remain dirty and are protected in a fresh draft', async () => {
  const db = storage();
  let current = 'before';
  const btn = { disabled: false };
  const no = () => {};
  const c = context(['salvarDocumento'], {
    localforage: db, document: { getElementById: () => btn },
    formularioSujo: true, revisaoFormulario: 0, documentoAtualId: "os1", restaurandoDocumento: false, salvamentoManualEmAndamento: false, aguardarAssinaturas: async () => {}, salvarRascunhoPersistente: async doc => db.setItem("draft_doc_os1",doc),
    cancelarAutoSavePendente: no, protegerRascunhoAtualAntesDeValidar: async () => true,
    validarCamposObrigatorios: () => true, aprenderPecasDaOS: async () => {},
    recolherDadosDoFormulario: () => ({ id: 'os1', ordens: [{ descricao: current }] }),
    verificarIntegridadeMidiasDocumento: async () => { current = 'edited while saving'; c.revisaoFormulario++; return { ok: true }; },
    atualizarIndicadorIntegridadeMidias: no, obterHistoricoSalvo: async () => [],
    aplicarIntegridadeDocumento: async () => {}, gerarMetadadosResumo: doc => ({ id: doc.id }),
    gravarHistoricoSalvo: async h => { await db.setItem('historico_os', h); return true; },
    removerRascunhoPersistente: async () => db.removeItem('draft_doc_os1'), atualizarIndicadorRascunho: no,
    mostrarToast: no, solicitarPersistenciaArmazenamento: no, atualizarProtecaoArmazenamentoConhecido: no,
    limparMidiasRemovidasDoDocumento: no, carregarHistorico: no, agendarLimpezaMidiasOrfas: no, registrarErroApp: no
  });
  await db.setItem('draft_doc_os1', { descricao: 'before' });
  assert.equal(await c.salvarDocumento(), false);
  assert.equal(db.data.get('os_doc_os1').ordens[0].descricao, 'before');
  assert.equal(current, 'edited while saving');
  assert.equal(c.formularioSujo, true);
  assert.equal(db.data.get('draft_doc_os1').ordens[0].descricao, 'edited while saving');
  assert.match(source, /if \(!restaurandoDocumento\) marcarFormularioAlterado/);
});

test('signature saving waits until its image has finished drawing', async () => {
  let finish, drawing = 'blank', saved;
  const pad = { clear() { drawing = 'blank'; }, fromDataURL() { return new Promise(resolve => { finish = () => { drawing = 'signature'; resolve(); }; }); } };
  const c = context(['carregarAssinaturaPad','aguardarAssinaturas','confirmarAssinaturaExpandida'], {
    restaurandoDocumento: false, salvamentoManualEmAndamento: false, marcarFormularioAlterado() {},
    assinaturaAbertaPeloPreview: false, alvoAssinaturaAtual: 'cliente', padTecnico: pad, padCliente: pad,
    document: { getElementById: () => ({}) }, padExpandido: { isEmpty: () => false, toDataURL: () => 'signature' },
    resizeCanvasSeguro() {}, bloquearEdicao() {}, fecharModalAssinatura() {},
    autoSalvarRascunho: async () => { saved = drawing; }
  });
  const pending=c.confirmarAssinaturaExpandida();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved, undefined);
  finish();
  await pending;
  assert.equal(drawing, 'signature');
  assert.equal(saved, 'signature');
});

test('stale bank-hours write is rejected and a retry preserves both entries', async () => {
  const db = storage([['banco_horas_data', []]]);
  let tail=Promise.resolve();
  const navigator={locks:{request:(key,options,fn)=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;}}};
  const mocks = { navigator, localforage: db, registosBancoHoras: [], registrarErroApp() {}, mostrarToast() {} };
  const a = context(['sanitizarRegistoBancoHoras', 'executarComBloqueioBancoHoras', 'persistirBancoHorasSeguro'], mocks);
  const b = context(['sanitizarRegistoBancoHoras', 'executarComBloqueioBancoHoras', 'persistirBancoHorasSeguro'], mocks);
  assert.equal(await a.persistirBancoHorasSeguro([{ id: 'a' }]), true);
  assert.equal(await b.persistirBancoHorasSeguro([{ id: 'b' }]), false);
  assert.deepEqual(db.data.get('banco_horas_data'), [{ id: 'a' }]);
  assert.equal(await b.persistirBancoHorasSeguro([...b.registosBancoHoras,{id:'b'}]),true);
  assert.deepEqual(db.data.get('banco_horas_data'), [{ id: 'a' },{id:'b'}]);
});

test('temporary read failure aborts index recovery without writing a partial index', async () => {
  const db = storage([['os_doc_a', { id: 'a', ordens: [{}] }], ['os_doc_b', { id: 'b', ordens: [{}] }]]);
  const read = db.getItem;
  db.getItem = async key => { if (key === 'os_doc_b') throw Error('temporary'); return read(key); };
  const c = context(['reconstruirHistoricoAPartirDocumentos'], {
    localforage: db, idLocalSeguro: () => true, gerarMetadadosResumo: doc => ({ id: doc.id }), gravarProtecaoArmazenamentoLocal() {}
  });
  await assert.rejects(c.reconstruirHistoricoAPartirDocumentos(['os_doc_a', 'os_doc_b']), /Recuperação do Histórico adiada/);
  assert.equal(db.data.has('historico_os'), false);
  assert.ok(db.data.has('os_doc_b'));
});

test('invalid PDF attachment prevents incomplete report generation', async () => {
  const start = source.indexOf("        const anexoMediaId = getVal('anexoMediaId', id);");
  const end = source.indexOf('    await reportProgress(88,', start);
  const block = source.slice(start, end).replace(/\s*}\s*$/, '');
  const c = vm.createContext({ id: 1, getVal: key => key === 'anexoMediaId' ? 'pdf1' : '',
    MEDIA_PDF_PREFIX: 'pdf_', obterBlobMidia: async () => new Blob(['%PDF-invalid']),
    PDFDocument: { load: async () => { throw Error('corrupt PDF'); } },
    console: quiet, mostrarToast() {} });
  await assert.rejects(vm.runInContext('(async () => {' + block + '; return "continued"; })()', c), /PDF cancelado/);
});

test('backup validation rejects malformed parts before changing stored data', () => {
  const c = context(['validarEstruturaDocumento','validarDocumentoBackup'], { idLocalSeguro: () => true });
  assert.equal(c.validarDocumentoBackup({ id: 'a', ordens: [{ pecas: [null] }] }), false);
  assert.equal(c.validarDocumentoBackup({ id: 'a', ordens: [{ pecas: [{q:'1',n:'Peça',c:'123'}] }] }), true);
  assert.match(source, /dados\.pecas\.forEach\(p =>/);
  assert.match(source, /escapeHTML\(p\.q\)/);
});

test('ordinary save still completes and removes its obsolete draft', async () => {
  const db = storage();
  let current = 'before';
  const btn = { disabled: false };
  const no = () => {};
  const c = context(['salvarDocumento'], {
    localforage: db, document: { getElementById: () => btn },
    formularioSujo: true, revisaoFormulario: 0, documentoAtualId: "os1", restaurandoDocumento: false, salvamentoManualEmAndamento: false, aguardarAssinaturas: async () => {}, salvarRascunhoPersistente: async doc => db.setItem("draft_doc_os1",doc),
    cancelarAutoSavePendente: no, protegerRascunhoAtualAntesDeValidar: async () => true,
    validarCamposObrigatorios: () => true, aprenderPecasDaOS: async () => {},
    recolherDadosDoFormulario: () => ({ id: 'os1', ordens: [{ descricao: current }] }),
    verificarIntegridadeMidiasDocumento: async () => { return { ok: true }; },
    atualizarIndicadorIntegridadeMidias: no, obterHistoricoSalvo: async () => [],
    aplicarIntegridadeDocumento: async () => {}, gerarMetadadosResumo: doc => ({ id: doc.id }),
    gravarHistoricoSalvo: async h => { await db.setItem('historico_os', h); return true; },
    removerRascunhoPersistente: async () => db.removeItem('draft_doc_os1'), atualizarIndicadorRascunho: no,
    mostrarToast: no, solicitarPersistenciaArmazenamento: no, atualizarProtecaoArmazenamentoConhecido: no,
    limparMidiasRemovidasDoDocumento: no, carregarHistorico: no, agendarLimpezaMidiasOrfas: no, registrarErroApp: no
  });
  await db.setItem('draft_doc_os1', { descricao: 'before' });
  assert.equal(await c.salvarDocumento(), true);
  assert.equal(db.data.get('os_doc_os1').ordens[0].descricao, 'before');
  assert.equal(current, 'before');
  assert.equal(c.formularioSujo, false);
  assert.equal(db.data.has('draft_doc_os1'), false);
  assert.match(source, /if \(!restaurandoDocumento\) marcarFormularioAlterado/);
});

test('edits arriving while the old draft is removed are protected again', async () => {
  const db = storage();
  let current = 'before';
  const btn = { disabled: false };
  const no = () => {};
  const c = context(['salvarDocumento'], {
    localforage: db, document: { getElementById: () => btn },
    formularioSujo: true, revisaoFormulario: 0, documentoAtualId: "os1", restaurandoDocumento: false, salvamentoManualEmAndamento: false, aguardarAssinaturas: async () => {}, salvarRascunhoPersistente: async doc => db.setItem("draft_doc_os1",doc),
    cancelarAutoSavePendente: no, protegerRascunhoAtualAntesDeValidar: async () => true,
    validarCamposObrigatorios: () => true, aprenderPecasDaOS: async () => {},
    recolherDadosDoFormulario: () => ({ id: 'os1', ordens: [{ descricao: current }] }),
    verificarIntegridadeMidiasDocumento: async () => { return { ok: true }; },
    atualizarIndicadorIntegridadeMidias: no, obterHistoricoSalvo: async () => [],
    aplicarIntegridadeDocumento: async () => {}, gerarMetadadosResumo: doc => ({ id: doc.id }),
    gravarHistoricoSalvo: async h => { await db.setItem('historico_os', h); return true; },
    removerRascunhoPersistente: async () => {current='edited while saving';c.revisaoFormulario++;await db.removeItem('draft_doc_os1');}, atualizarIndicadorRascunho: no,
    mostrarToast: no, solicitarPersistenciaArmazenamento: no, atualizarProtecaoArmazenamentoConhecido: no,
    limparMidiasRemovidasDoDocumento: no, carregarHistorico: no, agendarLimpezaMidiasOrfas: no, registrarErroApp: no
  });
  await db.setItem('draft_doc_os1', { descricao: 'before' });
  assert.equal(await c.salvarDocumento(), false);
  assert.equal(db.data.get('os_doc_os1').ordens[0].descricao, 'before');
  assert.equal(current, 'edited while saving');
  assert.equal(c.formularioSujo, true);
  assert.equal(db.data.get('draft_doc_os1').ordens[0].descricao, 'edited while saving');
  assert.match(source, /if \(!restaurandoDocumento\) marcarFormularioAlterado/);
});


test('invalid restored data is rejected before clearing the current form', async () => {
  const c=context(['validarEstruturaDocumento','restaurarDadosParaFormulario'], {
    idLocalSeguro:()=>true, documentoAtualId:'original', restaurandoDocumento:false
  });
  await assert.rejects(c.restaurarDadosParaFormulario({id:'bad',ordens:[{pecas:[null]}]}), /Documento inválido/);
  assert.equal(c.documentoAtualId,'original');
  assert.equal(c.restaurandoDocumento,false);
});

test('unexpected restoration failure always releases the loading flag', async () => {
  const c=context(['validarEstruturaDocumento','restaurarDadosParaFormulario'], {
    idLocalSeguro:()=>true, restaurandoDocumento:false, cancelarAutoSavePendente(){},
    aguardarAssinaturas:async()=>{throw Error('decode failed');}
  });
  await assert.rejects(c.restaurarDadosParaFormulario({id:'a',ordens:[{}]}), /decode failed/);
  assert.equal(c.restaurandoDocumento,false);
});

test('signature decode failure rejects and clears the pending state', async () => {
  const c=context(['carregarAssinaturaPad'],{});
  const pad={fromDataURL:async()=>{throw Error('invalid image');}};
  await assert.rejects(c.carregarAssinaturaPad(pad,'bad'), /invalid image/);
  assert.equal(pad.carregamentoAssinatura,null);
});

test('bank-hours does not write without cross-tab lock support', async () => {
  const db=storage([['banco_horas_data',[]]]);
  const c=context(['sanitizarRegistoBancoHoras','executarComBloqueioBancoHoras','persistirBancoHorasSeguro'], {
    localforage:db, registosBancoHoras:[], registrarErroApp(){}, mostrarToast(){}
  });
  assert.equal(await c.persistirBancoHorasSeguro([{id:'a'}]),false);
  assert.deepEqual(db.data.get('banco_horas_data'),[]);
});
}
