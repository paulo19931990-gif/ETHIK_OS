/* app.js */
if (typeof localforage !== 'undefined') {
    localforage.config({ name: 'MultiOSProDB', storeName: 'app_data', description: 'Armazenamento offline robusto' });
} else {
    console.warn("Aviso: localforage indisponível. Cache offline falhou.");
}

// === SISTEMA INTELIGENTE DE PEÇAS ===
let bancoPecas = [];
let pecasPorCodigo = new Map();
let pecasPorNome = new Map();

async function iniciarBancoPecas() {
    let salvo = null;
    if (typeof localforage !== 'undefined') {
        try { salvo = await localforage.getItem('banco_pecas_inteligente'); } catch (e) { console.warn('Falha ao carregar banco de peças local:', e); }
    }
    bancoPecas = Array.isArray(salvo) && salvo.length > 0 ? salvo : (typeof pecasDeFabrica !== 'undefined' ? [...pecasDeFabrica] : []);
    pecasPorCodigo.clear(); pecasPorNome.clear();
    bancoPecas.forEach(p => { if (p && typeof p.c === 'string' && typeof p.n === 'string') { pecasPorCodigo.set(p.c, p); pecasPorNome.set(p.n, p); } });
    atualizarListasHTML();
}

function atualizarListasHTML() {
    const dlCodigos = document.getElementById('dbCodigosPecas'); const dlNomes = document.getElementById('dbNomesPecas');
    if(!dlCodigos || !dlNomes) return;
    dlCodigos.replaceChildren(); dlNomes.replaceChildren();
    const fragCodigos = document.createDocumentFragment(); const fragNomes = document.createDocumentFragment();
    bancoPecas.forEach(peca => {
        const optCodigo = document.createElement('option'); optCodigo.value = String(peca.c || ''); optCodigo.textContent = String(peca.n || ''); fragCodigos.appendChild(optCodigo);
        const optNome = document.createElement('option'); optNome.value = String(peca.n || ''); optNome.textContent = String(peca.c || ''); fragNomes.appendChild(optNome);
    });
    dlCodigos.appendChild(fragCodigos); dlNomes.appendChild(fragNomes);
}

function autoPreencherPeca(input, tipo) {
    const row = input.closest('.peca-row-item'); const inputNome = row.querySelector('.n'); const inputCod = row.querySelector('.c');
    if (tipo === 'codigo' && input.value) {
        const p = pecasPorCodigo.get(input.value);
        if (p && !inputNome.value) inputNome.value = p.n;
    } else if (tipo === 'nome' && input.value) {
        const p = pecasPorNome.get(input.value);
        if (p && !inputCod.value) inputCod.value = p.c;
    }
}

async function aprenderPecasDaOS() {
    let bancoAtualizado = false;
    document.querySelectorAll('.peca-row-item').forEach(row => {
        const n = row.querySelector('.n')?.value.trim(); const c = row.querySelector('.c')?.value.trim();
        if (!n || !c) return;
        const existenteCodigo = pecasPorCodigo.get(c);
        if (existenteCodigo) {
            if (existenteCodigo.n !== n && !pecasPorNome.has(n)) {
                pecasPorNome.delete(existenteCodigo.n); existenteCodigo.n = n; pecasPorNome.set(n, existenteCodigo); bancoAtualizado = true;
            }
            return;
        }
        if (pecasPorNome.has(n)) return;
        const novaPeca = { c, n };
        bancoPecas.push(novaPeca); pecasPorCodigo.set(c, novaPeca); pecasPorNome.set(n, novaPeca); bancoAtualizado = true;
    });
    if (bancoAtualizado && typeof localforage !== 'undefined') { await localforage.setItem('banco_pecas_inteligente', bancoPecas); atualizarListasHTML(); }
}

let documentoAtualId = Date.now().toString();
let logoImgData = null, logoImgFormat = 'PNG', imgObject = null;
let urlDownloadGerado = null; 
let objUrlPreview = null;
let padTecnico, padCliente, padExpandido, alvoAssinaturaAtual = null;

let currentZoom = 1, startZoom = 1, startDist = 0;
let pinchStartScrollLeft = 0, pinchStartScrollTop = 0, pinchStartViewportX = 0, pinchStartViewportY = 0;
let registosBancoHoras = [];
let contadorOS = 0;

let mediaStreamCamera = null;
let osIdAtualFoto = null;
let timeoutRascunho = null;

const truncarStr = (str, max) => (str && str.length > max) ? str.substring(0, max - 3) + '...' : (str || '');
const getVal = (campo, id) => document.getElementById(`${campo}_${id}`) ? document.getElementById(`${campo}_${id}`).value : '';
const signatureOptions = { minWidth: 1.5, maxWidth: 3, penColor: "rgb(15,23,42)", backgroundColor: "rgba(255,255,255,0)" };

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function dataLocalISO(data = new Date()) {
    const offset = data.getTimezoneOffset();
    return new Date(data.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function idLocalSeguro(valor) {
    return typeof valor === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(valor);
}

function dependenciasPdfDisponiveis(incluirPdfJs = false) {
    const baseOk = !!(window.jspdf?.jsPDF && window.PDFLib?.PDFDocument);
    const pdfJsOk = !incluirPdfJs || typeof pdfjsLib !== 'undefined';
    return baseOk && pdfJsOk;
}

function dataUrlImagemSegura(valor) {
    return typeof valor === 'string' && /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\r\n]+$/i.test(valor);
}

function dataUrlPdfSegura(valor) {
    if (typeof valor !== 'string') return false;
    const match = /^data:(?:application\/pdf|application\/octet-stream)?;base64,([a-z0-9+/=\r\n]+)$/i.exec(valor);
    if (!match) return false;
    try { return atob(match[1].replace(/\s/g, '').slice(0, 16)).startsWith('%PDF-'); } catch (e) { return false; }
}


// === PERFIL DO TÉCNICO, ACESSO INICIAL E TEMA (v51) ===
const PERFIL_TECNICO_KEY = 'tecnico_perfil_v1';
const SESSAO_TECNICO_KEY = 'multi_os_auth_session_v1';
let perfilTecnicoAtual = null;
let tecnicoAutenticado = false;
let authModo = 'login';
let fotoPerfilTemporaria = null;
let fotoPerfilEdicaoTemporaria = null;

function obterIniciais(nome = '') {
    const partes = String(nome).trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || 'T') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function criarSalt() {
    if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function hashSenhaTecnico(senha, salt) {
    const texto = `${salt}|${senha}|MultiOSPro`;
    if (window.crypto?.subtle && window.TextEncoder) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261; for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    return `fallback_${(h >>> 0).toString(16)}`;
}

function alternarVisibilidadeSenha(id, btn) {
    const input = document.getElementById(id); if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    if (btn) btn.setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
}

function aplicarTema(tema, salvar = true) {
    const final = tema === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = final;
    if (salvar) { try { localStorage.setItem('multi_os_theme', final); } catch(e) {} }
    const meta = document.getElementById('themeColorMeta'); if (meta) meta.content = final === 'dark' ? '#0b1220' : '#f5f7fb';
    const btn = document.getElementById('btnTema'); if (btn) btn.title = final === 'dark' ? 'Usar modo claro' : 'Usar modo escuro';
}
function alternarTema() { aplicarTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }

function renderAvatar(foto, imgId, iniciaisId, nome = '') {
    const img = document.getElementById(imgId); const ini = document.getElementById(iniciaisId);
    if (ini) ini.textContent = obterIniciais(nome);
    if (img) { if (dataUrlImagemSegura(foto)) { img.src = foto; img.style.display = 'block'; if (ini) ini.style.display = 'none'; } else { img.removeAttribute('src'); img.style.display = 'none'; if (ini) ini.style.display = ''; } }
}

function atualizarInterfacePerfil() {
    const nome = perfilTecnicoAtual?.nome || 'Técnico';
    const elNome = document.getElementById('perfilTopoNome'); if (elNome) elNome.textContent = nome;
    const saudacao = document.getElementById('saudacaoTopo'); if (saudacao) saudacao.textContent = 'Olá, técnico';
    renderAvatar(perfilTecnicoAtual?.foto, 'perfilTopoFoto', 'perfilTopoIniciais', nome);
    renderAvatar(perfilTecnicoAtual?.foto, 'perfilModalImg', 'perfilModalIniciais', nome);
}

async function comprimirFotoPerfil(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.');
    if (file.size > 8 * 1024 * 1024) throw new Error('A foto deve ter no máximo 8 MB.');
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl; });
    const size = 320; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); const scale = Math.max(size / img.width, size / img.height); const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
}

function mostrarTelaAcesso(modo = 'login') {
    authModo = modo; const screen = document.getElementById('authScreen'); if (!screen) return;
    const setup = modo === 'setup'; screen.classList.remove('auth-hidden'); document.body.classList.add('auth-open');
    document.getElementById('authTitulo').textContent = setup ? 'Crie seu acesso' : 'Bem-vindo de volta';
    document.getElementById('authDescricao').textContent = setup ? 'Cadastre o técnico que utilizará este dispositivo. Seus dados antigos serão mantidos.' : 'Digite sua senha para acessar o Multi-OS Pro.';
    document.getElementById('authConfirmarWrap').classList.toggle('hidden', !setup);
    document.getElementById('authFotoLabel').classList.toggle('hidden', !setup);
    const nome = document.getElementById('authNome'); nome.readOnly = false; nome.value = setup ? '' : ''; nome.placeholder = setup ? 'Seu nome' : 'Digite seu nome';
    document.getElementById('authSenha').value = ''; document.getElementById('authConfirmarSenha').value = '';
    document.getElementById('authSubmitBtn').querySelector('span').textContent = setup ? 'Criar acesso' : 'Entrar';
    fotoPerfilTemporaria = setup ? null : perfilTecnicoAtual?.foto || null;
    renderAvatar(fotoPerfilTemporaria || perfilTecnicoAtual?.foto, 'authAvatarImg', 'authAvatarInitials', nome.value || perfilTecnicoAtual?.nome || 'Técnico');
    setTimeout(() => (setup ? nome : document.getElementById('authSenha')).focus(), 80);
}
function ocultarTelaAcesso() { document.getElementById('authScreen')?.classList.add('auth-hidden'); document.body.classList.remove('auth-open'); }

async function sincronizarNomeTecnicoPerfil() {
    if (!perfilTecnicoAtual?.nome) return;
    const tecnicoEl = document.getElementById('tecnico'); if (tecnicoEl && !tecnicoEl.value.trim()) tecnicoEl.value = perfilTecnicoAtual.nome;
    const bh = document.getElementById('bh_nome_tecnico'); if (bh) { bh.value = perfilTecnicoAtual.nome; try { await localforage.setItem('bh_nome_tecnico_salvo', perfilTecnicoAtual.nome); } catch(e) {} }
}

async function inicializarAcessoTecnico() {
    aplicarTema(document.documentElement.dataset.theme || 'light', false);
    if (typeof localforage === 'undefined') { tecnicoAutenticado = true; ocultarTelaAcesso(); return; }
    try { perfilTecnicoAtual = await localforage.getItem(PERFIL_TECNICO_KEY); } catch(e) { perfilTecnicoAtual = null; }
    atualizarInterfacePerfil();
    if (!perfilTecnicoAtual?.nome || !perfilTecnicoAtual?.senhaHash || !perfilTecnicoAtual?.salt) { mostrarTelaAcesso('setup'); return; }
    if (sessionStorage.getItem(SESSAO_TECNICO_KEY) === 'ok') { tecnicoAutenticado = true; ocultarTelaAcesso(); await sincronizarNomeTecnicoPerfil(); return; }
    mostrarTelaAcesso('login');
}

