// Garante que loadData() roda após checkAuth E após o DOM estar pronto.
// Também recarrega ao clicar na aba de Emendas se ainda não carregou.
let _emendaCarregado = false;
let _emendaStale = false;       // dados do painel desatualizados por salvamentos feitos em outras abas
let _emendasPromise = null;     // carga em andamento (evita cargas simultâneas)
let _emendasRerun = false;      // pedido de nova carga recebido durante uma carga
const _origLoadData = loadData;

// Abas que leem allRows/cachedEmendas/cachedUnidades: precisam dos dados do painel de Emendas.
const _ABAS_USAM_DADOS_EMENDAS = ['dashboard','consulta','inventario-ac','licitacoes'];
// Nestas abas, um salvamento que chame loadData() recarrega na hora (o usuário está vendo os dados).
const _ABAS_RECARGA_IMEDIATA = ['dashboard','consulta','inventario-ac'];

// loadData() continua sendo o ponto único de recarga, mas:
//  - nunca roda em paralelo consigo mesmo;
//  - se chamado a partir de outra aba (ex.: salvar AF em Atas), só marca os dados como
//    desatualizados; a recarga acontece quando o usuário voltar a uma aba que usa esses dados.
loadData = function(){
  const aba = window._activeTab || 'dashboard';
  if(_emendaCarregado && !_emendasPromise && !_ABAS_RECARGA_IMEDIATA.includes(aba)){
    _emendaStale = true;
    return Promise.resolve();
  }
  if(_emendasPromise){ _emendasRerun = true; return _emendasPromise; }
  _emendasPromise = (async()=>{
    do{
      _emendasRerun = false;
      _emendaCarregado = false;
      await _origLoadData();
      _emendaCarregado = true;
      _emendaStale = false;
    }while(_emendasRerun);
  })().finally(()=>{ _emendasPromise = null; });
  return _emendasPromise;
};

// Garante que allRows/cachedEmendas/cachedUnidades estão carregados (e atualizados).
function ensureEmendasData(){
  if(_emendasPromise) return _emendasPromise;
  if(_emendaCarregado && !_emendaStale) return Promise.resolve();
  const aba = window._activeTab || 'dashboard';
  // chamada explícita: força a carga mesmo que a aba ativa não seja de recarga imediata
  if(_emendaCarregado && !_ABAS_RECARGA_IMEDIATA.includes(aba)){
    _emendaCarregado = false; // permite o fluxo normal de loadData()
  }
  return loadData();
}
window.ensureEmendasData = ensureEmendasData;

const _origShowTab = showTab;
showTab = function(name){
  _origShowTab(name);
  if(_ABAS_USAM_DADOS_EMENDAS.includes(name) && (!_emendaCarregado || _emendaStale)) ensureEmendasData();
};

// Injeta botão X em todos os modais que usam .modal-title (sem X próprio)
function _initModalCloseButtons(){
  document.querySelectorAll('.modal-overlay').forEach(overlay=>{
    const titleEl=overlay.querySelector('.modal-title');
    if(!titleEl) return;
    if(titleEl.querySelector('.modal-title-close')) return; // já tem X
    const btn=document.createElement('button');
    btn.className='modal-title-close';
    btn.innerHTML='✕';
    btn.title='Fechar';
    btn.type='button';
    btn.onclick=()=>overlay.classList.remove('active');
    titleEl.appendChild(btn);
  });
}

// ═══ GESTÃO DE SENHA ═══
let _isRecoveryMode = false;

function _setSenhaMsg(txt, tipo){
  const el = document.getElementById('alterar-senha-msg');
  if(!el) return;
  el.textContent = txt || '';
  el.className = 'fmsg ' + (tipo || '');
}

function abrirAlterarSenha(recoveryMode){
  _isRecoveryMode = !!recoveryMode;
  const title = document.getElementById('alterar-senha-title');
  const info  = document.getElementById('alterar-senha-info');
  const cancelBtn = document.getElementById('btn-cancelar-senha');
  if(title) title.textContent = recoveryMode ? '🔑 Definir nova senha' : '🔑 Alterar senha';
  if(info)  info.textContent  = recoveryMode
    ? 'Você acessou via link de redefinição. Defina sua nova senha abaixo.'
    : 'Informe a nova senha desejada para sua conta.';
  if(cancelBtn) cancelBtn.style.display = recoveryMode ? 'none' : '';
  document.getElementById('nova-senha').value = '';
  document.getElementById('confirmar-senha').value = '';
  _setSenhaMsg('');
  document.getElementById('modal-alterar-senha').classList.add('active');
  setTimeout(() => document.getElementById('nova-senha').focus(), 100);
}

