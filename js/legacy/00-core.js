const AC_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNv3eDo49IS5Ouj16SK8mnxAHbN-sSIEVX-VyjwNqD0ey43C_-NYb3Ilky3zol-g/pub?gid=401272592&single=true&output=csv";
const CHAMADOS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2XwYGAoxuCh_A-mZOAFsaohN1Rq1czObyXFBn7T7Jv-WlppmmiCejK0zzsbOod1i9YhetzvPzWqve/pub?gid=1633672398&single=true&output=csv";
const CONTROLE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2XwYGAoxuCh_A-mZOAFsaohN1Rq1czObyXFBn7T7Jv-WlppmmiCejK0zzsbOod1i9YhetzvPzWqve/pub?gid=2129580133&single=true&output=csv";
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSMC6PshT-kTzLm36YLemi5JPSg22nGVfI6XonGkeoVyKtGlIQma-0hUOmbnnnVY6xeEIbY3gj-dl_e/pub?gid=401356519&single=true&output=csv";
const SUPABASE_URL = "https://qpvgpfwuurqcqprnpxua.supabase.co";
const SUPABASE_KEY = "sb_publishable_SisbCbcyd-MFrIqvYSQZ8A_eaVaepNp";
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let _secoesOrganizacionais = [];
window._pendingApproval = false;