async function submeterAcessoTecnico() {
    if (typeof localforage === 'undefined') return mostrarToast('Armazenamento local indisponível.', true);
    const nome = document.getElementById('authNome').value.trim(); const senha = document.getElementById('authSenha').value;
    const btn = document.getElementById('authSubmitBtn'); if (btn) btn.disabled = true;
    try {
        if (authModo === 'setup') {
            const confirmar = document.getElementById('authConfirmarSenha').value;
            if (nome.length < 2) throw new Error('Informe o nome do técnico.');
            if (senha.length < 4) throw new Error('A senha deve ter pelo menos 4 caracteres.');
            if (senha !== confirmar) throw new Error('As senhas não conferem.');
            const salt = criarSalt(); const senhaHash = await hashSenhaTecnico(senha, salt);
            perfilTecnicoAtual = { nome, senhaHash, salt, foto: fotoPerfilTemporaria || null, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
            await localforage.setItem(PERFIL_TECNICO_KEY, perfilTecnicoAtual);
        } else {
            const nomeCorreto = nome.localeCompare(perfilTecnicoAtual.nome, 'pt-BR', { sensitivity: 'base' }) === 0;
            const hash = await hashSenhaTecnico(senha, perfilTecnicoAtual.salt);
            if (!nomeCorreto || hash !== perfilTecnicoAtual.senhaHash) throw new Error('Nome ou senha incorretos.');
        }
        tecnicoAutenticado = true; sessionStorage.setItem(SESSAO_TECNICO_KEY, 'ok'); atualizarInterfacePerfil(); ocultarTelaAcesso(); await sincronizarNomeTecnicoPerfil(); mostrarToast(`Bem-vindo, ${perfilTecnicoAtual.nome.split(' ')[0]}!`);
    } catch(e) { mostrarToast(e.message || 'Não foi possível entrar.', true); }
    finally { if (btn) btn.disabled = false; }
}

function toggleMenuPerfil(e) { if (e) e.stopPropagation(); document.getElementById('menuPerfil')?.classList.toggle('hidden'); }
function fecharMenuPerfil() { document.getElementById('menuPerfil')?.classList.add('hidden'); }
function abrirPerfilTecnico() {
    fecharMenuPerfil(); if (!perfilTecnicoAtual) return;
    document.getElementById('perfilNomeInput').value = perfilTecnicoAtual.nome || '';
    document.getElementById('perfilSenhaAtual').value = ''; document.getElementById('perfilNovaSenha').value = '';
    fotoPerfilEdicaoTemporaria = perfilTecnicoAtual.foto || null; renderAvatar(fotoPerfilEdicaoTemporaria, 'perfilModalImg', 'perfilModalIniciais', perfilTecnicoAtual.nome);
    document.getElementById('modalPerfilTecnico').classList.remove('hidden');
}
function fecharPerfilTecnico() { document.getElementById('modalPerfilTecnico')?.classList.add('hidden'); }

async function salvarPerfilTecnico() {
    if (!perfilTecnicoAtual) return;
    const nome = document.getElementById('perfilNomeInput').value.trim(); const atual = document.getElementById('perfilSenhaAtual').value; const nova = document.getElementById('perfilNovaSenha').value;
    try {
        if (nome.length < 2) throw new Error('Informe um nome válido.');
        let senhaHash = perfilTecnicoAtual.senhaHash, salt = perfilTecnicoAtual.salt;
        if (nova) {
            if (nova.length < 4) throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
            const hashAtual = await hashSenhaTecnico(atual, perfilTecnicoAtual.salt); if (hashAtual !== perfilTecnicoAtual.senhaHash) throw new Error('Senha atual incorreta.');
            salt = criarSalt(); senhaHash = await hashSenhaTecnico(nova, salt);
        }
        perfilTecnicoAtual = { ...perfilTecnicoAtual, nome, senhaHash, salt, foto: fotoPerfilEdicaoTemporaria || null, atualizadoEm: new Date().toISOString() };
        await localforage.setItem(PERFIL_TECNICO_KEY, perfilTecnicoAtual); atualizarInterfacePerfil(); await sincronizarNomeTecnicoPerfil(); fecharPerfilTecnico(); mostrarToast('Perfil atualizado.');
    } catch(e) { mostrarToast(e.message || 'Não foi possível salvar o perfil.', true); }
}

function sairDoAppTecnico() { fecharMenuPerfil(); tecnicoAutenticado = false; sessionStorage.removeItem(SESSAO_TECNICO_KEY); mostrarTelaAcesso('login'); }

function atualizarResumoDocumento() {
    const blocos = [...document.querySelectorAll('.os-bloco')];
    const n = blocos.length;
    const plural = n === 1 ? 'O.S.' : 'O.S.';
    const textoDocumento = `Documento com ${n} ${plural}`;
    const badge = document.getElementById('osCountBadge');
    if (badge) badge.textContent = `${n} O.S. no arquivo`;
    const title = document.getElementById('documentTitle');
    if (title) title.textContent = textoDocumento;
    const finalCount = document.getElementById('finalDocCount');
    if (finalCount) finalCount.textContent = textoDocumento;
    const header = document.getElementById('headerContextText');
    const novaOs = document.getElementById('novaOs');
    if (header && novaOs && !novaOs.classList.contains('hidden')) {
        const finalStage = document.getElementById('finalStage');
        header.textContent = finalStage && !finalStage.classList.contains('hidden') ? 'Finalização do arquivo' : textoDocumento;
    }
    const info = document.getElementById('consolidatedInfoText');
    if (info) info.textContent = `Este será um único arquivo PDF consolidado, com ${n === 1 ? 'a O.S.' : `as ${n} O.S.`} neste documento.`;
    blocos.forEach((b, index) => {
        const badgeNum = b.querySelector('.os-number-badge');
        if (badgeNum) badgeNum.textContent = String(index + 1);
        atualizarResumoOS(Number(b.dataset.id));
    });
    renderFinalOsSummary();
}

function transformarBlocoEmCardMockup(bloco, id) {
    if (!bloco || bloco.dataset.mockupReady === '1') return;
    bloco.dataset.mockupReady = '1';
    bloco.classList.add('os-card-mockup');
    const legacyHeader = bloco.children[0];
    const editor = bloco.children[1];
    if (!legacyHeader || !editor) return;
    legacyHeader.classList.add('legacy-os-header');
    editor.classList.add('os-editor-content');

    const summary = document.createElement('div');
    summary.className = 'os-card-summary';
    summary.innerHTML = `
      <div class="os-card-topline">
        <div class="os-number-badge">${id}</div>
        <div class="os-card-title-wrap"><strong id="osResumoTitulo_${id}">O.S. ${id}</strong></div>
        <span class="os-state-badge editing" id="osResumoStatus_${id}">Em edição</span>
        <button class="os-chevron" type="button" aria-label="Expandir ou recolher O.S." onclick="toggleOsEditor(${id})"><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></button>
      </div>
      <div class="os-summary-rows">
        <div><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"></circle><path d="M5 21a7 7 0 0 1 14 0"></path></svg><span>Cliente</span><b id="osResumoCliente_${id}">Não informado</b></div>
        <div><svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M9 8h6M9 12h6M9 16h4"></path></svg><span>Equipamento</span><b id="osResumoEquip_${id}">Não informado</b></div>
        <div><svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5-5L7.5 3.5l3 3-6.8 6.8a2 2 0 0 0 0 2.8l4.2 4.2a2 2 0 0 0 2.8 0l6.8-6.8 3 3 2.2-2.2a4 4 0 0 0-5-5"></path></svg><span>Serviço Executado</span><b id="osResumoServico_${id}">Não informado</b></div>
      </div>
      <div class="os-summary-actions">
        <button class="edit-os-button" type="button" onclick="toggleOsEditor(${id}, true)"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"></path><path d="m13 7 4 4"></path></svg> Editar</button>
        ${id > 1 ? `<button class="remove-os-button" type="button" onclick="removerBlocoOSUI(${id})">Remover</button>` : ''}
      </div>`;
    bloco.insertBefore(summary, legacyHeader);

    bloco.addEventListener('input', () => atualizarResumoOS(id));
    bloco.addEventListener('change', () => atualizarResumoOS(id));

    document.querySelectorAll('.os-bloco').forEach(outro => {
        if (outro !== bloco) toggleOsEditor(Number(outro.dataset.id), false);
    });
    toggleOsEditor(id, true);
    atualizarResumoOS(id);
}

function toggleOsEditor(id, forceOpen = null) {
    const bloco = document.querySelector(`.os-bloco[data-id="${id}"]`);
    if (!bloco) return;
    const editor = bloco.querySelector('.os-editor-content');
    if (!editor) return;
    const isOpen = bloco.classList.contains('is-open');
    const abrir = forceOpen === null ? !isOpen : !!forceOpen;
    if (abrir) {
        document.querySelectorAll('.os-bloco.is-open').forEach(outro => {
            if (outro !== bloco) {
                outro.classList.remove('is-open');
                const outroEditor = outro.querySelector('.os-editor-content');
                if (outroEditor) outroEditor.style.display = 'none';
                atualizarEstadoResumoOS(Number(outro.dataset.id));
            }
        });
        bloco.classList.add('is-open');
        editor.style.display = 'grid';
    } else {
        bloco.classList.remove('is-open');
        editor.style.display = 'none';
    }
    atualizarEstadoResumoOS(id);
}

function atualizarEstadoResumoOS(id) {
    const bloco = document.querySelector(`.os-bloco[data-id="${id}"]`);
    const status = document.getElementById(`osResumoStatus_${id}`);
    if (!bloco || !status) return;
    const aberto = bloco.classList.contains('is-open');
    const cliente = document.getElementById(`cliente_${id}`)?.value.trim();
    const numero = document.getElementById(`osNum_${id}`)?.value.trim();
    status.className = 'os-state-badge';
    if (aberto) { status.textContent = 'Em edição'; status.classList.add('editing'); }
    else if (cliente && numero) { status.textContent = 'Concluída'; status.classList.add('complete'); }
    else { status.textContent = 'Rascunho'; status.classList.add('draft'); }
}

function atualizarResumoOS(id) {
    if (!id) return;
    const bloco = document.querySelector(`.os-bloco[data-id="${id}"]`);
    const indice = bloco ? [...document.querySelectorAll('.os-bloco')].indexOf(bloco) + 1 : id;
    const cliente = document.getElementById(`cliente_${id}`)?.value.trim() || 'Não informado';
    const equipamento = document.getElementById(`equipamento_${id}`)?.value.trim() || 'Não informado';
    const descricao = document.getElementById(`descricao_${id}`)?.value.trim() || 'Não informado';
    const numero = document.getElementById(`osNum_${id}`)?.value.trim();
    const title = document.getElementById(`osResumoTitulo_${id}`);
    const c = document.getElementById(`osResumoCliente_${id}`);
    const e = document.getElementById(`osResumoEquip_${id}`);
    const d = document.getElementById(`osResumoServico_${id}`);
    if (title) title.textContent = `O.S. ${indice} — ${cliente === 'Não informado' ? (numero ? `Nº ${numero}` : 'Nova O.S.') : cliente}`;
    if (c) c.textContent = cliente;
    if (e) e.textContent = equipamento;
    if (d) d.textContent = descricao.length > 62 ? `${descricao.slice(0, 59)}...` : descricao;
    atualizarEstadoResumoOS(id);
    renderFinalOsSummary();
}

function removerBlocoOSUI(id) {
    const bloco = document.querySelector(`.os-bloco[data-id="${id}"]`);
    if (!bloco) return;
    bloco.remove();
    atualizarVisibilidadeCamposPorBloco();
    atualizarResumoDocumento();
    autoSalvarRascunho();
}

function renderFinalOsSummary() {
    const container = document.getElementById('finalOsSummary');
    if (!container) return;
    container.replaceChildren();
    const blocos = [...document.querySelectorAll('.os-bloco')];
    blocos.forEach((bloco, index) => {
        const id = Number(bloco.dataset.id);
        const cliente = document.getElementById(`cliente_${id}`)?.value.trim() || 'Nova O.S.';
        const pecas = [...bloco.querySelectorAll('.peca-row-item')].filter(r => r.querySelector('.n')?.value.trim() || r.querySelector('.c')?.value.trim()).length;
        const fotos = bloco.querySelectorAll('.foto-item').length;
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'final-os-row';
        row.addEventListener('click', () => { mostrarEtapaDocumento(); toggleOsEditor(id, true); setTimeout(() => bloco.scrollIntoView({behavior:'smooth', block:'start'}), 60); });
        const num = document.createElement('span'); num.className = `final-os-num ${index % 2 ? 'violet' : 'green'}`; num.textContent = String(index + 1);
        const name = document.createElement('b'); name.textContent = `O.S. ${index + 1} — ${cliente}`;
        const meta = document.createElement('small'); meta.textContent = `${pecas} ${pecas === 1 ? 'peça' : 'peças'}, ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`;
        const arrow = document.createElement('span'); arrow.className = 'final-os-arrow'; arrow.textContent = '›';
        row.append(num, name, meta, arrow); container.appendChild(row);
    });
}

function mostrarEtapaFinalizacao() {
    const doc = document.getElementById('documentStage'); const fin = document.getElementById('finalStage');
    if (!doc || !fin) return;
    doc.classList.add('hidden'); fin.classList.remove('hidden');
    atualizarResumoDocumento();
    const header = document.getElementById('headerContextText'); if (header) header.textContent = 'Finalização do arquivo';
    setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasTecnico'), padTecnico); resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 80);
    window.scrollTo({top:0, behavior:'smooth'});
}

function mostrarEtapaDocumento() {
    const doc = document.getElementById('documentStage'); const fin = document.getElementById('finalStage');
    if (!doc || !fin) return;
    fin.classList.add('hidden'); doc.classList.remove('hidden');
    atualizarResumoDocumento();
    window.scrollTo({top:0, behavior:'smooth'});
}

async function irParaOrdensAtuais() {
    await switchTab('novaOs'); mostrarEtapaDocumento();
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('btnNavOrdens')?.classList.add('active');
    setTimeout(() => document.getElementById('listaOrdensServico')?.scrollIntoView({behavior:'smooth', block:'start'}), 60);
}

async function adicionarOSPeloAtalho() {
    await switchTab('novaOs'); mostrarEtapaDocumento(); adicionarBlocoOS();
    setTimeout(() => document.querySelector('.os-bloco:last-child')?.scrollIntoView({behavior:'smooth', block:'start'}), 70);
}

function abrirMenuPrincipal() {
    document.getElementById('menuPrincipalBackdrop')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function fecharMenuPrincipal(event = null) {
    const backdrop = document.getElementById('menuPrincipalBackdrop');
    if (event && event.target !== backdrop) return;
    backdrop?.classList.add('hidden');
    document.body.style.overflow = '';
}

function definirNomeAnexo(id, nome = '') {
    const el = document.getElementById(`anexoNome_${id}`);
    if (!el) return;
    el.replaceChildren();
    const icone = document.createElement('span');
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = '✓ ';
    const texto = document.createElement('span');
    let nomeLimpo = String(nome || '').replace(/^Anexado:\s*/i, '').trim();
    if (/^Anexado$/i.test(nomeLimpo)) nomeLimpo = '';
    texto.textContent = nomeLimpo ? `Anexado: ${nomeLimpo}` : 'Anexado';
    el.append(icone, texto);
    el.classList.remove('hidden');
}

let promptDeInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptDeInstalacao = e; });

async function acionarInstalacaoApp() {
    if (promptDeInstalacao) { promptDeInstalacao.prompt(); promptDeInstalacao = null; } 
    else { alert("Instalação automática não disponível. Adicione manualmente ao ecrã principal usando o menu do seu navegador."); }
}

async function atualizarIndicadorArmazenamento() {
    const elText = document.getElementById('storage-text'); const elBar = document.getElementById('storage-bar');
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const { usage, quota } = await navigator.storage.estimate();
            const percent = Math.min((usage / quota) * 100, 100);
            const usedMB = (usage / 1024 / 1024).toFixed(1); const totalGB = (quota / 1024 / 1024 / 1024).toFixed(2);
            if(elText) elText.textContent = `${usedMB} MB de ~${totalGB} GB`;
            if(elBar) { elBar.style.width = `${percent}%`; elBar.className = `h-2 rounded-full transition-all duration-500 ${percent > 80 ? 'bg-red-500' : 'bg-blue-500'}`; }
        } catch(e) {}
    }
}

async function carregarLogoDoArmazenamento() {
    try {
        const logoSalvo = await localforage.getItem('oficialLogoApp');
        if (logoSalvo && dataUrlImagemSegura(logoSalvo)) {
            logoImgData = logoSalvo; logoImgFormat = (logoSalvo.includes('image/jpeg') || logoSalvo.includes('image/jpg')) ? 'JPEG' : 'PNG';
            const img = new Image(); img.src = logoSalvo;
            img.onload = () => {
                imgObject = img;
                if(document.getElementById('headerLogo')) document.getElementById('headerLogo').src = logoSalvo;
                if(document.getElementById('headerLogoContainer')) document.getElementById('headerLogoContainer').classList.remove('hidden');
            };
        }
    } catch(e) { console.error('Erro logo:', e); }
}

