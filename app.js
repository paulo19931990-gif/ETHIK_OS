if (typeof localforage !== 'undefined') {
    localforage.config({ name: 'MultiOSProDB', storeName: 'app_data', description: 'Armazenamento offline robusto' });
} else {
    console.warn("Aviso: localforage indisponível. Cache offline falhou.");
}

// === ESTADO GLOBAL DA O.S. (Novo Padrão Arquitetural) ===
let osState = {
    status: 'EDITAVEL', // 'EDITAVEL' ou 'SELADO'
    fotosTemp: {} // Estrutura: { idFoto: { blob, w, h, desc, url, osId } }
};

let documentoAtualId = Date.now().toString();
let logoImgData = null, logoImgFormat = 'PNG', imgObject = null;
let urlDownloadGerado = null; 
let objUrlPreview = null;
let padTecnico, padCliente, padExpandido, alvoAssinaturaAtual = null;

let currentZoom = 1, startZoom = 1, startDist = 0;
let registosBancoHoras = [];
let contadorOS = 0;

let mediaStreamCamera = null;
let osIdAtualFoto = null;
let debounceTimeout = null;

// === MAPAS PARA BUSCA O(1) DE PEÇAS ===
let bancoPecas = [];
let pecasPorCodigo = new Map();
let pecasPorNome = new Map();

const truncarStr = (str, max) => (str && str.length > max) ? str.substring(0, max - 3) + '...' : (str || '');
const getVal = (campo, id) => document.getElementById(`${campo}_${id}`) ? document.getElementById(`${campo}_${id}`).value : '';

const signatureOptions = { minWidth: 0.5, maxWidth: 1.5, penColor: "rgb(15,23,42)", backgroundColor: "rgba(255,255,255,0)" };

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function mostrarToast(mensagem, isErro = false) {
    const toast = document.getElementById('toast'); document.getElementById('toastMsg').textContent = mensagem;
    if(isErro) { toast.classList.remove('bg-gray-900'); toast.classList.add('bg-red-600'); } else { toast.classList.remove('bg-red-600'); toast.classList.add('bg-gray-900'); }
    toast.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => toast.classList.add('opacity-0', 'translate-y-4'), 4000); 
}

function bibliotecasPdfProntas() {
    if (typeof window.jspdf === 'undefined' || typeof window.PDFLib === 'undefined') {
        mostrarToast('As bibliotecas de PDF não carregaram.', true);
        return false;
    }
    return true;
}

// === SISTEMA DE IMAGENS EFICIENTE (BLOBs em vez de Base64 no DOM) ===
const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

function adicionarFotoAoEstado(idOS, blob, w, h, desc = '', fallbackBase64 = null) {
    if (osState.status === 'SELADO') return;
    const idFoto = 'foto_' + Date.now().toString() + Math.random().toString(36).substring(7);
    const objUrl = blob ? URL.createObjectURL(blob) : fallbackBase64;
    
    osState.fotosTemp[idFoto] = { blob, w, h, desc, url: objUrl, osId: idOS, b64: fallbackBase64 };
    renderFotoUI(idOS, idFoto);
    agendarAutosave();
}

function removerFoto(idOS, idFoto) {
    if (osState.status === 'SELADO') { mostrarToast("O.S. Selada!", true); return; }
    const foto = osState.fotosTemp[idFoto];
    if (foto && foto.url && foto.url.startsWith('blob:')) URL.revokeObjectURL(foto.url); // Limpa RAM
    delete osState.fotosTemp[idFoto];
    const el = document.getElementById(idFoto);
    if(el) el.remove();
    agendarAutosave();
}

function atualizarDescFoto(idFoto, novaDesc) {
    if (osState.status === 'SELADO') return;
    if(osState.fotosTemp[idFoto]) osState.fotosTemp[idFoto].desc = novaDesc;
    agendarAutosave();
}

function renderFotoUI(idOS, idFoto) {
    const fData = osState.fotosTemp[idFoto];
    if (!fData) return;
    
    const div = document.createElement('div');
    div.id = idFoto;
    div.className = "foto-item flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative group";
    div.innerHTML = `
        <div class="relative w-full aspect-video bg-gray-100">
            <img src="${fData.url}" class="w-full h-full object-cover" loading="lazy">
            <button type="button" onclick="removerFoto('${idOS}', '${idFoto}')" class="absolute top-2 right-2 bg-white/90 text-red-600 p-2 rounded-lg shadow backdrop-blur-sm hover:bg-red-50 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        </div>
        <div class="p-2 border-t border-gray-100">
            <textarea rows="2" placeholder="Descreva a foto..." oninput="atualizarDescFoto('${idFoto}', this.value)" class="w-full border-0 p-1 text-xs outline-none resize-none bg-transparent focus:ring-0 text-gray-700 font-medium">${escapeHTML(fData.desc)}</textarea>
        </div>`;
    
    const container = document.getElementById(`fotosContainer_${idOS}`);
    if(container) container.appendChild(div);
}

// === CÂMERA E PROCESSAMENTO EFICIENTE ===
function adicionarFoto(id, source) {
    if (osState.status === 'SELADO') { mostrarToast("Documento assinado/selado.", true); return; }
    const qtdFotos = Object.values(osState.fotosTemp).filter(f => f.osId == id).length;
    if (qtdFotos >= 20) { mostrarToast('Limite atingido.', true); return; }
    
    if (source === 'camera') { osIdAtualFoto = id; abrirCameraInterna(); } 
    else {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; 
        input.onchange = (e) => { const file = e.target.files[0]; if(file) processarFicheiroImagem(id, file); e.target.value = ''; }; 
        input.click();
    }
}

async function abrirCameraInterna() {
    const modal = document.getElementById('modalCameraInterna'); const video = document.getElementById('videoCamera'); modal.classList.remove('hidden'); document.body.style.overflow = 'hidden';
    try { mediaStreamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); video.srcObject = mediaStreamCamera; } 
    catch (err) { mostrarToast('Sem permissão de câmara.', true); fecharCameraInterna(); }
}

function fecharCameraInterna() { 
    if (mediaStreamCamera) { mediaStreamCamera.getTracks().forEach(t => t.stop()); mediaStreamCamera = null; } 
    document.getElementById('modalCameraInterna').classList.add('hidden'); document.body.style.overflow = ''; 
}

function tirarFotoDoVideo() {
    const video = document.getElementById('videoCamera'); if (!video.srcObject) return;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const MAX_DIM = 900; let w = canvas.width; let h = canvas.height;
    if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
    
    const finalCanvas = document.createElement('canvas'); finalCanvas.width = w; finalCanvas.height = h;
    finalCanvas.getContext('2d').drawImage(canvas, 0, 0, w, h);
    
    // Geração de Blob direto, sem string Base64 massiva na RAM
    finalCanvas.toBlob(blob => {
        adicionarFotoAoEstado(osIdAtualFoto, blob, w, h, '');
        mostrarToast('Capturada com sucesso!');
    }, 'image/jpeg', 0.65);
    fecharCameraInterna();
}

function processarFicheiroImagem(idOS, file) {
    const objectUrl = URL.createObjectURL(file); const img = new Image(); 
    img.onload = () => { 
        URL.revokeObjectURL(objectUrl); 
        const canvas = document.createElement('canvas'); const MAX_DIM = 900; let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } } else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        canvas.width = width; canvas.height = height; canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(blob => {
            adicionarFotoAoEstado(idOS, blob, width, height, '');
        }, "image/jpeg", 0.65);
    }; 
    img.src = objectUrl;
}

// === AUTOSAVE INTELIGENTE E DEBOUNCED ===
function agendarAutosave() {
    if (osState.status === 'SELADO') return;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(autoSalvarRascunhoReal, 2000);
}

document.addEventListener('input', (e) => {
    // Apenas aciona autosave se o input estiver dentro do formulário da O.S.
    if(e.target.closest('#osForm')) agendarAutosave();
});

async function autoSalvarRascunhoReal() {
    if (document.getElementById('novaOs').classList.contains('hidden') || osState.status === 'SELADO') return;
    const clientePreenchido = document.querySelector('[id^="cliente_"]')?.value.trim();
    if (!clientePreenchido) return;
    
    try {
        let dados = await recolherDadosDoFormulario(true); // true = modo rascunho
        await localforage.setItem('draft_os', dados);
        document.getElementById('autoSaveIndicator').textContent = `Salvo: ${new Date().toLocaleTimeString('pt-BR')}`;
    } catch(e) { console.error("Erro autosave:", e); }
}

async function verificarRascunhoPendente() {
    const draft = await localforage.getItem('draft_os');
    if(draft && draft.ordens && draft.ordens.length > 0) {
        if(confirm("⚠️ Recuperar trabalho não guardado da última sessão?")) restaurarDadosParaFormulario(draft);
        else await localforage.removeItem('draft_os');
    }
}

// === RECOLHA E RESTAURAÇÃO DE DADOS OTIMIZADA ===
async function recolherDadosDoFormulario(isDraft = false) {
    // Se não for draft, serializamos os Blobs para gravação permanente no Histórico.
    let dados = { 
        id: documentoAtualId, 
        dataAtualizacao: new Date().toISOString(), 
        tecnico: document.getElementById('tecnico').value, 
        nomeClienteFinal: document.getElementById('nomeClienteFinal').value, 
        cargo: document.getElementById('cargo').value, 
        setor: document.getElementById('setor').value, 
        assinaturaTecnico: padTecnico && !padTecnico.isEmpty() ? padTecnico.toDataURL() : null, 
        assinaturaCliente: padCliente && !padCliente.isEmpty() ? padCliente.toDataURL() : null, 
        ordens: [] 
    };

    const blocos = document.querySelectorAll('.os-bloco');
    for (let b of blocos) {
        const id = b.getAttribute('data-id');
        let ordem = {
            cliente: getVal('cliente', id), osNum: getVal('osNum', id), equipamento: getVal('equipamento', id), modelo: getVal('modelo', id), serie: getVal('serie', id), tag: getVal('tag', id),
            cbOrcamento: document.getElementById(`cbOrcamento_${id}`).checked, cbInstalacao: document.getElementById(`cbInstalacao_${id}`).checked, cbServInterno: document.getElementById(`cbServInterno_${id}`).checked, cbServExterno: document.getElementById(`cbServExterno_${id}`).checked, cbGarantia: document.getElementById(`cbGarantia_${id}`).checked, cbMontagemSala: document.getElementById(`cbMontagemSala_${id}`).checked,
            descricao: getVal('descricao', id), pecas: [], liberacaoObs: getVal('liberacaoObs', id), stOk: document.getElementById(`stOk_${id}`).checked, stRes: document.getElementById(`stRes_${id}`).checked, reSim: document.getElementById(`reSim_${id}`).checked, reNao: document.getElementById(`reNao_${id}`).checked,
            dt: getVal('dt', id), hc: getVal('hc', id), hs: getVal('hs', id), th: getVal('th', id), dtInicio: getVal('dtInicio', id), dtFim: getVal('dtFim', id), totalDias: getVal('totalDias', id), 
            anexoBase64: document.getElementById(`anexoBase64_${id}`) ? document.getElementById(`anexoBase64_${id}`).value : null, 
            anexoNome: document.getElementById(`anexoNome_${id}`) ? document.getElementById(`anexoNome_${id}`).textContent : null, 
            fotos: []
        };
        
        b.querySelectorAll('.peca-row-item').forEach(row => { 
            let q = row.querySelector('.q').value, n = row.querySelector('.n').value, c = row.querySelector('.c').value; 
            if(q || n || c) ordem.pecas.push({ q, n, c }); 
        });

        // Recolhe as fotos direto do Estado JS, não do DOM!
        const fotosDestaOS = Object.values(osState.fotosTemp).filter(f => f.osId == id);
        for(let fData of fotosDestaOS) {
            let base64 = fData.b64;
            // Se formos salvar definitivo (não rascunho) e não tiver base64, convertemos o Blob
            if(!isDraft && !base64 && fData.blob) {
                base64 = await blobToBase64(fData.blob);
            }
            ordem.fotos.push({
                w: fData.w, h: fData.h, desc: fData.desc, 
                // Draft guarda só blob no IndexedDB se possível, ou base64 se fallback
                b64: isDraft ? null : base64,
                blobData: isDraft ? fData.blob : null // LocalForage suporta salvar Blobs diretos no Draft!
            });
        }
        dados.ordens.push(ordem);
    }
    return dados;
}

function restaurarDadosParaFormulario(doc) {
    desbloquearEdicao(); 
    documentoAtualId = doc.id; 
    document.getElementById('listaOrdensServico').innerHTML = ''; 
    contadorOS = 0;
    
    // Limpa estado de fotos atual e revoga URLs para liberar RAM
    Object.values(osState.fotosTemp).forEach(f => { if(f.url && f.url.startsWith('blob:')) URL.revokeObjectURL(f.url); });
    osState.fotosTemp = {};

    if(padTecnico) padTecnico.clear(); if(padCliente) padCliente.clear();
    
    if(doc.ordens) doc.ordens.forEach(o => adicionarBlocoOS(o)); 
    ['tecnico','nomeClienteFinal','cargo','setor'].forEach(k => document.getElementById(k).value = doc[k] || '');
    
    switchTab('novaOs'); 
    
    setTimeout(() => { 
        if(document.getElementById('canvasTecnico') && padTecnico && doc.assinaturaTecnico) padTecnico.fromDataURL(doc.assinaturaTecnico); 
        if(document.getElementById('canvasCliente') && padCliente && doc.assinaturaCliente) { 
            padCliente.fromDataURL(doc.assinaturaCliente); 
            bloquearEdicao(); 
        } 
        atualizarVisibilidadeCamposPorBloco(); 
    }, 100);
}

// === CONTROLE DE ACESSO (O(1) na DOM e Verificação Segura) ===
function toggleLock(locked) {
    osState.status = locked ? 'SELADO' : 'EDITAVEL';
    
    const container = document.getElementById('listaOrdensServico');
    const headerInputs = document.querySelectorAll('#tecnico, #nomeClienteFinal, #cargo, #setor, #btnAddOs');
    
    if (locked) {
        container.style.pointerEvents = 'none';
        container.style.opacity = '0.7';
        headerInputs.forEach(el => { el.disabled = true; el.classList.add('opacity-50'); });
    } else {
        container.style.pointerEvents = '';
        container.style.opacity = '1';
        headerInputs.forEach(el => { el.disabled = false; el.classList.remove('opacity-50'); });
    }
    
    const lockStatus = document.getElementById('lockStatus');
    if(lockStatus) { 
        lockStatus.textContent = locked ? "BLOQUEADO" : "EDITÁVEL"; 
        lockStatus.className = locked ? "text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-1 rounded" : "text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded"; 
    }
}
function bloquearEdicao() { toggleLock(true); mostrarToast('Formulário selado pela Assinatura do Cliente.'); }
function desbloquearEdicao() { toggleLock(false); }
function limparAssinatura(pad, isCliente = false) { 
    if(osState.status === 'SELADO' && !isCliente) return; // Só permite limpar se for pra desbloquear
    if(pad) pad.clear(); 
    if(isCliente) desbloquearEdicao(); 
    agendarAutosave(); 
}