// ═══ PERMISSÕES GRANULARES POR ABA ═══
// Modelo de dois papéis: 'admin' (acesso total) e qualquer outro = usuário comum,
// cujo acesso de VER/EDITAR é definido 100% pelas caixinhas de permissão por aba.
window._userPapel = null;
window._tabPerms = [];
window._activeTab = 'dashboard';
const ADMIN_ONLY_TABS = ['usuarios','cadastros']; // só admin gerencia usuários e cadastros
const DEFAULT_HIDDEN_TABS = ['planilhas']; // usuário comum só vê se for liberado na engrenagem
const SIDEBAR_TABS = ['dashboard','saldo-emendas','consulta','chamados','chamados-novos','fiscalizacao','inventario-ac','itens','empenhos','atas','contratos','licitacoes','sancoes','cadastros','usuarios','planilhas'];
function _isApprovedProfile(){ return currentProfile?.aprovado !== false; }
function _isAdmin(){ return (window._userPapel==='admin' || currentProfile?.papel==='admin') && _isApprovedProfile(); }
function _perfilEhDivisao(){ return currentProfile?.escopo_organizacional==='divisao'; }
function _contextoEhDivisao(){ return _isAdmin()?currentProfile?.contexto_modo==='divisao':_perfilEhDivisao(); }
function _secaoAtualId(){ return _isAdmin()?(currentProfile?.contexto_secao_id||currentProfile?.secao_id):currentProfile?.secao_id; }
function _secaoAtual(){ const id=String(_secaoAtualId()||''); return _secoesOrganizacionais.find(s=>String(s.id)===id)||null; }
function _escopoPodeChamados(){ return _contextoEhDivisao() || String(_secaoAtual()?.sigla||'').toUpperCase()==='SUEQ - EQUIP'; }
function _secaoOptions(valor=''){
  return '<option value="">Selecione a seção...</option>'+_secoesOrganizacionais.map(s=>`<option value="${s.id}"${String(s.id)===String(valor)?' selected':''}>${_sanEsc(s.sigla)}${s.nome?' — '+_sanEsc(s.nome):''}</option>`).join('');
}
function aplicarSecaoFormulario(selId,{valor=null}={}){
  const sel=document.getElementById(selId); if(!sel||!currentUser) return;
  const podeEscolher=_isAdmin()||_perfilEhDivisao();
  const escolhido=valor||(!_contextoEhDivisao()?_secaoAtualId():null);
  sel.innerHTML=_secaoOptions(escolhido);
  sel.disabled=!podeEscolher;
  if(!podeEscolher&&currentProfile?.secao_id) sel.value=String(currentProfile.secao_id);
  if(_contextoEhDivisao()&&!valor) sel.value='';
}
function aplicarSecaoTextoFormulario(selId,valor=null){
  const sel=document.getElementById(selId); if(!sel||!currentUser) return;
  const podeEscolher=_isAdmin()||_perfilEhDivisao();
  const escolhido=valor||(!_contextoEhDivisao()?_secaoAtual()?.sigla:null);
  if(escolhido) sel.value=escolhido;
  sel.disabled=!podeEscolher;
  if(!podeEscolher&&_secaoAtual()?.sigla) sel.value=_secaoAtual().sigla;
  if(_contextoEhDivisao()&&!valor) sel.value='';
}
async function carregarContextoOrganizacional(){
  const {data}=await sb.from('secoes').select('id,sigla,nome').eq('ativo',true).order('sigla');
  _secoesOrganizacionais=data||[];
  const wrap=document.getElementById('org-context-wrap'), label=document.getElementById('org-context-label');
  if(_isAdmin()){
    const sel=document.getElementById('org-context-select');
    sel.innerHTML='<option value="divisao">Divisão — todas as seções</option>'+_secoesOrganizacionais.map(s=>`<option value="secao:${s.id}">${_sanEsc(s.sigla)}</option>`).join('');
    sel.value=currentProfile?.contexto_modo==='divisao'?'divisao':`secao:${currentProfile?.contexto_secao_id||currentProfile?.secao_id||''}`;
    wrap.style.display='inline-flex'; label.style.display='none';
  }else{
    wrap.style.display='none'; label.textContent=_perfilEhDivisao()?'Divisão — todas as seções':(_secaoAtual()?.sigla||'Seção não definida'); label.style.display='inline-flex';
  }
}
async function trocarContextoAdmin(){
  if(!_isAdmin()) return;
  const val=document.getElementById('org-context-select')?.value||'';
  const patch=val==='divisao'?{contexto_modo:'divisao',contexto_secao_id:null}:{contexto_modo:'secao',contexto_secao_id:Number(val.split(':')[1])};
  const {error}=await sb.from('profiles').update(patch).eq('id',currentUser.id);
  if(error){alert('Não foi possível trocar o contexto: '+error.message);return;}
  window.location.reload();
}
function userCanView(tabKey){
  if(tabKey==='dashboard') return true;
  if(!_isApprovedProfile()) return false;
  if(['chamados','chamados-novos','fiscalizacao'].includes(tabKey)&&!_escopoPodeChamados()) return false;
  if(_isAdmin()) return true;
  if(ADMIN_ONLY_TABS.includes(tabKey)) return false;
  const perm=(window._tabPerms||[]).find(p=>p.tab_key===tabKey);
  if(perm) return !!perm.can_view;
  return tabKey==='dashboard'; // conta nova vê apenas Emendas; admin libera o resto nas caixinhas
}
function userCanEdit(tabKey){
  if(!_isApprovedProfile()) return false;
  if(['chamados','chamados-novos','fiscalizacao'].includes(tabKey)&&!_escopoPodeChamados()) return false;
  if(_isAdmin()) return true;
  if(ADMIN_ONLY_TABS.includes(tabKey)) return false;
  const perm=(window._tabPerms||[]).find(p=>p.tab_key===tabKey);
  if(perm) return !!perm.can_edit;
  return false; // edição só com a caixinha marcada
}
function aplicarVisibilidadeAbas(){
  SIDEBAR_TABS.forEach(n=>{
    const el=document.getElementById("sidebar-"+n);
    if(el) el.style.display = (n==='saldo-emendas' ? userCanEdit('dashboard') : userCanView(n)) ? "flex" : "none";
  });
  updateSidebarSections();
}
function updateSidebarSections(){
  document.querySelectorAll('.sidebar-section').forEach(sec=>{
    const items=[...sec.querySelectorAll('.sidebar-item')];
    const anyVisible=items.some(it=>it.style.display!=='none');
    sec.style.display = anyVisible ? '' : 'none';
  });
}