async function lerLogotipo(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) { mostrarToast('Selecione uma imagem válida para o logótipo.', true); event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = async function(e) { try { if (!dataUrlImagemSegura(e.target.result)) throw new Error('Formato inválido'); await localforage.setItem('oficialLogoApp', e.target.result); await carregarLogoDoArmazenamento(); mostrarToast('Logótipo atualizado!'); } catch(err) { console.error(err); mostrarToast('Não foi possível guardar o logótipo.', true); } };
        reader.onerror = () => mostrarToast('Não foi possível ler o logótipo.', true);
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

function gerarMetadadosResumo(doc) {
    return {
        id: doc.id, dataAtualizacao: doc.dataAtualizacao,
        clienteEmpresa: doc.ordens && doc.ordens[0] ? doc.ordens[0].cliente : 'Desconhecido', nomeClienteFinal: doc.nomeClienteFinal || 'Desconhecido',
        osNumResumo: doc.ordens && doc.ordens[0] ? doc.ordens[0].osNum : 'Sem OS', equipamentoResumo: doc.ordens && doc.ordens[0] ? doc.ordens[0].equipamento : ''
    };
}

async function obterHistoricoSalvo() {
    try { 
        let h = await localforage.getItem('historico_os') || []; 
        if (h.length > 0 && h[0].ordens) {
            let novoMeta = [];
            for(let doc of h) { await localforage.setItem(`os_doc_${doc.id}`, doc); novoMeta.push(gerarMetadadosResumo(doc)); }
            await localforage.setItem('historico_os', novoMeta); return novoMeta;
        }
        return h; 
    } catch(e) { return []; }
}

async function gravarHistoricoSalvo(historicoMeta) { 
    try { await localforage.setItem('historico_os', historicoMeta); return true; } 
    catch(e) { return false; } 
}

function mostrarToast(mensagem, isErro = false) {
    const toast = document.getElementById('toast'); document.getElementById('toastMsg').textContent = mensagem;
    if(isErro) { toast.classList.remove('bg-gray-900'); toast.classList.add('bg-red-600'); } else { toast.classList.remove('bg-red-600'); toast.classList.add('bg-gray-900'); }
    toast.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => toast.classList.add('opacity-0', 'translate-y-4'), 4000); 
}

async function abrirAbaHistoricoSegura() {
    if (perfilTecnicoAtual && tecnicoAutenticado) { await switchTab('historico'); return; }
    let pinSalvo = await localforage.getItem('app_pin');
    if (!pinSalvo) { document.getElementById('inputNovoPin').value = ''; document.getElementById('modalCriarPin').classList.remove('hidden'); } 
    else { document.getElementById('inputDigitarPin').value = ''; document.getElementById('modalDigitarPin').classList.remove('hidden'); }
}
async function salvarNovoPin() {
    const novoPin = document.getElementById('inputNovoPin').value.trim();
    if(/^\d{4,12}$/.test(novoPin)) { await localforage.setItem('app_pin', novoPin); document.getElementById('modalCriarPin').classList.add('hidden'); switchTab('historico'); mostrarToast("PIN registado!"); }
    else mostrarToast("Use um PIN numérico de 4 a 12 dígitos.", true);
}
async function validarPinAcesso() {
    const digitado = document.getElementById('inputDigitarPin').value.trim(); const pinSalvo = await localforage.getItem('app_pin');
    if (digitado === pinSalvo) { document.getElementById('modalDigitarPin').classList.add('hidden'); switchTab('historico'); }
    else { mostrarToast("PIN incorreto!", true); document.getElementById('inputDigitarPin').value = ''; }
}

function abrirModalExportar() { document.getElementById('inputNomeBackup').value = `Backup_MultiOS_${dataLocalISO()}`; document.getElementById('modalExportar').classList.remove('hidden'); }
function fecharModalExportar() { document.getElementById('modalExportar').classList.add('hidden'); }
async function confirmarExportacao() {
    let inputNome = document.getElementById('inputNomeBackup').value.trim() || `Backup_${dataLocalISO()}`;
    let historicoMeta = await obterHistoricoSalvo();
    let backupCompleto = { historicoOS: [], bancoHoras: registosBancoHoras || [] };
    for (let meta of historicoMeta) { let docFull = await localforage.getItem(`os_doc_${meta.id}`); if (docFull) backupCompleto.historicoOS.push(docFull); }
    const blob = new Blob([JSON.stringify(backupCompleto, null, 2)], { type: 'application/json' });
    if(urlDownloadGerado) URL.revokeObjectURL(urlDownloadGerado);
    urlDownloadGerado = URL.createObjectURL(blob);
    inputNome = inputNome.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 100) || `Backup_${dataLocalISO()}`;
    const a = document.createElement('a'); a.href = urlDownloadGerado; a.download = `${inputNome}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    fecharModalExportar(); mostrarToast('Backup Exportado!');
}
function validarDocumentoBackup(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
    if (!idLocalSeguro(doc.id) || !Array.isArray(doc.ordens)) return false;
    return doc.ordens.every(ordem => {
        if (!ordem || typeof ordem !== 'object' || Array.isArray(ordem)) return false;
        if (ordem.fotos !== undefined && !Array.isArray(ordem.fotos)) return false;
        if (ordem.pecas !== undefined && !Array.isArray(ordem.pecas)) return false;
        if (ordem.anexoBase64 && !dataUrlPdfSegura(ordem.anexoBase64)) return false;
        if (Array.isArray(ordem.fotos) && !ordem.fotos.every(f => f && typeof f === 'object' && (!f.b64 || dataUrlImagemSegura(f.b64)))) return false;
        return true;
    });
}

function validarRegistoBancoHoras(reg) {
    return !!(reg && typeof reg === 'object' && idLocalSeguro(reg.id) && /^\d{4}-\d{2}-\d{2}$/.test(String(reg.data || '')) && /^\d{2}:\d{2}$/.test(String(reg.chegada || '')) && /^\d{2}:\d{2}$/.test(String(reg.saida || '')) && Number.isFinite(Number(reg.balancoFinal)));
}

function normalizarBackupImportado(importados) {
    if (Array.isArray(importados)) return { historicoOS: importados, bancoHoras: [] };
    if (!importados || typeof importados !== 'object' || !Array.isArray(importados.historicoOS) || !Array.isArray(importados.bancoHoras)) return null;
    return { historicoOS: importados.historicoOS, bancoHoras: importados.bancoHoras };
}

function importarBackupJSON(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        let rollbackDocs = new Map(); let historicoAnterior = null; let bancoHorasAnterior = null;
        try {
            const normalizado = normalizarBackupImportado(JSON.parse(e.target.result));
            if (!normalizado || !normalizado.historicoOS.every(validarDocumentoBackup) || !normalizado.bancoHoras.every(validarRegistoBancoHoras)) throw new Error('Estrutura inválida');

            const ids = new Set();
            for (const doc of normalizado.historicoOS) {
                if (ids.has(doc.id)) throw new Error('IDs duplicados no backup');
                ids.add(doc.id);
            }

            historicoAnterior = await obterHistoricoSalvo();
            bancoHorasAnterior = Array.isArray(registosBancoHoras) ? [...registosBancoHoras] : [];
            for (const doc of normalizado.historicoOS) rollbackDocs.set(doc.id, await localforage.getItem(`os_doc_${doc.id}`));

            const novoHistorico = [...historicoAnterior];
            for (const doc of normalizado.historicoOS) {
                await localforage.setItem(`os_doc_${doc.id}`, doc);
                const meta = gerarMetadadosResumo(doc); const idx = novoHistorico.findIndex(m => m.id === doc.id);
                if(idx >= 0) novoHistorico[idx] = meta; else novoHistorico.unshift(meta);
            }
            if (!await gravarHistoricoSalvo(novoHistorico)) throw new Error('Falha ao gravar índice');

            const novoBancoHoras = [...bancoHorasAnterior];
            for (const reg of normalizado.bancoHoras) {
                const normalizadoReg = { ...reg, balancoFinal: Number(reg.balancoFinal) };
                const idx = novoBancoHoras.findIndex(r => r.id === normalizadoReg.id);
                if (idx >= 0) novoBancoHoras[idx] = normalizadoReg; else novoBancoHoras.push(normalizadoReg);
            }
            if (normalizado.bancoHoras.length > 0) await localforage.setItem('banco_horas_data', novoBancoHoras);
            registosBancoHoras = novoBancoHoras;
            await carregarHistorico(); mostrarToast('Backup importado e validado!');
        } catch(err) {
            console.error('Erro ao importar backup:', err);
            try {
                for (const [id, antigo] of rollbackDocs) {
                    if (antigo === null || antigo === undefined) await localforage.removeItem(`os_doc_${id}`); else await localforage.setItem(`os_doc_${id}`, antigo);
                }
                if (historicoAnterior) await localforage.setItem('historico_os', historicoAnterior);
                if (bancoHorasAnterior) { registosBancoHoras = bancoHorasAnterior; await localforage.setItem('banco_horas_data', bancoHorasAnterior); }
            } catch (rollbackErr) { console.error('Falha no rollback da importação:', rollbackErr); }
            mostrarToast('Backup inválido ou importação incompleta. Nenhum dado novo foi mantido.', true);
        }
    };
    reader.onerror = () => mostrarToast('Não foi possível ler o ficheiro de backup.', true);
    reader.readAsText(file); event.target.value = '';
}
async function limparTodoHistorico() {
    if(!confirm("Tem a certeza que deseja APAGAR TODO o histórico de O.S.? Esta ação não pode ser desfeita e os ficheiros não exportados serão perdidos.")) return;
    let historicoMeta = await obterHistoricoSalvo();
    for (let meta of historicoMeta) { await localforage.removeItem(`os_doc_${meta.id}`); }
    await localforage.removeItem('historico_os');
    if (documentoAtualId) iniciarNovaOS();
    await carregarHistorico();
    mostrarToast('Todo o histórico foi apagado.');
}

function atualizarZoomPdf() {
    const wrapper = document.getElementById('pdfPagesWrapper'); const container = document.getElementById('pdfRenderContainer'); if (!wrapper || !container) return;
    const isDesktop = window.innerWidth > 600; const paddingLateral = isDesktop ? 48 : 16; const safeWidth = Math.max(240, container.clientWidth - paddingLateral);
    const baseWidth = isDesktop ? Math.min(768, safeWidth) : safeWidth;
    const largura = Math.max(120, baseWidth * currentZoom);
    wrapper.style.setProperty('--pdf-page-width', `${largura}px`);
    wrapper.querySelectorAll('canvas').forEach(c => { c.style.height = 'auto'; c.style.display = 'block'; c.style.maxWidth = 'none'; c.style.width = `${largura}px`; });
    if(document.getElementById('zoomText')) document.getElementById('zoomText').innerText = Math.round(currentZoom * 100) + '%';
}

function aplicarZoomPdf(novoZoom, focoClientX = null, focoClientY = null, zoomAnterior = currentZoom) {
    const container = document.getElementById('pdfRenderContainer');
    if (!container) return;
    const limite = Math.min(Math.max(novoZoom, 0.5), 4);
    const rect = container.getBoundingClientRect();
    const viewportX = focoClientX == null ? container.clientWidth / 2 : focoClientX - rect.left;
    const viewportY = focoClientY == null ? container.clientHeight / 2 : focoClientY - rect.top;
    const conteudoX = container.scrollLeft + viewportX;
    const conteudoY = container.scrollTop + viewportY;
    const ratio = zoomAnterior > 0 ? limite / zoomAnterior : 1;
    currentZoom = limite;
    atualizarZoomPdf();
    requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, conteudoX * ratio - viewportX);
        container.scrollTop = Math.max(0, conteudoY * ratio - viewportY);
    });
}

function zoomInPdf() { aplicarZoomPdf(currentZoom + 0.25); }
function zoomOutPdf() { aplicarZoomPdf(currentZoom - 0.25); }

function resizeCanvasSeguro(canvas, pad, skipRestore = false) {
    if(!canvas) return; let dataURL = null; if(!skipRestore && pad && !pad.isEmpty()) dataURL = pad.toDataURL(); 
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || canvas.parentElement.offsetWidth || 300; const height = canvas.offsetHeight || canvas.parentElement.offsetHeight || 150;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(ratio, ratio);
    if (pad) pad.clear(); if(!skipRestore && dataURL && pad) pad.fromDataURL(dataURL); 
}

function bloquearMultiTouch(canvas) {
    if(!canvas) return;
    const blockSecondary = (e) => { if ((e.type.startsWith('pointer') && !e.isPrimary) || (e.touches && e.touches.length > 1)) { e.stopImmediatePropagation(); e.preventDefault(); } };
    canvas.addEventListener('pointerdown', blockSecondary, { capture: true, passive: false }); canvas.addEventListener('pointermove', blockSecondary, { capture: true, passive: false }); canvas.addEventListener('touchstart', blockSecondary, { capture: true, passive: false }); canvas.addEventListener('touchmove', blockSecondary, { capture: true, passive: false });
}

async function salvarNomeTecnicoBh() {
    const val = document.getElementById('bh_nome_tecnico').value; await localforage.setItem('bh_nome_tecnico_salvo', val);
}

document.addEventListener("DOMContentLoaded", async () => {
    await iniciarBancoPecas(); // Inicializa o banco de dados e atualiza as HTML datalists
    
    if (typeof localforage !== 'undefined') await carregarLogoDoArmazenamento();
    
    const cTec = document.getElementById('canvasTecnico'); const cCli = document.getElementById('canvasCliente'); const cExp = document.getElementById('canvasExpandido');
    if (typeof SignaturePad !== 'undefined') {
        if(cTec) padTecnico = new SignaturePad(cTec, signatureOptions); 
        if(cCli) padCliente = new SignaturePad(cCli, signatureOptions); 
        if(cExp) padExpandido = new SignaturePad(cExp, signatureOptions);
    }
    
    bloquearMultiTouch(cTec);
    bloquearMultiTouch(cCli);
    bloquearMultiTouch(cExp);
    
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
            if (!document.getElementById('novaOs').classList.contains('hidden')) { resizeCanvasSeguro(cTec, padTecnico); resizeCanvasSeguro(cCli, padCliente); }
        });
        if(cTec && cTec.parentElement) observer.observe(cTec.parentElement);
    }
    
    window.addEventListener('resize', () => {
        if (!document.getElementById('novaOs').classList.contains('hidden')) { resizeCanvasSeguro(cTec, padTecnico); resizeCanvasSeguro(cCli, padCliente); }
    });

    const pdfContainer = document.getElementById('pdfRenderContainer');
    if(pdfContainer) {
        pdfContainer.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 2) return;
            const [a, b] = e.touches;
            startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
            startZoom = currentZoom;
            const rect = pdfContainer.getBoundingClientRect();
            pinchStartViewportX = ((a.clientX + b.clientX) / 2) - rect.left;
            pinchStartViewportY = ((a.clientY + b.clientY) / 2) - rect.top;
            pinchStartScrollLeft = pdfContainer.scrollLeft;
            pinchStartScrollTop = pdfContainer.scrollTop;
        }, {passive: true});
        pdfContainer.addEventListener('touchmove', function(e) {
            if (e.touches.length !== 2 || !startDist) return;
            e.preventDefault();
            const [a, b] = e.touches;
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
            const novoZoom = Math.min(Math.max(0.5, startZoom * (dist / startDist)), 4);
            const ratio = novoZoom / startZoom;
            currentZoom = novoZoom;
            atualizarZoomPdf();
            pdfContainer.scrollLeft = Math.max(0, (pinchStartScrollLeft + pinchStartViewportX) * ratio - pinchStartViewportX);
            pdfContainer.scrollTop = Math.max(0, (pinchStartScrollTop + pinchStartViewportY) * ratio - pinchStartViewportY);
        }, {passive: false});
        const finalizarPinch = () => { startDist = 0; startZoom = currentZoom; };
        pdfContainer.addEventListener('touchend', finalizarPinch, {passive: true});
        pdfContainer.addEventListener('touchcancel', finalizarPinch, {passive: true});
    }

    adicionarBlocoOS(); atualizarVisibilidadeCamposPorBloco(); verificarRascunhoPendente();

    const formOs = document.getElementById('osForm');
    if(formOs) {
        formOs.addEventListener('input', () => {
            clearTimeout(timeoutRascunho);
            timeoutRascunho = setTimeout(autoSalvarRascunho, 3000);
        });
    }

    const hHoje = dataLocalISO(); const bhDataEl = document.getElementById('bh_data'); if(bhDataEl) bhDataEl.value = hHoje;
    const mesAtual = hHoje.slice(0, 7); const bhMesInicio = document.getElementById('bh_mes_inicio'); if(bhMesInicio) bhMesInicio.value = mesAtual; const bhMesFim = document.getElementById('bh_mes_fim'); if(bhMesFim) bhMesFim.value = mesAtual;
    
    if (typeof localforage !== 'undefined') {
        const nomeSalvo = await localforage.getItem('bh_nome_tecnico_salvo'); if (nomeSalvo && document.getElementById('bh_nome_tecnico')) document.getElementById('bh_nome_tecnico').value = nomeSalvo;
        const horasSalvas = await localforage.getItem('banco_horas_data'); if (Array.isArray(horasSalvas)) registosBancoHoras = horasSalvas.filter(validarRegistoBancoHoras).map(r => ({...r, balancoFinal: Number(r.balancoFinal)}));
    } else {
        mostrarToast('Armazenamento local indisponível. Salvar e histórico não funcionarão nesta sessão.', true);
    }

    await inicializarAcessoTecnico();
    atualizarResumoDocumento();

    document.getElementById('authFotoInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        try { fotoPerfilTemporaria = await comprimirFotoPerfil(file); renderAvatar(fotoPerfilTemporaria, 'authAvatarImg', 'authAvatarInitials', document.getElementById('authNome').value || 'Técnico'); }
        catch(err) { mostrarToast(err.message, true); } finally { e.target.value = ''; }
    });
    document.getElementById('perfilFotoInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        try { fotoPerfilEdicaoTemporaria = await comprimirFotoPerfil(file); renderAvatar(fotoPerfilEdicaoTemporaria, 'perfilModalImg', 'perfilModalIniciais', document.getElementById('perfilNomeInput').value || perfilTecnicoAtual?.nome); }
        catch(err) { mostrarToast(err.message, true); } finally { e.target.value = ''; }
    });
    document.getElementById('authNome')?.addEventListener('input', e => renderAvatar(fotoPerfilTemporaria, 'authAvatarImg', 'authAvatarInitials', e.target.value));
    document.getElementById('authSenha')?.addEventListener('keydown', e => { if (e.key === 'Enter' && authModo === 'login') submeterAcessoTecnico(); });
    document.addEventListener('click', (e) => { const menu = document.getElementById('menuPerfil'); if (menu && !menu.classList.contains('hidden') && !e.target.closest('.app-top-actions')) fecharMenuPerfil(); });
});

async function autoSalvarRascunho() {
    const clientePreenchido = document.querySelector('[id^="cliente_"]')?.value.trim();
    if (typeof localforage === 'undefined' || document.getElementById('novaOs').classList.contains('hidden') || document.getElementById('lockStatus').textContent.includes('BLOQUEADO') || !clientePreenchido) return;
    try { await localforage.setItem('draft_os', recolherDadosDoFormulario()); document.getElementById('autoSaveIndicator').textContent = `Salvo: ${new Date().toLocaleTimeString('pt-PT')}`; }
    catch(e) { console.error('Falha no auto-salvamento:', e); document.getElementById('autoSaveIndicator').textContent = 'Falha ao salvar rascunho'; }
}

async function verificarRascunhoPendente() {
    const draft = await localforage.getItem('draft_os');
    if(draft && draft.ordens && draft.ordens.length > 0) {
        if(confirm("⚠️ Recuperar trabalho não guardado da última sessão?")) restaurarDadosParaFormulario(draft);
        else await localforage.removeItem('draft_os');
    }
}

function formatarMins(minsTotais) {
    const isNegativo = minsTotais < 0; const absMins = Math.abs(minsTotais); const h = Math.floor(absMins / 60); const m = absMins % 60;
    return `${isNegativo ? '-' : (minsTotais > 0 ? '+' : '')}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function calcularMinsDesvio(horaEntrada, horaSaida, isCredito) {
    const [eH, eM] = horaEntrada.split(':').map(Number); const [sH, sM] = horaSaida.split(':').map(Number);
    let mins = (sH * 60 + sM) - (eH * 60 + eM); if (mins < 0) mins += 1440; return isCredito ? mins : -mins; 
}

