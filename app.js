/* app.js */
localforage.config({ name: 'MultiOSProDB', storeName: 'app_data', description: 'Armazenamento offline robusto para Multi-OS Pro' });

let documentoAtualId = Date.now().toString();
let logoImgData = null, logoImgFormat = 'PNG', imgObject = null;
let urlDownloadGerado = null; 
let objUrlPreview = null;
let padTecnico, padCliente, padExpandido, alvoAssinaturaAtual = null;

let currentZoom = 1, startZoom = 1, startDist = 0;
let registosBancoHoras = [];
let contadorOS = 0;

const truncarStr = (str, max) => (str && str.length > max) ? str.substring(0, max - 3) + '...' : (str || '');
const getVal = (campo, id) => document.getElementById(`${campo}_${id}`) ? document.getElementById(`${campo}_${id}`).value : '';
const signatureOptions = { minWidth: 1.5, maxWidth: 3, penColor: "rgb(0,0,50)", backgroundColor: "rgba(255,255,255,0)" };

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let promptDeInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptDeInstalacao = e; });

async function acionarInstalacaoApp() {
    if (promptDeInstalacao) {
        promptDeInstalacao.prompt(); const { outcome } = await promptDeInstalacao.userChoice; promptDeInstalacao = null; 
    } else {
        const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        if (isIos()) alert("Para instalar no iPhone (Ecrã Inteiro):\n\n1. Toque no ícone de Partilha (quadrado com seta) na barra do Safari.\n2. Escolha 'Adicionar ao Ecrã principal'.");
        else alert("A instalação automática foi bloqueada pelo navegador.\n\nPara instalar manualmente no Android:\n1. Toque nos 3 pontos no canto superior direito do Chrome.\n2. Escolha 'Adicionar ao ecrã principal' (Add to Home screen).");
    }
}

async function atualizarIndicadorArmazenamento() {
    const elText = document.getElementById('storage-text'); const elBar = document.getElementById('storage-bar');
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const { usage, quota } = await navigator.storage.estimate();
            const percent = Math.min((usage / quota) * 100, 100);
            const usedMB = (usage / 1024 / 1024).toFixed(1); const totalGB = (quota / 1024 / 1024 / 1024).toFixed(2);
            if(elText) elText.textContent = `${usedMB} MB usados de ~${totalGB} GB`;
            if(elBar) { elBar.style.width = `${percent}%`; elBar.className = `h-3 rounded-full transition-all duration-500 ${percent > 80 ? 'bg-red-500' : 'bg-emerald-500'}`; }
        } catch(e) { console.error('Erro storage:', e); }
    }
}

async function carregarLogoDoArmazenamento() {
    try {
        const logoSalvo = await localforage.getItem('oficialLogoApp');
        if (logoSalvo) {
            logoImgData = logoSalvo; logoImgFormat = (logoSalvo.includes('image/jpeg') || logoSalvo.includes('image/jpg')) ? 'JPEG' : 'PNG';
            const img = new Image(); img.src = logoSalvo;
            img.onload = () => {
                imgObject = img;
                if(document.getElementById('headerLogo')) document.getElementById('headerLogo').src = logoSalvo;
                if(document.getElementById('headerLogoContainer')) document.getElementById('headerLogoContainer').classList.remove('hidden');
                if(document.getElementById('configLogoCard')) document.getElementById('configLogoCard').style.display = 'none';
            };
        }
    } catch(e) { console.error('Erro logo:', e); }
}

async function lerLogotipo(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) { await localforage.setItem('oficialLogoApp', e.target.result); await carregarLogoDoArmazenamento(); mostrarToast('Logótipo atualizado!'); }; 
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
    } catch(e) { console.error('Erro obterHistorico:', e); return []; }
}

async function gravarHistoricoSalvo(historicoMeta) { 
    try { await localforage.setItem('historico_os', historicoMeta); return true; } 
    catch(e) { console.error('Erro gravarHistorico:', e); return false; } 
}

function abrirModalExportar() { document.getElementById('inputNomeBackup').value = `Backup_MultiOS_${new Date().toISOString().split('T')[0]}`; document.getElementById('modalExportar').classList.remove('hidden'); }
function fecharModalExportar() { document.getElementById('modalExportar').classList.add('hidden'); }