// ═══ SIDEBAR / LAYOUT ═══
function _setTableOffset(){
  // Mede a altura dos elementos ACIMA da tabela em cada aba ativa
  // e define --table-offset para que a tabela ocupe o resto da tela
  const panel=document.querySelector('.panel.active');
  if(!panel) return;
  const wrap=panel.querySelector('.table-wrap, #pl-table-wrap');
  if(!wrap) return;
  const rect=wrap.getBoundingClientRect();
  // offset = distância do topo da viewport até o topo da tabela + padding inferior (20px)
  const offset=Math.round(rect.top)+20;
  document.documentElement.style.setProperty('--table-offset', offset+'px');
}

function setHeaderH(){
  const h=document.querySelector('.header');
  if(h) document.documentElement.style.setProperty('--header-h', h.offsetHeight+'px');
}
function updateSidebarOverlay(){
  const ov=document.getElementById('sidebar-overlay');
  if(!ov) return;
  const open=document.body.classList.contains('sidebar-open') && window.innerWidth<=768;
  ov.style.display=open?'block':'none';
}
function toggleSidebar(){ document.body.classList.toggle('sidebar-open'); updateSidebarOverlay(); }
function fecharSidebar(){ document.body.classList.remove('sidebar-open'); updateSidebarOverlay(); }
window.addEventListener('resize',()=>{ setHeaderH(); _setTableOffset(); updateSidebarOverlay(); });

async function checkAuth(){
  const {data:{session}} = await sb.auth.getSession();
  if(!session){
    entrarModoConvidado();
    return false;
  }
  currentUser = session.user;
  // profile e permissões por aba não dependem uma da outra: buscar em paralelo
  // (antes eram 2 chamadas em série, cada uma somando latência ao carregamento inicial).
  console.time('checkAuth:profile+tabPerms');
  const [{data:profile}, tabPermsResult] = await Promise.all([
    sb.from("profiles").select("*").eq("id", currentUser.id).single(),
    sb.from('user_tab_permissions').select('*').eq('user_id', currentUser.id).then(r=>r, e=>({data:null,error:e}))
  ]);
  console.timeEnd('checkAuth:profile+tabPerms');
  currentProfile = profile;
  window._userPapel = profile?.papel || 'visualizador';
  window._pendingApproval = false;
  window._tabPerms = tabPermsResult?.data || [];
  if(profile && profile.aprovado === false && profile.papel !== 'admin'){
    entrarModoPendente();
    return false;
  }
  await carregarContextoOrganizacional();

  // Esconder banner de convidado e botão de login
  document.getElementById("guest-banner").style.display = "none";
  document.getElementById("btn-login-header").style.display = "none";

  // Mostrar nome do usuário
  const greetEl = document.getElementById("user-greeting");
  if(greetEl){
    greetEl.textContent = "Olá, " + (profile?.nome || currentUser.email);
    greetEl.style.display = "inline";
  }

  // Mostrar abas conforme permissões (papel global + permissões por aba)
  aplicarVisibilidadeAbas();

  // Botões de editor da aba Emendas (a visibilidade real é controlada por aba em showTab)
  const eb=document.getElementById("editor-btns");
  if(eb) eb.style.display="flex";

  // Botão de logout
  if(!document.getElementById("btn-logout")){
    const logoutBtn=document.createElement("button");
    logoutBtn.className="refresh-btn";
    logoutBtn.id="btn-logout";
    logoutBtn.textContent="Sair";
    logoutBtn.onclick=async()=>{ await sb.auth.signOut(); window.location.reload(); };
    const senhaBtn=document.createElement("button");
    senhaBtn.className="refresh-btn";
    senhaBtn.id="btn-alterar-senha-header";
    senhaBtn.textContent="🔑 Senha";
    senhaBtn.title="Alterar minha senha";
    senhaBtn.onclick=()=>abrirAlterarSenha(false);
    const chamadosLink=document.querySelector("a[href*='chamado.html']");
    if(chamadosLink){
      chamadosLink.parentNode.insertBefore(logoutBtn,chamadosLink.nextSibling);
      chamadosLink.parentNode.insertBefore(senhaBtn,logoutBtn);
    }
  }

  // (visibilidade das abas Usuários/Planilhas já é tratada por aplicarVisibilidadeAbas)

  // Controle de botões de edição por aba (modelo de permissões granulares).
  // Quando a aba ativa não permite editar para este usuário, escondemos os botões de ação.
  const _editStyle=document.createElement('style');
  _editStyle.textContent=`
    body.no-edit-tab button[onclick*="salvarNova"],
    body.no-edit-tab button[onclick*="abrirModalNova"],
    body.no-edit-tab button[onclick*="abrirModalNovaExec"],
    body.no-edit-tab button[onclick*="abrirModalNovaAta"],
    body.no-edit-tab button[onclick*="abrirModalEdicao"],
    body.no-edit-tab button[onclick*="encerrarContrato"],
    body.no-edit-tab button[onclick*="renovarAta"],
    body.no-edit-tab button[onclick*="excluirExec"],
    body.no-edit-tab button[onclick*="excluirLinhaAC"],
    body.no-edit-tab button[onclick*="excluirLinhaChamado"],
    body.no-edit-tab button[onclick*="adicionarLinhaAC"],
    body.no-edit-tab button[onclick*="marcarTodosChamados"],
    body.no-edit-tab #editor-btns,
    body.no-edit-tab #btn-add-ac,
    body.no-edit-tab .btn-enviar-status
    {display:none!important}
  `;
  document.head.appendChild(_editStyle);

  const ultimaAba=localStorage.getItem("ultima_aba");
  if(ultimaAba) showTab(ultimaAba);
  return true;
}

