// Garante que loadData() roda após checkAuth E após o DOM estar pronto.
// Também recarrega ao clicar na aba de Emendas se ainda não carregou.
let _emendaCarregado = false;
const _origLoadData = loadData;
loadData = async function(){
  _emendaCarregado = false;
  await _origLoadData();
  _emendaCarregado = true;
};

const _origShowTab = showTab;
showTab = function(name){
  _origShowTab(name);
  if(name === 'dashboard' && !_emendaCarregado) loadData();
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
    const {error} = await sb.auth.resetPasswordForEmail(email);
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
    const {error} = await sb.auth.resetPasswordForEmail(email);
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
  setTimeout(() => { loadData(); _initModalCloseButtons(); }, 100);
});