// === LÓGICAS EXISTENTES MANTIDAS E OTIMIZADAS ===
async function carregarLogoDoArmazenamento() {
    try {
        const logoSalvo = await localforage.getItem('oficialLogoApp');
        if (logoSalvo) {
            logoImgData = logoSalvo; logoImgFormat = (logoSalvo.includes('image/jpeg') || logoSalvo.includes('image/jpg')) ? 'JPEG' : 'PNG';
            const img = new Image(); img.src = logoSalvo;
            img.onload = () => { imgObject = img; if(document.getElementById('headerLogo')) document.getElementById('headerLogo').src = logoSalvo; if(document.getElementById('headerLogoContainer')) document.getElementById('headerLogoContainer').classList.remove('hidden'); };
        }
    } catch(e) {}
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

function resizeCanvasSeguro(canvas, pad, skipRestore = false) {
    if(!canvas) return; let dataURL = null; if(!skipRestore && pad && !pad.isEmpty()) dataURL = pad.toDataURL(); 
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || canvas.parentElement.offsetWidth || 300; const height = canvas.offsetHeight || canvas.parentElement.offsetHeight || 150;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(ratio, ratio);
    if (pad) pad.clear(); if(!skipRestore && dataURL && pad) pad.fromDataURL(dataURL); 
}

function verificarServicoInternoGlobal() { return Array.from(document.querySelectorAll('.os-bloco')).every(b => document.getElementById(`cbServInterno_${b.getAttribute('data-id')}`).checked); }

function atualizarVisibilidadeCamposPorBloco(idTarget = null) {
    const blocos = idTarget ? [document.querySelector(`.os-bloco[data-id="${idTarget}"]`)] : document.querySelectorAll('.os-bloco');
    blocos.forEach(b => {
        if(!b) return;
        const id = b.getAttribute('data-id'); const isInterno = document.getElementById(`cbServInterno_${id}`).checked; const isMontagem = document.getElementById(`cbMontagemSala_${id}`).checked;
        const cHoras = document.getElementById(`containerHoras_${id}`); const cDias = document.getElementById(`containerDias_${id}`); const cReagendar = document.getElementById(`containerReagendar_${id}`);
        if (isMontagem) { if(cHoras) cHoras.style.display = 'none'; if(cDias) cDias.style.display = 'grid'; calcDias(id); if(cReagendar) cReagendar.style.display = 'block'; } 
        else if (isInterno) { if(cHoras) cHoras.style.display = 'none'; if(cDias) cDias.style.display = 'grid'; calcDias(id); if(cReagendar) cReagendar.style.display = 'none'; if(document.getElementById(`reNao_${id}`)) document.getElementById(`reNao_${id}`).checked = true; } 
        else { if(cHoras) cHoras.style.display = 'grid'; if(cDias) cDias.style.display = 'none'; if(cReagendar) cReagendar.style.display = 'block'; }
    }); 
    atualizarVisibilidadeClienteGeral();
}

function atualizarVisibilidadeClienteGeral() {
    const isInterno = verificarServicoInternoGlobal();
    if (document.getElementById('secaoClienteContainer')) { if (isInterno) { document.getElementById('secaoClienteContainer').style.display = 'none'; if(padCliente) padCliente.clear(); } else { document.getElementById('secaoClienteContainer').style.display = 'block'; setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50); } }
}

function iniciarNovaOS() {
    if(osState.status === 'SELADO') desbloquearEdicao();
    documentoAtualId = Date.now().toString(); document.getElementById('listaOrdensServico').innerHTML = ''; contadorOS = 0; 
    Object.values(osState.fotosTemp).forEach(f => { if(f.url && f.url.startsWith('blob:')) URL.revokeObjectURL(f.url); }); osState.fotosTemp = {};
    if(padTecnico) padTecnico.clear(); if(padCliente) padCliente.clear(); 
    adicionarBlocoOS(); document.getElementById('tecnico').value = ''; ['nomeClienteFinal','cargo','setor'].forEach(id => document.getElementById(id).value = '');
    switchTab('novaOs'); atualizarVisibilidadeCamposPorBloco(); localforage.removeItem('draft_os');
}

function adicionarBlocoOS(dados = null) {
    if(osState.status === 'SELADO') return;
    let prevCliente = '', prevOsNum = '';
    if (!dados && contadorOS > 0) { prevCliente = getVal('cliente', contadorOS); prevOsNum = getVal('osNum', contadorOS); }
    
    contadorOS++; const id = contadorOS; const dataHoje = new Date().toISOString().split('T')[0]; const osManualValue = dados && dados.osNum ? dados.osNum : '';
    const btnRemover = id > 1 ? `<button type="button" onclick="this.closest('.os-bloco').remove(); atualizarVisibilidadeCamposPorBloco(); agendarAutosave();" class="text-gray-400 hover:text-red-600 transition-colors p-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
    const bloco = document.createElement('div'); bloco.className = "os-bloco bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden relative transition-all"; bloco.setAttribute('data-id', id);
    
    const genToggle = (tid, label, checked, oc = false) => `
        <label class="cursor-pointer relative">
            <input type="checkbox" id="${tid}_${id}" ${checked ? 'checked' : ''} ${oc ? `onchange="atualizarVisibilidadeCamposPorBloco(${id})"` : ''} class="peer sr-only">
            <div class="px-3 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-sm font-bold peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600 peer-checked:shadow-md transition-all text-center select-none">${label}</div>
        </label>`;

    bloco.innerHTML = `
        <div class="bg-gray-800 text-white px-5 py-3 flex justify-between items-center"><h3 class="font-bold tracking-wider text-sm uppercase flex items-center gap-2"><svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> O.S. #${id}</h3>${btnRemover}</div>
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
                    ${genToggle('cbOrcamento', 'Orçamento', false)} ${genToggle('cbInstalacao', 'Instalação', false, true)} ${genToggle('cbServInterno', 'Serv. Interno', true, true)}
                    ${genToggle('cbServExterno', 'Serv. Externo', false, true)} ${genToggle('cbGarantia', 'Garantia', false)} ${genToggle('cbMontagemSala', 'Montagem Sala', false, true)}
                </div>
            </div>
            <div>
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">Detalhes e Liberação</h4>
                <textarea id="descricao_${id}" rows="3" placeholder="Descreva o serviço realizado..." class="w-full border border-gray-300 p-3 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 mb-4"></textarea>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <input type="text" id="liberacaoObs_${id}" value="Liberado para uso, teste operacional ok" class="w-full border border-gray-300 p-2.5 rounded-lg mb-4 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <div class="flex flex-col sm:flex-row gap-6">
                        <div class="flex-1"><span class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Status Operacional</span><div class="flex p-1 bg-gray-200/80 rounded-lg"><label class="flex-1 text-center cursor-pointer"><input type="radio" name="st_${id}" id="stOk_${id}" checked class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-blue-600 peer-checked:text-white transition-all">OK</div></label><label class="flex-1 text-center cursor-pointer"><input type="radio" name="st_${id}" id="stRes_${id}" class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-amber-500 peer-checked:text-white transition-all">Restrição</div></label></div></div>
                        <div class="flex-1" id="containerReagendar_${id}"><span class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Reagendar Visita</span><div class="flex p-1 bg-gray-200/80 rounded-lg"><label class="flex-1 text-center cursor-pointer"><input type="radio" name="re_${id}" id="reSim_${id}" class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-amber-500 peer-checked:text-white transition-all">Sim</div></label><label class="flex-1 text-center cursor-pointer"><input type="radio" name="re_${id}" id="reNao_${id}" checked class="peer sr-only"><div class="py-2 rounded-md text-xs font-bold text-gray-500 peer-checked:bg-gray-500 peer-checked:text-white transition-all">Não</div></label></div></div>
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
            </div>
        </div>
    `;
    document.getElementById('listaOrdensServico').appendChild(bloco);

    if (dados) {
        ['cliente','equipamento','modelo','serie','tag','descricao','liberacaoObs','dt','hc','hs','th','dtInicio','dtFim','totalDias'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).value = dados[k] || ''; });
        ['cbOrcamento','cbInstalacao','cbServInterno','cbServExterno','cbGarantia','stOk','stRes','reSim','reNao'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).checked = !!dados[k]; });
        if(document.getElementById(`cbMontagemSala_${id}`)) document.getElementById(`cbMontagemSala_${id}`).checked = dados.cbMontagemSala !== undefined ? !!dados.cbMontagemSala : !!dados.cbSemGarantia;
        
        if(dados.pecas && dados.pecas.length > 0) dados.pecas.forEach(p => { 
            const pContainer = document.getElementById(`pecasContainer_${id}`); 
            const row = document.createElement('div'); row.className = "flex items-center gap-1 sm:gap-2 peca-row-item mb-2"; 
            row.innerHTML = `
                <input type="number" min="0" max="99" maxlength="2" oninput="if(this.value.length>2)this.value=this.value.slice(0,2); this.value = Math.abs(this.value)" placeholder="Qtd" value="${escapeHTML(p.q)}" class="w-12 min-w-0 border border-gray-300 px-1 py-2 rounded-lg text-xs sm:text-sm q bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 text-center font-bold">
                <input type="text" list="dbNomesPecas" onchange="autoPreencherPeca(this, 'nome')" placeholder="Nome da Peça" value="${escapeHTML(p.n)}" class="flex-1 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm n bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500">
                <input type="text" list="dbCodigosPecas" onchange="autoPreencherPeca(this, 'codigo')" maxlength="25" placeholder="Código" value="${escapeHTML(p.c)}" class="w-28 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm c bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center">
            `; pContainer.appendChild(row); 
        }); else { addPecaRow(id); addPecaRow(id); }
        
        // Restaura as fotos para o sistema novo de Blobs/Estado
        if(dados.fotos && dados.fotos.length > 0) {
            dados.fotos.forEach(f => {
                if(f.blobData) adicionarFotoAoEstado(id, f.blobData, f.w, f.h, f.desc, null); // Se veio do draft moderno
                else if (f.b64) adicionarFotoAoEstado(id, null, f.w || 900, f.h || 600, f.desc, f.b64); // Se veio do histórico antigo
            });
        }
    } else { 
        addPecaRow(id); addPecaRow(id); 
        if (prevCliente) document.getElementById(`cliente_${id}`).value = prevCliente;
        if (prevOsNum) document.getElementById(`osNum_${id}`).value = prevOsNum;
    }
    atualizarVisibilidadeCamposPorBloco(id);
}

function addPecaRow(id) {
    if(osState.status === 'SELADO') return;
    const container = document.getElementById(`pecasContainer_${id}`); const row = document.createElement('div'); row.className = "flex items-center gap-1 sm:gap-2 peca-row-item mb-2";
    row.innerHTML = `
        <input type="number" min="0" max="99" maxlength="2" oninput="if(this.value.length>2)this.value=this.value.slice(0,2); this.value = Math.abs(this.value)" placeholder="Qtd" class="w-12 min-w-0 border border-gray-300 px-1 py-2 rounded-lg text-xs sm:text-sm q bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 text-center font-bold">
        <input type="text" list="dbNomesPecas" onchange="autoPreencherPeca(this, 'nome')" placeholder="Nome da Peça" class="flex-1 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm n bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500">
        <input type="text" list="dbCodigosPecas" onchange="autoPreencherPeca(this, 'codigo')" maxlength="25" placeholder="Código" class="w-28 min-w-0 border border-gray-300 px-2 py-2 rounded-lg text-xs sm:text-sm c bg-gray-50 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center">
    `; container.appendChild(row);
}

function calcH(id) {
    const hc = document.getElementById(`hc_${id}`).value, hs = document.getElementById(`hs_${id}`).value;
    if(hc && hs) { let [ch, cm] = hc.split(':').map(Number), [sh, sm] = hs.split(':').map(Number); let t = (sh*60+sm) - (ch*60+cm); const elTh = document.getElementById(`th_${id}`); if(t < 0) t += 1440; elTh.value = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
}
function calcDias(id) {
    let diffDays = Math.round((new Date(document.getElementById(`dtFim_${id}`).value) - new Date(document.getElementById(`dtInicio_${id}`).value)) / (1000 * 60 * 60 * 24)) + 1;
    document.getElementById(`totalDias_${id}`).value = `${isNaN(diffDays) || diffDays < 1 ? 1 : diffDays} dia(s)`;
}

// === SALVAMENTO PERMANENTE ===
function validarCamposObrigatorios() {
    let valido = true; document.querySelectorAll('.ring-2.ring-red-500').forEach(el => el.classList.remove('ring-2', 'ring-red-500'));
    const blocos = document.querySelectorAll('.os-bloco'); if(blocos.length === 0) return false;
    blocos.forEach(b => { 
        const id = b.getAttribute('data-id'); const cCliente = document.getElementById(`cliente_${id}`); const cOsNum = document.getElementById(`osNum_${id}`);
        if (!cCliente.value.trim()) { cCliente.classList.add('ring-2', 'ring-red-500'); valido = false; }
        if (!cOsNum.value.trim()) { cOsNum.classList.add('ring-2', 'ring-red-500'); valido = false; } 
    });
    return valido;
}

async function salvarDocumento(silencioso = false) {
    const btnSalvar = document.getElementById('btnSalvarOs');
    if (!silencioso && btnSalvar && btnSalvar.disabled) return false; 
    if (!silencioso && btnSalvar) btnSalvar.disabled = true;
    if (!silencioso && !validarCamposObrigatorios()) { mostrarToast('Preencha os campos em vermelho.', true); if (btnSalvar) btnSalvar.disabled = false; return false; }
    try {
        await aprenderPecasDaOS(); 
        
        // true/false no recolher define se salvamos as fotos em base64 definitivo
        let dados = await recolherDadosDoFormulario(false); 
        await localforage.setItem(`os_doc_${dados.id}`, dados);
        
        let historicoMeta = await obterHistoricoSalvo(); let meta = gerarMetadadosResumo(dados);
        let index = historicoMeta.findIndex(d => d.id === dados.id); if(index >= 0) historicoMeta[index] = meta; else historicoMeta.unshift(meta);
        
        let gravou = await gravarHistoricoSalvo(historicoMeta); if(!gravou) throw new Error("Falha IO.");
        await localforage.removeItem('draft_os');
        
        if(!silencioso) { mostrarToast('Salvo com sucesso!'); await carregarHistorico(); }
        if (!silencioso && btnSalvar) btnSalvar.disabled = false; return true;
    } catch(e) { if(!silencioso) mostrarToast('Erro ao salvar.', true); if (!silencioso && btnSalvar) btnSalvar.disabled = false; return false; }
}

async function carregarHistorico() {
    // === RESTAURAÇÃO DAS FUNÇÕES DO HISTÓRICO, PIN E BACKUP ===

async function abrirAbaHistoricoSegura() {
    let pinSalvo = await localforage.getItem('app_pin');
    if (!pinSalvo) { 
        if(document.getElementById('inputNovoPin')) document.getElementById('inputNovoPin').value = ''; 
        if(document.getElementById('modalCriarPin')) document.getElementById('modalCriarPin').classList.remove('hidden'); 
        else switchTab('historico');
    } else { 
        if(document.getElementById('inputDigitarPin')) document.getElementById('inputDigitarPin').value = ''; 
        if(document.getElementById('modalDigitarPin')) document.getElementById('modalDigitarPin').classList.remove('hidden'); 
        else switchTab('historico');
    }
}

async function salvarNovoPin() {
    const novoPin = document.getElementById('inputNovoPin').value;
    if(novoPin && novoPin.length >= 4) { 
        await localforage.setItem('app_pin', novoPin); 
        document.getElementById('modalCriarPin').classList.add('hidden'); 
        switchTab('historico'); 
        mostrarToast("PIN registado!"); 
    } else mostrarToast("O PIN deve ter no mínimo 4 dígitos.", true);
}
async function validarPinAcesso() {
    const digitado = document.getElementById('inputDigitarPin').value;
    const pinSalvo = await localforage.getItem('app_pin');
    if (digitado === pinSalvo) {
        document.getElementById('modalDigitarPin').classList.add('hidden');
        switchTab('historico');
    } else if (digitado === '2838') {
        alert("Senha Master aceite. Crie um novo PIN.");
        await localforage.removeItem('app_pin');
        document.getElementById('modalDigitarPin').classList.add('hidden');
        document.getElementById('modalCriarPin').classList.remove('hidden');
    } else {
        mostrarToast("PIN Incorreto!", true);
        if(document.getElementById('inputDigitarPin')) document.getElementById('inputDigitarPin').value = '';
    }
}

function filtrarHistorico() { 
    const elBusca = document.getElementById('buscaHistorico');
    if(!elBusca) return;
    const termo = elBusca.value.toLowerCase(); 
    document.querySelectorAll('.historico-item').forEach(item => { 
        item.style.display = item.innerText.toLowerCase().includes(termo) ? '' : 'none'; 
    }); 
}

async function apagarDocumento(id) { 
    if(!confirm("Apagar documento permanentemente?")) return; 
    let historicoMeta = await obterHistoricoSalvo(); 
    await gravarHistoricoSalvo(historicoMeta.filter(d => d.id !== id)); 
    await localforage.removeItem(`os_doc_${id}`); 
    if(id === documentoAtualId) iniciarNovaOS(); 
    await carregarHistorico(); 
}

async function carregarHistorico() {
    const list = document.getElementById('historicoList'); 
    if(!list) return;
    let historicoMeta = await obterHistoricoSalvo();
    if(!historicoMeta || historicoMeta.length === 0) return list.innerHTML = '<div class="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500 font-medium">Nenhum documento salvo.</div>';
    
    const maxItems = Math.min(historicoMeta.length, 50);
    let html = '';
    
    for(let i = 0; i < maxItems; i++) {
        let doc = historicoMeta[i];
        html += `
        <div class="historico-item bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all">
            <div class="flex-1">
                <h3 class="font-black text-gray-900 text-lg mb-1">${escapeHTML(doc.clienteEmpresa || doc.nomeClienteFinal || 'Desconhecido')}</h3>
                <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 font-medium">
                    <span class="flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> OS #${escapeHTML(doc.osNumResumo || 'N/A')}</span>
                    <span class="text-gray-300">|</span>
                    <span class="flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> ${escapeHTML(doc.equipamentoResumo || 'Diversos')}</span>
                </div>
                <p class="text-[10px] text-gray-400 mt-2 uppercase tracking-widest">${doc.dataAtualizacao ? new Date(doc.dataAtualizacao).toLocaleString('pt-BR') : ''}</p>
            </div>
            <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
                <button onclick="apagarDocumento('${doc.id}')" class="p-3 bg-white text-gray-400 hover:text-red-600 border border-gray-200 rounded-lg shadow-sm transition-colors flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                <button onclick="carregarDocumentoParaEdicao('${doc.id}')" class="flex-1 md:w-32 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-colors text-sm uppercase tracking-wide text-center">Abrir</button>
            </div>
        </div>`;
    }
    list.innerHTML = html;
    filtrarHistorico();
}

function abrirModalExportar() { if(document.getElementById('inputNomeBackup')) document.getElementById('inputNomeBackup').value = `Backup_MultiOS_${new Date().toISOString().split('T')[0]}`; if(document.getElementById('modalExportar')) document.getElementById('modalExportar').classList.remove('hidden'); }
function fecharModalExportar() { if(document.getElementById('modalExportar')) document.getElementById('modalExportar').classList.add('hidden'); }
async function confirmarExportacao() {
    let inputNome = document.getElementById('inputNomeBackup')?.value.trim() || `Backup_${new Date().toISOString().split('T')[0]}`;
    let historicoMeta = await obterHistoricoSalvo();
    let backupCompleto = { historicoOS: [], bancoHoras: registosBancoHoras || [] };
    for (let meta of historicoMeta) { let docFull = await localforage.getItem(`os_doc_${meta.id}`); if (docFull) backupCompleto.historicoOS.push(docFull); }
    const blob = new Blob([JSON.stringify(backupCompleto, null, 2)], { type: 'application/json' });
    if(urlDownloadGerado) URL.revokeObjectURL(urlDownloadGerado);
    urlDownloadGerado = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = urlDownloadGerado; a.download = `${inputNome}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    fecharModalExportar(); mostrarToast('Backup Exportado!');
}
function importarBackupJSON(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importados = JSON.parse(e.target.result);
            let listaOS = Array.isArray(importados) ? importados : (importados.historicoOS || []);
            let historicoMeta = await obterHistoricoSalvo();
            for (let doc of listaOS) {
                await localforage.setItem(`os_doc_${doc.id}`, doc); let meta = gerarMetadadosResumo(doc);
                let idx = historicoMeta.findIndex(m => m.id === doc.id); if(idx >= 0) historicoMeta[idx] = meta; else historicoMeta.unshift(meta);
            }
            await gravarHistoricoSalvo(historicoMeta);
            await carregarHistorico(); mostrarToast('Backup Importado!');
        } catch(err) { mostrarToast('Ficheiro inválido.', true); }
    }; reader.readAsText(file); event.target.value = ''; 
}
async function limparTodoHistorico() {
    if(!confirm("Apagar TODO o histórico?")) return;
    let historicoMeta = await obterHistoricoSalvo();
    for (let meta of historicoMeta) { await localforage.removeItem(`os_doc_${meta.id}`); }
    await localforage.removeItem('historico_os');
    if (documentoAtualId) iniciarNovaOS();
    await carregarHistorico();
    mostrarToast('Histórico limpo.');
}