function entrarModoConvidado(){
  window._pendingApproval = false;
  window._userPapel = null;
  window._tabPerms = [];
  // Esconder todas as abas exceto Emendas
  document.querySelectorAll('.sidebar-item').forEach(el=>{
    el.style.display = el.id==='sidebar-dashboard' ? 'flex' : 'none';
  });
  updateSidebarSections();
  // Mostrar banner e botão de login
  const banner=document.getElementById("guest-banner");
  if(banner){
    banner.style.display="flex";
    const title=banner.querySelector("div div:first-child");
    const sub=banner.querySelector("div div:nth-child(2)");
    const btn=banner.querySelector("button");
    if(title) title.textContent="Modo de visualização pública";
    if(sub) sub.textContent="Você está vendo as emendas em modo público. Faça login para acessar todas as seções e funcionalidades.";
    if(btn){ btn.textContent="Fazer Login"; btn.onclick=abrirModalLogin; }
  }
  document.getElementById("btn-login-header").style.display="inline-block";
  showTab("dashboard");
}

function entrarModoPendente(){
  window._pendingApproval = true;
  window._tabPerms = [];
  document.querySelectorAll('.sidebar-item').forEach(el=>{
    el.style.display = el.id==='sidebar-dashboard' ? 'flex' : 'none';
  });
  updateSidebarSections();
  const banner=document.getElementById("guest-banner");
  if(banner){
    banner.style.display="flex";
    const title=banner.querySelector("div div:first-child");
    const sub=banner.querySelector("div div:nth-child(2)");
    const btn=banner.querySelector("button");
    if(title) title.textContent="Acesso aguardando aprovação";
    if(sub) sub.textContent="Sua conta foi criada, mas um administrador precisa aprovar seu acesso interno. Enquanto isso, você pode consultar as emendas públicas.";
    if(btn){ btn.textContent="Sair"; btn.onclick=async()=>{ await sb.auth.signOut(); window.location.reload(); }; }
  }
  document.getElementById("btn-login-header").style.display="none";
  const greetEl=document.getElementById("user-greeting");
  if(greetEl){
    greetEl.textContent="Aguardando aprovação";
    greetEl.style.display="inline";
  }
  document.getElementById("loading").style.display="none";
  showTab("dashboard");
}

function abrirModalLogin(){
  document.getElementById("modal-login").classList.add("active");
  document.getElementById("login-email").value="";
  document.getElementById("login-senha").value="";
  document.getElementById("login-err").style.display="none";
  setTimeout(()=>document.getElementById("login-email").focus(),100);
}