function fecharAlterarSenha(){
  if(_isRecoveryMode) return;
  document.getElementById('modal-alterar-senha').classList.remove('active');
}

async function salvarNovaSenha(){
  const nova = document.getElementById('nova-senha').value;
  const conf = document.getElementById('confirmar-senha').value;
  if(!nova || nova.length < 6){ _setSenhaMsg('A senha deve ter pelo menos 6 caracteres.', 'err'); return; }
  if(nova !== conf){ _setSenhaMsg('As senhas não coincidem.', 'err'); return; }
  const btn = document.getElementById('btn-salvar-senha');
  btn.disabled = true; btn.textContent = 'Salvando...';
  _setSenhaMsg('Salvando...');
  try{
    const {error} = await sb.auth.updateUser({ password: nova });
    if(error) throw error;
    _setSenhaMsg('Senha alterada com sucesso!', 'ok');
    setTimeout(() => {
      document.getElementById('modal-alterar-senha').classList.remove('active');
      _isRecoveryMode = false;
      if(window.toast) toast('Senha alterada com sucesso!', 'success');
    }, 1500);
  }catch(e){
    _setSenhaMsg('Erro: ' + e.message, 'err');
  }finally{
    btn.disabled = false; btn.textContent = 'Salvar nova senha';
  }
}

function toggleEsqueceuSenha(){
  const s = document.getElementById('forgot-section');
  if(!s) return;
  const visible = s.style.display === 'none' || !s.style.display;
  s.style.display = visible ? 'block' : 'none';
  if(visible){
    const emailInput = document.getElementById('forgot-email');
    const loginEmail = document.getElementById('login-email')?.value || '';
    if(emailInput){ emailInput.value = loginEmail; emailInput.focus(); }
    document.getElementById('forgot-msg').textContent = '';
  }
}

async function enviarLinkRecuperacao(){
  const email = (document.getElementById('forgot-email')?.value || '').trim();
  const msgEl = document.getElementById('forgot-msg');
  if(!email){ msgEl.textContent = 'Informe o e-mail.'; msgEl.style.color = 'var(--red)'; return; }
  const btn = document.getElementById('btn-enviar-link');
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando...'; }
  try{
    const {error} = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://zmaffeisz.github.io/dashboard-emendas/index.html'
    });
    if(error) throw error;
    msgEl.textContent = '✅ Link enviado! Verifique a caixa de entrada.';
    msgEl.style.color = 'var(--green)';
  }catch(e){
    msgEl.textContent = 'Erro: ' + e.message;
    msgEl.style.color = 'var(--red)';
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Enviar link por e-mail'; }
  }
}

async function enviarResetSenha(email){
  if(!email){ if(window.toast) toast('E-mail não encontrado.', 'error'); return; }
  if(!await uiConfirm(`Enviar e-mail de redefinição de senha para:\n${email}?`)) return;
  try{
    const {error} = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://zmaffeisz.github.io/dashboard-emendas/index.html'
    });
    if(error) throw error;
    if(window.toast) toast('Link enviado para ' + email, 'success');
  }catch(e){
    if(window.toast) toast('Erro: ' + e.message, 'error');
  }
}

window.abrirAlterarSenha    = abrirAlterarSenha;
window.fecharAlterarSenha   = fecharAlterarSenha;
window.salvarNovaSenha      = salvarNovaSenha;
window.toggleEsqueceuSenha  = toggleEsqueceuSenha;
window.enviarLinkRecuperacao = enviarLinkRecuperacao;
window.enviarResetSenha     = enviarResetSenha;

// Detecta retorno do link de redefinição de senha enviado por e-mail
sb.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    document.getElementById('modal-login')?.classList.remove('active');
    setTimeout(() => abrirAlterarSenha(true), 400);
  }
});

checkAuth().then(() => {
  // Pequeno delay garante que o DOM está pronto antes de carregar
  setTimeout(() => {
    _initModalCloseButtons();
    const aba = window._activeTab || 'dashboard';
    if(_ABAS_USAM_DADOS_EMENDAS.includes(aba)){
      ensureEmendasData();
    }else{
      // A aba aberta não usa os dados do painel de Emendas: deixa-a carregar primeiro e
      // só depois prepara os dados em segundo plano (Licitações/Inventário/Consulta usam).
      const bg = () => { if(!_emendaCarregado && !_emendasPromise) ensureEmendasData(); };
      setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(bg, {timeout: 4000}) : bg()), 6000);
    }
  }, 100);
});