async function adicionarRegistoBancoHoras() {
    const data = document.getElementById('bh_data').value; const cliente = document.getElementById('bh_cliente').value; const motivo = document.getElementById('bh_motivo').value; const local = document.getElementById('bh_local').value; const chegada = document.getElementById('bh_chegada').value; const saida = document.getElementById('bh_saida').value; const isCredito = document.getElementById('bh_tipo_credito').checked;
    if(!data || !chegada || !saida) { mostrarToast("Preencha Data e Horários!", true); return; }
    
    const novoReg = { id: Date.now().toString(), data, cliente, motivo, local, chegada, saida, isCredito, balancoFinal: calcularMinsDesvio(chegada, saida, isCredito) };
    registosBancoHoras.push(novoReg); registosBancoHoras.sort((a,b) => new Date(a.data) - new Date(b.data)); await localforage.setItem('banco_horas_data', registosBancoHoras);
    
    document.getElementById('bh_cliente').value = ''; document.getElementById('bh_motivo').value = ''; document.getElementById('bh_local').value = '';
    const mesDoRegisto = data.slice(0, 7); document.getElementById('bh_mes_inicio').value = mesDoRegisto; document.getElementById('bh_mes_fim').value = mesDoRegisto;
    renderTabelaBancoHoras(); mostrarToast("Lançamento efetuado!");
}

async function adicionarDiaCompletoBancoHoras() {
    const data = document.getElementById('bh_data').value; 
    const cliente = document.getElementById('bh_cliente').value; 
    const motivoInput = document.getElementById('bh_motivo').value.trim(); 
    const local = document.getElementById('bh_local').value; 
    const isCredito = document.getElementById('bh_tipo_credito').checked;
    
    if(!data) { mostrarToast("Selecione a Data!", true); return; }
    
    const dateObj = new Date(data + 'T00:00:00');
    const dayOfWeek = dateObj.getDay(); 
    
    let mins = 0; let chegada = "08:00"; let saida = "17:00";
    
    if (dayOfWeek >= 1 && dayOfWeek <= 4) { mins = 540; chegada = "08:00"; saida = "17:00"; } 
    else if (dayOfWeek === 5) { mins = 480; chegada = "08:00"; saida = "16:00"; } 
    else { mostrarToast("Aviso: Fim de semana (Sáb/Dom) considerado 0h.", true); return; }
    
    const balancoFinal = isCredito ? mins : -mins;
    const motivoFinal = motivoInput ? `${motivoInput} (Dia Completo)` : "Dia Completo";
    
    const novoReg = { id: Date.now().toString(), data, cliente, motivo: motivoFinal, local, chegada, saida, isCredito, balancoFinal };
    
    registosBancoHoras.push(novoReg); registosBancoHoras.sort((a,b) => new Date(a.data) - new Date(b.data)); 
    await localforage.setItem('banco_horas_data', registosBancoHoras);
    
    document.getElementById('bh_cliente').value = ''; document.getElementById('bh_motivo').value = ''; document.getElementById('bh_local').value = '';
    const mesDoRegisto = data.slice(0, 7); document.getElementById('bh_mes_inicio').value = mesDoRegisto; document.getElementById('bh_mes_fim').value = mesDoRegisto;
    renderTabelaBancoHoras(); mostrarToast(`Dia completo adicionado (${mins/60}h)!`);
}

async function removerRegistoHora(id) {
    if(!confirm("Apagar este registo?")) return; registosBancoHoras = registosBancoHoras.filter(r => r.id !== id); await localforage.setItem('banco_horas_data', registosBancoHoras); renderTabelaBancoHoras();
}

async function limparTabelaHoras() {
    const inicioVal = document.getElementById('bh_mes_inicio').value; const fimVal = document.getElementById('bh_mes_fim').value; if(!inicioVal || !fimVal) return;
    if(confirm(`Apagar TODOS os registos do período?`)) {
        registosBancoHoras = registosBancoHoras.filter(r => { const mes = r.data.slice(0, 7); return !(mes >= inicioVal && mes <= fimVal); });
        await localforage.setItem('banco_horas_data', registosBancoHoras); renderTabelaBancoHoras(); mostrarToast("Dados apagados.");
    }
}