async function fazerLogin(){
  const email=document.getElementById("login-email").value.trim();
  const senha=document.getElementById("login-senha").value;
  const errEl=document.getElementById("login-err");
  const btnEl=document.getElementById("btn-fazer-login");
  if(!email||!senha){
    errEl.textContent="Preencha e-mail e senha.";
    errEl.style.display="block";
    return;
  }
  btnEl.disabled=true;
  btnEl.textContent="Entrando...";
  errEl.style.display="none";
  const {error}=await sb.auth.signInWithPassword({email,password:senha});
  if(error){
    errEl.textContent=error.message==="Invalid login credentials"?"E-mail ou senha incorretos.":error.message;
    errEl.style.display="block";
    btnEl.disabled=false;
    btnEl.textContent="Entrar";
    return;
  }
  document.getElementById("modal-login").classList.remove("active");
  btnEl.disabled=false;
  btnEl.textContent="Entrar";
  await checkAuth();
}

let allRows = [];
let cachedEmendas = [];
let cachedUnidades = [];
let cachedProcessos = [];
let acRows = [];
let atasItens = [];
let atasExec = [];
let atasContratos = [];
let itensRows = [];
let itensCarregado = false;
let chamadosRows = [];
let controleRows = [];
let filtered = [];
let searchType = "todos";
let lastSearchResults = [];
let sortCol = null;
let sortAsc = true;
let selectedEmendas = [];
let pendingEmendas = [];
let allEmendaOptions = [];

const STATUS_MAP = {
  "ENTREGUE":{color:"#1D9E75",label:"Entregue"},
  "EM LICITAÇÃO":{color:"#378ADD",label:"Em licitação"},
  "EM ANDAMENTO":{color:"#888780",label:"Em andamento"},
  "AGUARDANDO RESERVA":{color:"#EF9F27",label:"Aguard. reserva"},
  "AGUARDANDO AF":{color:"#EF9F27",label:"Aguard. AF"},
  "FRACASSADO":{color:"#E24B4A",label:"Fracassado"},
  "SEGOV":{color:"#D4537E",label:"SEGOV"},
  "PREGÃO AGENDADO":{color:"#7F77DD",label:"Pregão agendado"},
  "CANCELADO":{color:"#5F5E5A",label:"Cancelado"},
  "AF EMITIDA":{color:"#639922",label:"AF emitida"},
  "TRANSFERIDO TI":{color:"#B4B2A9",label:"Transferido TI"},
  "SUSPENSO":{color:"#E24B4A",label:"Suspenso"},
  "EM CARONA":{color:"#5DCAA5",label:"Em carona"},
  "CONTROLE INTERNO":{color:"#BA7517",label:"Controle interno"},
  "SEM STATUS":{color:"#d0cfc8",label:"Sem status"},
};

function catStatus(s){
  if(!s||s.trim()===""||s==="nan") return "SEM STATUS";
  const u=s.toUpperCase();
  if(u.includes("ADQUIRIDO/ENTREGUE")||u.includes("ADQUIRIDO / ENTREGUE")||u.includes("ADQUIRIDO EM 20")) return "ENTREGUE";
  if(u.includes("CANCELADO")||u.includes("ITEM CANCELADO")||u.includes("ITEM REMOVIDO")||u.includes("ITEM PREJUDICADO")||u.includes("SEM SALDO")) return "CANCELADO";
  if(u.includes("FRACASSADO")) return "FRACASSADO";
  if(u.includes("AGUARDANDO AF")) return "AGUARDANDO AF";
  if(u.includes("AF EMITIDA")||u.includes("AGUARDANDO ENTREGA")||u.includes("AGUARDANDO CONFIRMACAO")) return "AF EMITIDA";
  if(u.includes("AGUARDANDO RESERVA")||u.includes("RESERVA SOLICITADA")) return "AGUARDANDO RESERVA";
  if(u.includes("SEAD")||u.includes("ELABORANDO EDITAL")||u.includes("ANALISE DE EDITAL")||u.includes("ANÁLISE JURÍDICA")) return "EM LICITAÇÃO";
  if(u.includes("PREGÃO AGENDADO")||u.includes("PREGAO AGENDADO")) return "PREGÃO AGENDADO";
  if(u.includes("CARONA")||u.includes("ADESÃO")) return "EM CARONA";
  if(u.includes("SUSPENSA")||u.includes("DEVOLUÇÃO")||u.includes("SUSPENSO")) return "SUSPENSO";
  if(u.includes("TRANSFERIDA")||u.includes("TI/SES")) return "TRANSFERIDO TI";
  if(u.includes("SEGOV")) return "SEGOV";
  if(u.includes("CONTROLE INTERNO")) return "CONTROLE INTERNO";
  return "EM ANDAMENTO";
}