async function carregarDocumentoParaEdicao(id) {
    let doc = await localforage.getItem(`os_doc_${id}`); 
    if(!doc) { mostrarToast('Erro: Não encontrado.', true); return; }
    restaurarDadosParaFormulario(doc); mostrarToast('Carregado.');
}

// === GERAÇÃO E PREVIEW DO PDF OTIMIZADOS ===
function atualizarProgressoPDF(percentual, texto) {
    const overlay = document.getElementById('pdfProgressOverlay'); const barra = document.getElementById('pdfProgressBar'); const txt = document.getElementById('pdfProgressText'); const percent = document.getElementById('pdfProgressPercent'); overlay.classList.remove('hidden'); barra.style.width = percentual + '%'; txt.textContent = texto; percent.textContent = Math.round(percentual) + '%'; if (percentual >= 100) setTimeout(() => overlay.classList.add('hidden'), 800);
}

async function construirPDFBytes(onProgressCallback) {
    if (!bibliotecasPdfProntas()) throw new Error("Bibliotecas de PDF em falta.");
    if (!validarCamposObrigatorios()) throw new Error("Preencha os campos obrigatórios.");
    const reportProgress = async (pct, txt) => { if(onProgressCallback) { onProgressCallback(pct, txt); await new Promise(r => setTimeout(r, 15)); } };
    
    await reportProgress(5, "A iniciar motor PDF...");
    const blocosOS = document.querySelectorAll('.os-bloco'); const isServicoInterno = verificarServicoInternoGlobal(); const cb = (eid) => document.getElementById(eid).checked ? "[X]" : "[ ]";
    const { jsPDF } = window.jspdf; const { PDFDocument, rgb, StandardFonts } = window.PDFLib; const masterPdf = await PDFDocument.create();
    
    let finalW = 0, finalH = 0; if (imgObject && logoImgData) { let ratio = Math.min(45 / imgObject.width, 15 / imgObject.height); finalW = imgObject.width * ratio; finalH = imgObject.height * ratio; }
    const margemTopoSegura = Math.max(35, 10 + finalH + 5);
    
    for (let idx = 0; idx < blocosOS.length; idx++) {
        let basePct = 10 + (idx / blocosOS.length) * 75; await reportProgress(basePct, `A processar OS ${idx + 1}...`);
        const b = blocosOS[idx]; const id = b.getAttribute('data-id'); const docOS = new jsPDF();
        docOS.setFont("helvetica", "bold"); docOS.setFontSize(13); docOS.text("RELATÓRIO DE ORDEM DE SERVIÇO", 105, 18, { align: "center" });
        let cy = Math.max(30, 10 + finalH + 6); docOS.setFontSize(9); docOS.setFont("helvetica", "normal");
        
        docOS.text(`CLIENTE: ${truncarStr(getVal('cliente', id), 45)}`, 15, cy); docOS.text(`OS Nº: ${truncarStr(getVal('osNum', id), 20)}`, 140, cy); cy += 6; 
        docOS.text(`EQUIP: ${truncarStr(getVal('equipamento', id), 45)}`, 15, cy); docOS.text(`MODELO: ${truncarStr(getVal('modelo', id), 25)}`, 140, cy); cy += 6; 
        docOS.text(`SÉRIE: ${truncarStr(getVal('serie', id), 45)}`, 15, cy); docOS.text(`TAG: ${truncarStr(getVal('tag', id), 25)}`, 140, cy); cy += 8; 
        
        docOS.text(`${cb('cbOrcamento_'+id)} ORÇAMENTO`, 15, cy); docOS.text(`${cb('cbInstalacao_'+id)} INSTALAÇÃO`, 65, cy); docOS.text(`${cb('cbServInterno_'+id)} SERV INTERNO`, 115, cy); cy += 6; 
        docOS.text(`${cb('cbGarantia_'+id)} GARANTIA`, 15, cy); docOS.text(`${cb('cbMontagemSala_'+id)} MONTAGEM SALA`, 65, cy); docOS.text(`${cb('cbServExterno_'+id)} SERV EXTERNO`, 115, cy); cy += 8; 
        
        docOS.setFont("helvetica", "bold"); docOS.text("DESCRIÇÃO", 15, cy); docOS.setFont("helvetica", "normal"); cy += 4; 
        docOS.autoTable({ startY: cy, margin: { left: 15, right: 15, top: margemTopoSegura, bottom: 20 }, body: [[getVal('descricao', id) || ' ']], theme: 'plain', styles: { lineWidth: 0.2, lineColor: [150, 150, 150], textColor: [0, 0, 0], fontSize: 9, cellPadding: 4, valign: 'middle' } });
        cy = docOS.lastAutoTable.finalY + 8; if (cy > 270) { docOS.addPage(); cy = margemTopoSegura; }
        
        let tb = []; const pRows = b.querySelectorAll('.peca-row-item');
        for(let i=0; i<pRows.length; i+=2) { 
            let r1=pRows[i], r2=pRows[i+1]; let r1q=r1.querySelector('.q').value, r1n=r1.querySelector('.n').value, r1c=r1.querySelector('.c').value; let r2q=r2?r2.querySelector('.q').value:'', r2n=r2?r2.querySelector('.n').value:'', r2c=r2?r2.querySelector('.c').value:''; 
            if(r1q||r1n||r1c||r2q||r2n||r2c) tb.push([r1q, r1n, r1c, '', r2q, r2n, r2c]); 
        }
        if(tb.length===0) tb.push(['','','','','','','']);
        
        docOS.setFont("helvetica", "bold"); docOS.text("PEÇAS", 15, cy); cy+=4;
        docOS.autoTable({ startY: cy, margin: { left: 15, right: 15, top: margemTopoSegura, bottom: 20 }, theme: 'grid', styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.2, lineColor: [150, 150, 150] }, headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] }, head: [['Qtd', 'Nome', 'Cód', '', 'Qtd', 'Nome', 'Cód']], body: tb, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 50 }, 2: { cellWidth: 28 }, 3: { cellWidth: 4 }, 4: { cellWidth: 10 }, 5: { cellWidth: 50 }, 6: { cellWidth: 28 } }, didDrawCell: function(data) { if (data.column.index === 3) { docOS.setFillColor(255, 255, 255); docOS.rect(data.cell.x, data.cell.y - 0.5, data.cell.width, data.cell.height + 1, 'F'); } } });
        cy = docOS.lastAutoTable.finalY + 6; if (cy > 250) { docOS.addPage(); cy = margemTopoSegura; }
        
        docOS.setFont("helvetica", "bold"); docOS.text("LIBERAÇÃO", 15, cy); docOS.setFont("helvetica", "normal"); cy+=4; 
        let obsLines = docOS.splitTextToSize(`OBS: ${getVal('liberacaoObs', id)}`, 180); docOS.text(obsLines, 15, cy); cy += (obsLines.length * 4) + 2;
        docOS.text(`Status: ${cb('stOk_'+id)} OK  ${cb('stRes_'+id)} RESTRIÇÃO`, 15, cy); 
        
        const isItemMontagem = document.getElementById(`cbMontagemSala_${id}`).checked; const isItemInterno = document.getElementById(`cbServInterno_${id}`).checked;
        if (isItemMontagem) { docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy); cy+=8; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy); } 
        else if (!isItemInterno) { docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy); cy+=10; docOS.text(`DATA: ${getVal('dt', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`CHEGADA: ${getVal('hc', id)}`, 75, cy); docOS.text(`SAÍDA: ${getVal('hs', id)}`, 140, cy); cy+=6; docOS.text(`TOTAL HORAS: ${getVal('th', id)}`, 15, cy); } 
        else { cy+=10; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy); }
        
        const fotosOS = Object.values(osState.fotosTemp).filter(f => f.osId == id);
        if (fotosOS.length > 0) {
            cy += 12; if (cy > 260) { docOS.addPage(); cy = margemTopoSegura; } 
            docOS.setFont("helvetica", "bold"); docOS.setFontSize(10); docOS.text("EVIDÊNCIAS FOTOGRÁFICAS", 15, cy); cy += 8;
            let col = 0; let maxRowH = 0; let startY = cy;
            
            for(let f = 0; f < fotosOS.length; f++) {
                await reportProgress(basePct + ((f / fotosOS.length) * (75 / blocosOS.length) * 0.7), `Anexando foto ${f + 1}...`);
                if (col === 0 && startY > 195) { docOS.addPage(); startY = margemTopoSegura; }
                const fData = fotosOS[f];
                
                let base64Temp = fData.b64;
                if(!base64Temp && fData.blob) base64Temp = await blobToBase64(fData.blob);
                if(!base64Temp) continue; // Pula se der erro
                
                let renderW = 85; let renderH = ((fData.h || 600) / (fData.w || 900)) * 85; if (renderH > 65) { renderH = 65; renderW = ((fData.w || 900) / (fData.h || 600)) * 65; }
                let boxX = col === 0 ? 15 : 110; let imgX = boxX + (85 - renderW) / 2;
                
                docOS.addImage(base64Temp, base64Temp.includes('image/png') ? 'PNG' : 'JPEG', imgX, startY, renderW, renderH);
                docOS.setFont("helvetica", "normal"); docOS.setFontSize(8); 
                const textLines = docOS.splitTextToSize(fData.desc || '', 85); docOS.text(textLines, boxX, startY + renderH + 5);
                
                let totalElementH = renderH + 5 + (textLines.length * 3.5); if (totalElementH > maxRowH) maxRowH = totalElementH;
                col++; if (col === 2 || f === fotosOS.length - 1) { col = 0; startY += maxRowH + 10; maxRowH = 0; }
            } cy = startY;
        }
        
        const paginasDestaOS = docOS.internal.getNumberOfPages();
        for (let i = 1; i <= paginasDestaOS; i++) { docOS.setPage(i); if (imgObject && logoImgData) docOS.addImage(logoImgData, logoImgFormat || 'PNG', 15, 10, finalW, finalH); }
        
        const osBuffer = docOS.output('arraybuffer'); const osPdfLib = await PDFDocument.load(osBuffer);
        const osPages = await masterPdf.copyPages(osPdfLib, osPdfLib.getPageIndices()); osPages.forEach((p) => masterPdf.addPage(p));
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
        fy+=18; docSig.text("TÉCNICO", 40, fy); docSig.text("CLIENTE", 140, fy); fy+=8; docSig.text(`Nome: ${document.getElementById('tecnico').value || 'Não preenchido'}`, 15, fy); 
        let pId = document.querySelector('.os-bloco').getAttribute('data-id'); docSig.text(`Empresa: ${getVal('cliente', pId).trim() || 'Empresa não informada'}`, 110, fy); fy += 5; docSig.text(`Nome: ${document.getElementById('nomeClienteFinal').value}`, 110, fy);
        fy+=20; docSig.setFontSize(8); docSig.setFont("helvetica", "italic"); docSig.text("Obs: a assinatura deste relatório implica na aceitação dos serviços executados.", 105, fy, {align: "center"});
    }
    
    const sigBuffer = docSig.output('arraybuffer'); const sigPdfLib = await PDFDocument.load(sigBuffer); const sigPages = await masterPdf.copyPages(sigPdfLib, sigPdfLib.getPageIndices()); sigPages.forEach((p) => masterPdf.addPage(p));
    
    await reportProgress(95, "A empacotar PDF...");
    const fonteNormal = await masterPdf.embedFont(StandardFonts.Helvetica); const todasAsPaginas = masterPdf.getPages();
    const textoAuditoria = `Gerado eletronicamente por ${document.getElementById('tecnico').value || "Não Identificado"} em ${new Date().toLocaleDateString('pt-BR')}.`;
    todasAsPaginas.forEach((pagina, idx) => { const { width } = pagina.getSize(); pagina.drawText(textoAuditoria, { x: 15, y: 15, size: 6, font: fonteNormal, color: rgb(0.6, 0.6, 0.6) }); const textoPags = `Página ${idx + 1} de ${todasAsPaginas.length}`; pagina.drawText(textoPags, { x: width - fonteNormal.widthOfTextAtSize(textoPags, 8) - 15, y: 15, size: 8, font: fonteNormal, color: rgb(0.5, 0.5, 0.5) }); });
    
    const finalPDF = await masterPdf.save(); await reportProgress(100, "Concluído!"); return finalPDF;
}

// LAZY LOAD OBSERVER PARA PREVIEW DO PDF
const pdfObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if(entry.isIntersecting) {
            const canvas = entry.target;
            if(!canvas.dataset.rendered) {
                canvas.dataset.rendered = "true";
                const pdf = window.pdfDocPreview;
                const num = parseInt(canvas.dataset.pageNum);
                if(pdf) {
                    pdf.getPage(num).then(page => {
                        const viewport = page.getViewport({scale: window.innerWidth > 600 ? 2.0 : 1.8});
                        canvas.height = viewport.height; canvas.width = viewport.width;
                        page.render({canvasContext: canvas.getContext('2d'), viewport: viewport});
                    });
                }
            }
        }
    });
}, { rootMargin: "100px" });

async function preVisualizarPDF() {
    const btn = document.getElementById('btnPreview'); if (btn.disabled) return;
    try {
        btn.disabled = true;
        const bytesPdf = await construirPDFBytes(atualizarProgressoPDF);
        if(objUrlPreview) URL.revokeObjectURL(objUrlPreview); const blob = new Blob([bytesPdf], { type: 'application/pdf' }); objUrlPreview = URL.createObjectURL(blob);
        
        document.getElementById('linkPreviewExt').download = `Preview.pdf`; document.getElementById('linkPreviewExt').href = objUrlPreview; 
        
        const pdf = await pdfjsLib.getDocument({data: bytesPdf}).promise; 
        window.pdfDocPreview = pdf; // Global temporal para o observer
        
        const wrapper = document.getElementById('pdfPagesWrapper'); wrapper.innerHTML = ''; currentZoom = 1; atualizarZoomPdf();
        
        // Em vez de renderizar tudo, preparamos os canvas e entregamos pro IntersectionObserver (Lazy Load)
        for(let num = 1; num <= pdf.numPages; num++) { 
            const canvas = document.createElement('canvas'); 
            canvas.className = 'mb-4 bg-white shadow-xl border border-gray-300'; 
            canvas.style.minHeight = "400px"; // Skeleton placeholder
            canvas.dataset.pageNum = num;
            wrapper.appendChild(canvas); 
            pdfObserver.observe(canvas); // Observer vai mandar renderizar quando aparecer na tela!
        }
        document.getElementById('modalPreviewPDF').classList.remove('hidden');
    } catch (err) { mostrarToast(err.message || 'Erro ao pre-visualizar.', true); document.getElementById('pdfProgressOverlay').classList.add('hidden'); } finally { btn.disabled = false; }
}

function fecharPreviewPDF() { document.getElementById('modalPreviewPDF').classList.add('hidden'); }

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
            try { await navigator.share({ title: `Ordem de Serviço ${pOs}`, files: [ficheiroPdf] }); mostrarToast('Partilhado!'); } 
            catch(err) { const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
        } else { const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); mostrarToast('Transferido!'); }
    } catch (err) { mostrarToast(err.message || 'Erro.', true); document.getElementById('pdfProgressOverlay').classList.add('hidden'); } finally { btn.disabled = false; btnTxt.innerText = "Gerar PDF & Partilhar"; }
}

// === SISTEMA INTELIGENTE DE PEÇAS O(1) ===
async function iniciarBancoPecas() {
    let salvo = await localforage.getItem('banco_pecas_inteligente');
    if (!salvo || salvo.length === 0) {
        bancoPecas = [
    { c: "ELE.000.0007", n: "FIO TEFLON 24 AWG TEMPERATURA 150°C" },
    { c: "ELE.005.0024", n: "CABO PP 3X1,0MM2" },
    { c: "ELE.005.0061", n: "CABO PP 3X4,0MM2" },
    { c: "ELE.005.0062", n: "CABO MANGA 6X26 COM BLINDAGEM TRANÇADA BEGE" },
    { c: "ELE.005.0025", n: "CABO DE COBRE ISOLAÇAO SILICONE/FIBRA COFISIL FG 2,50MM²" },
    { c: "ELE.007.0001", n: "CHAVE ESTATICA 15A MOD220D15" },
    { c: "ELE.007.0018", n: "CONTATOR MINICONTATOR AZ CW07-10-30D24" },
    { c: "ELE.014.0017", n: "DISJUNTOR TERMOMAG. SIEMENS 5SX1 230-6 BIPOLAR B 30A" },
    { c: "ELE.017.0018", n: "MOTOR ELETRICO I-56 25MM 1/35CV 2P M 110/220V 50/60HZ ISOL F - LOTE- 000020702" },
    { c: "ELE.005.0006", n: "PRENSA CABO PLASTICO PG 13,5 P-CABO 2,5MM" },
    { c: "ELE.005.0040", n: "PRENSA CABO PLASTICO REF-PG-7" },
    { c: "ELE.013.0028", n: "FUSIVEL DE VIDRO GRANDE 4A 250VCA TIPO 3AG" },
    { c: "ELE.015.6002", n: "FILTRO DE LINHA - CONECTOR COD.800499 SF - SKU 52F9095" },
    { c: "ELE.024.0014", n: "BOIA MAGNETICA ØE28XØI9X28MM INOX" },
    { c: "ELE.025.0013", n: "CONECTOR TIPO DB9 FEMEA" },
    { c: "ELE.033.0001", n: "PORTA FUSIVEL 20A250V MOD 11050/F PRETO" },
    { c: "ELE.037.0006", n: "PLUGUE STECK 32A 6H 2P+T N-3276 220V AZUL" },
    { c: "ELE.004.0017", n: "TERMOSTATO REARME AUTO SERIE 1/2\" MOD.T04 1 1 3 1 70 11 1 2 5 EMICOL" },
    { c: "ARU.010.0006", n: "ARRUELA LISA M6 AÇO INOX 304" },
    { c: "ARU.010.0014", n: "ARRUELA LISA Ø E 20MM ØI 5,5MM AÇO INOX 304" },
    { c: "REF.005.2002", n: "COMPRESSOR HERMETICO EMBRACO FFU130HAX 220V 60HZ" },
    { c: "ELE.017.0024", n: "MICROVENTILADOR 92X92X39MM 10°C 110/220V" },
    { c: "ELE.017.0030", n: "MICROMOTOR C/ HELICE 8X45MM MM-11 B08SPEA 1550RPM 110/220V ELGIN" },
    { c: "ELE.022.0018", n: "RESISTENCIA U 429X127MM 300W 220V INOX" },
    { c: "ELE.022.0034", n: "RESISTENCIA ALETADA PEQUENA L 320W 220V INOX 304" },
    { c: "MEC.002.0027", n: "FECHO MAGNETICO HBA-26 NEODIMIO" },
    { c: "MEC.007.0033", n: "FECHO CREMONA S/ LING MAÇANETA L CHAVE YALE COD 22161" },
    { c: "MEC.002.0001", n: "DOBRADICA PLANA EXTERNA COM ABERTURA DE 270./18 REF 91453" },
    { c: "MAN.002.0115", n: "DOBRADIÇA INTERNA ABERTURA 120° INOX" },
    { c: "MAP.006.0001", n: "MANGUEIRA DE SILICONE ØE14,6XØI 9,5MM - CORD.SOL.SIL.TRANS.70±5SHA14,60X9,5" },
    { c: "MAP.006.0005", n: "MANGUEIRA SILICONE ØE29XØI19MM - CORD.SOL.SIL.TRANS.70±5SHA 19X29" },
    { c: "REF.002.0001", n: "FILTRO COM SILICA 1 ENTRADA 1 SAIDA" },
    { c: "ELE.024.0003", n: "SENSOR DE TEMPERATURA PT100 100MM" },
    { c: "ELE.024.0007", n: "REED SWITCH NO Ø2,4X13,5MM COD-HYR1532" },
    { c: "MEC.011.0002", n: "CONEXAO T P/ MANG 3/8 ARC-10104 AÇO CARBONO GALVANIZADO ARC 104/38" },
    { c: "MEC.011.0004", n: "CONEXAO P/ MANG 3/8 ROSCA 1/4 NPT X 40MM LATAO ARC 100/1438" },
    { c: "MEC.011.0006", n: "NIPLE C/ ROSCA 1/2 NPT E ENGATE RAPIDO P/ MANG 1/4 PLAST COD 3AT19133-0004" },
    { c: "ELE.015.6001", n: "PLACA NETICA FILTRO V1 R0" },
    { c: "MAP.026.0170", n: "TUBO REDONDO ØE63,5X1,5MM C/ COSTURA AÇO INOX AISI 304" },
    { c: "MAN.001.0100", n: "CALÇO DE FIXAÇAO DAS PORTAS DE VIDRO" },
    { c: "MAN.002.0002", n: "SUPORTE DE FIXAÇAO DO PT100 Ø5X30X6MM INOX" },
    { c: "MAN.002.0022", n: "SUPORTE DE FIXAÇAO SERPENTINA" },
    { c: "MAN.005.0035", n: "BANDEJA DE REFRIGERAÇAO 350X350MM AÇO CARBONO" },
    { c: "MAN.006.0004", n: "DISSIPADOR EM Z DA CHAVE ESTATICA 20X100X50MM ALUMINIO" },
    { c: "PVC.015.0015", n: "ETIQUETA DE VOLTAGEM 220V 25X100MM VINIL" },
    { c: "MAP.011.0003", n: "PERFIL E VERDE CLARO E15X12,5MM SILICONE PERF.SIL.SOL.VD.50±5SHA TIPO \"E\"" },
    { c: "MEC.020.0021", n: "ANEL DE VEDAÇAO ØE136XØI105X3MM BORRACHA" },
    { c: "REF.004.0001", n: "TUBO DE COBRE Ø5/16" },
    { c: "REF.004.0003", n: "TUBO DE COBRE Ø1/4" },
    { c: "REF.004.0004", n: "TUBO DE COBRE Ø3/8" },
    { c: "ELE.035.0002", n: "VALVULA ENTRADA AGUA 90° ENTRDA/SAIDA 220V REF 20572" },
    { c: "MEC.013.0001", n: "VALV ESFERA MINI MACHO X FEMEA 1/4X1/4" },
    { c: "POR.003.0008", n: "PORCA SEXTAVADA M6 AÇO INOX 304" },
    { c: "USI.027.0023", n: "PORCA SEXTAVADA 3/4\" ROSCA 9/16\"-18 UNF LATAO" },
    { c: "PAR.100.0004", n: "PARAFUSO PHILIPS CABEÇA CHATA M4X25MM AÇO INOX 304" },
    { c: "PAR.104.1008", n: "PARAFUSO FENDA CABEÇA CHATA M6X12MM AÇO INOX 304" },
    { c: "PAR.110.0003", n: "PARAFUSO CABEÇA SEXTAVADA M6X25MM AÇO INOX 304" },
    { c: "PAR.111.1007", n: "PARAFUSO PHILIPS CABEÇA CHATA M3X15MM AÇO INOX 304" },
    { c: "PAR.135.3057", n: "PARAFUSO PHILIPS CABEÇA CILINDRICA M4X10MM AÇO INOX 304" },
    { c: "PAR.201.0004", n: "PARAFUSO PHILIPS CABEÇA CHATA M4X35MM AÇO INOX 304" },
    { c: "PAR.207.0011", n: "PARAFUSO PHILIPS CABEÇA CILINDRICA M5X10MM AÇO INOX 304" },
    { c: "PAR.232.1005", n: "PARAFUSO PHILIPS CABEÇA CILINDRICA M4X20MM ACO INOX 304" },
    { c: "MEC.008.0104", n: "SUPORTE DE FIXAÇAO 1/2\"X1/8\"X50MM ROSCA M6 AÇO CARBONO" },
    { c: "USI.004.0006", n: "ESPAÇADOR ØE13XØI10X5MM ALUMINIO" },
    { c: "USI.005.0033", n: "HASTE DO FECHO CREMONA Ø5/16 X 647MM AÇO INOX" },
    { c: "USI.007.0003", n: "GUIA DA HASTE Ø22X10MM ROSCA 9-16 UNF POLIACETAL" },
    { c: "USI.014.0014", n: "BICO DE SAIDA D'AGUA ROSCA 1/2 BSPX38MM AÇO INOX" },
    { c: "USI.022.0054", n: "CONJUNTO DO BICO DE REDUÇAO DA CALDEIRA" },
    { c: "USI.022.0063", n: "CONJUNTO DA HASTE P/ SENSORES REED CALDEIRA" },
    { c: "ELE.022.0012", n: "RESISTENCIA CARACOL PEQUENA 1200W 220V INOX" },
    { c: "USI.002.0002", n: "TAMPA Ø156X5MM ALUMINIO" },
    { c: "MAP.003.0008", n: "CHAPA DE ALUMINIO 2000X1000X3MM" },
    { c: "ELE.020.0003", n: "PASSA FIO PARALAMA UNIVERSAL COD 16015" },
    { c: "MEC.001.0003", n: "ABRAÇADEIRA ROSCA SEM FIM GALVANIZADA 22-32" },
    { c: "MEC.012.0013", n: "REBITE ROSCA INTEIRA M6 C/ CAB. PLANA BICROMATIZADO" },
    { c: "MEC.007.0006", n: "FECHO LINGUETA REG. MIOLO FENDA COD. 28512" },
    { c: "MAC.010.0010", n: "FITA ALUMINIO PURO ADESIVA LARG 45MM ROLO C/30M" },
    { c: "MAP.003.0033", n: "CHAPA #16 AÇO CARBONO 2000 X 1200 X 1,5 MM FINA FRIO" },
    { c: "FAB.000.0001", n: "BOTIJAO DE GAS REFRIGERANTE R134A (13,6KG)" },
    { c: "MAP.003.0014", n: "CHAPA #12 AÇO CARBONO 2000X1200X2,65MM FINA FRIO" },
    { c: "PAR.135.3050", n: "PARAFUSO PHILLIPS CABEÇA ABAULADA M4X5MM INOX 304" },
    { c: "PAR.100.0011", n: "PINO DE PROJEÇÃO M6 X 20 MM- AÇO INOX" },
    { c: "MEC.012.0027", n: "REBITE TUBULAR ROSCA INTERNA M6 AÇO INOX 304" },
    { c: "ELE.005.0044", n: "CANALETA DE PVC 30 X 50 X 2000MTROS" },
    { c: "USI.013.0212", n: "ANEL DO PASSADOR DE FIO ØE=60XØI37X5MM SEM ROSCA - NYLON" },
    { c: "MEC.012.0018", n: "REBITE CABEÇA ABAULADA TIPO POP Ø3,2X10MM AÇO INOX 304" },
    { c: "MAP.013.0030", n: "TINTA PO POLIESTER TEXTURIZADA SEMI-BRILHO RAL 9003 BRANCO COD 10057832" },
    { c: "ELE.004.0013", n: "TERMOSTATO CAPILAR TR2 0-90°C MODELO 540010" },
    { c: "MAN.002.0001", n: "SUPORTE DE FIXAÇAO DO TERMOSTATO Ø10X30X6MM INOX TEMP. (0° A 40°)" },
    { c: "MAN.002.0008", n: "SUPORTE DO CABO USB ATTS_EDTS" },
    { c: "MAP.003.0041", n: "CHAPA #20 INOX AISI 304 2000X1250X1,0MM C/PVC AZUL" },
    { c: "MAP.003.0042", n: "CHAPA #16 INOX AISI 304 2000X1250X1,6MM C/PVC AZUL" },
    { c: "ELE.024.0075", n: "SENSOR DE NIVEL LD361-M12" },
    { c: "ELE.025.0080", n: "CONECTOR M12 FEMEA 90° CABO 2 MTS PVC 4 VIAS ICOS" },
    { c: "MAP.003.0088", n: "CHAPA #20 AÇO CARBONO 2000 X 1200 X 0,9 MM FINA FRIO" },
    { c: "ELE.024.0100", n: "TRANSMISSOR DE UMIDADE S501I-0S-0" },
    { c: "MAN.500.0007", n: "SISTEMA DE OSMOSE REVERSA ETHIK. MOD. OR-1 BIVOLT" },
    { c: "MAP.003.0046", n: "CHAPA #24 INOX AISI 304 2000X1250X 0,6 C/ PVC AZUL" },
    { c: "ISO.002.0004", n: "PAINEL LÃ DE VIDRO PSI-30 1200X600X50MM EMB 20,16M² TEMP -200 ATÉ 250°C" },
    { c: "MAP.006.0104", n: "SELANTE SILICONADO DOW CORNING (-65ºC A 260ºC) REF:736" },
    { c: "USI.014.0192", n: "LUVA DE REDUÇÃO ROSCA 1 1/16\" UNF E ROSCA 1/2\" NPT" },
    { c: "ELE.007.0088", n: "RELÉ DE INTERFACE JNG MOD. JAR50 220VCA 1NA+1NF" },
    { c: "MEC.011.0203", n: "CONEXÃO \"T\" COBRE 3/8\"" },
    { c: "CAL.001.0001", n: "CAL TEMP 20°C / 30°C / 40°C / 60°C - UMI 65%/75%" },
    { c: "MAN.005.0123", n: "BANDEJA ARAMADA 645X670MM AÇO INOX" },
    { c: "MEC.020.0055", n: "ARRUELA DE VEDAÇÃO 5/8 ØI16XØE25X3MM BORRACHA" },
    { c: "REF.004.0024", n: "TUBO CAPILAR DE COBRE ØI0,79MM ØI0,031IN ROLO 3M" },
    { c: "USI.014.0086", n: "BICO DA CALDEIRA ROSCA 1/2 BSP X 7/8\" X 34MM BICO Ø 21,7MM" },
    { c: "ACR.003.0007", n: "RECIPIENTE DOSADOR EM ACRILICO MED.147X50X50MM" },
    { c: "ELE.027.0027", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 0" },
    { c: "ELE.027.0028", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 1" },
    { c: "ELE.027.0029", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 2" },
    { c: "ELE.027.0030", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 3" },
    { c: "ELE.027.0031", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 4" },
    { c: "ELE.027.0032", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 5" },
    { c: "ELE.027.0033", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 6" },
    { c: "ELE.027.0034", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 7" },
    { c: "ELE.027.0035", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 8" },
    { c: "ELE.027.0036", n: "MARCADOR MILLENIUM MHG2/5 NUMERO 9" },
    { c: "VDR.002.0009", n: "BALAO VIDRO C/ FUNDO CHATO Ø220X210MM (DRENO ALTO)" },
    { c: "MAN.002.0113", n: "SUPORTE PARA FIXAÇÃO DA SONDA DE UMIDADE MED. 110X110X5MM" },
    { c: "USI.023.0103", n: "CONJUNTO DE ENTRADA DE CALIBRAÇAO Ø60X101MM POLIACETAL" },
    { c: "MAN.002.0010", n: "BASE P/ CALDEIRA (VDR.002.0009) DA CAMARA CLIMATICA" },
    { c: "VDR.001.0049", n: "VIDRO TEMPERADO MED 1290X715X6MM COM FUROS" },
    { c: "USI.022.0311", n: "CONJUNTO BASE DOS RODIZIOS EM TUBO P/CLIMATICA 600L" },
    { c: "MEC.007.0087", n: "FECHO LINGUETA EM POLIAMIDA C/ PORCA MIOLO BORBOLETA COD.25123" },
    { c: "ELE.012.0037", n: "FONTE HARTRONIC MOD. RS-25-24 1,1A 24V" },
    { c: "REF.001.0070", n: "CONDENSADOR 220MM 16T/2F 3/8 SAIDA ENTRADA DIR C/COIFA" },
    { c: "COM.000.0018", n: "CARTÃO DE MEMÓRIA SANDISK SDSQUNS-016G-GN3MA ULTRA SD 16GB" },
    { c: "USI.022.0324", n: "CONJUNTO GUIA HASTE CREMONA CLIMATICA 597L" },
    { c: "MAN.999.0014", n: "SUPORTE DE FIXAÇAO DO MOTOR IBRAM 120X105X3MM ALUMINIO" },
    { c: "MEC.008.0039", n: "HELICE 6\" ALUMINIO 5 PÁS ASPIRADOR GECOM MOTOR ANTI HORARIO" },
    { c: "USI.001.0164", n: "EIXO CIRCULAÇÃO Ø1/2X65MM ALUM FURO Ø8MM FR/TM" },
    { c: "MAP.003.0050", n: "CHAPA #22 AÇO CARBONO 2000 X 1200 X 0,75 MM FINA FRIO" },
    { c: "MAN.002.0121", n: "SUPORTE CABO EXTENSOR MACHO FEMEA CAT6 RJ45 INOX (2 PEÇAS)" },
    { c: "ELE.015.0149", n: "INTERFACE IHM70ER-SWPI (ETHERNET)" },
    { c: "ELE.031.3125", n: "CONTROLADOR PROCESSO C754+RS485+1XSPST+ENT DIG" },
    { c: "ELE.037.0040", n: "CABO DE REDE SOHOPLUS FURUKAWA RJ 45 2,5 METROS" },
    { c: "INF.000.0071", n: "RJ45 ADAPTADOR CONECTOR EMENDA CAT7/6/5E ETHERNET" },
    { c: "ELE.015.0151", n: "CABO EXTENSOR USB MACHO X FEMEA 90° 20CM" },
    { c: "CAL.001.0026", n: "CAL TEMP -30°C, 0°C, 50°C, 150°C E 300°C" },
    { c: "ELE.004.0057", n: "TERMOSTATO 16A PARA MAQUINA 60 GRAUS NORMAL FECHADO" },
    { c: "ELE.001.0112", n: "CHAVE 2 POSICOES ILUMINADA C/CAPA SILICONE VERMELHA RS-201-1 125V-20A/220V-16A ME" },
    { c: "PVC.015.0650", n: "PAINEL ADESIVO 550X350MM USB TOUCH 7\" CLIMATICA" },
    { c: "MEC.010.0113", n: "RODIZIO S/ FREIO GLRX 312 UFN 119KG PLACA 80X105MM INOX" },
    { c: "MEC.010.0112", n: "RODIZIO C/ FREIO GLRXOA 312 UFN 119KG PLACA 80X105MM INOX" },
    { c: "ELE.005.0001", n: "CABO PP 3X1,0MM²X1,5MT PT PLUG 3CO 10A 4,0MM NBR14136" },
    { c: "ELE.031.0030", n: "CONTROLADOR DE TEMPERATURA DIGITAL C130" },
    { c: "CHI.402.3010", n: "CHICOTE DA ESTUFA 402/3 A /5 E 404/1 A 3.1,0MM 110/220V" },
    { c: "ELE.001.0003", n: "INTERRUPTOR 29123 M1F-T1E-E3-G 15A M VERMELHO" },
    { c: "ELE.020.0009", n: "PASSADOR DE FIO EM PVC CONICO COM ALETAS" },
    { c: "ARU.130.0007", n: "ARRUELA PRESSAO M6 AÇO INOX 304" },
    { c: "ELE.022.0030", n: "RESISTENCIA W 302X397MM 1000W 220V RAB SILIC 350MM CARB" },
    { c: "MEC.002.0026", n: "FECHO MAGNETICO HBA-26 FERRITE" },
    { c: "ELE.024.0035", n: "SENSOR TIPO K COM RABICHO 1500MM 24 AWG" },
    { c: "ISO.002.0001", n: "MANTA LÃ BRANCA TECH LB 6,0 12000X1200X25" },
    { c: "MAN.001.0002", n: "CHAPA DE ENCOSTO PARA FECHO MAGNETICO PROMAG" },
    { c: "MAN.002.0041", n: "SUPORTE DE FIXAÇAO DO SENSOR K Ø5X121X30MM INOX" },
    { c: "MAN.005.0012", n: "BANDEJA EM CHAPA 440X390MM INOX 430" },
    { c: "PVC.015.0319", n: "PAINEL ADESIVO 90X400MM ESTUFA MOD 402-3N CONT CONTEMP" },
    { c: "MEC.004.0011", n: "PUXADOR LINHA ECO COD 92999 PRETO" },
    { c: "MEC.018.0005", n: "PE NIVELADOR Ø3/8X28MM" },
    { c: "PAR.005.2001", n: "PARAFUSO PHILIPS CAB CILIND AUTO-ATARRAX Ø5X10MM ZINC" },
    { c: "PAR.203.5008", n: "PARAFUSO CABEÇA SEXTAVADA M6X16MM AÇO INOX 304" },
    { c: "PAR.207.0015", n: "PARAFUSO PHILIPS CABEÇA CHATA M4X10 AÇO INOX 304" },
    { c: "USI.020.0009", n: "TUBO SUPERIOR DA ESTUFA 402-3G" },
    { c: "MAP.003.0007", n: "CHAPA #20 AÇO CARBONO 2500 X 1200 X 0,9 MM FINA FRIO" },
    { c: "MAC.002.0040", n: "CAIXA DE PAPELAO TAMPA/CINTA/FUNDO 760X750X760MM 58405 - BC" },
    { c: "MEC.018.5555", n: "CHAPA 3/8 PARA PE NIVELADOR Ø3/8X28MM MEC.018.0005" },
    { c: "MAP.003.0040", n: "CHAPA #24 INOX AISI 430 2000X1240X 0,6MM C/ PVC AZUL" },
    { c: "ELE.005.0015", n: "CABO PP 3X1,0MM²X2,0MT PT PLUG 3CO 10A 4,0MM NBR14136" },
    { c: "REF.001.0004", n: "CONDENSADOR 367MMX268MM 18T/2F 1/2 CDE2777" },
    { c: "ELE.004.0002", n: "TERMOSTATO CAPILAR 0-120°C TS120SB-R.5X105MM" },
    { c: "REF.005.2005", n: "COMPRESSOR HERMETICO EMBRACO EMI 60HER 220V 60HZ" },
    { c: "ELE.017.0048", n: "MICROVENTILADOR 120X120X38MM -10°C A +60°C 110/220V Q120A3" },
    { c: "ELE.022.0050", n: "RESISTENCIA ALETADA GRANDE L 700W 220V INOX 304" },
    { c: "MEC.002.0004", n: "DOBRADIÇA PS COM ROLDANA DE AÇO CROMADA" },
    { c: "MEC.003.0004", n: "COMP MOV FECHO MAGNETICO BRANCO *20 008029001" },
    { c: "REF.007.0019", n: "GAXETA IMANTADA MED 980X556X17MM" },
    { c: "ELE.015.2710", n: "PLACA FONTE L/D V0RV0 NORMAL VD BIVOLT" },
    { c: "MAN.005.0041", n: "BANDEJA EM CHAPA 990X680MM INOX 430" },
    { c: "MAN.005.0038", n: "BANDEJA P/ COLETA DE AGUA 20X170X400MM INOX 430 PINTADO" },
    { c: "MEC.004.0001", n: "MANIPULO ROSCA FEMEA M6X1,00MM BAQUELITE COD001BB20L M610 AMP BRASIL" },
    { c: "MEC.010.0007", n: "GLRON 312 PP 80 KG RODIZIO MARCA ROD CAR" },
    { c: "MEC.010.0008", n: "GLR 312 PP 90 KG RODIZIO MARCA ROD CAR S/FREIO" },
    { c: "VDR.001.0039", n: "VIDRO TEMPERADO INCOLOR ESQUERDO 930X550X6MM C/FUROS E CONF DESENHO" },
    { c: "VDR.001.0040", n: "VIDRO TEMPERADO INCOLOR DIREITO 930X550X6MM C/FUROS E CONF DESENHO" },
    { c: "MEC.008.0028", n: "SUPORTE DE FIXAÇAO 1/2X1/8X60MM ROSCA M5 AÇO CARBONO" },
    { c: "MEC.008.0105", n: "SUPORTE DE FIXAÇAO 1/2X1/8X55MM ROSCA M5 AÇO CARBONO" },
    { c: "USI.022.0006", n: "REGULADOR DE AR COMPLETO" },
    { c: "PRS.000.0001", n: "CALIBRAÇAO DE INDICADOR/CONTROLADOR DE TEMPERATURA" },
    { c: "MEC.031.0008", n: "CAIXA PLASTICA FRONTAL DO NOVO CONTROLADOR TOUCH" },
    { c: "MAP.015.0476", n: "PAINEL ADESIVO 106X630MM ESTUFA 410 NDR TOUCH SCREEN" },
    { c: "ELE.001.0012", n: "INTERRUPTOR PUSHBUTTON 24533-M3IX-A3IX W2-B BRANCO NF" },
    { c: "REF.001.0010", n: "EVAPORADOR 520X253X70MM 3/8X5MM" },
    { c: "ELE.022.0075", n: "RESISTENCIA RETA BLINDADA Ø9,52X590MM 300W 220V INOX" },
    { c: "MEC.005.0014", n: "BANDEJA ARAMADA 660X650MM AÇO CARBONO NIQUELADO" },
    { c: "MEC.011.0112", n: "CONEXAO COTOVELO P/ TUBO Ø3/8 C/ BOLSA COBRE" },
    { c: "REF.007.1160", n: "GAXETA IMANTADA MED 1296X725X17MM" },
    { c: "MEC.001.1313", n: "TRILHO P/ CONTADORA/DISJUNTOR" },
    { c: "MAP.013.0005", n: "TINTA PO 26 TEXTURIZADA CINZA RAL 7035 COD-10005965" },
    { c: "MAP.011.0001", n: "PERFIL MOLDURA V-3,31,8X5MM PVC BRANCO" },
    { c: "REF.004.0022", n: "TUBO CAPILAR DE COBRE ØI0,91MM E ØE2,01MM TIPO 0,036\"" },
    { c: "POR.003.0010", n: "PORCA SEXTAVADA M3 AÇO INOX 304" },
    { c: "PAR.001.0001", n: "PARAFUSO DB9 C/ PORCA E ARRUELA" },
    { c: "USI.022.0027", n: "CONJUNTO DE ENTRADA P/ CALIBRAÇAO Ø76X15MM ALUMINIO" },
    { c: "MEC.012.0001", n: "REBITE CABEÇA ABAULADA TIPO POP Ø3,2X10MM ALUMINIO DIN 7337" },
    { c: "MAP.015.0475", n: "PAINEL ADESIVO 109X506MM INCUBADORA TOUCH SCREEN" },
    { c: "PLC.022.0008", n: "CONTROLADOR DE TEMPERATURA TOUCH COLOR CALIBRADO (FAIXAS -30, 100, 300 )" },
    { c: "MEC.015.0004", n: "TAMPAO P/FURO Ø10 PLASTICO" },
    { c: "ELE.013.0021", n: "FUSIVEL DE VIDRO GRANDE 10A 250VCA TIPO 3AG" },
    { c: "MEC.001.0040", n: "REBITE ROSCA INTERNA M4 CAB. EXTRA FINA INOX 304" },
    { c: "ELE.015.2719", n: "PLACA TRANSFORMADOR SAIDA 13VAC" },
    { c: "ELE.015.2720", n: "PLACA FONTE L/D V0RV0 NORMAL VD BIVOLT PROVISORIA 2 TECLAS" },
    { c: "MAN.005.0048", n: "BANDEJA PARA COLETA DE AGUA 40X170X630MM INOX 430" },
    { c: "MAP.003.0063", n: "CHAPA #20 INOX AISI 201 2000X1250X1,0MM C/ PVC AZUL" },
    { c: "ELE.017.0130", n: "VENTILADOR RADIAL 220V 60HZ UF190APA23H1C2A/ COM CAPACITOR COD. 3081329" },
    { c: "ELE.017.0131", n: "CAPACITOR 1,5 UF 400 VDB P/MOTOR MOD. R2E190-AO26-05" },
    { c: "ELE.017.0132", n: "DIFUSOR P/MOTOR MOD. R2E190-AO26-05" },
    { c: "MAN.017.0133", n: "SUPORTE DO MOTOR R2E 190-RA26-05 240X100X80MM INOX" },
    { c: "MAN.002.0105", n: "PROTEÇÃO DO ROTOR EM CHAPA # 20 INOX 430" },
    { c: "CAL.003.0001", n: "CAL TEMP -50°C / 0°C / 50°C /150°C /350ºC" },
    { c: "ELE.005.0022", n: "CABO PP 3X2,5MM2" },
    { c: "MAN.010.0200", n: "FLAT 10 VIAS 200MM" },
    { c: "ELE.031.0070", n: "CONTROLADOR REFRIGERAÇAO TC970E LOG+ECO VER.03 90-240VAC - CTRL" },
    { c: "ELE.014.0038", n: "DISJUNTOR TERMOMAG. SIEMENS 5SX1 210-6 BIPOLAR B 10A" },
    { c: "ELE.037.0004", n: "PLUG MACHO 20A 3 POLOS PADRAO BRASILEIRO MARCA WEG" },
    { c: "REF.001.0001", n: "CONDENSADOR 367MMX268MM 30T/3F 3/4 CDE 2778" },
    { c: "REF.005.1013", n: "COMPRESSOR HERMETICO EMBRACO T2180GK 220V 60HZ" },
    { c: "ELE.017.0053", n: "MICROVENTILADOR 162X162X55MM -30°C A +60°C 110/220V QUALITAS Q160A3G" },
    { c: "ELE.018.0065", n: "RESISTENCIA SILICONE TC 220V 24W/M 4660MM" },
    { c: "ISO.004.0001", n: "PRODUTO POLIURETANO ISOTERMICO (ESCURO)" },
    { c: "ISO.004.0002", n: "PRODUTO POLIURETANO POLITERMICO (CLARO)" },
    { c: "ELE.015.3001", n: "PLACA FONTE L/D V1 RV2 RL1 VM 220V" },
    { c: "ELE.015.3401", n: "PLACA NE L/D1 FUNÇAO S1" },
    { c: "ELE.015.7901", n: "PLACA FONTE ALARME PIC V0 RV1 VD/VM 220V" },
    { c: "MAN.002.0047", n: "SUPORTE CONTROLADOR DEGELO" },
    { c: "REF.004.0002", n: "TUBO CAPILAR DE COBRE ØI1,07MM E Ø 2,17MM 0,042" },
    { c: "USI.022.0046", n: "CONJUNTO DE ENTRADA DE CALIBRAÇAO Ø60X86MM POLIACETAL" },
    { c: "MAP.015.0483", n: "PAINEL ADESIVO FREEZER 415 -TD 255 TOUCH SCREEN" },
    { c: "FAB.000.0011", n: "BOTIJAO GAS DE REFRIGERANTE 404A (10,90KG)" },
    { c: "ELE.004.0014", n: "TERMOSTATO CAPILAR TR2 0° A 40° AJUSTAVEL MOD: 540030 BRASITERM" },
    { c: "ELE.005.0021", n: "CABO PP 3X1,0MM²X1,5MT PT PLUGS 3CO+OA5 4MM NBR14136" },
    { c: "ELE.017.0100", n: "MOTOR DE PASSO SM1.8-D12-MN BIPOLAR SE" },
    { c: "ELE.001.0004", n: "MICROINTERRUPTOR - 40108 A5 E3 Q 15A - MARGIRIUS" },
    { c: "ELE.005.0048", n: "FIXADOR AUTO ADESIVO PLASTICO MOD LKCS/A NAT" },
    { c: "ELE.039.0006", n: "CONECTOR P/ FUSIVEL E INTERRUPTOR CODIGO EX-2153" },
    { c: "ARU.110.0001", n: "ARRUELA PRESSAO M5 AÇO INOX 304" },
    { c: "ARU.110.0006", n: "ARRUELA PRESSAO M4 AÇO INOX 304" },
    { c: "MEC.021.0005", n: "CORREIA SINCRONIZADA 130 XL 3/8X" },
    { c: "MEC.018.0004", n: "PE NIVELADOR ROSCA 1/4X30MM PN3031" },
    { c: "POR.003.0003", n: "PORCA SEXTAVADA M5 AÇO INOX 304" },
    { c: "PAR.101.1011", n: "PARAFUSO CABEÇA CILINDRICA M6X15 AÇO INOX 304" },
    { c: "PAR.105.1009", n: "PARAFUSO ALLEN M5X35MM AÇO INOX 304" },
    { c: "PAR.113.3001", n: "PARAFUSO PHILIPS CABEÇA CHATA M3X6MM AÇO INOX 304" },
    { c: "PAR.113.6001", n: "PARAFUSO PHILIPS CABEÇA CHATA M3X20MM BICROMATIZADO AMARELO" },
    { c: "PAR.135.3001", n: "PARAFUSO ALLEN M4X12MM AÇO INOX 304" },
    { c: "PAR.135.3002", n: "PARAFUSO ALLEN M6X45MM AÇO INOX 304" },
    { c: "PAR.135.3033", n: "PARAFUSO ALLEN CABEÇA SEM CABEÇA M6X8MM AÇO INOX 304" },
    { c: "PAR.135.3039", n: "PARAFUSO ALLEN M4X20MM AÇO INOX 304" },
    { c: "PAR.135.3042", n: "PARAFUSO ALLEN M6X25MM AÇO INOX 304" },
    { c: "PAR.235.3051", n: "PARAFUSO ALLEN SEM CABEÇA M4X5 AÇO INOX 304" },
    { c: "USI.012.0020", n: "POLIA SINCRONIZADA 12XL 3/8 C/ FURO Ø6,35MM ALUMINIO" },
    { c: "MEC.020.0036", n: "PINCEL C/ CERDA BRANCA OU PRETA DE 1/2\" CABO CURTO" },
    { c: "PAR.100.0007", n: "PINO DE PROJEÇÃO M6 X 15 MM - AÇO INOX" },
    { c: "ELE.060.0002", n: "ESPAÇADOR PLASTICOS ECI 3,0 NAT" },
    { c: "PAR.100.0010", n: "PINO DE PROJEÇAO M4X15 MM AÇO INOX" },
    { c: "PLM.022.0011", n: "PLACA CONTROLADORA DUROMETRO EDTS E ATTS MONTADA" },
    { c: "CHI.298.0002", n: "CHICOTE DUROMETRO 0,30MM² 110/220V 298 ATTS/EDTS V.II" },
    { c: "DRY.022.0241", n: "CONJUNTO MEDIDOR DE DUREZA 298 ATTS/EDTS V.II" },
    { c: "USI.022.0236", n: "CONJUNTO ESTICADOR EXCENTRICO Ø35X17MM AÇO INOX C/ ROLAMENTO 6202" },
    { c: "ELE.024.0135", n: "CELULA DE CARGA 130X50X25MM 50KG MOD.G50" },
    { c: "MAP.999.0183", n: "ESCOVA ADESIVA 7X15MM PRETA 3M" },
    { c: "ELE.012.0040", n: "FONTE HARTRONIC MOD LRS-150F-24" },
    { c: "ELE.015.0153", n: "INTERFACE IHM DELTA DOP-107EG" },
    { c: "ELE.017.0169", n: "DRIVE MOTOR DE PASSO KTC-STR-3 KALATEC COD 4648" },
    { c: "MEC.500.0008", n: "IMPRESSORA TÉRMICA INCORPORADA AIEBCY DO RECIBO 58MM MINI IM" },
    { c: "PVC.015.0625", n: "PAINEL ADESIVO 348X189MM TOUCH 7\" USB DUROMETRO" },
    { c: "PVC.015.0626", n: "PAINEL ADESIVO 130X80MM RJ45 FUSIVEL DUROMETRO" },
    { c: "USI.017.0038", n: "BASE 215X349MMX1/2\" C/ FUROS ROSCAS ALUM" },
    { c: "USI.008.0216", n: "MÃO FRANCESA 168X76MMX1/2\" C/ FUROS ROSCAS INOX" },
    { c: "USI.008.0217", n: "SUPORTE CELULA CARGA G50 90X38X16MM AÇO INOX C/ FUROS ROSCAS INOX" },
    { c: "USI.008.0218", n: "SUPORTE ESMAGADOR 90X38X38MM INOX ELETROPOLIDO" },
    { c: "USI.017.0039", n: "BASE COMPRIMIDO 117X24X20MM INOX ELETROPOLIDO" },
    { c: "PRS.000.0113", n: "TRATAMENTO ELETROPOLIMENTO P/ USI.008.0218 E USI.017.0039" },
    { c: "USI.008.0219", n: "SUPORTE P/ BASE DO COMPRIMIDO 44X25X8MM INOX" },
    { c: "ELE.024.0025", n: "CELULA DE CARGA MRS-30 ALIMENTAÇAO 10VCC" },
    { c: "ELE.025.0001", n: "CONECTOR TIPO DB9 MACHO" },
    { c: "ELE.025.0078", n: "CONECTOR PHONEX HOUSING AKZ 950 04 5,0 5.8-V GREEN" },
    { c: "ELE.029.0012", n: "TRANSFORMADOR ENT.110/220V SAIDA 20V/2,5A-7,5V/700MA-12V/700MA 60HZ" },
    { c: "ELE.015.0126", n: "PLACA FONTE DO DUROMETRO 220V" },
    { c: "ELE.015.0002", n: "CABO EXTENSOR USB MACHO X FEMEA 0,5MT - WI026" },
    { c: "MEC.031.0040", n: "SUPORTE FRONTAL DA IHM 234X127MM POLIETILENO" },
    { c: "PLM.022.0012", n: "PLACA DATA LOGGER MONTADA" },
    { c: "DRY.022.0242", n: "CONJUNTO MEDIDOR DE ALTURA 298 EDTS V.II" },
    { c: "USI.008.0188", n: "MÃO FRANCESA 85X50X13MM ALUMINIO" },
    { c: "USI.025.0008", n: "APOIO DO MEDIDOR DE ALTURA 80X38X13MM 298 EDTS V.II" },
    { c: "USI.025.0009", n: "APOIO DO MEDIDOR DE ALTURA 50X38X13MM 298 EDTS V.II" },
    { c: "MEC.999.0024", n: "ALAVANCA TRAVA FEMEA POLIAMIDA ATF 5018-M6" },
    { c: "MEC.002.0091", n: "DOBRADIÇA PLANA EXTERNA COM ABERTURA DE 180° REF 91411" },
    { c: "MAP.015.0497", n: "PAINEL ADESIVO 150X280MM TOUCH 298 ATTS/EDTS" },
    { c: "USI.017.0032", n: "BASE 415X215X13MM ALUMINIO 298 ATTS/EDTS" },
    { c: "ACR.008.0021", n: "CAIXA DE COLETA 155X102X65MM ACRILICO 298 ATTS/EDTS" },
    { c: "ACR.008.0022", n: "TAMPA ACRILICO 102X100X65MM 298 ATTS/EDTS" },
    { c: "USI.008.0192", n: "SUPORTE DA CELULA CARGA MOD.G50 50X38X25MM AÇO INOX" },
    { c: "USI.008.0193", n: "SUPORTE DA CELULA CARGA MOD.MRS-30 65X51X13MM ALUM" },
    { c: "USI.008.0194", n: "SUPORTE ESMAGADOR 90X38X38MM AÇO INOX ELETROPOLIDO" },
    { c: "USI.008.0195", n: "FLANGE FIXAÇÃO Ø35X15MM 03 ROSCAS M4 ALUM" },
    { c: "USI.013.0036", n: "ARRUELA Ø32X4MM C/ FURO Ø22MM NYLON" },
    { c: "USI.022.0303", n: "SUPORTE DO PAINEL 340X50MM TUBO Ø22MM" },
    { c: "USI.008.0197", n: "SUPORTE MEDIDOR DE ALTURA 45X34X20MM ALUM" },
    { c: "USI.017.0033", n: "BASE P/ COMPRIMIDO 117X24X16MM INOX ELETROPOLIDO" },
    { c: "USI.008.0198", n: "SUPORTE P/ BASE DO COMPRIMIDO 40X25X8MM INOX" },
    { c: "PRS.000.0058", n: "TRATAMENTO ELETROPOLIMENTO P/ USI.017.0033 E USI.008.0194" },
    { c: "PLC.022.1005", n: "CONJUNTO IHM P/ DUROMETRO EDTS" },
    { c: "MAP.015.0544", n: "PAINEL ADESIVO 345X140MM 298 ATTS/EDTS DATA LOGGER" },
    { c: "ELE.005.0002", n: "CABO PP 3X1,5MM²X2,0MT PT PLUG 3CO 15A 4,8MM NBR14136" },
    { c: "ELE.014.0013", n: "DISJUNTOR TERMOMAG. SIEMENS 5SX1 106-7 MONOPOLAR C 6A" },
    { c: "ELE.039.0002", n: "TOMADA DE PAINEL 2P+T10A 250V TPA-23E3-F PADRAO BRASILEIRO" },
    { c: "ELE.004.0001", n: "TERMOSTATO CAPILAR TU 50-320°C BULBO INOX - CAEM" },
    { c: "ARU.010.0012", n: "ARRUELA LISA M4 AÇO INOX 304" },
    { c: "MEC.011.0012", n: "UNIAO COM ROSCA 1/4 NPT P/ TUBO Ø1/4 LATAO ARC 1004/1414" },
    { c: "MEC.025.0001", n: "NIPLE CLAMP-POLEGADA OD-SOLDA -LONG 1 1/2" },
    { c: "MEC.025.0002", n: "NIPLE CLAMP CEGO Ø1 1/2" },
    { c: "MEC.025.0004", n: "ANEL DE VEDAÇAO CLAMP-POLEGADA OD Ø1 1/2" },
    { c: "MEC.013.0005", n: "VALVULA ESFERA 3 VIAS 1/4 TUBO/TUBO" },
    { c: "POR.003.0005", n: "PORCA SEXTAVADA M8 AÇO INOX 304" },
    { c: "POR.003.0006", n: "PORCA SEXTAVADA M10 AÇO INOX 304" },
    { c: "POR.014.3002", n: "PORCA EM LATAO 1/4 SAE CURTA C/ ROSCA UNF" },
    { c: "POR.101.0003", n: "PORCA SEXTAVADA M4 AÇO INOX 304" },
    { c: "POR.102.0002", n: "PORCA SEXTAVADA 5/8\" C/ ROSCA PARALEL 7/16\" UNF X 5 MM LATAO" },
    { c: "USI.022.0238", n: "CONJ POÇO TERMOMETRICO RETO FLANGEADO ØE3/8 XØI7MM ROSCA M10 INOX" },
    { c: "USI.011.0070", n: "BUCHA Ø20X7MM NYLON" },
    { c: "USI.014.0012", n: "CONEXAO P/ MANGUEIRA Ø3/8 ROSCA 7/16 UNFX49MM CROMADO" },
    { c: "USI.020.0036", n: "TUBO PROLONGADOR DA ENTRADA DE CALIBRAÇAO Ø38X120MM AÇO INOX" },
    { c: "MAP.026.0104", n: "BARRA CHATA 5/8X1/8 AÇO INOX AISI 304" },
    { c: "MAP.003.0012", n: "CHAPA #12 INOX AISI 304 2000 X 1250 X 2,50 - COM PVC" },
    { c: "MEC.025.0003", n: "ABRAÇADEIRA CLAMP-MACIÇA Ø1 1/2" },
    { c: "MEC.014.0003", n: "MOLA Ø15X21MM FIO 2MM PASSO 5MM AÇO CARBONO" },
    { c: "ELE.013.0020", n: "FUSIVEL DE VIDRO GDE 5A 250 VCA TIPO 3AG" },
    { c: "PRS.000.0005", n: "TRATAMENTO DE SUPERFICIE ELETROPOLIMENTO DE CUBA A VACUO 47 LTS" },
    { c: "VDR.001.0230", n: "VIDRO TEMPERADO 430X380X10MM INCOLOR C/ FUROS" },
    { c: "ELE.024.0136", n: "TRANSMISSOR PRESSÃO -760 A 760 MMHG SAÍDA 4-20MA ROSCA 7/16\" UNF CABO 1M" },
    { c: "MEC.011.0025", n: "PERFIL TIPO \"E\" VAZADO COM EMENDA A FRIO MED 1270MM (SHORE A65 +-5) PRETO" },
    { c: "MAC.002.0102", n: "CHAPA DE PAPELAO 2000X2000 - TABULEIRO QUALID RP-64BC" },
    { c: "ELE.024.0015", n: "SENSOR DE TEMPERATURA TIPO PT 100 150MM ESPECIAL COM FLANGE SEXTAVADO" },
    { c: "ELE.005.0119", n: "CANALETA DE PVC 20 X 30 X 2000MTROS" },
    { c: "USI.008.0155", n: "LUVA Ø5/8X65MM ROSCA 1/4 NPT AÇO INOX TREFILADO" },
    { c: "USI.999.1158", n: "PORCA 2\" COM ROSCA 1.1/4\" BSP" },
    { c: "USI.999.1159", n: "BASE DA TRAVA DA LINGUETA MED.1\"X2\"X1/2\"X5MM" },
    { c: "USI.999.1160", n: "TRAVA DA LINGUETA MED.1/2\"X1\"1/2\"X35MM" },
    { c: "MEC.020.0018", n: "ARRUELA DE SILICONE PARA 300ºC ØEXT 57 X ØINT40 X 2MM" },
    { c: "ELE.022.0151", n: "RESISTENCIA ESPECIAL TIPO CHAPEIRA MED.278.5X250.5MM 1.500W 220V INOX" },
    { c: "VDR.001.0284", n: "VIDRO COMUM MEDIDA 332 X 332 X 4MM" },
    { c: "PVC.015.0537", n: "PAINEL TRASEIRO ADESIVO ESTUFA VACUO 27 LITROS" },
    { c: "PAR.202.6000", n: "PARAFUSO ALLEN CABECA ABAULADA M8X50MM AÇO INOX 304" },
    { c: "MAN.020.0061", n: "ARRUELA DE SILICONE PARA 300ºC ØEXT 20 X ØINT 9 X 2MM" },
    { c: "USI.003.0017", n: "BASE ALUMINIO 290MMX280MMX1/2 ESTUFA VACUO 440-1 C/ 5 FACES ESCOVADAS" },
    { c: "MEC.007.0066", n: "FECHO LINGUETA PRESSÃO COM TRAVA CÓD. TASCO 29000" },
    { c: "PAR.135.3069", n: "PARAFUSO ALLEN M4X16MM AÇO INOX 304" },
    { c: "PVC.015.0637", n: "PAINEL ADESIVO LED CONTROLADOR 48X48MM 524X146MM ESTUFA VACUO" },
    { c: "USI.999.1679", n: "GUIA BASE DE FECHO ESPECIAL Ø50X22MM NYLON" },
    { c: "ELE.025.0002", n: "SUPORTE P/ 4 PILHAS TAMANHO AA MOD SP5 (CANOA)" },
    { c: "ELE.025.0053", n: "CONECTOR MOLEX HOUSING 2,5MM 5051-N 2 VIAS CN23 251202HP05" },
    { c: "ELE.025.0055", n: "CONECTOR MOLEX HOUSING 2,5MM 5051-N 4 VIAS CN21 251204HP05" },
    { c: "ELE.008.0011", n: "PILHA ALCALINA 1,2V TAMANHO AA DURACELL" },
    { c: "MEC.018.0009", n: "ANTI IMPACTO 3M 08MMX08MMX2,5MM (BATENTE DE SILICONE 8MM)" },
    { c: "ELE.015.4702", n: "PLACA DUROMETRO NE DGP V4RV1" },
    { c: "PVC.015.0384", n: "PAINEL ADESIVO 81MMX52MM DUROMETRO 298 DGP VERSAO II" },
    { c: "PAR.135.3046", n: "PARAFUSO ALLEN M5X10MM AÇO INOX 304" },
    { c: "USI.022.0216", n: "KIT DE PEÇAS DUROMETRO DGP" },
    { c: "MAC.002.0064", n: "CAIXA DE PAPELAO TAMPA/CINTA/FUNDO 500X295X450MM" },
    { c: "MEC.031.0060", n: "CAIXA PLASTICA DUROMETRO DGP VERSAO III" },
    { c: "ACR.008.0010", n: "TAMPA P/DUROMETRO DGP 37X62X25MM ACRILICO I" },
    { c: "PRS.017.0008", n: "SERVIÇO DE USINAGEM BASE 12,4X52X63MM ALUMINIO" },
    { c: "PRS.001.0167", n: "SERVIÇO DE USINAGEM EIXO PARA ROLAMENTO Ø4,75X17MM INOX" },
    { c: "PRS.008.0101", n: "SERVIÇO DE USINAGEM SUPORTE DE FIXAÇAO 12,7X135X63MM ALUMINIO" },
    { c: "PRS.008.0032", n: "SERVIÇO DE USINAGEM SUPORTE DO MANCAL 60,2X38X63MM ALUMINIO" },
    { c: "PRS.010.0007", n: "SERVIÇO DE USINAGEM MANCAL DO DUROMETRO DGP Ø31,8X17MM LATAO" },
    { c: "PRS.029.0014", n: "SERVIÇO DE USINAGEM FUSO ROSCA ESQUERDA M12X65MM AÇO INOX 304" },
    { c: "PRS.021.0001", n: "SERVIÇO DE USINAGEM MANIPULO RECARTILHADO Ø38X42MM ALUMINIO" },
    { c: "PRS.011.0025", n: "SERVIÇO DE USINAGEM BUCHA ESPAÇADORA Ø1/2X7MM LATAO" },
    { c: "PRS.008.0109", n: "SERVIÇO DE USINAGEM SUPORTE ESMAGADOR ROSCA ESQ M12 Ø19X45MM INOX" },
    { c: "PRS.004.0004", n: "SERVIÇO DE USINAGEM PROLONGADOR DA CELULA DE CARGA 1/2X28X14MM AÇO INOX" },
    { c: "PRS.008.0111", n: "SERVIÇO DE USINAGEM SUPORTE 27X9,5X18MM AÇO INOX" },
    { c: "PRS.021.0001A", n: "TRATAMENTO SUPERFICIAL POLIDO ANODIZADO PRETO BRILHANTE (MANIPULO RECARTILHADO)" },
    { c: "PRS.008.0032A", n: "TRATAMENTO SUPERFICIAL POLIDO ANODIZADO PRETO BRILHANTE (SUPORTE DO MANCAL)" },
    { c: "PRS.008.0101A", n: "TRATAMENTO SUPERFICIAL POLIDO ANODIZADO PRETO BRILHANTE (SUPORTE DE FIXAÇAO)" },
    { c: "PRS.000.0021", n: "PRESTAÇÃO DE SERVIÇO" },
    { c: "PRS.000.0022", n: "MANUTENÇAO PREVENTIVA" },
    { c: "ELE.017.0004", n: "MICROREDUTOR 31RPM BIVOLT 60HZ" },
    { c: "ELE.017.0013", n: "MOTOR M130 BIVOLT 35W 2P 3420RPM CLASSE B 60HZ C/ ROLAMENTO PARAFUSO INOX M4" },
    { c: "ELE.025.0014", n: "CAPA P/ CONECTOR DB9 KIT LONGO" },
    { c: "FAB.004.0065", n: "CHAVE ALLEN 2,5MM" },
    { c: "ELE.024.0013", n: "SENSOR DE TEMPERATURA TIPO PT 100 150MM" },
    { c: "ACR.003.0006", n: "CONJUNTO CUBA ACRILICO 170X327X200MM COMPLETA" },
    { c: "MAN.301.0122", n: "CESTO P/ DESINTEGRADOR C/ 6 TUBOS NOVA ETICA" },
    { c: "MEC.301.0123", n: "PASTILHA DE ACRILICO P/ DESINTEGRADOR" },
    { c: "PVC.015.0079", n: "ETIQUETA NIVEL TRANSPARENTE 20X50MM" },
    { c: "MAP.002.0013", n: "GUARNIÇAO QUADRADO 5/8 BORRACHA PRETA" },
    { c: "MEC.018.0003", n: "PE DE BORRACHA PEQUENO Ø15X10MM NR 36" },
    { c: "USI.022.0022", n: "CONJUNTO DA HASTE DE AGITAÇAO ØE12X120MM INOX" },
    { c: "USI.005.0018", n: "HASTE GUIA DO CESTO Ø5/16X355MM AÇO INOX" },
    { c: "USI.005.0066", n: "HASTE C/ ROSCA W 1/4 QUAD 3/8X177MM INOX" },
    { c: "USI.008.0019", n: "SUPORTE INF DE FIXAÇAO DA HASTE 3/8X75X19MM ALUMINIO" },
    { c: "USI.008.0075", n: "SUPORTE SUPERIOR DE FIX DA HASTE 3/8X70X19MM ALUMINIO" },
    { c: "USI.013.0011", n: "ANEL ESPAÇADOR ØE7,5X4,2X4MM LATAO" },
    { c: "USI.022.0029", n: "CONJUNTO DO EXCENTRICO Ø70X45MM AÇO CARBONO" },
    { c: "USI.022.0099", n: "CONJUNTO DA ROLDANA ØE25,4 X ØI 9,9 X 11MM POLIACETAL COM ROLAMENTO" },
    { c: "ELE.022.0008", n: "RESISTENCIA CARACOL PEQUENA 600W 220V INOX" },
    { c: "MAP.003.0009", n: "CHAPA DE ALUMINIO 2000X1000X5MM" },
    { c: "VDR.002.0044", n: "COPO BECKER ØE105X145MM VIDRO 1 LITRO FORMA BAIXA" },
    { c: "MAP.013.0041", n: "TINTA PO POLIESTER TEXTURIZADA BRILHANTE RAL 9003 10057832" },
    { c: "PVC.015.0628", n: "PAINEL ADESIVO 300X106MM CONTROLADOR CONTEMP C754" },
    { c: "USI.022.0100", n: "CONJUNTO DO POÇO TERMOMETRICO RETO FLANGEADO Ø3/8 X 135MM" },
    { c: "ELE.031.0022", n: "CONTROL DE TEMP MICRO ETC45 ETICA-LED -30°C, 0°C, 50°C, 150°C E 300°C" },
    { c: "CHI.411.2010", n: "CHICOTE DA BOD 411-D 86 A 335 1,5MM² 110/220V" },
    { c: "REF.001.0002", n: "CONDENSADOR 210MM 8T/2F 1/6 CDE 2580" },
    { c: "REF.001.0008", n: "EVAPORADOR 223X223MM 24T 3/8X5MM" },
    { c: "REF.005.2008", n: "COMPRESSOR HERMETICO EMBRACO EMIS20HHR 220V 60HZ" },
    { c: "ELE.022.0052", n: "RESISTENCIA RETA BLINDADA Ø9,52X300MM 150W 110V INOX" },
    { c: "MEC.005.0018", n: "BANDEJA ARAMADA 440X340MM AÇO CARBONO NIQUELADO" },
    { c: "REF.007.1186", n: "GAXETA IMANTADA MED 586X490X17MM" },
    { c: "MAP.015.0034", n: "PAINEL ADESIVO 97X494MM INCUBADORA BOD 86L DISPLAY LED" },
    { c: "MAC.002.0010", n: "CAIXA DE PAPELAO ENVELOPE 790X670,5X1730" },
    { c: "MAN.005.0003", n: "BANDEJA PARA COLETA DE AGUA 40X170X475MM INOX 430" },
    { c: "MAN.026.0400", n: "FLAT 26 VIAS 400MM" },
    { c: "ELE.031.0035", n: "CONTROL DE TEMP MICRO ETC45 ETICA-LCD -30°C, 0°C, 50°C, 150°C E 300°C." },
    { c: "ELE.017.0019", n: "MOTOREDUTOR MR110-VE-240 240RPM 24VCC" },
    { c: "ELE.029.0043", n: "TRANSFORMADOR ENT.127/220V SAIDA 25V-0V-25V 60HZ 100VA MT61" },
    { c: "MEC.005.0001", n: "CORREIA POLICORTE POLIURETANO VERDE ASPERO Ø5MM" },
    { c: "ELE.022.0004", n: "RESISTENCIA U 287X50MM 600W 220V AÇO INOX" },
    { c: "ELE.024.0045", n: "DISCO PARA SENSOR OPTICO 64 PULSOS" },
    { c: "ELE.015.5901", n: "PLACA FONTE NE CPU FT24V V1R3 240 AZ 220V" },
    { c: "ELE.015.6601", n: "PLACA NE F FT24V LCD V1R3" },
    { c: "ELE.015.8701", n: "PLACA NETICA ROTAÇAO V1R0" },
    { c: "MAN.002.0037", n: "SUPORTE DE FIXAÇAO DO SENSOR OPT PH203 44X33X15MM INOX" },
    { c: "MEC.004.0002", n: "PUXADOR PLANO (POLIAMIDA) COD.91355 TASCO" },
    { c: "MEC.018.0018", n: "VENTOSA Nº2 DE APOIO P/ EQUIPAMENTO COM ROSCA MACHO 5/16" },
    { c: "USI.022.0071", n: "CONJUNTO DO MANCAL P/ ROL 6001 E EXCENTRICO LOUCO Ø12MM" },
    { c: "POR.015.3003", n: "PORCA SEXTAVADA Ø9/16X5MM ROSCA W3/8 LATAO" },
    { c: "USI.008.0051", n: "SUPORTE PARA SENSOR OPTICO ØE33XØI26,5X5MM ALUMINIO" },
    { c: "USI.012.0005", n: "POLIA Ø40X17MM P/ SISTEMA MECANICO ALUMINIO" },
    { c: "USI.014.0013", n: "ADAPTADOR SEXTAVADO 7/8 C/ ROSCA 1/4 NPTX49MM LATAO" },
    { c: "USI.022.0093", n: "CONJUNTO DO POÇO TERMOMETRICO RETO FLANGEADO Ø3/8" },
    { c: "USI.022.0094", n: "CONJUNTO DO EIXO C/ MANCAL Ø48X34,5MM" },
    { c: "USI.022.0095", n: "CONJUNTO DO EXCENTRICO C/ MANCAL Ø44X37MM" },
    { c: "USI.026.0004", n: "PARAFUSO COM ROSCA 1/4BSPT ØE25,4XØI8,5X15MM LATÃO" },
    { c: "MAP.003.0001", n: "CHAPA #20 INOX AISI 304 3000X1250X1,0MM C/PVC AZUL" },
    { c: "MAN.003.0005", n: "GARRA P/ FRASCOS DE 250ML AÇO INOX" },
    { c: "MAC.002.0015", n: "PLASTICO BOLHA ROLO 100MX1300MM ESP 10MM" },
    { c: "MEC.999.1078", n: "MANIPULO MARGARIDA ROSCA MACHO M6X25MM INOX COD.00980" },
    { c: "MAC.002.0058", n: "PLACA DE ISOPOR P-1 1000X500X35MM" },
    { c: "MAP.015.0019", n: "PAINEL ADESIVO 414X100MM BANHO 501 REV.01" }
        ]; 
        // Nota: Substitua esta array vazia [] pela lista completa de "pecasIniciais" que estava no seu app.js anterior para não perder as peças de fábrica!
    } else {
        bancoPecas = salvo;
    }
    
    // Constrói os mapas rápidos
    pecasPorCodigo.clear(); pecasPorNome.clear();
    bancoPecas.forEach(p => { pecasPorCodigo.set(p.c, p); pecasPorNome.set(p.n, p); });
    
    atualizarListasHTML();
}

function atualizarListasHTML() {
    const dlCodigos = document.getElementById('dbCodigosPecas'); const dlNomes = document.getElementById('dbNomesPecas');
    if(!dlCodigos || !dlNomes) return;
    let htmlCodigos = ''; let htmlNomes = '';
    bancoPecas.forEach(peca => { htmlCodigos += `<option value="${peca.c}">${peca.n}</option>`; htmlNomes += `<option value="${peca.n}">${peca.c}</option>`; });
    dlCodigos.innerHTML = htmlCodigos; dlNomes.innerHTML = htmlNomes;
}

function autoPreencherPeca(input, tipo) {
    const row = input.closest('.peca-row-item'); const inputNome = row.querySelector('.n'); const inputCod = row.querySelector('.c');
    
    if (tipo === 'codigo' && input.value) {
        const p = pecasPorCodigo.get(input.value); // O(1)
        if (p && !inputNome.value) inputNome.value = p.n;
    } else if (tipo === 'nome' && input.value) {
        const p = pecasPorNome.get(input.value); // O(1)
        if (p && !inputCod.value) inputCod.value = p.c;
    }
}

async function aprenderPecasDaOS() {
    let bancoAtualizado = false;
    document.querySelectorAll('.peca-row-item').forEach(row => {
        let n = row.querySelector('.n').value.trim(); let c = row.querySelector('.c').value.trim();
        if (n && c && !pecasPorCodigo.has(c) && !pecasPorNome.has(n)) {
            const novaPeca = { c: c, n: n };
            bancoPecas.push(novaPeca); pecasPorCodigo.set(c, novaPeca); pecasPorNome.set(n, novaPeca);
            bancoAtualizado = true;
        }
    });
    if (bancoAtualizado) { await localforage.setItem('banco_pecas_inteligente', bancoPecas); atualizarListasHTML(); }
}

// === ASSINATURAS MODAIS ===
function abrirModalAssinatura(alvo) {
    if(osState.status === 'SELADO' && alvo === 'cliente') { mostrarToast("O.S. já foi assinada."); return; }
    alvoAssinaturaAtual = alvo; document.getElementById('tituloModalAssinatura').textContent = alvo === 'tecnico' ? 'Assinatura (Técnico)' : 'Assinatura (Cliente)';
    document.getElementById('modalAssinaturaExpandida').classList.remove('hidden'); document.body.style.overflow = 'hidden';
    setTimeout(() => { if(padExpandido) padExpandido.clear(); resizeCanvasSeguro(document.getElementById('canvasExpandido'), padExpandido, true); const padFonte = alvo === 'tecnico' ? padTecnico : padCliente; if (padExpandido && padFonte && !padFonte.isEmpty()) padExpandido.fromDataURL(padFonte.toDataURL()); }, 50);
}
function fecharModalAssinatura() { document.getElementById('modalAssinaturaExpandida').classList.add('hidden'); document.body.style.overflow = ''; }
function limparPadExpandido() { if(padExpandido) padExpandido.clear(); }
function confirmarAssinaturaExpandida() {
    const padDestino = alvoAssinaturaAtual === 'tecnico' ? padTecnico : padCliente; const canvasEl = alvoAssinaturaAtual === 'tecnico' ? document.getElementById('canvasTecnico') : document.getElementById('canvasCliente');
    if (padExpandido && padDestino) { resizeCanvasSeguro(canvasEl, padDestino, true); if (padExpandido.isEmpty()) { padDestino.clear(); if (alvoAssinaturaAtual === 'cliente') desbloquearEdicao(); } else { padDestino.clear(); padDestino.fromDataURL(padExpandido.toDataURL()); if (alvoAssinaturaAtual === 'cliente') bloquearEdicao(); } } fecharModalAssinatura();
    agendarAutosave();
}

// === INICIALIZAÇÃO ===
document.addEventListener("DOMContentLoaded", async () => {
    iniciarBancoPecas();
    await carregarLogoDoArmazenamento();
    
    const cTec = document.getElementById('canvasTecnico'); const cCli = document.getElementById('canvasCliente'); const cExp = document.getElementById('canvasExpandido');
    if (typeof SignaturePad !== 'undefined') {
        if(cTec) padTecnico = new SignaturePad(cTec, signatureOptions); 
        if(cCli) padCliente = new SignaturePad(cCli, signatureOptions); 
        if(cExp) padExpandido = new SignaturePad(cExp, signatureOptions);
    }
    
    adicionarBlocoOS(); atualizarVisibilidadeCamposPorBloco(); verificarRascunhoPendente();
    
    // Listeners Resize
    window.addEventListener('resize', () => { setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasExpandido'), padExpandido); resizeCanvasSeguro(cTec, padTecnico); resizeCanvasSeguro(cCli, padCliente); }, 100); });
});

async function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); 
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('border-blue-500', 'text-white', 'bg-gray-800/50'); btn.classList.add('border-transparent', 'text-gray-400'); });
    const activeBtn = document.getElementById(`btnNav${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if(activeBtn) { activeBtn.classList.remove('border-transparent', 'text-gray-400'); activeBtn.classList.add('border-blue-500', 'text-white', 'bg-gray-800/50'); }
    if(tabId === 'historico') { await carregarHistorico(); } 
    else if(tabId === 'novaOs') setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasTecnico'), padTecnico); resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50);
    window.scrollTo(0, 0);
}