function renderTabelaBancoHoras() {
    const tbody = document.getElementById('bh_tabela_registos'); 
    const inicioVal = document.getElementById('bh_mes_inicio').value; const fimVal = document.getElementById('bh_mes_fim').value;
    let regsFiltrados = registosBancoHoras;
    
    if (inicioVal && fimVal) regsFiltrados = registosBancoHoras.filter(r => { const m = r.data.slice(0, 7); return m >= inicioVal && m <= fimVal; });
    
    let html = ''; let totalPeriodo = 0;
    
    if(regsFiltrados.length === 0) { 
        html = `<tr><td colspan="5" class="p-6 text-center text-gray-400 font-medium">Nenhum registo encontrado.</td></tr>`; 
    } else {
        regsFiltrados.forEach(reg => {
            totalPeriodo += reg.balancoFinal;
            const textoBalanco = formatarMins(reg.balancoFinal); const corBal = reg.balancoFinal > 0 ? 'text-blue-600' : (reg.balancoFinal < 0 ? 'text-red-600' : 'text-gray-500');
            html += `
            <tr class="hover:bg-blue-50/50 transition-colors">
                <td class="p-4 font-semibold text-gray-700 whitespace-nowrap">${reg.data.split('-').reverse().join('/')}</td>
                <td class="p-4"><div class="font-bold text-gray-900">${escapeHTML(reg.cliente || '-')}</div><div class="text-xs text-gray-500 mt-0.5">${escapeHTML(reg.local || '-')} | ${escapeHTML(reg.motivo || '-')}</div></td>
                <td class="p-4 font-mono text-gray-600 text-center whitespace-nowrap">${reg.chegada} - ${reg.saida}</td>
                <td class="p-4 text-right font-mono font-black ${corBal} text-base whitespace-nowrap">${textoBalanco}</td>
                <td class="p-4 text-center"><button onclick="removerRegistoHora('${reg.id}')" class="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
    
    let totalGlobal = 0; registosBancoHoras.forEach(r => totalGlobal += r.balancoFinal);
    
    const valPeriodoEl = document.getElementById('bh_periodo_horas'); const badgePeriodo = document.getElementById('bh_status_periodo');
    valPeriodoEl.textContent = formatarMins(totalPeriodo);
    
    if(totalPeriodo > 0) { valPeriodoEl.className = "text-4xl font-black font-mono text-blue-400 tracking-tight"; badgePeriodo.textContent = "CRÉDITO"; badgePeriodo.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-900/50 text-blue-400 uppercase tracking-widest border border-blue-800"; } 
    else if (totalPeriodo < 0) { valPeriodoEl.className = "text-4xl font-black font-mono text-red-400 tracking-tight"; badgePeriodo.textContent = "DÉBITO"; badgePeriodo.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-900/50 text-red-400 uppercase tracking-widest border border-red-800"; } 
    else { valPeriodoEl.className = "text-4xl font-black font-mono text-gray-300 tracking-tight"; badgePeriodo.textContent = "NEUTRO"; badgePeriodo.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-gray-700 text-gray-300 uppercase tracking-widest border border-gray-600"; }

    const valTotalEl = document.getElementById('bh_total_horas'); const badgeStatus = document.getElementById('bh_status_saldo'); const cardGlow = document.getElementById('card_global_glow');
    valTotalEl.textContent = formatarMins(totalGlobal);
    cardGlow.classList.remove('shadow-[0_0_20px_rgba(37,99,235,0.3)]', 'shadow-[0_0_20px_rgba(239,68,68,0.3)]', 'border-blue-800', 'border-red-800');
    
    if(totalGlobal > 0) { 
        valTotalEl.className = "text-4xl font-black font-mono text-blue-400 tracking-tight"; badgeStatus.textContent = "A RECEBER"; badgeStatus.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-900/50 text-blue-400 uppercase tracking-widest border border-blue-800"; 
        cardGlow.classList.add('shadow-[0_0_20px_rgba(37,99,235,0.3)]', 'border-blue-800');
    } else if (totalGlobal < 0) { 
        valTotalEl.className = "text-4xl font-black font-mono text-red-400 tracking-tight"; badgeStatus.textContent = "A COMPENSAR"; badgeStatus.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-900/50 text-red-400 uppercase tracking-widest border border-red-800"; 
        cardGlow.classList.add('shadow-[0_0_20px_rgba(239,68,68,0.3)]', 'border-red-800');
    } else { 
        valTotalEl.className = "text-4xl font-black font-mono text-gray-300 tracking-tight"; badgeStatus.textContent = "REGULARIZADO"; badgeStatus.className = "px-2.5 py-1 rounded-md text-[10px] font-bold bg-gray-700 text-gray-300 uppercase tracking-widest border border-gray-600"; 
    }
}

function gerarPdfBancoHoras() {
    if (!window.jspdf?.jsPDF) { mostrarToast("Motor de PDF indisponível. Verifique a ligação ou o cache offline.", true); return; }
    try {
    const inicioVal = document.getElementById('bh_mes_inicio').value; const fimVal = document.getElementById('bh_mes_fim').value;
    let regsFiltrados = registosBancoHoras; let strPeriodo = 'Todos os Registos';
    if (inicioVal && fimVal) { regsFiltrados = registosBancoHoras.filter(r => { const mesRegisto = r.data.slice(0, 7); return mesRegisto >= inicioVal && mesRegisto <= fimVal; }); strPeriodo = `${inicioVal.split('-').reverse().join('/')} a ${fimVal.split('-').reverse().join('/')}`; }
    if(regsFiltrados.length === 0) { mostrarToast("Não há dados.", true); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); let startYHeader = 25;
    if (imgObject && logoImgData) { let ratio = Math.min(45 / imgObject.width, 15 / imgObject.height); doc.addImage(logoImgData, logoImgFormat || 'PNG', 15, 10, imgObject.width * ratio, imgObject.height * ratio); startYHeader = Math.max(25, 10 + (imgObject.height * ratio) + 5); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("RELATÓRIO DE HORAS", 148, 15, { align: "center" }); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Técnico: ${document.getElementById('bh_nome_tecnico').value || 'Não Preenchido'}`, 15, startYHeader); doc.text(`Período: ${strPeriodo}`, 280, startYHeader, { align: "right" });
    let corpoTabela = []; let totalPeriodo = 0; regsFiltrados.forEach(reg => { totalPeriodo += reg.balancoFinal; corpoTabela.push([reg.data.split('-').reverse().join('/'), reg.cliente || '-', reg.motivo || '-', reg.local || '-', `${reg.chegada} - ${reg.saida}`, formatarMins(reg.balancoFinal)]); });
    let totalGlobal = 0; registosBancoHoras.forEach(r => totalGlobal += r.balancoFinal);
    doc.autoTable({ startY: startYHeader + 5, head: [['Data', 'Cliente', 'Motivo', 'Local', 'Período', 'Extra/Falta']], body: corpoTabela, theme: 'grid', headStyles: { fillColor: [16, 185, 129] }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } } });
    let posY = doc.lastAutoTable.finalY + 15; if (posY > 160) { doc.addPage(); posY = 30; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); const textSaldoPeriodo = totalPeriodo >= 0 ? "SALDO PERÍODO (CRÉDITO)" : "SALDO PERÍODO (DÉBITO)"; const colorPer = totalPeriodo >= 0 ? [37, 99, 235] : [239, 68, 68]; doc.setTextColor(...colorPer); doc.text(`${textSaldoPeriodo}: ${formatarMins(totalPeriodo)}`, 15, posY);
    posY += 10; doc.setFontSize(14); const textoSaldo = totalGlobal >= 0 ? "SALDO ACUMULADO (CRÉDITO)" : "SALDO ACUMULADO (DÉBITO)"; const textColor = totalGlobal >= 0 ? [37, 99, 235] : [239, 68, 68]; doc.setTextColor(...textColor); doc.text(`${textoSaldo}: ${formatarMins(totalGlobal)}`, 15, posY);
    doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.line(80, posY + 35, 210, posY + 35); doc.text("ASSINATURA", 145, posY + 40, {align: "center"});
    doc.save(`Horas_${new Date().getTime()}.pdf`);
    } catch (err) {
        console.error('Erro ao gerar folha de ponto:', err);
        mostrarToast('Não foi possível gerar a folha de ponto em PDF.', true);
    }
}

function adicionarFoto(id, source) {
    const fotosAtuais = document.querySelectorAll(`#fotosContainer_${id} .foto-item`).length;
    if (fotosAtuais >= 20) { mostrarToast('Limite atingido.', true); return; }
    if (source === 'camera') { osIdAtualFoto = id; abrirCameraInterna(); } 
    else {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; 
        input.onchange = (e) => { const file = e.target.files[0]; if(!file) return; processarFicheiroImagem(id, file); e.target.value = ''; }; 
        input.click();
    }
}
async function abrirCameraInterna() {
    if (!navigator.mediaDevices?.getUserMedia) { mostrarToast('Câmara não suportada neste navegador ou fora de HTTPS.', true); return; }
    const modal = document.getElementById('modalCameraInterna'); const video = document.getElementById('videoCamera'); modal.classList.remove('hidden'); document.body.style.overflow = 'hidden';
    try { mediaStreamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); video.srcObject = mediaStreamCamera; }
    catch (err) { console.error('Erro ao abrir câmara:', err); mostrarToast('Sem permissão de câmara ou câmara indisponível.', true); fecharCameraInterna(); }
}
function fecharCameraInterna() { if (mediaStreamCamera) { mediaStreamCamera.getTracks().forEach(t => t.stop()); mediaStreamCamera = null; } document.getElementById('modalCameraInterna').classList.add('hidden'); document.body.style.overflow = ''; }
function tirarFotoDoVideo() {
    const video = document.getElementById('videoCamera'); if (!video.srcObject) return;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const MAX_DIM = 900; let w = canvas.width; let h = canvas.height;
    if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
    const finalCanvas = document.createElement('canvas'); finalCanvas.width = w; finalCanvas.height = h;
    const finalCtx = finalCanvas.getContext('2d'); finalCtx.drawImage(canvas, 0, 0, w, h);
    renderFotoItem(osIdAtualFoto, finalCanvas.toDataURL('image/jpeg', 0.65), ''); fecharCameraInterna(); mostrarToast('Capturada com sucesso!');
}
function processarFicheiroImagem(id, file) {
    if (!file?.type?.startsWith('image/')) { mostrarToast('Selecione um ficheiro de imagem válido.', true); return; }
    const objectUrl = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(objectUrl); const canvas = document.createElement('canvas'); const MAX_DIM = 900; let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } } else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
        canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, width, height);
        renderFotoItem(id, canvas.toDataURL("image/jpeg", 0.65), ''); };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); mostrarToast('Não foi possível ler a imagem.', true); };
    img.src = objectUrl;
}
function renderFotoItem(id, base64, desc) {
    if (!dataUrlImagemSegura(base64)) { console.warn('Imagem ignorada: formato inválido.'); return; }
    const div = document.createElement('div'); div.className = "foto-item flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative group";
    div.innerHTML = `
        <input type="hidden" class="foto-b64" value="${base64}">
        <div class="relative w-full aspect-video bg-gray-100">
            <img src="${base64}" class="w-full h-full object-cover">
            <button type="button" onclick="this.closest('.foto-item').remove(); autoSalvarRascunho();" class="absolute top-2 right-2 bg-white/90 text-red-600 p-2 rounded-lg shadow backdrop-blur-sm hover:bg-red-50 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        </div>
        <div class="p-2 border-t border-gray-100">
            <textarea rows="2" placeholder="Descreva a foto (obrigatório para PDF)..." class="foto-desc w-full border-0 p-1 text-xs outline-none resize-none bg-transparent focus:ring-0 text-gray-700 font-medium">${escapeHTML(desc)}</textarea>
        </div>`;
    document.getElementById(`fotosContainer_${id}`).appendChild(div);
    autoSalvarRascunho();
}

function processarAnexo(id, input) {
    const file = input.files[0]; if (!file) { removerAnexo(id); return; }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { mostrarToast('Selecione um PDF válido.', true); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        if (!dataUrlPdfSegura(e.target.result)) { mostrarToast('O ficheiro selecionado não parece ser um PDF válido.', true); removerAnexo(id); return; }
        const b64 = document.getElementById(`anexoBase64_${id}`); if (b64) { b64.value = e.target.result; b64.dataset.filename = file.name; }
        definirNomeAnexo(id, file.name);
        const btn = document.getElementById(`btnRemoverAnexo_${id}`); if (btn) btn.classList.remove('hidden');
        autoSalvarRascunho();
    };
    reader.onerror = () => mostrarToast('Não foi possível ler o PDF anexado.', true);
    reader.readAsDataURL(file); input.value = '';
}
function removerAnexo(id) {
    const input = document.getElementById(`anexoInput_${id}`); if (input) input.value = '';
    const b64 = document.getElementById(`anexoBase64_${id}`); if (b64) { b64.value = ''; delete b64.dataset.filename; }
    const nome = document.getElementById(`anexoNome_${id}`); if (nome) { nome.replaceChildren(); nome.classList.add('hidden'); }
    const btn = document.getElementById(`btnRemoverAnexo_${id}`); if (btn) btn.classList.add('hidden');
    autoSalvarRascunho();
}

function recolherDadosDoFormulario() {
    let dados = { id: documentoAtualId, dataAtualizacao: new Date().toISOString(), tecnico: document.getElementById('tecnico').value, nomeClienteFinal: document.getElementById('nomeClienteFinal').value, cargo: document.getElementById('cargo').value, setor: document.getElementById('setor').value, assinaturaTecnico: padTecnico && !padTecnico.isEmpty() ? padTecnico.toDataURL() : null, assinaturaCliente: padCliente && !padCliente.isEmpty() ? padCliente.toDataURL() : null, ordens: [] };
    document.querySelectorAll('.os-bloco').forEach(b => {
        const id = b.getAttribute('data-id');
        let ordem = {
            cliente: getVal('cliente', id), osNum: getVal('osNum', id), equipamento: getVal('equipamento', id), modelo: getVal('modelo', id), serie: getVal('serie', id), tag: getVal('tag', id),
            cbOrcamento: document.getElementById(`cbOrcamento_${id}`).checked, cbInstalacao: document.getElementById(`cbInstalacao_${id}`).checked, cbServInterno: document.getElementById(`cbServInterno_${id}`).checked, cbServExterno: document.getElementById(`cbServExterno_${id}`).checked, cbGarantia: document.getElementById(`cbGarantia_${id}`).checked, cbMontagemSala: document.getElementById(`cbMontagemSala_${id}`).checked,
            descricao: getVal('descricao', id), pecas: [], liberacaoObs: getVal('liberacaoObs', id), stOk: document.getElementById(`stOk_${id}`).checked, stRes: document.getElementById(`stRes_${id}`).checked, reSim: document.getElementById(`reSim_${id}`).checked, reNao: document.getElementById(`reNao_${id}`).checked,
            dt: getVal('dt', id), hc: getVal('hc', id), hs: getVal('hs', id), th: getVal('th', id), dtInicio: getVal('dtInicio', id), dtFim: getVal('dtFim', id), totalDias: getVal('totalDias', id), 
            anexoBase64: document.getElementById(`anexoBase64_${id}`) ? document.getElementById(`anexoBase64_${id}`).value : null, 
            anexoNome: document.getElementById(`anexoBase64_${id}`)?.dataset.filename || null, 
            fotos: []
        };
        b.querySelectorAll('.peca-row-item').forEach(row => { let q = row.querySelector('.q').value, n = row.querySelector('.n').value, c = row.querySelector('.c').value; if(q || n || c) ordem.pecas.push({ q, n, c }); });
        b.querySelectorAll('.foto-item').forEach(fItem => { ordem.fotos.push({ b64: fItem.querySelector('.foto-b64').value, desc: fItem.querySelector('.foto-desc').value }); });
        dados.ordens.push(ordem);
    }); return dados;
}

function restaurarDadosParaFormulario(doc) {
    desbloquearEdicao(); documentoAtualId = doc.id; document.getElementById('listaOrdensServico').innerHTML = ''; contadorOS = 0;
    if(padTecnico) padTecnico.clear(); if(padCliente) padCliente.clear();
    if(doc.ordens) doc.ordens.forEach(o => adicionarBlocoOS(o)); ['tecnico','nomeClienteFinal','cargo','setor'].forEach(k => document.getElementById(k).value = doc[k] || '');
    switchTab('novaOs'); 
    setTimeout(() => { if(document.getElementById('canvasTecnico') && padTecnico && dataUrlImagemSegura(doc.assinaturaTecnico)) padTecnico.fromDataURL(doc.assinaturaTecnico); if(document.getElementById('canvasCliente') && padCliente && dataUrlImagemSegura(doc.assinaturaCliente)) { padCliente.fromDataURL(doc.assinaturaCliente); bloquearEdicao(); } atualizarVisibilidadeCamposPorBloco(); }, 100);
}