function normalizar(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function matchBusca(texto, query){
  if(!query) return true;
  const palavras=normalizar(query).trim().split(/\s+/).filter(Boolean);
  const t=normalizar(texto);
  return palavras.every(p=>t.includes(p));
}
function parseBR(v){
  if(!v) return 0;
  let s=v.toString().trim().replace(/[R$\s]/g,"").replace(/[^\d.,]/g,"");
  if(s.includes(",")) s=s.replace(/\./g,"").replace(",",".");
  return parseFloat(s)||0;
}
function fmtM(v){const n=parseFloat(v)||0;if(n>=1e6)return"R$ "+(n/1e6).toFixed(1)+"M";if(n>=1e3)return"R$ "+(n/1e3).toFixed(0)+"K";return"R$ "+n.toFixed(0)}
function fmtFull(v){return"R$ "+((parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2}))}
function tipoBadge(t){const m={"ESTADUAL":["#E1F5EE","#085041"],"FEDERAL":["#E6F1FB","#0C447C"],"MUNICIPAL":["#EEEDFE","#26215C"]};const c=m[t]||["#F1EFE8","#444"];return`<span class="badge" style="background:${c[0]};color:${c[1]}">${t||"—"}</span>`}
function statusBadge(cat){const i=STATUS_MAP[cat]||{color:"#888",label:cat};return`<span class="badge" style="background:${i.color}22;color:${i.color}">${i.label}</span>`}

// ═══ TABS ═══

function abrirModalEdicao(name){
  if(bloquearSeVisualiz()) return;
  popularSelectsEdicao();
  if(name==='nova-emenda'){ preencherSelectParlamentares(); neInitItens(); }
  if(name==='atualizar-status'){ resetModalFilters(); limparStatus(); }
  if(name==='novo-item'||name==='atualizar-status'){ popularStatusLicitacao(); }
  document.getElementById("panel-"+name).classList.add("active");
}

// Popula os controles de status dos modais (novo item / atualizar status) com a MESMA
// fonte da aba "Licitações em andamento": status_opcoes contexto='licitacao' (manuais).
// Mantém o fallback hardcoded do HTML caso a consulta falhe.
let _statusLicCache=null;
async function popularStatusLicitacao(){
  if(!_statusLicCache){
    const {data,error}=await sb.from('status_opcoes')
      .select('nome,ordem,automatico').eq('contexto','licitacao').eq('ativo',true).order('ordem');
    if(error||!data||!data.length) return;
    _statusLicCache=data.filter(s=>!s.automatico).map(s=>s.nome);
    if(!_statusLicCache.length){ _statusLicCache=null; return; }
  }
  const sel=document.getElementById('ni-status');
  if(sel){
    const atual=sel.value;
    sel.innerHTML='<option value="">Selecione...</option>'+_statusLicCache.map(n=>`<option value="${_sanEsc(n)}">${_sanEsc(n)}</option>`).join('');
    if(atual) sel.value=atual;
  }
  const dl=document.getElementById('status-opcoes');
  if(dl){ dl.innerHTML=_statusLicCache.map(n=>`<option value="${_sanEsc(n)}">`).join(''); }
}

function fecharModalEdicao(name){
  document.getElementById("panel-"+name).classList.remove("active");
}