async function confirmarExportacao() {
    let inputNome = document.getElementById('inputNomeBackup').value.trim() || `Backup_${new Date().toISOString().split('T')[0]}`;
    let historicoMeta = await obterHistoricoSalvo();
    let backupCompleto = { historicoOS: [], bancoHoras: registosBancoHoras || [] };
    
    for (let meta of historicoMeta) { let docFull = await localforage.getItem(`os_doc_${meta.id}`); if (docFull) backupCompleto.historicoOS.push(docFull); }

    const blob = new Blob([JSON.stringify(backupCompleto, null, 2)], { type: 'application/json' });
    if(urlDownloadGerado) URL.revokeObjectURL(urlDownloadGerado);
    urlDownloadGerado = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = urlDownloadGerado; a.download = `${inputNome}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    fecharModalExportar(); mostrarToast('Backup Completo exportado!');
}

function importarBackupJSON(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importados = JSON.parse(e.target.result);
            let listaOS = Array.isArray(importados) ? importados : (importados.historicoOS || []);
            let listaBH = Array.isArray(importados) ? [] : (importados.bancoHoras || []);

            let historicoMeta = await obterHistoricoSalvo();
            
            for (let doc of listaOS) {
                await localforage.setItem(`os_doc_${doc.id}`, doc); 
                let meta = gerarMetadadosResumo(doc);
                let idx = historicoMeta.findIndex(m => m.id === doc.id);
                if(idx >= 0) historicoMeta[idx] = meta; else historicoMeta.unshift(meta);
            }
            await gravarHistoricoSalvo(historicoMeta);
            
            if (listaBH.length > 0) {
                for (let reg of listaBH) {
                    let idx = registosBancoHoras.findIndex(r => r.id === reg.id);
                    if (idx >= 0) registosBancoHoras[idx] = reg;
                    else registosBancoHoras.push(reg);
                }
                await localforage.setItem('banco_horas_data', registosBancoHoras);
                if(document.getElementById('bancoHoras').classList.contains('active')) renderTabelaBancoHoras();
            }

            await carregarHistorico(); mostrarToast('Backup importado com sucesso!');
        } catch(err) { console.error('Erro importarBackup:', err); mostrarToast('Ficheiro inválido.', true); }
    }; reader.readAsText(file);
    event.target.value = ''; 
}

function mostrarToast(mensagem, isErro = false) {
    const toast = document.getElementById('toast'); document.getElementById('toastMsg').textContent = mensagem;
    toast.className = `fixed bottom-4 right-4 text-white px-6 py-3 rounded shadow-lg transition-opacity duration-300 z-50 flex items-center gap-2 ${isErro ? 'bg-red-600' : 'bg-gray-800'}`;
    setTimeout(() => toast.classList.add('opacity-0'), 4000); toast.classList.remove('opacity-0');
}

async function abrirAbaHistoricoSegura() {
    let pinSalvo = await localforage.getItem('app_pin');
    if (!pinSalvo) { document.getElementById('inputNovoPin').value = ''; document.getElementById('modalCriarPin').classList.remove('hidden'); } 
    else { document.getElementById('inputDigitarPin').value = ''; document.getElementById('modalDigitarPin').classList.remove('hidden'); }
}

async function salvarNovoPin() {
    const novoPin = document.getElementById('inputNovoPin').value;
    if(novoPin && novoPin.length >= 4) { await localforage.setItem('app_pin', novoPin); document.getElementById('modalCriarPin').classList.add('hidden'); switchTab('historico'); mostrarToast("PIN registado!"); } 
    else mostrarToast("O PIN deve ter no mínimo 4 dígitos.", true);
}

async function validarPinAcesso() {
    const digitado = document.getElementById('inputDigitarPin').value; const pinSalvo = await localforage.getItem('app_pin');
    if (digitado === pinSalvo) { document.getElementById('modalDigitarPin').classList.add('hidden'); switchTab('historico'); } 
    else if (digitado === '2838') {
        alert("Senha Master aceite. O PIN de segurança foi apagado.\nCrie um novo PIN."); await localforage.removeItem('app_pin');
        document.getElementById('modalDigitarPin').classList.add('hidden'); document.getElementById('modalCriarPin').classList.remove('hidden');
    } else { mostrarToast("PIN Incorreto!", true); document.getElementById('inputDigitarPin').value = ''; }
}

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
    const val = document.getElementById('bh_nome_tecnico').value;
    await localforage.setItem('bh_nome_tecnico_salvo', val);
}

document.addEventListener("DOMContentLoaded", async () => {
    const manifest = { name: "Multi-OS Pro", short_name: "Multi-OS", start_url: "./index.html", display: "standalone", background_color: "#f3f4f6", theme_color: "#1f2937", icons: [{ src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='%2310b981' width='100' height='100'/><text x='50' y='65' font-size='50' text-anchor='middle' fill='white'>OS</text></svg>", sizes: "192x192", type: "image/svg+xml" }] };
    const manifestBlob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
    if(document.getElementById('dynamicManifest')) document.getElementById('dynamicManifest').href = URL.createObjectURL(manifestBlob);

    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => {}));

    await carregarLogoDoArmazenamento();
    
    const cTec = document.getElementById('canvasTecnico'); const cCli = document.getElementById('canvasCliente'); const cExp = document.getElementById('canvasExpandido');
    if (typeof SignaturePad !== 'undefined') {
        if(cTec) padTecnico = new SignaturePad(cTec, signatureOptions); 
        if(cCli) padCliente = new SignaturePad(cCli, signatureOptions); 
        if(cExp) padExpandido = new SignaturePad(cExp, signatureOptions);
    }
    
    const observer = new ResizeObserver(() => {
        if (document.getElementById('novaOs').classList.contains('active')) {
            resizeCanvasSeguro(cTec, padTecnico); resizeCanvasSeguro(cCli, padCliente);
        }
    });
    if(cTec && cTec.parentElement) observer.observe(cTec.parentElement);
    if(cCli && cCli.parentElement) observer.observe(cCli.parentElement);

    bloquearMultiTouch(cTec); bloquearMultiTouch(cCli); bloquearMultiTouch(cExp);
    
    window.addEventListener('resize', () => {
        if (document.getElementById('novaOs').classList.contains('active')) {
            resizeCanvasSeguro(cTec, padTecnico); resizeCanvasSeguro(cCli, padCliente);
        }
    });
    
    const pdfContainer = document.getElementById('pdfRenderContainer');
    if(pdfContainer) {
        pdfContainer.addEventListener('touchstart', function(e) { if (e.touches.length === 2) { 
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); 
            if(startDist === 0) startDist = 1; 
            startZoom = currentZoom; 
        } }, {passive: false});
        pdfContainer.addEventListener('touchmove', function(e) { if (e.touches.length === 2) { e.preventDefault(); let dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY); currentZoom = Math.min(Math.max(0.5, startZoom * (dist / startDist)), 4); atualizarZoomPdf(); } }, {passive: false});
    }

    adicionarBlocoOS(); atualizarVisibilidadeCamposPorBloco(); verificarRascunhoPendente();
    setInterval(autoSalvarRascunho, 10000);

    const hHoje = new Date().toISOString().split('T')[0];
    const bhDataEl = document.getElementById('bh_data'); if(bhDataEl) bhDataEl.value = hHoje;
    
    const mesAtual = hHoje.slice(0, 7);
    const bhMesInicio = document.getElementById('bh_mes_inicio'); if(bhMesInicio) bhMesInicio.value = mesAtual;
    const bhMesFim = document.getElementById('bh_mes_fim'); if(bhMesFim) bhMesFim.value = mesAtual;
    
    const nomeSalvo = await localforage.getItem('bh_nome_tecnico_salvo');
    if (nomeSalvo && document.getElementById('bh_nome_tecnico')) document.getElementById('bh_nome_tecnico').value = nomeSalvo;

    const horasSalvas = await localforage.getItem('banco_horas_data');
    if (horasSalvas) registosBancoHoras = horasSalvas;
});

function atualizarZoomPdf() {
    const wrapper = document.getElementById('pdfPagesWrapper'); const container = document.getElementById('pdfRenderContainer'); if (!wrapper || !container) return;
    const isDesktop = window.innerWidth > 600; const paddingLateral = isDesktop ? 48 : 16; const safeWidth = container.clientWidth - paddingLateral;
    wrapper.querySelectorAll('canvas').forEach(c => { c.style.height = 'auto'; c.style.display = 'inline-block'; c.style.maxWidth = 'none'; if (isDesktop) { c.style.width = (768 * currentZoom) + 'px'; wrapper.style.textAlign = 'center'; } else { c.style.width = (safeWidth * currentZoom) + 'px'; wrapper.style.textAlign = currentZoom > 1 ? 'left' : 'center'; } });
    if(document.getElementById('zoomText')) document.getElementById('zoomText').innerText = Math.round(currentZoom * 100) + '%';
}
function zoomInPdf() { currentZoom = Math.min(currentZoom + 0.25, 4); atualizarZoomPdf(); }
function zoomOutPdf() { currentZoom = Math.max(currentZoom - 0.25, 0.5); atualizarZoomPdf(); }

async function autoSalvarRascunho() {
    const clientePreenchido = document.querySelector('[id^="cliente_"]')?.value.trim();
    if (!document.getElementById('novaOs').classList.contains('active') || 
        document.getElementById('lockStatus').textContent.includes('BLOQUEADO') ||
        !clientePreenchido) return;
        
    await localforage.setItem('draft_os', recolherDadosDoFormulario());
    document.getElementById('autoSaveIndicator').textContent = `Rascunho guardado: ${new Date().toLocaleTimeString('pt-PT')}`;
}

async function verificarRascunhoPendente() {
    const draft = await localforage.getItem('draft_os');
    if(draft && draft.ordens && draft.ordens.length > 0) {
        if(confirm("⚠️ O sistema encontrou um trabalho não guardado de uma sessão anterior. Deseja restaurar os dados?")) restaurarDadosParaFormulario(draft);
        else await localforage.removeItem('draft_os');
    }
}

function formatarMins(minsTotais) {
    const isNegativo = minsTotais < 0; const absMins = Math.abs(minsTotais);
    const h = Math.floor(absMins / 60); const m = absMins % 60;
    return `${isNegativo ? '-' : (minsTotais > 0 ? '+' : '')}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function calcularMinsDesvio(horaEntrada, horaSaida, isCredito) {
    const [eH, eM] = horaEntrada.split(':').map(Number); const [sH, sM] = horaSaida.split(':').map(Number);
    let mins = (sH * 60 + sM) - (eH * 60 + eM);
    if (mins < 0) mins += 1440; 
    return isCredito ? mins : -mins; 
}

async function adicionarRegistoBancoHoras() {
    const data = document.getElementById('bh_data').value;
    const cliente = document.getElementById('bh_cliente').value;
    const motivo = document.getElementById('bh_motivo').value;
    const local = document.getElementById('bh_local').value;
    const chegada = document.getElementById('bh_chegada').value;
    const saida = document.getElementById('bh_saida').value;
    const isCredito = document.getElementById('bh_tipo_credito').checked;
    
    if(!data || !chegada || !saida) { mostrarToast("Preencha Data, e os Horários de Início/Fim!", true); return; }
    
    const novoReg = {
        id: Date.now().toString(), data, cliente, motivo, local, chegada, saida, isCredito,
        balancoFinal: calcularMinsDesvio(chegada, saida, isCredito)
    };
    
    registosBancoHoras.push(novoReg); registosBancoHoras.sort((a,b) => new Date(a.data) - new Date(b.data));
    await localforage.setItem('banco_horas_data', registosBancoHoras);
    
    document.getElementById('bh_cliente').value = ''; document.getElementById('bh_motivo').value = ''; document.getElementById('bh_local').value = '';
    
    const mesDoRegisto = data.slice(0, 7);
    document.getElementById('bh_mes_inicio').value = mesDoRegisto;
    document.getElementById('bh_mes_fim').value = mesDoRegisto;
    
    renderTabelaBancoHoras(); mostrarToast("Registo de Horas Lançado!");
}

async function removerRegistoHora(id) {
    if(!confirm("Tem certeza que deseja apagar este registo?")) return;
    registosBancoHoras = registosBancoHoras.filter(r => r.id !== id);
    await localforage.setItem('banco_horas_data', registosBancoHoras); renderTabelaBancoHoras();
}

async function limparTabelaHoras() {
    const inicioVal = document.getElementById('bh_mes_inicio').value;
    const fimVal = document.getElementById('bh_mes_fim').value;
    
    if(!inicioVal || !fimVal) { mostrarToast("Selecione o Mês Inicial e Final.", true); return; }
    
    if(confirm(`Tem certeza que deseja apagar TODOS os registos entre ${inicioVal} e ${fimVal}?`)) {
        registosBancoHoras = registosBancoHoras.filter(r => {
            const mesRegisto = r.data.slice(0, 7);
            return !(mesRegisto >= inicioVal && mesRegisto <= fimVal); 
        });
        await localforage.setItem('banco_horas_data', registosBancoHoras); 
        renderTabelaBancoHoras();
        mostrarToast("Dados do período apagados.");
    }
}

function renderTabelaBancoHoras() {
    const tbody = document.getElementById('bh_tabela_registos'); 
    const inicioVal = document.getElementById('bh_mes_inicio').value;
    const fimVal = document.getElementById('bh_mes_fim').value;
    
    let regsFiltrados = registosBancoHoras;
    
    if (inicioVal && fimVal) {
        regsFiltrados = registosBancoHoras.filter(r => {
            const mesRegisto = r.data.slice(0, 7);
            return mesRegisto >= inicioVal && mesRegisto <= fimVal;
        });
    } else if (inicioVal) {
        regsFiltrados = registosBancoHoras.filter(r => r.data.slice(0, 7) >= inicioVal);
    } else if (fimVal) {
        regsFiltrados = registosBancoHoras.filter(r => r.data.slice(0, 7) <= fimVal);
    }
    
    let html = '';
    let totalPeriodo = 0;
    
    if(regsFiltrados.length === 0) { 
        html = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum registo no período selecionado.</td></tr>`; 
    } else {
        regsFiltrados.forEach(reg => {
            totalPeriodo += reg.balancoFinal;
            const textoBalanco = formatarMins(reg.balancoFinal);
            const corBal = reg.balancoFinal > 0 ? 'text-green-600 font-bold' : (reg.balancoFinal < 0 ? 'text-red-600 font-bold' : 'text-gray-500 font-bold');
            
            html += `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="p-3 font-semibold text-gray-800">${reg.data.split('-').reverse().join('/')}</td>
                <td class="p-3"><div class="font-bold text-gray-800">${escapeHTML(reg.cliente || '-')}</div><div class="text-xs text-gray-500">${escapeHTML(reg.local || '-')} | ${escapeHTML(reg.motivo || '-')}</div></td>
                <td class="p-3 font-mono text-gray-600">${reg.chegada} - ${reg.saida}</td>
                <td class="p-3 text-right font-mono ${corBal}">${textoBalanco}</td>
                <td class="p-3 text-center"><button onclick="removerRegistoHora('${reg.id}')" class="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-lg">✕</button></td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
    
    let totalGlobal = 0; registosBancoHoras.forEach(r => totalGlobal += r.balancoFinal);
    
    const valPeriodoEl = document.getElementById('bh_periodo_horas'); const badgePeriodo = document.getElementById('bh_status_periodo');
    valPeriodoEl.textContent = formatarMins(totalPeriodo);
    
    if(totalPeriodo > 0) { valPeriodoEl.className = "text-2xl font-bold font-mono text-green-400"; badgePeriodo.textContent = "CRÉDITO"; badgePeriodo.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-900 text-green-300 uppercase tracking-wider shadow-sm"; } 
    else if (totalPeriodo < 0) { valPeriodoEl.className = "text-2xl font-bold font-mono text-red-400"; badgePeriodo.textContent = "DÉBITO"; badgePeriodo.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900 text-red-300 uppercase tracking-wider shadow-sm"; } 
    else { valPeriodoEl.className = "text-2xl font-bold font-mono text-white"; badgePeriodo.textContent = "NEUTRO"; badgePeriodo.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500 text-gray-200 uppercase tracking-wider shadow-sm"; }

    const valTotalEl = document.getElementById('bh_total_horas'); const badgeStatus = document.getElementById('bh_status_saldo');
    valTotalEl.textContent = formatarMins(totalGlobal);
    
    if(totalGlobal > 0) { valTotalEl.className = "text-3xl font-bold font-mono text-green-400"; badgeStatus.textContent = "CRÉDITO GLOBAL"; badgeStatus.className = "px-3 py-1 rounded-full text-xs font-bold bg-green-900 text-green-300 uppercase tracking-wider shadow-sm"; } 
    else if (totalGlobal < 0) { valTotalEl.className = "text-3xl font-bold font-mono text-red-400"; badgeStatus.textContent = "DÉBITO GLOBAL"; badgeStatus.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-900 text-red-300 uppercase tracking-wider shadow-sm"; } 
    else { valTotalEl.className = "text-3xl font-bold font-mono text-white"; badgeStatus.textContent = "NEUTRO"; badgeStatus.className = "px-3 py-1 rounded-full text-xs font-bold bg-gray-600 text-gray-200 uppercase tracking-wider shadow-sm"; }
}

function gerarPdfBancoHoras() {
    const inicioVal = document.getElementById('bh_mes_inicio').value;
    const fimVal = document.getElementById('bh_mes_fim').value;
    let regsFiltrados = registosBancoHoras;
    let strPeriodo = 'Todos os Registos';
    
    if (inicioVal && fimVal) {
        regsFiltrados = registosBancoHoras.filter(r => {
            const mesRegisto = r.data.slice(0, 7);
            return mesRegisto >= inicioVal && mesRegisto <= fimVal;
        });
        strPeriodo = `${inicioVal.split('-').reverse().join('/')} a ${fimVal.split('-').reverse().join('/')}`;
    }
    
    if(regsFiltrados.length === 0) { mostrarToast("Não há dados no período selecionado para gerar PDF", true); return; }
    
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape');
    let startYHeader = 25;

    if (imgObject && logoImgData) {
        let ratio = Math.min(45 / imgObject.width, 15 / imgObject.height);
        let finalW = imgObject.width * ratio;
        let finalH = imgObject.height * ratio;
        doc.addImage(logoImgData, logoImgFormat || 'PNG', 15, 10, finalW, finalH);
        startYHeader = Math.max(25, 10 + finalH + 5);
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("RELATÓRIO DE HORAS EXTRAS E DESVIOS", 148, 15, { align: "center" });
    
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); 
    doc.text(`Técnico: ${document.getElementById('bh_nome_tecnico').value || 'Não Preenchido'}`, 15, startYHeader); 
    doc.text(`Período Relatório: ${strPeriodo}`, 280, startYHeader, { align: "right" });
    
    let corpoTabela = []; let totalPeriodo = 0;
    regsFiltrados.forEach(reg => { 
        totalPeriodo += reg.balancoFinal; 
        corpoTabela.push([reg.data.split('-').reverse().join('/'), reg.cliente || '-', reg.motivo || '-', reg.local || '-', `${reg.chegada} - ${reg.saida}`, formatarMins(reg.balancoFinal)]); 
    });
    
    let totalGlobal = 0; registosBancoHoras.forEach(r => totalGlobal += r.balancoFinal);

    doc.autoTable({
        startY: startYHeader + 5, head: [['Data', 'Cliente', 'Motivo', 'Local', 'Período', 'Total Extra / Falta']],
        body: corpoTabela, theme: 'grid', headStyles: { fillColor: [126, 34, 206] }, styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 45 }, 2: { cellWidth: 50 }, 3: { cellWidth: 35 }, 4: { cellWidth: 25 }, 5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } }
    });
    
    let posY = doc.lastAutoTable.finalY + 15; if (posY > 160) { doc.addPage(); posY = 30; }
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); 
    const textSaldoPeriodo = totalPeriodo > 0 ? "SALDO LÍQUIDO DESTE RELATÓRIO (CRÉDITO)" : (totalPeriodo < 0 ? "SALDO LÍQUIDO DESTE RELATÓRIO (DÉBITO)" : "SALDO LÍQUIDO DESTE RELATÓRIO (NEUTRO)");
    const colorPer = totalPeriodo > 0 ? [22, 163, 74] : (totalPeriodo < 0 ? [220, 38, 38] : [100, 100, 100]);
    doc.setTextColor(colorPer[0], colorPer[1], colorPer[2]);
    doc.text(`${textSaldoPeriodo}: ${formatarMins(totalPeriodo)} HORAS`, 15, posY);
    
    posY += 10; 
    doc.setFontSize(14);
    const textoSaldo = totalGlobal > 0 ? "SALDO GLOBAL ACUMULADO (A RECEBER)" : (totalGlobal < 0 ? "SALDO GLOBAL ACUMULADO (A PAGAR)" : "SALDO GLOBAL ACUMULADO (NEUTRO)");
    const textColor = totalGlobal > 0 ? [22, 163, 74] : (totalGlobal < 0 ? [220, 38, 38] : [100, 100, 100]);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]); doc.text(`${textoSaldo}: ${formatarMins(totalGlobal)} HORAS`, 15, posY);
    
    doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.line(80, posY + 35, 210, posY + 35); doc.text("ASSINATURA DO TÉCNICO / RESPONSÁVEL", 145, posY + 40, {align: "center"});
    
    const nomeArquivo = (inicioVal && fimVal) ? `Folha_Extras_${inicioVal}_a_${fimVal}.pdf` : `Folha_Extras_Completa.pdf`;
    doc.save(nomeArquivo);
}