function verificarServicoInternoGlobal() { return Array.from(document.querySelectorAll('.os-bloco')).every(b => document.getElementById(`cbServInterno_${b.getAttribute('data-id')}`).checked); }
function atualizarVisibilidadeCamposPorBloco() {
    document.querySelectorAll('.os-bloco').forEach(b => {
        const id = b.getAttribute('data-id'); const isInterno = document.getElementById(`cbServInterno_${id}`).checked; const isMontagem = document.getElementById(`cbMontagemSala_${id}`).checked;
        const cHoras = document.getElementById(`containerHoras_${id}`); const cDias = document.getElementById(`containerDias_${id}`); const cReagendar = document.getElementById(`containerReagendar_${id}`);
        if (isMontagem) { if(cHoras) cHoras.style.display = 'none'; if(cDias) cDias.style.display = 'grid'; calcDias(id); if(cReagendar) cReagendar.style.display = 'block'; } 
        else if (isInterno) { if(cHoras) cHoras.style.display = 'none'; if(cDias) cDias.style.display = 'grid'; calcDias(id); if(cReagendar) cReagendar.style.display = 'none'; if(document.getElementById(`reNao_${id}`)) document.getElementById(`reNao_${id}`).checked = true; } 
        else { if(cHoras) cHoras.style.display = 'grid'; if(cDias) cDias.style.display = 'none'; if(cReagendar) cReagendar.style.display = 'block'; }
    }); atualizarVisibilidadeClienteGeral(); atualizarResumoDocumento();
}
function atualizarVisibilidadeClienteGeral() {
    const isInterno = verificarServicoInternoGlobal();
    if (document.getElementById('secaoClienteContainer')) { if (isInterno) { document.getElementById('secaoClienteContainer').style.display = 'none'; if(padCliente) padCliente.clear(); } else { document.getElementById('secaoClienteContainer').style.display = 'block'; setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50); } }
}

function abrirModalAssinatura(alvo) {
    alvoAssinaturaAtual = alvo; document.getElementById('tituloModalAssinatura').textContent = alvo === 'tecnico' ? 'Assinatura (Técnico)' : 'Assinatura (Cliente)';
    document.getElementById('modalAssinaturaExpandida').classList.remove('hidden'); document.body.style.overflow = 'hidden';
    setTimeout(() => { if(padExpandido) padExpandido.clear(); resizeCanvasSeguro(document.getElementById('canvasExpandido'), padExpandido, true); const padFonte = alvo === 'tecnico' ? padTecnico : padCliente; if (padExpandido && padFonte && !padFonte.isEmpty()) padExpandido.fromDataURL(padFonte.toDataURL()); }, 50);
}
function fecharModalAssinatura() { document.getElementById('modalAssinaturaExpandida').classList.add('hidden'); document.body.style.overflow = ''; }
function limparPadExpandido() { if(padExpandido) padExpandido.clear(); }
function confirmarAssinaturaExpandida() {
    const padDestino = alvoAssinaturaAtual === 'tecnico' ? padTecnico : padCliente; const canvasEl = alvoAssinaturaAtual === 'tecnico' ? document.getElementById('canvasTecnico') : document.getElementById('canvasCliente');
    if (padExpandido && padDestino) { resizeCanvasSeguro(canvasEl, padDestino, true); if (padExpandido.isEmpty()) { padDestino.clear(); if (alvoAssinaturaAtual === 'cliente') desbloquearEdicao(); } else { padDestino.clear(); padDestino.fromDataURL(padExpandido.toDataURL()); if (alvoAssinaturaAtual === 'cliente') bloquearEdicao(); } } fecharModalAssinatura();
    autoSalvarRascunho();
}

function toggleLock(locked) {
    document.querySelectorAll('#listaOrdensServico input, #listaOrdensServico textarea, #listaOrdensServico button, #tecnico, #nomeClienteFinal, #cargo, #setor, #btnAddOs').forEach(el => { el.disabled = locked; locked ? el.classList.add('opacity-50', 'pointer-events-none') : el.classList.remove('opacity-50', 'pointer-events-none'); });
    if(document.getElementById('lockStatus')) { document.getElementById('lockStatus').textContent = locked ? "BLOQUEADO" : "EDITÁVEL"; document.getElementById('lockStatus').className = locked ? "text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-1 rounded" : "text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded"; }
}
function bloquearEdicao() { toggleLock(true); mostrarToast('Formulário selado pela Assinatura do Cliente.'); }
function desbloquearEdicao() { toggleLock(false); }
function limparAssinatura(pad, isCliente = false) { if(pad) pad.clear(); if(isCliente) desbloquearEdicao(); autoSalvarRascunho(); }

async function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const alvo = document.getElementById(tabId); if (!alvo) return;
    alvo.classList.remove('hidden');

    document.querySelectorAll('.nav-btn, .bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btnNav${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if(activeBtn) activeBtn.classList.add('active');
    const header = document.getElementById('headerContextText');

    if(tabId === 'historico') {
        if (header) header.textContent = 'Histórico de O.S.';
        await carregarHistorico(); atualizarIndicadorArmazenamento();
    } else if (tabId === 'bancoHoras') {
        if (header) header.textContent = 'Banco de Horas';
        document.getElementById('btnNavMenu')?.classList.add('active');
        renderTabelaBancoHoras();
    } else if(tabId === 'novaOs') {
        atualizarResumoDocumento();
        setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasTecnico'), padTecnico); resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50);
    }
    fecharMenuPrincipal();
    window.scrollTo(0, 0);
}

function iniciarNovaOS() {
    documentoAtualId = Date.now().toString(); document.getElementById('listaOrdensServico').innerHTML = ''; contadorOS = 0; 
    if(padTecnico) padTecnico.clear(); if(padCliente) padCliente.clear(); adicionarBlocoOS(); document.getElementById('tecnico').value = perfilTecnicoAtual?.nome || ''; ['nomeClienteFinal','cargo','setor'].forEach(id => document.getElementById(id).value = '');
    desbloquearEdicao(); switchTab('novaOs'); mostrarEtapaDocumento(); atualizarVisibilidadeCamposPorBloco(); localforage.removeItem('draft_os'); if (document.getElementById('buscaHistorico')) document.getElementById('buscaHistorico').value = '';
}

function adicionarBlocoOS(dados = null) {
    contadorOS++; const id = contadorOS; const dataHoje = dataLocalISO(); const osManualValue = dados && dados.osNum ? dados.osNum : '';
    const btnRemover = id > 1 ? `<button type="button" onclick="this.closest('.os-bloco').remove(); atualizarVisibilidadeCamposPorBloco(); autoSalvarRascunho();" class="text-gray-400 hover:text-red-600 transition-colors p-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
    const bloco = document.createElement('div'); bloco.className = "os-bloco bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden relative transition-all"; bloco.setAttribute('data-id', id);
    
    const genToggle = (tid, label, checked, oc = false) => `
        <label class="cursor-pointer relative">
            <input type="checkbox" id="${tid}_${id}" ${checked ? 'checked' : ''} ${oc ? 'onchange="atualizarVisibilidadeCamposPorBloco()"' : ''} class="peer sr-only">
            <div class="px-3 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-sm font-bold peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600 peer-checked:shadow-md transition-all text-center select-none">
                ${label}
            </div>
        </label>`;

    bloco.innerHTML = `
        <div class="bg-gray-800 text-white px-5 py-3 flex justify-between items-center">
            <h3 class="font-bold tracking-wider text-sm uppercase flex items-center gap-2"><svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> O.S. #${id}</h3>
            ${btnRemover}
        </div>
        
        <div class="p-5 space-y-6">
            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Dados Base</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">Cliente / Empresa <span class="text-red-500">*</span></label><input type="text" id="cliente_${id}" required class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 transition font-medium"></div>
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">OS Nº <span class="text-red-500">*</span></label><input type="text" id="osNum_${id}" value="${escapeHTML(osManualValue)}" required placeholder="Ex: 10293" class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 transition font-mono font-bold text-blue-800"></div>
                </div>
            </div>

            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Equipamento</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="col-span-1 md:col-span-2"><label class="block text-xs font-bold text-gray-600 mb-1">Máquina / Equip.</label><input type="text" id="equipamento_${id}" class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"></div>
                    <div class="col-span-1 md:col-span-2"><label class="block text-xs font-bold text-gray-600 mb-1">Modelo</label><input type="text" id="modelo_${id}" class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"></div>
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">Nº Série</label><input type="text" id="serie_${id}" class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"></div>
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">Tag</label><input type="text" id="tag_${id}" class="w-full border border-gray-300 p-2.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"></div>
                </div>
            </div>

            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Natureza do Serviço</h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    ${genToggle('cbOrcamento', 'Orçamento', false)}
                    ${genToggle('cbInstalacao', 'Instalação', false, true)}
                    ${genToggle('cbServInterno', 'Serv. Interno', true, true)}
                    ${genToggle('cbServExterno', 'Serv. Externo', false, true)}
                    ${genToggle('cbGarantia', 'Garantia', false)}
                    ${genToggle('cbMontagemSala', 'Montagem Sala', false, true)}
                </div>
            </div>

            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Detalhes e Liberação</h4>
                <textarea id="descricao_${id}" rows="3" placeholder="Descreva o serviço realizado..." class="w-full border border-gray-300 p-3 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 mb-4"></textarea>
                
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <input type="text" id="liberacaoObs_${id}" value="Liberado para uso, teste operacional ok" class="w-full border border-gray-300 p-2.5 rounded-lg mb-4 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <div class="flex flex-col sm:flex-row gap-6">
                        <div class="flex-1">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Status Operacional</span>
                            <div class="flex p-1 bg-gray-200/80 rounded-lg">
                                <label class="flex-1 text-center cursor-pointer"><input type="radio" name="st_${id}" id="stOk_${id}" checked class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-blue-600 peer-checked:text-white transition-all">OK</div></label>
                                <label class="flex-1 text-center cursor-pointer"><input type="radio" name="st_${id}" id="stRes_${id}" class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-amber-500 peer-checked:text-white transition-all">Restrição</div></label>
                            </div>
                        </div>
                        <div class="flex-1" id="containerReagendar_${id}">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Reagendar Visita</span>
                            <div class="flex p-1 bg-gray-200/80 rounded-lg">
                                <label class="flex-1 text-center cursor-pointer"><input type="radio" name="re_${id}" id="reSim_${id}" class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-amber-500 peer-checked:text-white transition-all">Sim</div></label>
                                <label class="flex-1 text-center cursor-pointer"><input type="radio" name="re_${id}" id="reNao_${id}" checked class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-gray-500 peer-checked:text-white transition-all">Não</div></label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">PEÇA</h4>
                <div id="pecasContainer_${id}" class="space-y-2 mb-3"></div>
                <button type="button" onclick="addPecaRow(${id})" class="text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Nova Peça</button>
            </div>

            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Cronometria</h4>
                <div id="containerHoras_${id}" class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data</label><input type="date" id="dt_${id}" value="${dataHoje}" class="w-full border-0 bg-gray-50 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono"></div>
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chegada</label><input type="time" id="hc_${id}" class="w-full border-0 bg-gray-50 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono" onchange="calcH(${id})"></div>
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Saída</label><input type="time" id="hs_${id}" class="w-full border-0 bg-gray-50 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono" onchange="calcH(${id})"></div>
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Total</label><input type="text" id="th_${id}" class="w-full border-0 bg-gray-100 p-2 rounded text-sm text-blue-700 font-black font-mono text-center" readonly></div>
                </div>

                <div id="containerDias_${id}" class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 border border-gray-200 rounded-lg shadow-sm" style="display:none;">
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data Início</label><input type="date" id="dtInicio_${id}" value="${dataHoje}" class="w-full border-0 bg-gray-50 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono" onchange="calcDias(${id})"></div>
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data Final</label><input type="date" id="dtFim_${id}" value="${dataHoje}" class="w-full border-0 bg-gray-50 p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono" onchange="calcDias(${id})"></div>
                    <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Total Dias</label><input type="text" id="totalDias_${id}" value="1 dia(s)" class="w-full border-0 bg-gray-100 p-2 rounded text-sm text-blue-700 font-black font-mono text-center" readonly></div>
                </div>
            </div>

            <div class="pt-4 border-t border-gray-100">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Evidências Visuais</h4>
                    <div class="flex gap-2">
                        <button type="button" onclick="adicionarFoto(${id}, 'galeria')" class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors flex items-center gap-1">Galeria</button>
                        <button type="button" onclick="adicionarFoto(${id}, 'camera')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow flex items-center gap-1">Câmera</button>
                    </div>
                </div>
                <div id="fotosContainer_${id}" class="grid grid-cols-2 sm:grid-cols-3 gap-4"></div>

                <div class="mt-6 flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded-lg">
                    <span class="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg> PDF Anexo (Extra)</span>
                    <label class="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-bold cursor-pointer hover:bg-gray-100 shadow-sm text-gray-700">
                        Selecionar PDF
                        <input type="file" id="anexoInput_${id}" accept=".pdf" onchange="processarAnexo(${id}, this)" class="hidden">
                    </label>
                </div>
                <input type="hidden" id="anexoBase64_${id}">
                <div class="flex items-center justify-between mt-2">
                    <div id="anexoNome_${id}" class="text-xs text-blue-600 font-bold hidden"></div>
                    <button type="button" id="btnRemoverAnexo_${id}" onclick="removerAnexo(${id})" class="text-xs text-red-500 font-bold hidden hover:underline">Remover</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('listaOrdensServico').appendChild(bloco);
    transformarBlocoEmCardMockup(bloco, id);

    if (dados) {
        ['cliente','equipamento','modelo','serie','tag','descricao','liberacaoObs','dt','hc','hs','th','dtInicio','dtFim','totalDias'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).value = dados[k] || ''; });
        ['cbOrcamento','cbInstalacao','cbServInterno','cbServExterno','cbGarantia','stOk','stRes','reSim','reNao'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).checked = !!dados[k]; });
        if(document.getElementById(`cbMontagemSala_${id}`)) document.getElementById(`cbMontagemSala_${id}`).checked = dados.cbMontagemSala !== undefined ? !!dados.cbMontagemSala : !!dados.cbSemGarantia;
        if (dados.anexoBase64 && dataUrlPdfSegura(dados.anexoBase64)) { const b64 = document.getElementById(`anexoBase64_${id}`); b64.value = dados.anexoBase64; let nomeAnexo = dados.anexoNome ? String(dados.anexoNome).replace(/^Anexado:\s*/i, '').trim() : ''; if (/^Anexado$/i.test(nomeAnexo)) nomeAnexo = ''; if (nomeAnexo) b64.dataset.filename = nomeAnexo; definirNomeAnexo(id, nomeAnexo); document.getElementById(`btnRemoverAnexo_${id}`).classList.remove('hidden'); }
        if(dados.pecas && dados.pecas.length > 0) dados.pecas.forEach(p => { 
            const pContainer = document.getElementById(`pecasContainer_${id}`); 
            const row = document.createElement('div'); 
            row.className = "flex items-center gap-1 sm:gap-2 peca-row-item mb-2"; 
            row.innerHTML = `
                <input type="number" min="0" max="99" oninput="if(this.value.length>2)this.value=this.value.slice(0,2); this.value = Math.abs(this.value)" placeholder="Qtd" value="${escapeHTML(p.q)}" class="w-12 min-w-0 border border-gray-300 px-1 py-2 rounded-lg text-xs sm:text-sm q bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 text-center font-bold">
                <input type="text" list="dbNomesPecas" onchange="autoPreencherPeca(this, 'nome')" placeholder="Nome da Peça" value="${escapeHTML(p.n)}" class="flex-1 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm n bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500">
                <input type="text" list="dbCodigosPecas" onchange="autoPreencherPeca(this, 'codigo')" maxlength="25" placeholder="Código" value="${escapeHTML(p.c)}" class="w-28 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm c bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center">
            `; 
            pContainer.appendChild(row); 
        }); else { addPecaRow(id); addPecaRow(id); }
        if(dados.fotos && dados.fotos.length > 0) dados.fotos.forEach(f => renderFotoItem(id, f.b64, f.desc));
    } else { addPecaRow(id); addPecaRow(id); }
    atualizarVisibilidadeCamposPorBloco();
    atualizarResumoOS(id);
    atualizarResumoDocumento();
}