function showTab(name){
  if(name==='saldo-emendas'&&!podeEditar('dashboard')){
    alert("⛔ Você não tem permissão para acessar o saldo das emendas.");
    return;
  }
  if(name!=='saldo-emendas'&&!userCanView(name)){
    alert("⛔ Você não tem permissão para acessar esta aba.");
    return;
  }
  localStorage.setItem("ultima_aba", name);
  window._activeTab = name;
  document.body.classList.toggle('no-edit-tab', !userCanEdit(name==='saldo-emendas'?'dashboard':name));
  const names=["dashboard","saldo-emendas","consulta","chamados","chamados-novos","fiscalizacao","inventario-ac","itens","empenhos","atas","contratos","usuarios","planilhas"];
  document.querySelectorAll(".sidebar-item").forEach(t=>t.classList.toggle("active",t.id==="sidebar-"+name));
  fecharSidebar();
  document.querySelectorAll(".panel").forEach(p=>{if(!p.classList.contains("modal-overlay"))p.classList.remove("active")});
  document.getElementById("panel-"+name).classList.add("active");
  if(name==="chamados"&&!chamadosRows.length) loadChamados();
  if(name==="chamados-novos"&&!chamadosNovosCarregado) loadChamadosNovos();
  if(name==="fiscalizacao"&&!fiscalizacaoCarregado) loadFiscalizacao();
  if(name==="inventario-ac"&&!inventarioCarregado) loadInventario();
  if(name==="atas") loadAtas(); // sempre recarrega: ATAS é view derivada de contratos (reflete encerrar/prorrogar/editar feitos na aba Contratos)
  if(name==="itens"){ if(!itensCarregado) loadItens(); itensShowSub('entregas'); }
  if(name==="empenhos"&&!empenhosCarregado) loadEmpenhos();
  if(name==="contratos"&&!contratosCarregado) loadContratos();
  if(name==="usuarios") carregarUsuarios();
  if(name==="planilhas") carregarPlanilhaAC();
  if(name==="sancoes") loadSancoes();
  if(name==="cadastros") carregarCadastros();
  if(name==="licitacoes") loadLicitacoes();
  if(name==="saldo-emendas"&&!saldoEmendaCarregado) loadSaldoEmendas();
  setTimeout(_setTableOffset,50);
  _scanResizableTables();
  setTimeout(_scanResizableTables,400);
  setTimeout(_scanResizableTables,1200);
}

// ═══ LOAD ═══
async function exportarExcel(){
  await ensureLib('xlsx');
  if(!filtered.length){alert("Nenhum dado para exportar.");return}
  const colunas=[
    "TIPO","EMENDA","PARLAMENTAR","PROCESSO SEI DA EMENDA","VALOR CEDIDO",
    "UNIDADE BENEFICIADA","ITEM","QTDE EXECUTADA",
    "VALOR UNITÁRIO (R$) EXECUTADO","VALOR TOTAL (R$) EXECUTADO",
    "PROCESSO SEI DA CONTRATAÇÃO","STATUS DA CONTRATAÇÃO",
    "NOTA FISCAL","Nº DE EMPENHO","Nº DE PATRIMONIO",
    "UNIDADE DE ENTREGA","DATA DE ENTREGA NA UNIDADE","ORDEM DE PAGAMENTO"
  ];
  colunas.splice(8,0,"VALOR UNITARIO (R$) PLANEJADO","VALOR TOTAL (R$) PLANEJADO","VALOR UNITARIO (R$) LICITACAO","VALOR TOTAL (R$) LICITACAO");
  const dados=filtered.map(r=>[
    r.tipo, r.emenda, r.parlamentar, r.sei_emenda, r.valor_cedido,
    r.unidade, r.item, r.qtde,
    r.vl_unitario_cadastrado, r.vl_total_cadastrado,
    r.valor_licitacao_unit, r.valor_licitacao,
    r.vl_unitario, r.vl_total,
    r.cpl, r.status_raw,
    r.nota_fiscal, r.empenho, r.patrimonio,
    r.unidade_entrega, r.data_entrega, r.ordem_pagamento
  ]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  ws['!cols']=colunas.map((_,i)=>({wch:Math.max(12,...dados.map(row=>String(row[i]||"").length))+2}));
  const wb={SheetNames:["Emendas"],Sheets:{Emendas:ws}};
  const data=new Date().toLocaleDateString("pt-BR").replace(/\//g,"-");
  XLSX.writeFile(wb,"emendas_filtradas_"+data+".xlsx");
}

// ═══ CARREGAMENTO SOB DEMANDA DE BIBLIOTECAS PESADAS ═══
const _libUrls={
  xlsx:"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  html2pdf:"https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
  papa:"https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"
};
const _libCheck={xlsx:()=>window.XLSX,html2pdf:()=>window.html2pdf,papa:()=>window.Papa};
const _libPromise={};
function ensureLib(name){
  if(_libCheck[name] && _libCheck[name]()) return Promise.resolve();
  if(_libPromise[name]) return _libPromise[name];
  _libPromise[name]=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=_libUrls[name];
    s.onload=()=>resolve();
    s.onerror=()=>{_libPromise[name]=null;reject(new Error("Falha ao carregar "+name));};
    document.head.appendChild(s);
  });
  return _libPromise[name];
}