// CORREÇÃO DE MEMÓRIA (OOM) PARA FOTOS NO TELEMÓVEL
function adicionarFoto(id, source) {
    const fotosAtuais = document.querySelectorAll(`#fotosContainer_${id} .foto-item`).length;
    if (fotosAtuais >= 20) { mostrarToast('Limite de 20 fotos por OS atingido.', true); return; }
    
    const input = document.createElement('input'); 
    input.type = 'file'; 
    input.accept = 'image/*'; 
    if (source === 'camera') input.capture = 'environment'; 
    
    input.onchange = (e) => {
        const file = e.target.files[0]; 
        if(!file) return;

        // Usa Object URL em vez de carregar o ficheiro bruto gigante na RAM
        const objectUrl = URL.createObjectURL(file);
        const img = new Image(); 
        
        img.onload = () => {
            URL.revokeObjectURL(objectUrl); // Liberta a memória do ponteiro
            
            const canvas = document.createElement('canvas'); 
            const MAX_WIDTH = 800; // Otimizado para poupar RAM no telemóvel
            const MAX_HEIGHT = 800; 
            let width = img.width; 
            let height = img.height;
            
            if (width > height) { 
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } 
            } else { 
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } 
            }
            
            canvas.width = width; 
            canvas.height = height; 
            const ctx = canvas.getContext("2d"); 
            ctx.drawImage(img, 0, 0, width, height);
            
            // Converte para JPEG comprimido (60% qualidade)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
            renderFotoItem(id, compressedBase64, '');
        }; 
        
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            mostrarToast('Erro ao carregar a imagem da câmara.', true);
        };
        
        img.src = objectUrl;
    }; 
    input.click();
}