function addPecaRow(id) {
    const container = document.getElementById(`pecasContainer_${id}`); const row = document.createElement('div'); 
    row.className = "flex items-center gap-1 sm:gap-2 peca-row-item mb-2";
    row.innerHTML = `
        <input type="number" min="0" max="99" oninput="if(this.value.length>2)this.value=this.value.slice(0,2); this.value = Math.abs(this.value)" placeholder="Qtd" class="w-12 min-w-0 border border-gray-300 px-1 py-2 rounded-lg text-xs sm:text-sm q bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 text-center font-bold">
        <input type="text" list="dbNomesPecas" onchange="autoPreencherPeca(this, 'nome')" placeholder="Nome da Peça" class="flex-1 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm n bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500">
        <input type="text" list="dbCodigosPecas" onchange="autoPreencherPeca(this, 'codigo')" maxlength="25" placeholder="Código" class="w-28 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm c bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center">
    `; 
    container.appendChild(row);
}

function calcH(id) {
    const hc = document.getElementById(`hc_${id}`).value, hs = document.getElementById(`hs_${id}`).value; const elTh = document.getElementById(`th_${id}`);
    if(!elTh) return;
    if(hc && hs) { let [ch, cm] = hc.split(':').map(Number), [sh, sm] = hs.split(':').map(Number); let t = (sh*60+sm) - (ch*60+cm); if(t < 0) t += 1440; elTh.value = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
    else { elTh.value = ''; }
}
function calcDias(id) {
    let diffDays = Math.round((new Date(document.getElementById(`dtFim_${id}`).value) - new Date(document.getElementById(`dtInicio_${id}`).value)) / (1000 * 60 * 60 * 24)) + 1;
    document.getElementById(`totalDias_${id}`).value = `${isNaN(diffDays) || diffDays < 1 ? 1 : diffDays} dia(s)`;
}
function validarCamposObrigatorios() {
    let valido = true; document.querySelectorAll('.ring-2.ring-red-500').forEach(el => el.classList.remove('ring-2', 'ring-red-500'));
    const blocos = document.querySelectorAll('.os-bloco'); if(blocos.length === 0) return false;
    blocos.forEach(b => { const id = b.getAttribute('data-id'); const cCliente = document.getElementById(`cliente_${id}`); const cOsNum = document.getElementById(`osNum_${id}`);
        if (!cCliente.value.trim()) { cCliente.classList.add('ring-2', 'ring-red-500'); valido = false; }
        if (!cOsNum.value.trim()) { cOsNum.classList.add('ring-2', 'ring-red-500'); valido = false; } });
    document.querySelectorAll('.foto-desc').forEach(el => { if(!el.value.trim()) { el.closest('.foto-item').classList.add('ring-2', 'ring-red-500'); valido = false; } });
    return valido;
}
async function salvarDocumento(silencioso = false) {
    const btnSalvar = document.getElementById('btnSalvarOs');
    if (!silencioso && btnSalvar && btnSalvar.disabled) return false; if (!silencioso && btnSalvar) btnSalvar.disabled = true;
    if (!silencioso && !validarCamposObrigatorios()) { mostrarToast('Preencha os campos em vermelho.', true); if (btnSalvar) btnSalvar.disabled = false; return false; }
    if (typeof localforage === 'undefined') { if(!silencioso) mostrarToast('Armazenamento local indisponível.', true); if (btnSalvar) btnSalvar.disabled = false; return false; }
    let dados = null; let documentoAnterior = null; let historicoAnterior = null;
    try {
        await aprenderPecasDaOS();
        dados = recolherDadosDoFormulario();
        documentoAnterior = await localforage.getItem(`os_doc_${dados.id}`);
        historicoAnterior = await obterHistoricoSalvo();
        await localforage.setItem(`os_doc_${dados.id}`, dados);
        const historicoMeta = [...historicoAnterior]; const meta = gerarMetadadosResumo(dados);
        const index = historicoMeta.findIndex(d => d.id === dados.id); if(index >= 0) historicoMeta[index] = meta; else historicoMeta.unshift(meta);
        if(!await gravarHistoricoSalvo(historicoMeta)) throw new Error('Falha ao atualizar índice do histórico.');
        await localforage.removeItem('draft_os');
        if(!silencioso) { mostrarToast('Salvo com sucesso!'); await carregarHistorico(); }
        return true;
    } catch(e) {
        console.error('Erro ao salvar documento:', e);
        if (dados && historicoAnterior) {
            try {
                if (documentoAnterior === null || documentoAnterior === undefined) await localforage.removeItem(`os_doc_${dados.id}`); else await localforage.setItem(`os_doc_${dados.id}`, documentoAnterior);
                await localforage.setItem('historico_os', historicoAnterior);
            } catch (rollbackErr) { console.error('Falha no rollback do salvamento:', rollbackErr); }
        }
        if(!silencioso) mostrarToast('Erro ao salvar. Os dados anteriores foram preservados quando possível.', true);
        return false;
    } finally {
        if (!silencioso && btnSalvar) btnSalvar.disabled = false;
    }
}

function filtrarHistorico() { const termo = document.getElementById('buscaHistorico').value.toLowerCase(); document.querySelectorAll('.historico-item').forEach(item => { item.style.display = item.innerText.toLowerCase().includes(termo) ? '' : 'none'; }); }

async function carregarHistorico() {
    const list = document.getElementById('historicoList'); let historicoMeta = await obterHistoricoSalvo();
    historicoMeta = Array.isArray(historicoMeta) ? historicoMeta.filter(doc => doc && idLocalSeguro(doc.id)) : [];
    if(historicoMeta.length === 0) return list.innerHTML = '<div class="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500 font-medium">Nenhum documento salvo.</div>';
    
    list.innerHTML = historicoMeta.map(doc => `
    <div class="historico-item bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all">
        <div class="flex-1">
            <h3 class="font-black text-gray-900 text-lg mb-1">${escapeHTML(doc.clienteEmpresa || doc.nomeClienteFinal || 'Desconhecido')}</h3>
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 font-medium">
                <span class="flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> OS #${escapeHTML(doc.osNumResumo || 'N/A')}</span>
                <span class="text-gray-300">|</span>
                <span class="flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> ${escapeHTML(doc.equipamentoResumo || 'Diversos')}</span>
            </div>
            <p class="text-[10px] text-gray-400 mt-2 uppercase tracking-widest">${doc.dataAtualizacao ? new Date(doc.dataAtualizacao).toLocaleString('pt-PT') : ''}</p>
        </div>
        <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
            <button onclick="apagarDocumento('${doc.id}')" class="p-3 bg-white text-gray-400 hover:text-red-600 border border-gray-200 rounded-lg shadow-sm transition-colors flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            <button onclick="carregarDocumentoParaEdicao('${doc.id}')" class="flex-1 md:w-32 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-colors text-sm uppercase tracking-wide text-center">Abrir</button>
        </div>
    </div>`).join(''); filtrarHistorico();
}

async function carregarDocumentoParaEdicao(id) {
    let doc = await localforage.getItem(`os_doc_${id}`); if(!doc) { let histAntigo = await localforage.getItem('historico_os') || []; doc = histAntigo.find(d => d.id === id); if (doc && !doc.ordens) doc = null; }
    if(!doc) { mostrarToast('Erro: Não encontrado.', true); return; }
    restaurarDadosParaFormulario(doc); mostrarToast('Carregado.');
}
async function apagarDocumento(id) { if(!confirm("Apagar documento permanentemente?")) return; let historicoMeta = await obterHistoricoSalvo(); await gravarHistoricoSalvo(historicoMeta.filter(d => d.id !== id)); await localforage.removeItem(`os_doc_${id}`); if(id === documentoAtualId) iniciarNovaOS(); await carregarHistorico(); }

function atualizarProgressoPDF(percentual, texto) {
    const overlay = document.getElementById('pdfProgressOverlay'); const barra = document.getElementById('pdfProgressBar'); const txt = document.getElementById('pdfProgressText'); const percent = document.getElementById('pdfProgressPercent'); overlay.classList.remove('hidden'); barra.style.width = percentual + '%'; txt.textContent = texto; percent.textContent = Math.round(percentual) + '%'; if (percentual >= 100) setTimeout(() => overlay.classList.add('hidden'), 800);
}

async function construirPDFBytes(onProgressCallback) {
    if (!validarCamposObrigatorios()) throw new Error("Preencha os campos obrigatórios!");
    if (!dependenciasPdfDisponiveis(false)) throw new Error("Bibliotecas de PDF indisponíveis. Verifique a ligação ou o cache offline.");
    const reportProgress = async (pct, txt) => { if(onProgressCallback) { onProgressCallback(pct, txt); await new Promise(r => setTimeout(r, 15)); } };
    await reportProgress(5, "A iniciar motor PDF...");
    const blocosOS = document.querySelectorAll('.os-bloco'); const isServicoInterno = verificarServicoInternoGlobal(); const cb = (eid) => document.getElementById(eid).checked ? "[X]" : "[ ]";
    const { jsPDF } = window.jspdf; const { PDFDocument, rgb, StandardFonts } = window.PDFLib; const masterPdf = await PDFDocument.create();
    let finalW = 0, finalH = 0; if (imgObject && logoImgData) { let ratio = Math.min(45 / imgObject.width, 15 / imgObject.height); finalW = imgObject.width * ratio; finalH = imgObject.height * ratio; }
    const margemTopoSegura = Math.max(35, 10 + finalH + 5);
    await reportProgress(10, "A compilar formulários...");
    for (let idx = 0; idx < blocosOS.length; idx++) {
        let basePct = 10 + (idx / blocosOS.length) * 75; await reportProgress(basePct, `A processar OS ${idx + 1} de ${blocosOS.length}...`);
        const b = blocosOS[idx]; const id = b.getAttribute('data-id'); const docOS = new jsPDF();
        docOS.setFont("helvetica", "bold"); docOS.setFontSize(13); docOS.text("RELATÓRIO DE ORDEM DE SERVIÇO", 105, 18, { align: "center" });
        let cy = Math.max(30, 10 + finalH + 6); docOS.setFontSize(9); docOS.setFont("helvetica", "normal");
        docOS.text(`CLIENTE: ${truncarStr(getVal('cliente', id), 45)}`, 15, cy); docOS.text(`OS Nº: ${truncarStr(getVal('osNum', id), 20)}`, 140, cy);
        cy += 6; docOS.text(`EQUIP: ${truncarStr(getVal('equipamento', id), 45)}`, 15, cy); docOS.text(`MODELO: ${truncarStr(getVal('modelo', id), 25)}`, 140, cy);
        cy += 6; docOS.text(`SÉRIE: ${truncarStr(getVal('serie', id), 45)}`, 15, cy); docOS.text(`TAG: ${truncarStr(getVal('tag', id), 25)}`, 140, cy);
        cy += 8; docOS.text(`${cb('cbOrcamento_'+id)} ORÇAMENTO`, 15, cy); docOS.text(`${cb('cbInstalacao_'+id)} INSTALAÇÃO`, 65, cy); docOS.text(`${cb('cbServInterno_'+id)} SERV INTERNO`, 115, cy);
        cy += 6; docOS.text(`${cb('cbGarantia_'+id)} GARANTIA`, 15, cy); docOS.text(`${cb('cbMontagemSala_'+id)} MONTAGEM SALA`, 65, cy); docOS.text(`${cb('cbServExterno_'+id)} SERV EXTERNO`, 115, cy);
        cy += 8; docOS.setFont("helvetica", "bold"); docOS.text("DESCRIÇÃO", 15, cy); docOS.setFont("helvetica", "normal"); cy += 4; 
        docOS.autoTable({ startY: cy, margin: { left: 15, right: 15, top: margemTopoSegura, bottom: 20 }, body: [[getVal('descricao', id) || ' ']], theme: 'plain', styles: { lineWidth: 0.2, lineColor: [150, 150, 150], textColor: [0, 0, 0], fontSize: 9, cellPadding: 4, valign: 'middle' } });
        cy = docOS.lastAutoTable.finalY + 8; if (cy > 270) { docOS.addPage(); cy = margemTopoSegura; }
        docOS.setFont("helvetica", "bold"); docOS.text("PEÇAS", 15, cy); cy+=4; let tb = []; const pRows = b.querySelectorAll('.peca-row-item');
        for(let i=0; i<pRows.length; i+=2) { let r1=pRows[i], r2=pRows[i+1]; let r1q=r1.querySelector('.q').value, r1n=r1.querySelector('.n').value, r1c=r1.querySelector('.c').value; let r2q=r2?r2.querySelector('.q').value:'', r2n=r2?r2.querySelector('.n').value:'', r2c=r2?r2.querySelector('.c').value:''; if(r1q||r1n||r1c||r2q||r2n||r2c) tb.push([r1q, r1n, r1c, '', r2q, r2n, r2c]); }
        if(tb.length===0) tb.push(['','','','','','','']);
        docOS.autoTable({ startY: cy, margin: { left: 15, right: 15, top: margemTopoSegura, bottom: 20 }, theme: 'grid', styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.2, lineColor: [150, 150, 150] }, headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] }, head: [['Qtd', 'Nome', 'Cód', '', 'Qtd', 'Nome', 'Cód']], body: tb, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 50 }, 2: { cellWidth: 28 }, 3: { cellWidth: 4 }, 4: { cellWidth: 10 }, 5: { cellWidth: 50 }, 6: { cellWidth: 28 } }, didDrawCell: function(data) { if (data.column.index === 3) { docOS.setFillColor(255, 255, 255); docOS.rect(data.cell.x, data.cell.y - 0.5, data.cell.width, data.cell.height + 1, 'F'); } } });
        cy = docOS.lastAutoTable.finalY + 6; if (cy > 250) { docOS.addPage(); cy = margemTopoSegura; }
        docOS.setFont("helvetica", "bold"); docOS.text("LIBERAÇÃO", 15, cy); docOS.setFont("helvetica", "normal");
        cy+=4; let obsText = `OBS: ${getVal('liberacaoObs', id)}`; let obsLines = docOS.splitTextToSize(obsText, 180); docOS.text(obsLines, 15, cy); cy += (obsLines.length * 4) + 2;
        docOS.text(`Status: ${cb('stOk_'+id)} OK  ${cb('stRes_'+id)} RESTRIÇÃO`, 15, cy); 
        const isItemMontagem = document.getElementById(`cbMontagemSala_${id}`).checked; const isItemInterno = document.getElementById(`cbServInterno_${id}`).checked;
        if (cy > 270) { docOS.addPage(); cy = margemTopoSegura; }
        if (isItemMontagem) { docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy); cy+=8; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy); } 
        else if (!isItemInterno) { docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy); cy+=10; docOS.text(`DATA: ${getVal('dt', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`CHEGADA: ${getVal('hc', id)}`, 75, cy); docOS.text(`SAÍDA: ${getVal('hs', id)}`, 140, cy); cy+=6; docOS.text(`TOTAL HORAS: ${getVal('th', id)}`, 15, cy); } 
        else { cy+=10; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy); }
        const fotoItems = document.getElementById(`fotosContainer_${id}`).querySelectorAll('.foto-item');
        if (fotoItems.length > 0) {
            cy += 12; if (cy > 260) { docOS.addPage(); cy = margemTopoSegura; } docOS.setFont("helvetica", "bold"); docOS.setFontSize(10); docOS.text("EVIDÊNCIAS FOTOGRÁFICAS", 15, cy); cy += 8;
            let col = 0; let maxRowH = 0; let startY = cy;
            for(let f = 0; f < fotoItems.length; f++) {
                let fotoPct = basePct + ((f / fotoItems.length) * (75 / blocosOS.length) * 0.7); await reportProgress(fotoPct, `Anexando foto ${f + 1} de ${fotoItems.length} (OS ${idx + 1})...`);
                if (col === 0 && startY > 195) { docOS.addPage(); startY = margemTopoSegura; }
                const fItem = fotoItems[f]; const base64 = fItem.querySelector('.foto-b64').value; const desc = fItem.querySelector('.foto-desc').value;
                const imgProps = await new Promise((resolve) => { 
                    const i = new Image(); 
                    i.onload = () => resolve({ w: i.width, h: i.height }); 
                    i.onerror = () => resolve({ w: 1, h: 1 });
                    i.src = base64; 
                });
                let renderW = 85; let renderH = (imgProps.h / imgProps.w) * 85; if (renderH > 65) { renderH = 65; renderW = (imgProps.w / imgProps.h) * 65; }
                let boxX = col === 0 ? 15 : 110; let imgX = boxX + (85 - renderW) / 2;
                docOS.addImage(base64, base64.includes('image/png') ? 'PNG' : 'JPEG', imgX, startY, renderW, renderH);
                docOS.setFont("helvetica", "normal"); docOS.setFontSize(8); const textLines = docOS.splitTextToSize(desc, 85); let textY = startY + renderH + 5; docOS.text(textLines, boxX, textY);
                let totalElementH = renderH + 5 + (textLines.length * 3.5); if (totalElementH > maxRowH) maxRowH = totalElementH;
                col++; if (col === 2 || f === fotoItems.length - 1) { col = 0; startY += maxRowH + 10; maxRowH = 0; }
            } cy = startY;
        }
        const paginasDestaOS = docOS.internal.getNumberOfPages();
        for (let i = 1; i <= paginasDestaOS; i++) { docOS.setPage(i); if (imgObject && logoImgData) docOS.addImage(logoImgData, logoImgFormat || 'PNG', 15, 10, finalW, finalH); }
        const osBuffer = docOS.output('arraybuffer'); const osPdfLib = await PDFDocument.load(osBuffer);
        const osPages = await masterPdf.copyPages(osPdfLib, osPdfLib.getPageIndices()); osPages.forEach((p) => masterPdf.addPage(p));
        const anexoB64 = getVal('anexoBase64', id);
        if (anexoB64) { 
            try { 
                const binaryStr = atob(anexoB64.split(',')[1]); 
                const bytes = new Uint8Array(binaryStr.length); 
                for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); } 
                const anexoPdf = await PDFDocument.load(bytes); 
                const anexoPages = await masterPdf.copyPages(anexoPdf, anexoPdf.getPageIndices()); 
                anexoPages.forEach((p) => masterPdf.addPage(p)); 
            } catch (e) {
                mostrarToast(`Aviso: O PDF Anexo da OS #${id} não pôde ser incorporado.`, true);
            } 
        }
    }
    await reportProgress(88, "A gerar secção de assinaturas...");
    const docSig = new jsPDF();
    if (imgObject && logoImgData) docSig.addImage(logoImgData, logoImgFormat || 'PNG', 15, 10, finalW, finalH); let fy = Math.max(35, 10 + finalH + 10);
    docSig.setFont("helvetica", "bold"); docSig.setFontSize(12); docSig.text(isServicoInterno ? "ASSINATURA DO TÉCNICO" : "ASSINATURAS GERAIS", 105, 20, {align:"center"});
    docSig.setFontSize(9); docSig.setFont("helvetica", "normal"); docSig.text("Este documento consolida as OS, as evidências visuais e aprova os serviços executados.", 15, fy); fy+=25; 
    if (isServicoInterno) {
        docSig.line(60, fy+15, 150, fy+15); if(padTecnico && !padTecnico.isEmpty()) docSig.addImage(padTecnico.toDataURL(), 'PNG', 75, fy-8, 60, 20);
        fy+=18; docSig.text("TÉCNICO RESPONSÁVEL", 105, fy, {align:"center"}); fy+=8; docSig.text(`Nome: ${document.getElementById('tecnico').value || 'Não preenchido'}`, 60, fy);
    } else {
        docSig.line(15, fy+15, 95, fy+15); docSig.line(110, fy+15, 195, fy+15);
        if(padTecnico && !padTecnico.isEmpty()) docSig.addImage(padTecnico.toDataURL(), 'PNG', 25, fy-8, 50, 20);
        if(padCliente && !padCliente.isEmpty()) docSig.addImage(padCliente.toDataURL(), 'PNG', 120, fy-8, 50, 20);
        fy+=18; docSig.text("TÉCNICO", 40, fy); docSig.text("CLIENTE", 140, fy);
        fy+=8; docSig.text(`Nome: ${document.getElementById('tecnico').value || 'Não preenchido'}`, 15, fy); 
        let pId = document.querySelector('.os-bloco').getAttribute('data-id'); docSig.text(`Empresa: ${getVal('cliente', pId).trim() || 'Empresa não informada'}`, 110, fy); fy += 5; docSig.text(`Nome: ${document.getElementById('nomeClienteFinal').value}`, 110, fy);
        let cargoCli = document.getElementById('cargo').value.trim(); let setorCli = document.getElementById('setor').value.trim();
        if (cargoCli || setorCli) { let infoCli = []; if (cargoCli) infoCli.push(`Cargo: ${cargoCli}`); if (setorCli) infoCli.push(`Setor: ${setorCli}`); fy += 5; docSig.setFontSize(8); docSig.setTextColor(100, 100, 100); docSig.text(infoCli.join(' | '), 110, fy); docSig.setTextColor(0, 0, 0); }
        fy+=20; docSig.setFontSize(8); docSig.setFont("helvetica", "italic"); docSig.text("Obs: a assinatura deste relatório implica na aceitação dos serviços executados e posterior cobrança.", 105, fy, {align: "center"});
    }
    const sigBuffer = docSig.output('arraybuffer'); const sigPdfLib = await PDFDocument.load(sigBuffer); const sigPages = await masterPdf.copyPages(sigPdfLib, sigPdfLib.getPageIndices()); sigPages.forEach((p) => masterPdf.addPage(p));
    await reportProgress(95, "A finalizar compressão e empacotamento...");
    const fonteNormal = await masterPdf.embedFont(StandardFonts.Helvetica); const todasAsPaginas = masterPdf.getPages();
    const textoAuditoria = `Documento gerado eletronicamente por ${document.getElementById('tecnico').value || "Não Identificado"} em ${new Date().toLocaleDateString('pt-PT')}.`;
    todasAsPaginas.forEach((pagina, idx) => { const { width } = pagina.getSize(); pagina.drawText(textoAuditoria, { x: 15, y: 15, size: 6, font: fonteNormal, color: rgb(0.6, 0.6, 0.6) }); const textoPags = `Página ${idx + 1} de ${todasAsPaginas.length}`; pagina.drawText(textoPags, { x: width - fonteNormal.widthOfTextAtSize(textoPags, 8) - 15, y: 15, size: 8, font: fonteNormal, color: rgb(0.5, 0.5, 0.5) }); });
    const finalPDF = await masterPdf.save(); await reportProgress(100, "Concluído!"); return finalPDF;
}