// ═══ FEEDBACK UNIFICADO: toast + confirmação (8.4) ═══
(function(){
  const st=document.createElement("style");
  st.textContent=`
  #toast-wrap{position:fixed;top:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:min(360px,92vw)}
  .toast{padding:11px 14px;border-radius:8px;font-size:13px;line-height:1.4;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s;word-break:break-word}
  .toast.show{opacity:1;transform:none}
  .toast.info{background:#2563eb}.toast.success{background:#059669}.toast.error{background:#dc2626}.toast.warn{background:#d97706}
  #uiconfirm-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:none;align-items:center;justify-content:center;padding:16px}
  #uiconfirm-ov.show{display:flex}
  #uiconfirm-box{background:var(--surface,#fff);color:var(--text,#111);border-radius:12px;max-width:400px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
  #uiconfirm-msg{font-size:14px;line-height:1.5;white-space:pre-line;margin-bottom:18px}
  #uiconfirm-btns{display:flex;gap:8px;justify-content:flex-end}
  #uiconfirm-btns button{padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid var(--border,#ddd)}
  #uiconfirm-no{background:var(--surface,#fff);color:var(--text,#111)}
  #uiconfirm-yes{background:#dc2626;color:#fff;border-color:#dc2626;font-weight:600}`;
  (document.head||document.documentElement).appendChild(st);
  function wrapEl(){let w=document.getElementById("toast-wrap");if(!w&&document.body){w=document.createElement("div");w.id="toast-wrap";document.body.appendChild(w);}return w;}
  window.toast=function(msg,type){type=type||'info';const w=wrapEl();if(!w)return;const t=document.createElement("div");t.className="toast "+type;t.textContent=String(msg);w.appendChild(t);requestAnimationFrame(()=>t.classList.add("show"));setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),250);},type==='error'?6000:3500);};
  window.alert=function(msg){const s=String(msg);const type=/erro|falha|⛔|permiss|inv[aá]lid/i.test(s)?'error':/✓|sucesso/i.test(s)?'success':'info';window.toast(s,type);};
  let _ov=null,_resolve=null;
  function _close(v){if(_ov)_ov.classList.remove("show");if(_resolve){_resolve(v);_resolve=null;}}
  function ovEl(){
    if(_ov)return _ov;
    _ov=document.createElement("div");_ov.id="uiconfirm-ov";
    _ov.innerHTML='<div id="uiconfirm-box" role="dialog" aria-modal="true"><div id="uiconfirm-msg"></div><div id="uiconfirm-btns"><button id="uiconfirm-no" type="button">Cancelar</button><button id="uiconfirm-yes" type="button">Confirmar</button></div></div>';
    document.body.appendChild(_ov);
    _ov.querySelector("#uiconfirm-no").onclick=()=>_close(false);
    _ov.querySelector("#uiconfirm-yes").onclick=()=>_close(true);
    return _ov;
  }
  window.uiConfirm=function(msg){const ov=ovEl();ov.querySelector("#uiconfirm-msg").textContent=String(msg);ov.classList.add("show");return new Promise(r=>{_resolve=r;});};
})();

// ═══ FECHAMENTO GENÉRICO DE MODAIS: ESC e clique no backdrop (redesign visual) ═══
// Rede de segurança para todo .modal-overlay: só remove a classe "active" (mesmo
// efeito visual do botão de fechar). Onde já existe um fecharModalX() dedicado, ele
// continua sendo chamado normalmente pelos botões/X existentes — isto não o substitui.
(function(){
  // O fechamento ocorre somente pelos controles explícitos do próprio modal.
})();