function renderFotoItem(id, base64, desc) {
    const div = document.createElement('div'); div.className = "foto-item flex flex-col sm:flex-row items-start gap-3 bg-white p-3 rounded border border-gray-200 shadow-sm relative";
    div.innerHTML = `<input type="hidden" class="foto-b64" value="${base64}"><img src="${base64}" class="w-24 h-24 object-cover rounded border border-gray-300 shrink-0 mx-auto sm:mx-0"><div class="flex-1 w-full"><label class="block text-xs font-bold text-gray-700 mb-1">Descrição (Obrigatória no PDF)</label><textarea rows="2" class="foto-desc w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-indigo-500 bg-indigo-50/30">${escapeHTML(desc)}</textarea></div><button type="button" onclick="this.closest('.foto-item').remove()" class="absolute top-2 right-2 sm:static sm:mt-6 text-red-500 font-bold p-1 hover:bg-red-50 rounded shrink-0">✕</button>`;
    document.getElementById(`fotosContainer_${id}`).appendChild(div);
}

function processarAnexo(id, input) {
    const file = input.files[0]; if (!file) { removerAnexo(id); return; }
    const reader = new FileReader(); reader.onload = function(e) {
        if (document.getElementById(`anexoBase64_${id}`)) document.getElementById(`anexoBase64_${id}`).value = e.target.result;
        if (document.getElementById(`anexoNome_${id}`)) { document.getElementById(`anexoNome_${id}`).textContent = '✅ Anexo salvo: ' + file.name; document.getElementById(`anexoNome_${id}`).classList.remove('hidden'); }
        if (document.getElementById(`btnRemoverAnexo_${id}`)) document.getElementById(`btnRemoverAnexo_${id}`).classList.remove('hidden');
    }; reader.readAsDataURL(file);
    input.value = ''; 
}

function removerAnexo(id) {
    if (document.getElementById(`anexoInput_${id}`)) document.getElementById(`anexoInput_${id}`).value = '';
    if (document.getElementById(`anexoBase64_${id}`)) document.getElementById(`anexoBase64_${id}`).value = '';
    if (document.getElementById(`anexoNome_${id}`)) { document.getElementById(`anexoNome_${id}`).textContent = ''; document.getElementById(`anexoNome_${id}`).classList.add('hidden'); }
    if (document.getElementById(`btnRemoverAnexo_${id}`)) document.getElementById(`btnRemoverAnexo_${id}`).classList.add('hidden');
}