async function preVisualizarPDF() {
    const btn = document.getElementById('btnPreview'); if (btn.disabled) return;
    try {
        btn.disabled = true;
        if (!dependenciasPdfDisponiveis(true)) throw new Error("Bibliotecas de pré-visualização indisponíveis. Verifique a ligação ou o cache offline.");
        const bytesPdf = await construirPDFBytes(atualizarProgressoPDF);
        if(objUrlPreview) URL.revokeObjectURL(objUrlPreview); const blob = new Blob([bytesPdf], { type: 'application/pdf' }); objUrlPreview = URL.createObjectURL(blob);
        const primeiraOs = document.querySelector('.os-bloco'); let pOs = 'Rascunho', pCliente = 'Cliente'; if(primeiraOs) { const pId = primeiraOs.getAttribute('data-id'); pOs = getVal('osNum', pId).trim() || 'Rascunho'; pCliente = getVal('cliente', pId).trim() || 'Cliente'; }
        document.getElementById('linkPreviewExt').download = `Pre_Visualizacao_${pOs.replace(/[^a-z0-9]/gi, '_')}_${pCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`; document.getElementById('linkPreviewExt').href = objUrlPreview; 
        const pdf = await pdfjsLib.getDocument({data: bytesPdf}).promise; const wrapper = document.getElementById('pdfPagesWrapper'); const container = document.getElementById('pdfRenderContainer'); wrapper.replaceChildren(); currentZoom = 1;
        for(let num = 1; num <= pdf.numPages; num++) { const page = await pdf.getPage(num); const viewport = page.getViewport({scale: window.innerWidth > 600 ? 2.0 : 1.8}); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.height = viewport.height; canvas.width = viewport.width; canvas.className = 'pdf-page-canvas bg-white shadow-xl border border-gray-300'; await page.render({canvasContext: ctx, viewport: viewport}).promise; wrapper.appendChild(canvas); }
        atualizarZoomPdf(); if (container) { container.scrollLeft = 0; container.scrollTop = 0; } document.getElementById('modalPreviewPDF').classList.remove('hidden');
    } catch (err) { mostrarToast(err.message || 'Erro ao pre-visualizar.', true); document.getElementById('pdfProgressOverlay').classList.add('hidden'); } finally { btn.disabled = false; }
}

function fecharPreviewPDF() {
    document.getElementById('modalPreviewPDF').classList.add('hidden');
    const wrapper = document.getElementById('pdfPagesWrapper'); if (wrapper) wrapper.replaceChildren();
    if (objUrlPreview) { URL.revokeObjectURL(objUrlPreview); objUrlPreview = null; }
    const link = document.getElementById('linkPreviewExt'); if (link) link.removeAttribute('href');
    currentZoom = 1; startDist = 0;
}

async function gerarPDFConsolidado() {
    const btn = document.getElementById('btnGerarPdf'); const btnTxt = document.getElementById('btnTxt'); if(btn.disabled) return;
    try {
        btn.disabled = true; btnTxt.innerText = "A SALVAR...";
        if(!await salvarDocumento(false)) { btn.disabled = false; btnTxt.innerText = "Gerar PDF & Partilhar"; return; }
        const bytesPdfFinal = await construirPDFBytes(atualizarProgressoPDF);
        const pId = document.querySelector('.os-bloco').getAttribute('data-id'); const pOs = getVal('osNum', pId).trim(); const pCliente = getVal('cliente', pId).trim();
        const nomeFicheiro = `${pOs.replace(/[^a-z0-9]/gi, '_')}_${pCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        const blob = new Blob([bytesPdfFinal], { type: 'application/pdf' }); const ficheiroPdf = new File([blob], nomeFicheiro, { type: "application/pdf" });
        if(urlDownloadGerado) URL.revokeObjectURL(urlDownloadGerado); urlDownloadGerado = URL.createObjectURL(blob);
        if (navigator.canShare && navigator.canShare({ files: [ficheiroPdf] })) {
            try { await navigator.share({ title: `Ordem de Serviço ${pOs}`, text: `Segue em anexo a Ordem de Serviço ${pOs} referente a ${pCliente}.`, files: [ficheiroPdf] }); mostrarToast('Partilhado!'); } 
            catch(err) { const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); mostrarToast('Transferido!'); }
        } else { const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); mostrarToast('Transferido!'); }
    } catch (err) { mostrarToast(err.message || 'Erro ao gerar.', true); document.getElementById('pdfProgressOverlay').classList.add('hidden'); } finally { btn.disabled = false; btnTxt.innerText = "Gerar PDF & Partilhar"; }
}