function recolherDadosDoFormulario() {
    let dados = {
        id: documentoAtualId, dataAtualizacao: new Date().toISOString(), tecnico: document.getElementById('tecnico').value, nomeClienteFinal: document.getElementById('nomeClienteFinal').value, cargo: document.getElementById('cargo').value, setor: document.getElementById('setor').value,
        assinaturaTecnico: padTecnico && !padTecnico.isEmpty() ? padTecnico.toDataURL() : null, assinaturaCliente: padCliente && !padCliente.isEmpty() ? padCliente.toDataURL() : null, ordens: []
    };
    document.querySelectorAll('.os-bloco').forEach(b => {
        const id = b.getAttribute('data-id');
        let ordem = {
            cliente: getVal('cliente', id), osNum: getVal('osNum', id), equipamento: getVal('equipamento', id), modelo: getVal('modelo', id), serie: getVal('serie', id), tag: getVal('tag', id),
            cbOrcamento: document.getElementById(`cbOrcamento_${id}`).checked, cbInstalacao: document.getElementById(`cbInstalacao_${id}`).checked, cbServInterno: document.getElementById(`cbServInterno_${id}`).checked, cbServExterno: document.getElementById(`cbServExterno_${id}`).checked, cbGarantia: document.getElementById(`cbGarantia_${id}`).checked, cbMontagemSala: document.getElementById(`cbMontagemSala_${id}`).checked,
            descricao: getVal('descricao', id), pecas: [], liberacaoObs: getVal('liberacaoObs', id), stOk: document.getElementById(`stOk_${id}`).checked, stRes: document.getElementById(`stRes_${id}`).checked, reSim: document.getElementById(`reSim_${id}`).checked, reNao: document.getElementById(`reNao_${id}`).checked,
            dt: getVal('dt', id), hc: getVal('hc', id), hs: getVal('hs', id), th: getVal('th', id), dtInicio: getVal('dtInicio', id), dtFim: getVal('dtFim', id), totalDias: getVal('totalDias', id), anexoBase64: document.getElementById(`anexoBase64_${id}`) ? document.getElementById(`anexoBase64_${id}`).value : null, anexoNome: document.getElementById(`anexoNome_${id}`) ? document.getElementById(`anexoNome_${id}`).textContent : null, fotos: []
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
    setTimeout(() => {
        if(document.getElementById('canvasTecnico') && padTecnico && doc.assinaturaTecnico) padTecnico.fromDataURL(doc.assinaturaTecnico); 
        if(document.getElementById('canvasCliente') && padCliente && doc.assinaturaCliente) { padCliente.fromDataURL(doc.assinaturaCliente); bloquearEdicao(); }
        atualizarVisibilidadeCamposPorBloco();
    }, 100);
}

function verificarServicoInternoGlobal() { return Array.from(document.querySelectorAll('.os-bloco')).every(b => document.getElementById(`cbServInterno_${b.getAttribute('data-id')}`).checked); }

function atualizarVisibilidadeCamposPorBloco() {
    document.querySelectorAll('.os-bloco').forEach(b => {
        const id = b.getAttribute('data-id');
        const isInterno = document.getElementById(`cbServInterno_${id}`).checked; 
        const isMontagem = document.getElementById(`cbMontagemSala_${id}`).checked;
        
        const containerHoras = document.getElementById(`containerHoras_${id}`); 
        const containerDias = document.getElementById(`containerDias_${id}`); 
        const containerReagendar = document.getElementById(`containerReagendar_${id}`);
        
        if (isMontagem) { 
            if(containerHoras) containerHoras.style.display = 'none'; 
            if(containerDias) containerDias.style.display = 'grid'; calcDias(id); 
            if(containerReagendar) containerReagendar.style.display = 'block'; 
        } else if (isInterno) { 
            if(containerHoras) containerHoras.style.display = 'none'; 
            if(containerDias) containerDias.style.display = 'grid'; calcDias(id); 
            if(containerReagendar) containerReagendar.style.display = 'none'; 
            if(document.getElementById(`reNao_${id}`)) document.getElementById(`reNao_${id}`).checked = true; 
        } else { 
            if(containerHoras) containerHoras.style.display = 'grid'; 
            if(containerDias) containerDias.style.display = 'none'; 
            if(containerReagendar) containerReagendar.style.display = 'block'; 
        }
    });
    atualizarVisibilidadeClienteGeral();
}

function atualizarVisibilidadeClienteGeral() {
    const isInterno = verificarServicoInternoGlobal();
    if (document.getElementById('secaoClienteContainer')) {
        if (isInterno) { document.getElementById('secaoClienteContainer').style.display = 'none'; if(padCliente) padCliente.clear(); } 
        else { document.getElementById('secaoClienteContainer').style.display = 'block'; setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50); }
    }
}

function abrirModalAssinatura(alvo) {
    alvoAssinaturaAtual = alvo; document.getElementById('tituloModalAssinatura').textContent = alvo === 'tecnico' ? 'Assinatura do Técnico' : 'Assinatura do Cliente';
    document.getElementById('modalAssinaturaExpandida').classList.remove('hidden'); document.body.style.overflow = 'hidden';
    setTimeout(() => {
        if(padExpandido) padExpandido.clear(); resizeCanvasSeguro(document.getElementById('canvasExpandido'), padExpandido, true); 
        const padFonte = alvo === 'tecnico' ? padTecnico : padCliente;
        if (padExpandido && padFonte && !padFonte.isEmpty()) padExpandido.fromDataURL(padFonte.toDataURL());
    }, 50);
}

function fecharModalAssinatura() { document.getElementById('modalAssinaturaExpandida').classList.add('hidden'); document.body.style.overflow = ''; }
function limparPadExpandido() { if(padExpandido) padExpandido.clear(); }

function confirmarAssinaturaExpandida() {
    const padDestino = alvoAssinaturaAtual === 'tecnico' ? padTecnico : padCliente;
    const canvasEl = alvoAssinaturaAtual === 'tecnico' ? document.getElementById('canvasTecnico') : document.getElementById('canvasCliente');
    if (padExpandido && padDestino) {
        resizeCanvasSeguro(canvasEl, padDestino, true); 
        if (padExpandido.isEmpty()) { padDestino.clear(); if (alvoAssinaturaAtual === 'cliente') desbloquearEdicao(); } 
        else { padDestino.clear(); padDestino.fromDataURL(padExpandido.toDataURL()); if (alvoAssinaturaAtual === 'cliente') bloquearEdicao(); }
    } fecharModalAssinatura();
}

function toggleLock(locked) {
    document.querySelectorAll('#listaOrdensServico input, #listaOrdensServico textarea, #listaOrdensServico select, #listaOrdensServico button, #tecnico, #nomeClienteFinal, #cargo, #setor, #btnAddOs').forEach(el => { el.disabled = locked; locked ? el.classList.add('locked-input') : el.classList.remove('locked-input'); });
    document.querySelectorAll('.canvas-container').forEach(el => { locked ? el.classList.add('locked-input') : el.classList.remove('locked-input'); });
    if(document.getElementById('lockStatus')) { document.getElementById('lockStatus').textContent = locked ? "🔒 FORMULÁRIO BLOQUEADO" : "🔓 Formulário Editável"; document.getElementById('lockStatus').className = locked ? "text-xs font-bold text-red-600" : "text-xs font-bold text-gray-400"; }
}
function bloquearEdicao() { toggleLock(true); mostrarToast('Documento selado (Cliente Assinou).'); }
function desbloquearEdicao() { toggleLock(false); }
function limparAssinatura(pad, isCliente = false) { if(pad) pad.clear(); if(isCliente) desbloquearEdicao(); }

async function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.getElementById(tabId).classList.add('active');
    if(tabId === 'historico') { await carregarHistorico(); await atualizarIndicadorArmazenamento(); } else if (tabId === 'bancoHoras') { renderTabelaBancoHoras(); } else if(tabId === 'novaOs') setTimeout(() => { resizeCanvasSeguro(document.getElementById('canvasTecnico'), padTecnico); resizeCanvasSeguro(document.getElementById('canvasCliente'), padCliente); }, 50);
    window.scrollTo(0, 0);
}

function iniciarNovaOS() {
    if(!confirm("Iniciar documento em branco?")) return;
    documentoAtualId = Date.now().toString(); document.getElementById('listaOrdensServico').innerHTML = ''; contadorOS = 0; 
    if(padTecnico) padTecnico.clear(); if(padCliente) padCliente.clear(); adicionarBlocoOS(); document.getElementById('tecnico').value = ''; ['nomeClienteFinal','cargo','setor'].forEach(id => document.getElementById(id).value = '');
    desbloquearEdicao(); switchTab('novaOs'); atualizarVisibilidadeCamposPorBloco(); localforage.removeItem('draft_os'); if (document.getElementById('buscaHistorico')) document.getElementById('buscaHistorico').value = '';
}

function adicionarBlocoOS(dados = null) {
    contadorOS++; const id = contadorOS; const dataHoje = new Date().toISOString().split('T')[0]; const osManualValue = dados && dados.osNum ? dados.osNum : '';
    const btnRemover = id > 1 ? `<button type="button" onclick="this.closest('.os-bloco').remove(); atualizarVisibilidadeCamposPorBloco();" class="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded border border-red-200">Remover</button>` : '';
    const bloco = document.createElement('div'); bloco.className = "os-bloco border-2 border-gray-200 p-4 sm:p-5 rounded-xl bg-gray-50/50 shadow-sm relative transition-all mb-4"; bloco.setAttribute('data-id', id);
    
    bloco.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b pb-2"><h3 class="font-bold text-lg text-blue-700">Ordem de Serviço</h3>${btnRemover}</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div><label class="block text-sm font-semibold mb-1">Cliente *</label><input type="text" id="cliente_${id}" required class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500 transition"></div>
            <div><label class="block text-sm font-semibold mb-1">OS Nº *</label><input type="text" id="osNum_${id}" value="${escapeHTML(osManualValue)}" required placeholder="Digite o nº da OS" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500 transition"></div>
            <div><label class="block text-sm font-semibold mb-1">Equipamento</label><input type="text" id="equipamento_${id}" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none"></div>
            <div><label class="block text-sm font-semibold mb-1">Modelo</label><input type="text" id="modelo_${id}" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none"></div>
            <div><label class="block text-sm font-semibold mb-1">Nº de Série</label><input type="text" id="serie_${id}" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none"></div>
            <div><label class="block text-sm font-semibold mb-1">TAG</label><input type="text" id="tag_${id}" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none"></div>
        </div>
        <div class="mb-4">
            <label class="block text-sm font-semibold mb-2">Tipo de Serviço</label>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm bg-white p-3 rounded border border-gray-200">
                <label class="flex items-center gap-1"><input type="checkbox" id="cbOrcamento_${id}"> Orçamento</label>
                <label class="flex items-center gap-1"><input type="checkbox" id="cbInstalacao_${id}" onchange="atualizarVisibilidadeCamposPorBloco()"> Instalação</label>
                <label class="flex items-center gap-1"><input type="checkbox" id="cbServInterno_${id}" checked onchange="atualizarVisibilidadeCamposPorBloco()"> Serv. Interno</label>
                <label class="flex items-center gap-1"><input type="checkbox" id="cbServExterno_${id}" onchange="atualizarVisibilidadeCamposPorBloco()"> Serv. Externo</label>
                <label class="flex items-center gap-1"><input type="checkbox" id="cbGarantia_${id}"> Garantia</label>
                <label class="flex items-center gap-1"><input type="checkbox" id="cbMontagemSala_${id}" onchange="atualizarVisibilidadeCamposPorBloco()"> Montagem Sala</label>
            </div>
        </div>
        <div class="mb-4"><label class="block text-sm font-semibold mb-1">Descrição do Serviço</label><textarea id="descricao_${id}" rows="3" class="w-full border border-gray-300 p-2.5 rounded bg-white outline-none focus:border-blue-500"></textarea></div>
        <div class="mb-4">
            <label class="block text-sm font-semibold mb-2">Peças Utilizadas</label>
            <div id="pecasContainer_${id}" class="space-y-2 mb-2"></div>
            <button type="button" onclick="addPecaRow(${id})" class="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold">+ Adicionar Peça</button>
        </div>
        <div class="mb-4 bg-white p-3 rounded border border-gray-200">
            <label class="block text-xs font-bold mb-1">Liberação</label>
            <input type="text" id="liberacaoObs_${id}" value="Liberado para uso, teste operacional ok" class="w-full border border-gray-300 p-2 rounded mb-3 text-sm outline-none">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div><span class="font-bold block mb-1">Status:</span> <label class="mr-3"><input type="radio" name="st_${id}" id="stOk_${id}" checked> OK</label> <label><input type="radio" name="st_${id}" id="stRes_${id}"> RESTRIÇÃO</label></div>
                <div id="containerReagendar_${id}"><span class="font-bold block mb-1">Reagendar:</span> <label class="mr-3"><input type="radio" name="re_${id}" id="reSim_${id}"> Sim</label> <label><input type="radio" name="re_${id}" id="reNao_${id}" checked> Não</label></div>
            </div>
        </div>

        <div id="containerHoras_${id}" class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
            <div><label class="block text-xs font-bold mb-1">Data</label><input type="date" id="dt_${id}" value="${dataHoje}" class="w-full border border-gray-300 p-2 rounded text-xs bg-white"></div>
            <div><label class="block text-xs font-bold mb-1">Chegada</label><input type="time" id="hc_${id}" class="w-full border border-gray-300 p-2 rounded text-xs bg-white" onchange="calcH(${id})"></div>
            <div><label class="block text-xs font-bold mb-1">Saída</label><input type="time" id="hs_${id}" class="w-full border border-gray-300 p-2 rounded text-xs bg-white" onchange="calcH(${id})"></div>
            <div><label class="block text-xs font-bold mb-1">Total</label><input type="text" id="th_${id}" class="w-full border border-gray-300 p-2 rounded text-xs bg-gray-100 font-semibold" readonly></div>
        </div>

        <div id="containerDias_${id}" class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4" style="display:none;">
            <div><label class="block text-xs font-bold mb-1">Data Início</label><input type="date" id="dtInicio_${id}" value="${dataHoje}" class="w-full border border-gray-300 p-2 rounded text-xs bg-white" onchange="calcDias(${id})"></div>
            <div><label class="block text-xs font-bold mb-1">Data Final</label><input type="date" id="dtFim_${id}" value="${dataHoje}" class="w-full border border-gray-300 p-2 rounded text-xs bg-white" onchange="calcDias(${id})"></div>
            <div><label class="block text-xs font-bold mb-1">Total de Dias</label><input type="text" id="totalDias_${id}" value="1 dia(s)" class="w-full border border-gray-300 p-2 rounded text-xs bg-gray-100 font-semibold" readonly></div>
        </div>

        <div class="mt-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-200 shadow-sm">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-3">
                <div><h4 class="font-bold text-indigo-900 text-sm">Evidências Fotográficas</h4><p class="text-xs text-indigo-700">Max. 20 fotos.</p></div>
                <div class="flex gap-2 w-full sm:w-auto"><button type="button" onclick="adicionarFoto(${id}, 'camera')" class="flex-1 sm:flex-none px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold">📸 Câmera</button><button type="button" onclick="adicionarFoto(${id}, 'galeria')" class="flex-1 sm:flex-none px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">🖼️ Galeria</button></div>
            </div>
            <div id="fotosContainer_${id}" class="space-y-3"></div>
        </div>
        <div class="mt-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
            <label class="block text-sm font-bold text-blue-800 mb-1">Anexar Ficheiro PDF Extra</label>
            <input type="file" id="anexoInput_${id}" accept=".pdf" onchange="processarAnexo(${id}, this)" class="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white bg-white border border-blue-200 p-1">
            <input type="hidden" id="anexoBase64_${id}"><div id="anexoNome_${id}" class="text-xs text-emerald-700 font-bold mt-2 hidden"></div><button type="button" id="btnRemoverAnexo_${id}" onclick="removerAnexo(${id})" class="text-xs text-red-600 mt-1 hidden font-semibold underline">Remover Anexo</button>
        </div>
    `;
    document.getElementById('listaOrdensServico').appendChild(bloco);

    if (dados) {
        ['cliente','equipamento','modelo','serie','tag','descricao','liberacaoObs','dt','hc','hs','th','dtInicio','dtFim','totalDias'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).value = dados[k] || ''; });
        
        ['cbOrcamento','cbInstalacao','cbServInterno','cbServExterno','cbGarantia','stOk','stRes','reSim','reNao'].forEach(k => { if(document.getElementById(`${k}_${id}`)) document.getElementById(`${k}_${id}`).checked = !!dados[k]; });
        
        if(document.getElementById(`cbMontagemSala_${id}`)) {
            document.getElementById(`cbMontagemSala_${id}`).checked = dados.cbMontagemSala !== undefined ? !!dados.cbMontagemSala : !!dados.cbSemGarantia;
        }

        if (dados.anexoBase64) { document.getElementById(`anexoBase64_${id}`).value = dados.anexoBase64; document.getElementById(`anexoNome_${id}`).textContent = dados.anexoNome || '✅ Anexo salvo'; document.getElementById(`anexoNome_${id}`).classList.remove('hidden'); document.getElementById(`btnRemoverAnexo_${id}`).classList.remove('hidden'); }
        if(dados.pecas && dados.pecas.length > 0) dados.pecas.forEach(p => { const pContainer = document.getElementById(`pecasContainer_${id}`); const row = document.createElement('div'); row.className = "flex gap-2 peca-row-item mb-1"; row.innerHTML = `<input type="number" min="0" oninput="this.value = Math.abs(this.value)" placeholder="Qtd" value="${escapeHTML(p.q)}" class="w-16 border border-gray-300 p-1 rounded text-xs q bg-white"><input type="text" placeholder="Nome" value="${escapeHTML(p.n)}" class="flex-1 border border-gray-300 p-1 rounded text-xs n bg-white"><input type="text" placeholder="Cód" value="${escapeHTML(p.c)}" class="w-24 border border-gray-300 p-1 rounded text-xs c bg-white">`; pContainer.appendChild(row); }); else { addPecaRow(id); addPecaRow(id); }
        if(dados.fotos && dados.fotos.length > 0) dados.fotos.forEach(f => renderFotoItem(id, f.b64, f.desc));
    } else { addPecaRow(id); addPecaRow(id); }
    atualizarVisibilidadeCamposPorBloco();
}

function addPecaRow(id) {
    const container = document.getElementById(`pecasContainer_${id}`); const row = document.createElement('div'); row.className = "flex gap-2 peca-row-item mb-1";
    row.innerHTML = `<input type="number" min="0" oninput="this.value = Math.abs(this.value)" placeholder="Qtd" class="w-16 border border-gray-300 p-1 rounded text-xs q bg-white"><input type="text" placeholder="Nome" class="flex-1 border border-gray-300 p-1 rounded text-xs n bg-white"><input type="text" placeholder="Cód" class="w-24 border border-gray-300 p-1 rounded text-xs c bg-white">`; container.appendChild(row);
}

function calcH(id) {
    const hc = document.getElementById(`hc_${id}`).value, hs = document.getElementById(`hs_${id}`).value;
    if(hc && hs) {
        let [ch, cm] = hc.split(':').map(Number), [sh, sm] = hs.split(':').map(Number); let t = (sh*60+sm) - (ch*60+cm); const elTh = document.getElementById(`th_${id}`);
        if(t < 0) { t += 1440; elTh.classList.add('text-orange-600'); } else elTh.classList.remove('text-orange-600');
        elTh.value = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    }
}
function calcDias(id) {
    let diffDays = Math.round((new Date(document.getElementById(`dtFim_${id}`).value) - new Date(document.getElementById(`dtInicio_${id}`).value)) / (1000 * 60 * 60 * 24)) + 1;
    document.getElementById(`totalDias_${id}`).value = `${isNaN(diffDays) || diffDays < 1 ? 1 : diffDays} dia(s)`;
}

function validarCamposObrigatorios() {
    let valido = true; document.querySelectorAll('.error-field').forEach(el => el.classList.remove('error-field'));
    const blocos = document.querySelectorAll('.os-bloco'); if(blocos.length === 0) return false;
    blocos.forEach(b => { const id = b.getAttribute('data-id'); const cCliente = document.getElementById(`cliente_${id}`); const cOsNum = document.getElementById(`osNum_${id}`);
        if (!cCliente.value.trim()) { cCliente.classList.add('error-field'); valido = false; }
        if (!cOsNum.value.trim()) { cOsNum.classList.add('error-field'); valido = false; } });
    
    document.querySelectorAll('.foto-desc').forEach(el => { if(!el.value.trim()) { el.classList.add('error-field'); valido = false; } });
    return valido;
}

async function salvarDocumento(silencioso = false) {
    const btnSalvar = document.getElementById('btnSalvarOs');
    if (!silencioso && btnSalvar && btnSalvar.disabled) return false; if (!silencioso && btnSalvar) btnSalvar.disabled = true;
    if (!silencioso && !validarCamposObrigatorios()) { mostrarToast('Preencha os campos em destaque!', true); if (btnSalvar) btnSalvar.disabled = false; return false; }
    try {
        let dados = recolherDadosDoFormulario(); await localforage.setItem(`os_doc_${dados.id}`, dados);
        let historicoMeta = await obterHistoricoSalvo(); let meta = gerarMetadadosResumo(dados);
        let index = historicoMeta.findIndex(d => d.id === dados.id); if(index >= 0) historicoMeta[index] = meta; else historicoMeta.unshift(meta);
        
        let gravou = await gravarHistoricoSalvo(historicoMeta);
        if(!gravou) throw new Error("Falha ao gravar no armazenamento.");
        
        await localforage.removeItem('draft_os');
        if(!silencioso) { mostrarToast('Salvo com sucesso na Base de Dados!'); await carregarHistorico(); }
        if (!silencioso && btnSalvar) btnSalvar.disabled = false; return true;
    } catch(e) { console.error('Erro salvarDocumento:', e); if(!silencioso) mostrarToast('Erro ao salvar.', true); if (!silencioso && btnSalvar) btnSalvar.disabled = false; return false; }
}

function filtrarHistorico() { const termo = document.getElementById('buscaHistorico').value.toLowerCase(); document.querySelectorAll('.historico-item').forEach(item => { item.style.display = item.innerText.toLowerCase().includes(termo) ? '' : 'none'; }); }

async function carregarHistorico() {
    const list = document.getElementById('historicoList'); let historicoMeta = await obterHistoricoSalvo();
    if(!historicoMeta || historicoMeta.length === 0) return list.innerHTML = '<p class="text-gray-500 italic text-center">Nenhum documento salvo.</p>';
    list.innerHTML = historicoMeta.map(doc => `<div class="historico-item border p-4 rounded-xl bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm mb-3 border-l-4 border-l-blue-600"><div class="mb-3 sm:mb-0"><p class="font-bold text-blue-800 text-lg">${escapeHTML(doc.clienteEmpresa || doc.nomeClienteFinal || 'Desconhecido')}</p><p class="text-sm font-semibold text-gray-700">OS: ${escapeHTML(doc.osNumResumo || 'Sem OS')} <span class="mx-1 text-gray-400">•</span> Equip: ${escapeHTML(doc.equipamentoResumo || 'Diversos')}</p><p class="text-xs text-gray-500 mt-1">Atualizado: ${doc.dataAtualizacao ? new Date(doc.dataAtualizacao).toLocaleString('pt-PT') : ''}</p></div><div class="flex gap-2 w-full sm:w-auto"><button onclick="carregarDocumentoParaEdicao('${doc.id}')" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm">Abrir</button><button onclick="apagarDocumento('${doc.id}')" class="flex-1 px-4 py-2 bg-red-100 text-red-600 rounded-lg font-semibold text-sm">Excluir</button></div></div>`).join(''); filtrarHistorico();
}

async function carregarDocumentoParaEdicao(id) {
    let doc = await localforage.getItem(`os_doc_${id}`); 
    if(!doc) { let histAntigo = await localforage.getItem('historico_os') || []; doc = histAntigo.find(d => d.id === id); if (doc && !doc.ordens) doc = null; }
    if(!doc) { mostrarToast('Erro: Ficheiro não encontrado.', true); return; }
    restaurarDadosParaFormulario(doc); mostrarToast('Documento carregado.');
}

async function apagarDocumento(id) {
    if(!confirm("Tem certeza que deseja apagar?")) return;
    let historicoMeta = await obterHistoricoSalvo(); await gravarHistoricoSalvo(historicoMeta.filter(d => d.id !== id)); await localforage.removeItem(`os_doc_${id}`);
    if(id === documentoAtualId) iniciarNovaOS(); await carregarHistorico(); atualizarIndicadorArmazenamento();
}

async function apagarTodoHistorico() {
    let historicoMeta = await obterHistoricoSalvo(); if(historicoMeta.length === 0) { mostrarToast("O histórico já está vazio."); return; }
    let p = prompt("ATENÇÃO: Isto apagará TODAS as Ordens de Serviço e fotos guardadas.\nPara confirmar, digite APAGAR:");
    if(p === "APAGAR") { await gravarHistoricoSalvo([]); let chaves = await localforage.keys(); for(let key of chaves) if(key.startsWith('os_doc_')) await localforage.removeItem(key); iniciarNovaOS(); await carregarHistorico(); atualizarIndicadorArmazenamento(); mostrarToast("Todo o histórico foi apagado."); }
}

function atualizarProgressoPDF(percentual, texto) {
    const overlay = document.getElementById('pdfProgressOverlay'); const barra = document.getElementById('pdfProgressBar');
    const txt = document.getElementById('pdfProgressText'); const percent = document.getElementById('pdfProgressPercent');
    overlay.classList.remove('hidden');
    barra.style.width = percentual + '%'; txt.textContent = texto; percent.textContent = Math.round(percentual) + '%';
    if (percentual >= 100) setTimeout(() => overlay.classList.add('hidden'), 800);
}

async function construirPDFBytes(onProgressCallback) {
    if (!validarCamposObrigatorios()) throw new Error("Preencha os campos obrigatórios!");
    
    const reportProgress = async (pct, txt) => {
        if(onProgressCallback) { onProgressCallback(pct, txt); await new Promise(r => setTimeout(r, 15)); }
    };
    
    await reportProgress(5, "A iniciar motor PDF...");

    const blocosOS = document.querySelectorAll('.os-bloco'); const isServicoInterno = verificarServicoInternoGlobal(); const cb = (eid) => document.getElementById(eid).checked ? "[X]" : "[ ]";
    const { jsPDF } = window.jspdf; const { PDFDocument, rgb, StandardFonts } = window.PDFLib; const masterPdf = await PDFDocument.create();
    let finalW = 0, finalH = 0; if (imgObject && logoImgData) { let ratio = Math.min(45 / imgObject.width, 15 / imgObject.height); finalW = imgObject.width * ratio; finalH = imgObject.height * ratio; }
    const margemTopoSegura = Math.max(35, 10 + finalH + 5);

    await reportProgress(10, "A compilar formulários...");

    for (let idx = 0; idx < blocosOS.length; idx++) {
        let basePct = 10 + (idx / blocosOS.length) * 75; 
        await reportProgress(basePct, `A processar OS ${idx + 1} de ${blocosOS.length}...`);

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
        
        const isItemMontagem = document.getElementById(`cbMontagemSala_${id}`).checked; 
        const isItemInterno = document.getElementById(`cbServInterno_${id}`).checked;
        
        if (cy > 270) { docOS.addPage(); cy = margemTopoSegura; }

        if (isItemMontagem) {
            docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy);
            cy+=8; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy);
        } else if (!isItemInterno) {
            docOS.text(`Reagendar: ${cb('reSim_'+id)} Sim  ${cb('reNao_'+id)} Não`, 120, cy);
            cy+=10; docOS.text(`DATA: ${getVal('dt', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`CHEGADA: ${getVal('hc', id)}`, 75, cy); docOS.text(`SAÍDA: ${getVal('hs', id)}`, 140, cy);
            cy+=6; docOS.text(`TOTAL HORAS: ${getVal('th', id)}`, 15, cy);
        } else {
            cy+=10; docOS.text(`DATA INÍCIO: ${getVal('dtInicio', id).split('-').reverse().join('/')}`, 15, cy); docOS.text(`DATA FINAL: ${getVal('dtFim', id).split('-').reverse().join('/')}`, 75, cy); docOS.text(`TOTAL DE DIAS: ${getVal('totalDias', id)}`, 140, cy);
        }

        const fotoItems = document.getElementById(`fotosContainer_${id}`).querySelectorAll('.foto-item');
        if (fotoItems.length > 0) {
            cy += 12; if (cy > 260) { docOS.addPage(); cy = margemTopoSegura; }
            docOS.setFont("helvetica", "bold"); docOS.setFontSize(10); docOS.text("EVIDÊNCIAS FOTOGRÁFICAS", 15, cy); cy += 8;
            let col = 0; let maxRowH = 0; let startY = cy;
            
            for(let f = 0; f < fotoItems.length; f++) {
                let fotoPct = basePct + ((f / fotoItems.length) * (75 / blocosOS.length) * 0.7); 
                await reportProgress(fotoPct, `Anexando foto ${f + 1} de ${fotoItems.length} (OS ${idx + 1})...`);

                if (col === 0 && startY > 195) { docOS.addPage(); startY = margemTopoSegura; }
                const fItem = fotoItems[f]; const base64 = fItem.querySelector('.foto-b64').value; const desc = fItem.querySelector('.foto-desc').value;
                const imgProps = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve({ w: i.width, h: i.height }); i.src = base64; });
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
                const binaryStr = atob(anexoB64.split(',')[1]); const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
                const anexoPdf = await PDFDocument.load(bytes); const anexoPages = await masterPdf.copyPages(anexoPdf, anexoPdf.getPageIndices()); anexoPages.forEach((p) => masterPdf.addPage(p));
            } catch (e) { console.error('Erro ao ler PDF anexo:', e); }
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
        let pId = document.querySelector('.os-bloco').getAttribute('data-id');
        docSig.text(`Empresa: ${getVal('cliente', pId).trim() || 'Empresa não informada'}`, 110, fy); fy += 5; docSig.text(`Nome: ${document.getElementById('nomeClienteFinal').value}`, 110, fy);
        let cargoCli = document.getElementById('cargo').value.trim(); let setorCli = document.getElementById('setor').value.trim();
        if (cargoCli || setorCli) { let infoCli = []; if (cargoCli) infoCli.push(`Cargo: ${cargoCli}`); if (setorCli) infoCli.push(`Setor: ${setorCli}`); fy += 5; docSig.setFontSize(8); docSig.setTextColor(100, 100, 100); docSig.text(infoCli.join(' | '), 110, fy); docSig.setTextColor(0, 0, 0); }
        fy+=20; docSig.setFontSize(8); docSig.setFont("helvetica", "italic"); docSig.text("Obs: a assinatura deste relatório implica na aceitação dos serviços executados e posterior cobrança.", 105, fy, {align: "center"});
    }
    const sigBuffer = docSig.output('arraybuffer'); const sigPdfLib = await PDFDocument.load(sigBuffer); const sigPages = await masterPdf.copyPages(sigPdfLib, sigPdfLib.getPageIndices()); sigPages.forEach((p) => masterPdf.addPage(p));
    
    await reportProgress(95, "A finalizar compressão e empacotamento...");

    const fonteNormal = await masterPdf.embedFont(StandardFonts.Helvetica); const todasAsPaginas = masterPdf.getPages();
    const textoAuditoria = `Documento gerado eletronicamente por ${document.getElementById('tecnico').value || "Não Identificado"} em ${new Date().toLocaleDateString('pt-PT')}.`;
    todasAsPaginas.forEach((pagina, idx) => { const { width } = pagina.getSize(); pagina.drawText(textoAuditoria, { x: 15, y: 15, size: 6, font: fonteNormal, color: rgb(0.6, 0.6, 0.6) }); const textoPags = `Página ${idx + 1} de ${todasAsPaginas.length}`; pagina.drawText(textoPags, { x: width - fonteNormal.widthOfTextAtSize(textoPags, 8) - 15, y: 15, size: 8, font: fonteNormal, color: rgb(0.5, 0.5, 0.5) }); });
    
    const finalPDF = await masterPdf.save();
    await reportProgress(100, "Concluído!");
    return finalPDF;
}

async function preVisualizarPDF() {
    const btn = document.getElementById('btnPreview'); if (btn.disabled) return;
    try {
        btn.disabled = true;
        const bytesPdf = await construirPDFBytes(atualizarProgressoPDF);
        if(objUrlPreview) URL.revokeObjectURL(objUrlPreview); const blob = new Blob([bytesPdf], { type: 'application/pdf' }); objUrlPreview = URL.createObjectURL(blob);
        const primeiraOs = document.querySelector('.os-bloco');
        let pOs = 'Rascunho', pCliente = 'Cliente';
        if(primeiraOs) { const pId = primeiraOs.getAttribute('data-id'); pOs = getVal('osNum', pId).trim() || 'Rascunho'; pCliente = getVal('cliente', pId).trim() || 'Cliente'; }
        document.getElementById('linkPreviewExt').download = `Pre_Visualizacao_${pOs.replace(/[^a-z0-9]/gi, '_')}_${pCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`; document.getElementById('linkPreviewExt').href = objUrlPreview; 
        const pdf = await pdfjsLib.getDocument({data: bytesPdf}).promise; const wrapper = document.getElementById('pdfPagesWrapper'); wrapper.innerHTML = ''; 
        currentZoom = 1; atualizarZoomPdf();
        for(let num = 1; num <= pdf.numPages; num++) { const page = await pdf.getPage(num); const viewport = page.getViewport({scale: window.innerWidth > 600 ? 2.0 : 1.8}); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.height = viewport.height; canvas.width = viewport.width; canvas.className = 'mb-4 bg-white shadow-xl border border-gray-300'; await page.render({canvasContext: ctx, viewport: viewport}).promise; wrapper.appendChild(canvas); }
        atualizarZoomPdf(); document.getElementById('modalPreviewPDF').classList.remove('hidden');
    } catch (err) { 
        console.error('Erro Pre-visualizar PDF:', err); 
        mostrarToast(err.message || 'Erro ao pre-visualizar.', true);
        document.getElementById('pdfProgressOverlay').classList.add('hidden'); 
    } finally { btn.disabled = false; }
}

function fecharPreviewPDF() { document.getElementById('modalPreviewPDF').classList.add('hidden'); }

async function gerarPDFConsolidado() {
    const btn = document.getElementById('btnGerarPdf'); const btnTxt = document.getElementById('btnTxt'); if(btn.disabled) return;
    try {
        btn.disabled = true; btnTxt.innerText = "A SALVAR...";
        if(!await salvarDocumento(false)) { btn.disabled = false; btnTxt.innerText = "📄 GERAR E PARTILHAR (PDF)"; return; }
        
        const bytesPdfFinal = await construirPDFBytes(atualizarProgressoPDF);
        
        const pId = document.querySelector('.os-bloco').getAttribute('data-id'); const pOs = getVal('osNum', pId).trim(); const pCliente = getVal('cliente', pId).trim();
        const nomeFicheiro = `${pOs.replace(/[^a-z0-9]/gi, '_')}_${pCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        const blob = new Blob([bytesPdfFinal], { type: 'application/pdf' }); const ficheiroPdf = new File([blob], nomeFicheiro, { type: "application/pdf" });
        if(urlDownloadGerado) URL.revokeObjectURL(urlDownloadGerado); urlDownloadGerado = URL.createObjectURL(blob);
        if (navigator.canShare && navigator.canShare({ files: [ficheiroPdf] })) {
            try { await navigator.share({ title: `Ordem de Serviço ${pOs}`, text: `Segue em anexo a Ordem de Serviço ${pOs} referente a ${pCliente}.`, files: [ficheiroPdf] }); mostrarToast('Documento partilhado!'); } 
            catch(err) { console.error('Erro navigator.share:', err); const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); mostrarToast('PDF transferido!'); }
        } else { const link = document.createElement('a'); link.href = urlDownloadGerado; link.download = nomeFicheiro; document.body.appendChild(link); link.click(); document.body.removeChild(link); mostrarToast('PDF transferido!'); }
    } catch (err) { 
        console.error('Erro ao gerar PDF Consolidado:', err); 
        mostrarToast(err.message || 'Erro ao gerar PDF.', true); 
        document.getElementById('pdfProgressOverlay').classList.add('hidden');
    } finally { btn.disabled = false; btnTxt.innerText = "📄 GERAR E PARTILHAR (PDF)"; }
}
