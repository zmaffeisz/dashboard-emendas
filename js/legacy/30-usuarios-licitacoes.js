// ═══ USUÁRIOS ═══
let _usuariosCache = [];
const PERM_TABS = [
  {key:'dashboard', label:'Emendas'},
  {key:'saldo-emendas', label:'Saldo das Emendas'},
  {key:'consulta', label:'Consulta rápida'},
  {key:'chamados', label:'Chamados Antigos'},
  {key:'chamados-novos', label:'Chamados novos'},
  {key:'fiscalizacao', label:'Fiscalização de Contratos'},
  {key:'inventario-ac', label:'Inventário'},
  {key:'atas', label:'Atas Rp Vigentes'},
  {key:'contratos', label:'Contratos em execução'},
  {key:'licitacoes', label:'Licitações em andamento'},
  {key:'itens', label:'Controle de Entregas'},
  {key:'empenhos', label:'Empenhos'},
  {key:'sancoes', label:'Sanções'},
  {key:'planilhas', label:'Planilhas'},
];
let _udUserId = null;
function _defaultPerm(tabKey, papel){
  // Modelo de dois papéis: admin vê/edita tudo; usuário comum vê por padrão
  // (exceto abas administrativas) e só edita se liberado.
  if(papel==='admin') return {can_view:true, can_edit:true};
  return {can_view: tabKey==='dashboard', can_edit:false}; // conta nova: só vê Emendas
}
async function abrirDetalheUsuario(userId){
  const p=_usuariosCache.find(u=>u.id===userId);
  if(!p) return;
  _udUserId=userId;
  document.getElementById('ud-nome-input').value=p.nome||'';
  document.getElementById('ud-nome').textContent=p.nome||'—';
  document.getElementById('ud-email').textContent=p.email||'';
  document.getElementById('ud-papel').value=(p.papel==='admin')?'admin':'visualizador';
  document.getElementById('ud-escopo').value=p.escopo_organizacional==='divisao'?'divisao':'secao';
  document.getElementById('ud-secao').innerHTML=_secaoOptions(p.secao_id||'');
  document.getElementById('ud-secao').value=p.secao_id?String(p.secao_id):'';
  _udEscopoChange();
  const aprovadoEl=document.getElementById('ud-aprovado');
  if(aprovadoEl) aprovadoEl.checked = p.aprovado !== false;
  const excluirEl=document.getElementById('ud-excluir');
  if(excluirEl){
    excluirEl.style.display = p.id===currentUser?.id ? 'none' : 'inline-flex';
    excluirEl.disabled = p.id===currentUser?.id;
  }
  const msg=document.getElementById('ud-msg'); msg.className='fmsg'; msg.textContent='';
  const body=document.getElementById('ud-perms-body');
  body.innerHTML='<tr><td colspan="3" style="padding:10px;color:var(--text3);font-size:12px">Carregando...</td></tr>';
  document.getElementById('modal-usuario-detalhe').classList.add('active');
  let perms=[];
  try{ const {data}=await sb.from('user_tab_permissions').select('*').eq('user_id',userId); perms=data||[]; }catch(e){ perms=[]; }
  body.innerHTML=PERM_TABS.map(t=>{
    const found=perms.find(x=>x.tab_key===t.key);
    const def=found?{can_view:!!found.can_view,can_edit:!!found.can_edit}:_defaultPerm(t.key,p.papel);
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 8px">${t.label}</td>
      <td style="padding:7px 8px;text-align:center"><input type="checkbox" id="udv-${t.key}" ${def.can_view?'checked':''} onchange="_udSyncEdit('${t.key}')" style="accent-color:var(--blue);width:15px;height:15px;cursor:pointer"></td>
      <td style="padding:7px 8px;text-align:center"><input type="checkbox" id="ude-${t.key}" ${def.can_edit?'checked':''} ${def.can_view?'':'disabled'} style="accent-color:var(--blue);width:15px;height:15px;cursor:pointer"></td>
    </tr>`;
  }).join('');
}
function _udEscopoChange(){
  const divisao=document.getElementById('ud-escopo')?.value==='divisao';
  const wrap=document.getElementById('ud-secao-wrap'); if(wrap) wrap.style.display=divisao?'none':'flex';
}
function _udSyncEdit(key){
  const v=document.getElementById('udv-'+key);
  const e=document.getElementById('ude-'+key);
  if(!v||!e) return;
  if(!v.checked){ e.checked=false; e.disabled=true; } else { e.disabled=false; }
}
function fecharDetalheUsuario(){ document.getElementById('modal-usuario-detalhe').classList.remove('active'); _udUserId=null; }
async function salvarPermissoesUsuario(){
  if(bloquearSeVisualiz()) return;
  if(!_udUserId) return;
  const btn=document.getElementById('ud-salvar');
  const msg=document.getElementById('ud-msg');
  btn.disabled=true; btn.textContent='Salvando...';
  const novoNome=(document.getElementById('ud-nome-input')?.value||'').trim();
  const novoPapel=document.getElementById('ud-papel').value;
  const aprovado=!!document.getElementById('ud-aprovado')?.checked;
  const escopo=document.getElementById('ud-escopo').value;
  const secaoId=escopo==='secao'?Number(document.getElementById('ud-secao').value||0):null;
  if(escopo==='secao'&&!secaoId){msg.textContent='Selecione a seção do usuário.';msg.className='fmsg err';btn.disabled=false;btn.textContent='Salvar permissões';return;}
  const org={escopo_organizacional:escopo,secao_id:secaoId,contexto_modo:escopo==='divisao'?'divisao':'secao',contexto_secao_id:secaoId};
  const {data:upd,error:errPapel}=await sb.from('profiles').update({nome:novoNome||null,papel:novoPapel,aprovado,...org}).eq('id',_udUserId).select();
  if(errPapel){ msg.textContent='Erro ao salvar papel: '+errPapel.message; msg.className='fmsg err'; btn.disabled=false; btn.textContent='Salvar permissões'; return; }
  if(!upd || upd.length===0){ msg.textContent='⚠️ Sem permissão para alterar este usuário (verifique a política RLS de profiles).'; msg.className='fmsg err'; btn.disabled=false; btn.textContent='Salvar permissões'; return; }
  const rows=PERM_TABS.map(t=>({
    user_id:_udUserId, tab_key:t.key,
    can_view:document.getElementById('udv-'+t.key).checked,
    can_edit:document.getElementById('ude-'+t.key).checked,
  }));
  const {error}=await sb.from('user_tab_permissions').upsert(rows,{onConflict:'user_id,tab_key'});
  if(error){ msg.textContent='Erro ao salvar permissões: '+error.message+' — confirme que a tabela user_tab_permissions existe no Supabase.'; msg.className='fmsg err'; btn.disabled=false; btn.textContent='Salvar permissões'; return; }
  msg.textContent='✓ Permissões salvas com sucesso.'; msg.className='fmsg ok';
  btn.disabled=false; btn.textContent='Salvar permissões';
  carregarUsuarios();
  setTimeout(()=>fecharDetalheUsuario(),900);
}

async function excluirUsuario(userId, email){
  if(bloquearSeVisualiz('usuarios')) return;
  if(!userId) return;
  const p=_usuariosCache.find(u=>u.id===userId);
  const alvoEmail=email || p?.email || 'este usuario';
  if(userId===currentUser?.id){
    alert('Por seguranca, voce nao pode excluir a propria conta por aqui.');
    return;
  }
  const pergunta='Excluir a conta de '+alvoEmail+'?\n\nIsso remove o login no Supabase Auth e o perfil do usuario. Esta acao nao pode ser desfeita pela tela.';
  const ok=window.uiConfirm ? await uiConfirm(pergunta) : confirm(pergunta);
  if(!ok) return;
  const msg=document.getElementById('ud-msg');
  const btn=document.getElementById('ud-excluir');
  if(btn){ btn.disabled=true; btn.textContent='Excluindo...'; }
  const {error}=await sb.rpc('admin_delete_user',{p_user_id:userId});
  if(error){
    if(msg){ msg.textContent='Erro ao excluir conta: '+error.message; msg.className='fmsg err'; }
    else alert('Erro ao excluir conta: '+error.message);
    if(btn){ btn.disabled=false; btn.textContent='Excluir conta'; }
    return;
  }
  if(btn){ btn.disabled=false; btn.textContent='Excluir conta'; }
  if(window.toast) toast('Conta excluida.','ok');
  if(_udUserId===userId) fecharDetalheUsuario();
  carregarUsuarios();
}

async function carregarUsuarios(){
  document.getElementById("usuarios-loading").style.display="block";
  document.getElementById("usuarios-table").style.display="none";
  const {data:profiles,error}=await sb.from("profiles").select("*").order("nome");
  if(error){
    document.getElementById("usuarios-loading").textContent="Erro ao carregar usuários.";
    return;
  }
  _usuariosCache = profiles;
  const papelLabel=p=>p==='admin'?'Administrador':'Usuário';
  const papelCor=p=>p==='admin'?"var(--red-text)":"var(--text2)";
  const papelBg=p=>p==='admin'?"var(--red-bg)":"var(--surface2)";
  const statusLabel=p=>p.aprovado===false?'Pendente':'Aprovado';
  const statusCor=p=>p.aprovado===false?'var(--amber)':'var(--green)';
  const statusBg=p=>p.aprovado===false?'var(--amber-bg)':'var(--green-bg)';
  document.getElementById("usuarios-body").innerHTML=profiles.map(p=>`
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 12px;font-weight:500">${_sanEsc(p.nome||"")||"&#8212;"}</td>
      <td style="padding:10px 12px;color:var(--text2);font-size:12px">${_sanEsc(p.email||"")}</td>
      <td style="padding:10px 12px">
        <span style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500;background:${papelBg(p.papel)};color:${papelCor(p.papel)}">${papelLabel(p.papel)}</span>
      </td>
      <td style="padding:10px 12px">
        <span style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;background:${statusBg(p)};color:${statusCor(p)}">${statusLabel(p)}</span>
      </td>
      <td style="padding:10px 12px">
        <select id="papel-${p.id}" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)">
          <option value="visualizador"${p.papel!=="admin"?" selected":""}>Usuário</option>
          <option value="admin"${p.papel==="admin"?" selected":""}>Administrador</option>
        </select>
      </td>
      <td style="padding:10px 12px;white-space:nowrap">
        <div style="display:flex;gap:6px;align-items:center">
          ${p.id===currentUser?.id?'<span style="font-size:11px;color:var(--text3)">(você)</span>':`<button onclick="alterarPapel('${p.id}','${p.email}')" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:none;background:var(--blue);color:#fff;cursor:pointer">Salvar papel</button>`}
          ${p.aprovado===false?`<button onclick="aprovarUsuario('${p.id}')" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:none;background:var(--green);color:#fff;cursor:pointer">Aprovar</button>`:''}
          ${p.id===currentUser?.id?'':`<button onclick="excluirUsuario('${p.id}')" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:1px solid var(--red);background:var(--surface);color:var(--red);cursor:pointer">Excluir</button>`}
          <button onclick="enviarResetSenha('${p.email}')" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer" title="Enviar e-mail de redefinição de senha">📧 Reset senha</button>
          <button onclick="abrirDetalheUsuario('${p.id}')" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer">⚙️ Permissões</button>
        </div>
      </td>
    </tr>`).join("");
  document.getElementById("usuarios-loading").style.display="none";
  document.getElementById("usuarios-table").style.display="block";
}

// ═══ ABA LICITAÇÕES (processos) ═══
let _licitacoesCache=[];
let _procEditId=null;
let _procSaldoCache={};
let _procEditOldByEmenda={};
async function loadLicitacoes(){
  const box=document.getElementById('lic-lista');
  if(box) box.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando...</div>';
  try{
    const [proc,so,itens]=await Promise.all([
      sb.from('vw_processos_resumo').select('*').order('identificador'),
      sb.from('status_opcoes').select('id,nome,ordem,orgao,automatico').eq('contexto','licitacao').eq('ativo',true).order('ordem'),
      _cpFetchAllItens()
    ]);
    _licitacoesCache=proc.data||[];
    _cpStatusOpts=so.data||[]; _cpStatusById={}; _cpStatusOpts.forEach(s=>_cpStatusById[s.id]=s);
    _cpItens=itens||[];
  }catch(e){ if(box) box.innerHTML='<div style="padding:1rem;color:var(--red)">Erro: '+_sanEsc(e.message||e)+'</div>'; return; }
  renderLicitacoes();
}
function filtrarLicitacoes(){ renderLicitacoes(); }
function _licItemExecutado(i){ const s=_cpStatusById[i.status_lic_id]; return !!(s&&s.automatico); }
function _licItemContratado(i){ return !!i.contrato_id; }
function renderLicitacoes(){
  const box=document.getElementById('lic-lista'); if(!box) return;
  const busca=(document.getElementById('lic-busca')?.value||'').toLowerCase();
  const fTipo=document.getElementById('lic-f-tipo')?.value||'';
  const fOrg=document.getElementById('lic-f-orgao')?.value||'';
  const incluirContratados=document.getElementById('lic-f-contratados')?.checked||false;
  const podeEd=podeEditar('contratos');
  const porProc={}; _cpItens.forEach(it=>{ (porProc[it.processo_id]=porProc[it.processo_id]||[]).push(it); });
  const manuais=_cpStatusOpts.filter(s=>!s.automatico);
  let mostrados=0;
  // por processo: itens que ainda estão na licitação = NÃO executados (entregue/execução/executado saem da aba)
  const info=_licitacoesCache.map(p=>{
    const todosItens=porProc[p.id]||[];
    const naLic=todosItens.filter(i=>!_licItemExecutado(i));            // pendentes + já contratados
    const pendentes=naLic.filter(i=>!_licItemContratado(i));            // ainda nem viraram contrato
    return {p, naLic, totContratado:naLic.length-pendentes.length, fullyContratado:naLic.length>0 && pendentes.length===0, gone:todosItens.length>0 && naLic.length===0};
  });
  const ocultos=info.filter(x=>x.fullyContratado).length;
  const base=info.filter(x=>{
    if(x.gone) return false;                                  // todos os itens já saíram (executados)
    if(x.fullyContratado && !incluirContratados) return false; // 100% virou contrato → some por padrão
    const p=x.p;
    if(fTipo && (p.tipo||'')!==fTipo) return false;
    if(fOrg){ const orgs=x.naLic.map(i=>_cpStatusById[i.status_lic_id]?.orgao).filter(Boolean); if(!orgs.includes(fOrg)) return false; }
    if(busca){ const hay=[p.identificador,p.objeto,p.tipo,p.tipo_servico].concat(x.naLic.map(i=>i.descricao)).concat(_procServicoMensalItensFromValor(p.servico_mensal_itens).map(i=>i.descricao)).filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(busca)) return false; }
    return true;
  });
  const _ocultos=incluirContratados?0:ocultos;
  const html=base.map(x=>{
    const p=x.p; mostrados++;
    const items=x.naLic;
    const itensServico=_procServicoMensalItensFromValor(p.servico_mensal_itens);
    const totalItensExibidos=items.length||itensServico.length;
    // Nesta aba, o contrato vinculado prevalece apenas na apresentação do processo.
    // O status original continua intacto no banco e nas demais telas/fluxos.
    const roll=x.fullyContratado
      ? {nome:'CONTRATADO',orgao:null,auto:false,contratado:true}
      : (items.length?_cpRollup(items):(itensServico.length?{nome:'Serviço mensal',orgao:null,auto:false}:{nome:'sem itens',orgao:null,auto:false}));
    const aberto=!!_cpExpanded[p.id];
    const tipoServicoInfo=(p.natureza==='SERVIÇO'&&p.tipo_servico)?` · ${_sanEsc(p.tipo_servico)}`:'';
    let bloco=`<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;background:var(--surface)">
      <div style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:var(--surface2)">
        <span onclick="cpToggle(${p.id})" class="chevron${aberto?' open':''}" style="font-size:13px;color:var(--text3);cursor:pointer">▶</span>
        <div onclick="cpToggle(${p.id})" style="flex:1;min-width:0;cursor:pointer">
          <div style="font-weight:600;font-size:13px">${_sanEsc(p.identificador||('#'+p.id))} <span style="font-weight:400;color:var(--text3)">— ${_sanEsc((p.objeto||'').slice(0,64))}</span></div>
          <div style="font-size:11px;color:var(--text3)">${_sanEsc(p.tipo||'')} · ${_sanEsc(p.natureza||'')}${tipoServicoInfo} · ${totalItensExibidos} ${totalItensExibidos===1?'item':'itens'}</div>
        </div>
        ${_cpStatusBadge(roll)}
        <button onclick="abrirEditarProcesso(${p.id})" title="Editar processo" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer">✏️</button>
        ${podeEd?`<button onclick="gerarContratoDoProcesso(${p.id})" style="font-size:11px;padding:4px 8px;border-radius:4px;border:none;background:var(--green);color:#fff;cursor:pointer">📄 Gerar contrato</button>`:''}
      </div>`;
    if(aberto){
      if(podeEd&&items.length){
        const opts=manuais.map(s=>`<option value="${s.id}">${_sanEsc(s.nome)}</option>`).join('');
        bloco+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 13px;background:rgba(55,138,221,.08);border-top:1px solid var(--border)">
          <span style="font-size:12px;color:var(--text2);white-space:nowrap">Aplicar a todos:</span>
          <select id="cp-bulk-${p.id}" style="flex:1;max-width:340px;font-size:12px;padding:5px 8px"><option value="">selecione um status manual...</option>${opts}</select>
          <button onclick="cpBulkApply(${p.id})" style="font-size:12px;padding:5px 12px;border-radius:4px;border:none;background:var(--green);color:#fff;cursor:pointer">Aplicar</button>
        </div>`;
      }
      bloco+=`<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>`;
      if(!items.length&&itensServico.length){
        itensServico.forEach(it=>{
          const qtd=Number(it.quantidade||0);
          const unit=Number(it.valor_unitario||0);
          const mensal=Number(it.valor_mensal||(qtd*unit)||0);
          bloco+=`<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 13px">${_sanEsc(it.descricao||'—')} <span style="font-size:10px;color:var(--blue);border:1px solid var(--blue);border-radius:3px;padding:0 4px">serviço mensal</span></td>
            <td style="padding:8px 6px;color:var(--text3);width:70px;text-align:center">${qtd||''}</td>
            <td style="padding:8px 8px;color:var(--text3)">Unit. ${unit?fmtFull(unit):'—'} · Mensal ${mensal?fmtFull(mensal):'—'}</td>
            <td style="padding:8px 13px;color:var(--text3);width:70px;text-align:right;white-space:nowrap">—</td>
          </tr>`;
        });
      }
      items.forEach(it=>{
        const cur=_cpStatusById[it.status_lic_id];
        const exc=['fracassado','cancelado','suspenso','transferido'].includes((it.status||'').toLowerCase())?it.status:'';
        let ctrl;
        if(_licItemContratado(it)){
          ctrl=`<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--green)">✔ virou contrato</span> <span title="já gerou contrato — agora é gerido em Contratos em execução" style="color:var(--text3);cursor:help">🔒</span>`;
        } else if(cur&&cur.automatico){
          ctrl=`<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--blue)"><span style="width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block"></span>${_sanEsc(cur.nome)}</span> <span title="definido automaticamente pelo sistema" style="color:var(--text3);cursor:help">🔒</span>`;
        } else if(podeEd){
          ctrl=`<select onchange="cpSetItemStatus('${it.id}', this.value)" style="font-size:11px;padding:4px 6px;max-width:330px">
            <option value="">— indefinido —</option>
            ${manuais.map(s=>`<option value="${s.id}"${String(it.status_lic_id)===String(s.id)?' selected':''}>${_sanEsc(s.nome)}</option>`).join('')}
          </select>`;
        } else {
          ctrl=cur?_sanEsc(cur.nome):'<span style="color:var(--text3)">indefinido</span>';
        }
        bloco+=`<tr style="border-top:1px solid var(--border)">
          <td style="padding:8px 13px">${_sanEsc(it.descricao||'—')}${exc?` <span style="font-size:10px;color:var(--red);border:1px solid var(--red);border-radius:3px;padding:0 4px">${_sanEsc(exc)}</span>`:''}</td>
          <td style="padding:8px 6px;color:var(--text3);width:50px;text-align:center">${it.qtde??''}</td>
          <td style="padding:8px 8px">${ctrl}</td>
          <td style="padding:8px 13px;color:var(--text3);width:70px;text-align:right;white-space:nowrap">${_cpDesde(it.status_lic_desde)}</td>
        </tr>`;
      });
      bloco+=`</tbody></table>`;
    }
    bloco+=`</div>`;
    return bloco;
  }).join('');
  box.innerHTML=html||'<div style="padding:1rem;text-align:center;color:var(--text3)">Nenhuma licitação em andamento</div>';
  const cnt=document.getElementById('lic-count');
  if(cnt) cnt.textContent=mostrados+' em andamento'+(_ocultos?` · ${_ocultos} já contratada${_ocultos!==1?'s':''} oculta${_ocultos!==1?'s':''}`:'');
}

// ═══ CONTROLE DE PROCESSOS (gestão de status por item) ═══
let _cpProcessos=[], _cpItens=[], _cpStatusOpts=[], _cpStatusById={}, _cpExpanded={};
function _cpOrgaoCor(o){ return o==='SEAD'?'#d8a730':(o==='CONTROLADORIA'?'#7c5cd6':'var(--blue)'); }
async function _cpFetchAllItens(){
  let all=[], from=0; const size=1000;
  while(true){
    const {data,error}=await sb.from('itens')
      .select('id,processo_id,descricao,qtde,status,status_lic_id,status_lic_desde,contrato_id')
      .not('processo_id','is',null).order('processo_id').range(from,from+size-1);
    if(error) throw error;
    all=all.concat(data||[]);
    if(!data||data.length<size) break;
    from+=size;
  }
  return all;
}
function _cpRollup(items){
  const ids=[...new Set(items.map(i=>i.status_lic_id))];
  if(ids.length===1){ const s=_cpStatusById[ids[0]]; return s?{nome:s.nome,orgao:s.orgao,auto:s.automatico}:{nome:'Indefinido',orgao:null,auto:false}; }
  return {nome:'Vários', orgao:null, auto:false};
}
function _cpStatusBadge(r){
  const cor = r.contratado ? 'var(--green)' : (r.nome==='Indefinido' ? 'var(--text3)' : (r.nome==='Vários' ? 'var(--text2)' : _cpOrgaoCor(r.orgao)));
  const dot = r.auto?'<span style="width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block;margin-right:5px"></span>':'';
  return `<span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:${cor};background:var(--surface2);border:1px solid var(--border);padding:3px 9px;border-radius:20px">${dot}${_sanEsc(r.nome)}</span>`;
}
function _cpDesde(d){ if(!d) return ''; const dias=Math.floor((Date.now()-new Date(d).getTime())/86400000); return dias<=0?'hoje':('há '+dias+'d'); }
function cpToggle(pid){ _cpExpanded[pid]=!_cpExpanded[pid]; renderLicitacoes(); }
async function _cpGravarStatus(itemId, statusId){
  const so=statusId?_cpStatusById[statusId]:null;
  const agora=new Date().toISOString();
  const {error}=await sb.from('itens').update({status_lic_id:statusId||null, status_lic_desde:agora}).eq('id',itemId);
  if(error) throw error;
  try{ await sb.from('itens_status_historico').insert({item_id:itemId, status_id:statusId||null, status_nome:so?so.nome:null, mudado_por:currentUser?.id||null, origem:'manual'}); }catch(_){}
  const local=_cpItens.find(i=>String(i.id)===String(itemId)); if(local){ local.status_lic_id=statusId||null; local.status_lic_desde=agora; }
}
async function cpSetItemStatus(itemId, val){
  if(!podeEditar('contratos')){ alert('Sem permissão.'); return; }
  const statusId=val?Number(val):null;
  try{ await _cpGravarStatus(itemId, statusId); }catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
  renderLicitacoes();
}
async function cpBulkApply(pid){
  if(!podeEditar('contratos')){ alert('Sem permissão.'); return; }
  const sel=document.getElementById('cp-bulk-'+pid); const val=sel?.value;
  if(!val){ alert('Selecione um status para aplicar.'); return; }
  const statusId=Number(val);
  const alvos=_cpItens.filter(i=>String(i.processo_id)===String(pid) && !_licItemExecutado(i) && !_licItemContratado(i));
  if(!alvos.length){ alert('Nenhum item editável neste processo (os já contratados/executados são controlados em outras abas).'); return; }
  if(!confirm(`Aplicar "${_cpStatusById[statusId]?.nome}" a ${alvos.length} item(ns)?`)) return;
  try{ for(const it of alvos){ await _cpGravarStatus(it.id, statusId); } }catch(e){ alert('Erro: '+(e.message||e)); }
  renderLicitacoes();
}

async function preencherSelectStatusProcesso(){
  const sel=document.getElementById('proc-status'); if(!sel) return;
  const FALLBACK=['Em elaboração','Aguardando abertura','Em andamento','Aguardando homologação','Homologado','Contratado','Suspenso','Cancelado','Concluído'];
  const {data,error}=await sb.from('status_opcoes').select('nome').eq('contexto','processo').eq('ativo',true).order('ordem');
  const lista=((!error&&data&&data.length)?data.map(s=>s.nome):FALLBACK);
  sel.innerHTML='<option value="">Selecione...</option>'+lista.map(s=>`<option>${_sanEsc(s)}</option>`).join('');
}
async function abrirNovoProcesso(){
  if(!podeEditar('contratos')&&!_isAdmin()){alert('Sem permissão.');return;}
  _procEditId=null;
  document.getElementById('proc-titulo').textContent='➕ Novo processo';
  ['proc-identificador','proc-tipo-outro','proc-sc','proc-objeto','proc-modalidade','proc-valor','proc-obs'].forEach(id=>document.getElementById(id).value='');
  _procServicoMensalIds().forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('proc-serv-mensal-itens-lista').innerHTML='';
  document.getElementById('proc-tipo').value='';
  _procTipoChange();
  document.getElementById('proc-natureza').value='';
  document.getElementById('proc-tipo-servico').value='';
  const demandaMesesEl=document.getElementById('proc-serv-demanda-meses'); if(demandaMesesEl) demandaMesesEl.value='';
  await preencherSelectStatusProcesso();
  await preencherSelectSecoes('proc-secao', false);
  aplicarSecaoTextoFormulario('proc-secao');
  _procItensLoaded=[];
  _procSaldoCache={};
  _procEditOldByEmenda={};
  document.getElementById('proc-itens-lista').innerHTML='';
  const saldoResumo=document.getElementById('proc-emenda-saldo-resumo'); if(saldoResumo){saldoResumo.style.display='none';saldoResumo.innerHTML='';}
  const _impBox=document.getElementById('proc-import-box'); if(_impBox){_impBox.style.display='none';_impBox.innerHTML='';}
  procNaturezaChange();
  _renderProcItensVazio();
  document.getElementById('proc-msg').className='fmsg';
  document.getElementById('modal-processo').classList.add('active');
}
function abrirEditarProcesso(id){
  const p=_licitacoesCache.find(x=>String(x.id)===String(id)); if(!p) return;
  _procEditId=p.id;
  _procSaldoCache={};
  _procEditOldByEmenda={};
  document.getElementById('proc-titulo').textContent='✏️ Editar processo';
  document.getElementById('proc-identificador').value=p.identificador||'';
  const tipoPadrao=['CPL','SEI'].includes(p.tipo)?p.tipo:(p.tipo?'OUTRO':'');
  document.getElementById('proc-tipo').value=tipoPadrao;
  document.getElementById('proc-tipo-outro').value=tipoPadrao==='OUTRO'?(p.tipo||''):'';
  document.getElementById('proc-sc').value=p.sc||'';
  _procTipoChange();
  document.getElementById('proc-natureza').value=p.natureza||'';
  document.getElementById('proc-tipo-servico').value=p.tipo_servico||'';
  _procCarregarServicoMensalItens(p);
  document.getElementById('proc-serv-mensal-meses').value=p.servico_mensal_meses??'';
  document.getElementById('proc-serv-mensal-valor-mensal').value=p.servico_mensal_valor_mensal??'';
  document.getElementById('proc-serv-mensal-valor-global').value=p.servico_mensal_valor_global??'';
  const demandaMesesEl=document.getElementById('proc-serv-demanda-meses'); if(demandaMesesEl) demandaMesesEl.value=p.servico_demanda_meses??'';
  document.getElementById('proc-objeto').value=p.objeto||'';
  document.getElementById('proc-modalidade').value=p.modalidade||'';
  document.getElementById('proc-valor').value=p.valor_estimado??'';
  document.getElementById('proc-obs').value=p.observacao||'';
  preencherSelectStatusProcesso().then(()=>{document.getElementById('proc-status').value=p.status||'';});
  preencherSelectSecoes('proc-secao', false, p.secao).then(()=>aplicarSecaoTextoFormulario('proc-secao',p.secao||''));
  const _impBox=document.getElementById('proc-import-box'); if(_impBox){_impBox.style.display='none';_impBox.innerHTML='';}
  procNaturezaChange();
  procRecalcServicoMensal();
  _carregarProcItens(p.id);
  document.getElementById('proc-msg').className='fmsg';
  document.getElementById('modal-processo').classList.add('active');
}
// SEI = somente números e separadores (. / -). CPL e demais tipos podem ter letras.
function _procTipoChange(){
  const outro=document.getElementById('proc-tipo')?.value==='OUTRO';
  const wrap=document.getElementById('proc-tipo-outro-wrap');
  if(wrap) wrap.style.display=outro?'flex':'none';
  _procIdentFiltrar();
}
function _procIdentFiltrar(){
  const tipo=document.getElementById('proc-tipo')?.value;
  const inp=document.getElementById('proc-identificador'); if(!inp) return;
  if(tipo==='SEI'){
    const limpo=inp.value.replace(/[A-Za-zÀ-ÿ]/g,'');
    if(limpo!==inp.value){ const p=inp.selectionStart; inp.value=limpo; try{inp.setSelectionRange(p-1,p-1);}catch(_){} }
  }
}
async function salvarProcesso(){
  const ident=document.getElementById('proc-identificador').value.trim();
  const tipoSelecionado=document.getElementById('proc-tipo').value;
  const tipoOutro=document.getElementById('proc-tipo-outro')?.value.trim()||'';
  const tipo=tipoSelecionado==='OUTRO'?tipoOutro:tipoSelecionado;
  const sc=document.getElementById('proc-sc')?.value.trim()||null;
  const status=document.getElementById('proc-status')?.value||null;
  const natureza=document.getElementById('proc-natureza').value;
  const tipoServico=document.getElementById('proc-tipo-servico')?.value||'';
  const servicoMensal=_procLerServicoMensal();
  const servicoDemandaMeses=Number(document.getElementById('proc-serv-demanda-meses')?.value||0);
  const secao=document.getElementById('proc-secao').value;
  const secaoId=_secoesOrganizacionais.find(s=>s.sigla===secao)?.id||null;
  const objeto=document.getElementById('proc-objeto').value.trim();
  if(!ident||!tipo||!natureza||!secao||!objeto){showMsg('proc','Preencha os campos obrigatórios (*): Identificador, Tipo, Natureza, Seção e Objeto.','err');return;}
  if(natureza==='SERVIÇO'&&!tipoServico){showMsg('proc','Preencha o campo obrigatório (*): Tipo do serviço.','err');return;}
  if(_procEhServicoMensalFixo()&&!_procServicoMensalValido(servicoMensal)){showMsg('proc','Preencha todos os campos obrigatórios do Serviço mensal valor fixo.','err');return;}
  if(tipo==='SEI' && /[A-Za-zÀ-ÿ]/.test(ident)){showMsg('proc','Processo SEI: o identificador deve conter apenas números e separadores (. / -), sem letras.','err');return;}
  if(_procEhServicoDemanda()&&!document.querySelectorAll('#proc-itens-lista .proc-item-card').length){showMsg('proc','Servico por demanda/execucao precisa de pelo menos 1 item cadastrado.','err');return;}
  if(_procEhServicoDemanda()&&servicoDemandaMeses<=0){showMsg('proc','Informe a vigencia em meses do servico por demanda/execucao.','err');return;}
  const dados={
    identificador:ident,
    tipo,
    sc,
    natureza,
    tipo_servico:natureza==='SERVIÇO'?tipoServico:null,
    objeto,
    modalidade:document.getElementById('proc-modalidade').value.trim()||null,
    status,
    secao,
    secao_id:secaoId,
    valor_estimado:_procEhServicoMensalFixo()?servicoMensal.servico_mensal_valor_global:(document.getElementById('proc-valor').value?Number(document.getElementById('proc-valor').value):null),
    servico_mensal_itens:_procEhServicoMensalFixo()?servicoMensal.servico_mensal_itens:null,
    servico_mensal_meses:_procEhServicoMensalFixo()?servicoMensal.servico_mensal_meses:null,
    servico_mensal_valor_mensal:_procEhServicoMensalFixo()?servicoMensal.servico_mensal_valor_mensal:null,
    servico_mensal_valor_global:_procEhServicoMensalFixo()?servicoMensal.servico_mensal_valor_global:null,
    servico_demanda_meses:_procEhServicoDemanda()?servicoDemandaMeses:null,
    observacao:document.getElementById('proc-obs').value.trim()||null,
  };
  const btn=document.querySelector('#modal-processo .btn-primary'); btn.disabled=true;
  const res=_procEditId
    ? await sb.from('processos').update(dados).eq('id',_procEditId).select('id').single()
    : await sb.from('processos').insert(dados).select('id').single();
  if(res.error){btn.disabled=false;showMsg('proc','Erro: '+res.error.message,'err');return;}
  const procId=res.data?.id||_procEditId;
  if(natureza==='AQUISIÇÃO'||natureza==='ATA DE RP'||_procEhServicoDemanda()){
    try{ await _persistProcItens(procId, natureza); }
    catch(e){ btn.disabled=false; showMsg('proc','Processo salvo, mas erro nos itens: '+(e.message||e),'err'); await loadLicitacoes(); return; }
  }
  btn.disabled=false;
  showMsg('proc','✓ Salvo!','ok');
  await loadLicitacoes();
  setTimeout(()=>document.getElementById('modal-processo').classList.remove('active'),700);
}
// ═══ ITENS PREVISTOS DO PROCESSO (Fase 1) ═══
let _procItensLoaded=[];
const PROC_TIPO_SERVICO_DEMANDA_NORM='servico por demanda/execucao';
const PROC_FONTES=[['emenda','Emenda'],['recurso_proprio','Recurso próprio'],['outra','Outro']];
const PROC_TIPO_SERVICO_MENSAL_FIXO='Serviço mensal valor fixo';
function _procServicoMensalIds(){
  return ['proc-serv-mensal-meses','proc-serv-mensal-valor-mensal','proc-serv-mensal-valor-global'];
}
function _procEhServicoMensalFixo(){
  return document.getElementById('proc-natureza')?.value==='SERVIÇO' && document.getElementById('proc-tipo-servico')?.value===PROC_TIPO_SERVICO_MENSAL_FIXO;
}
function _procEhServicoDemanda(){
  const tipo=String(document.getElementById('proc-tipo-servico')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return document.getElementById('proc-natureza')?.value==='SERVIÇO' && tipo===PROC_TIPO_SERVICO_DEMANDA_NORM;
}
function _procSetValorEstimadoServicoMensal(readOnly){
  const valEl=document.getElementById('proc-valor');
  if(!valEl) return;
  if(readOnly){
    valEl.readOnly=true;
    valEl.placeholder='calculado pelo serviço mensal';
    valEl.style.background='var(--surface2)';
    valEl.style.opacity='.85';
  }else{
    valEl.readOnly=false;
    valEl.placeholder='ex: 50000';
    valEl.style.background='';
    valEl.style.opacity='';
  }
}
function _procServicoMensalItensFromValor(valor){
  if(Array.isArray(valor)) return valor;
  if(!valor) return [];
  if(typeof valor==='string'){
    try{
      const parsed=JSON.parse(valor);
      if(Array.isArray(parsed)) return parsed;
    }catch(_){}
    return [{descricao:valor, quantidade:null, valor_unitario:null}];
  }
  return [];
}
function _procCarregarServicoMensalItens(p){
  const lista=document.getElementById('proc-serv-mensal-itens-lista');
  if(!lista) return;
  lista.innerHTML='';
  const itens=_procServicoMensalItensFromValor(p.servico_mensal_itens);
  if(itens.length){
    itens.forEach(item=>procAddServicoMensalItemRow({
      descricao:item.descricao||item.item||'',
      quantidade:item.quantidade??item.qtde??p.servico_mensal_qtd_itens??'',
      valor_unitario:item.valor_unitario??item.valorItem??p.servico_mensal_valor_item??''
    }));
  }else if(p.servico_mensal_qtd_itens||p.servico_mensal_valor_item){
    procAddServicoMensalItemRow({descricao:'', quantidade:p.servico_mensal_qtd_itens??'', valor_unitario:p.servico_mensal_valor_item??''});
  }
}
function procAddServicoMensalItemRow(item={}){
  const lista=document.getElementById('proc-serv-mensal-itens-lista');
  if(!lista) return;
  const row=document.createElement('div');
  row.className='proc-serv-mensal-item';
  row.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;align-items:end;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;background:var(--surface2);min-width:0;max-width:100%;box-sizing:border-box;width:100%';
  row.innerHTML=`<div><div class="form-label">Item *</div><input type="text" class="smi-desc" placeholder="Descreva o item" value="${_sanEsc(String(item.descricao||'')).replace(/"/g,'&quot;')}" oninput="procRecalcServicoMensal()"></div>
    <div><div class="form-label">Quantidade *</div><input type="number" class="smi-qtd" min="0" step="1" placeholder="ex: 2" value="${item.quantidade??''}" oninput="procRecalcServicoMensal()"></div>
    <div><div class="form-label">Valor unitário *</div><input type="number" class="smi-valor" min="0" step="0.01" placeholder="ex: 1500" value="${item.valor_unitario??''}" oninput="procRecalcServicoMensal()"></div>
    <button type="button" class="btn-secondary" onclick="procRemoveServicoMensalItemRow(this)" title="Remover item" style="font-size:12px;padding:7px 10px;width:100%">Remover</button>`;
  lista.appendChild(row);
  procRecalcServicoMensal();
}
function procRemoveServicoMensalItemRow(btn){
  btn.closest('.proc-serv-mensal-item')?.remove();
  procRecalcServicoMensal();
}
function _procEnsureServicoMensalItemRow(){
  const lista=document.getElementById('proc-serv-mensal-itens-lista');
  if(lista&&!lista.querySelector('.proc-serv-mensal-item')) procAddServicoMensalItemRow();
}
function _procLerServicoMensal(){
  const itens=[...document.querySelectorAll('#proc-serv-mensal-itens-lista .proc-serv-mensal-item')].map(row=>{
    const quantidade=Number(row.querySelector('.smi-qtd')?.value||0);
    const valorUnitario=Number(row.querySelector('.smi-valor')?.value||0);
    return {
      descricao:(row.querySelector('.smi-desc')?.value||'').trim(),
      quantidade:quantidade||null,
      valor_unitario:valorUnitario||null,
      valor_mensal:(quantidade&&valorUnitario)?quantidade*valorUnitario:null
    };
  });
  const meses=Number(document.getElementById('proc-serv-mensal-meses')?.value||0);
  const mensal=itens.reduce((s,item)=>s+(item.valor_mensal||0),0);
  const global=mensal*meses;
  return {
    servico_mensal_itens:itens,
    servico_mensal_meses:meses||null,
    servico_mensal_valor_mensal:mensal||null,
    servico_mensal_valor_global:global||null
  };
}
function _procServicoMensalValido(d){
  return !!(d.servico_mensal_itens.length && d.servico_mensal_itens.every(item=>item.descricao && item.quantidade>0 && item.valor_unitario>0 && item.valor_mensal>0) && d.servico_mensal_meses>0 && d.servico_mensal_valor_mensal>0 && d.servico_mensal_valor_global>0);
}
function procRecalcServicoMensal(){
  const d=_procLerServicoMensal();
  const mensalEl=document.getElementById('proc-serv-mensal-valor-mensal');
  const globalEl=document.getElementById('proc-serv-mensal-valor-global');
  if(mensalEl) mensalEl.value=d.servico_mensal_valor_mensal?d.servico_mensal_valor_mensal.toFixed(2):'';
  if(globalEl) globalEl.value=d.servico_mensal_valor_global?d.servico_mensal_valor_global.toFixed(2):'';
  if(_procEhServicoMensalFixo()){
    const valEl=document.getElementById('proc-valor');
    if(valEl) valEl.value=d.servico_mensal_valor_global?d.servico_mensal_valor_global.toFixed(2):'';
  }
}
function procTipoServicoChange(){
  const mensal=_procEhServicoMensalFixo();
  const demanda=_procEhServicoDemanda();
  const wrap=document.getElementById('proc-servico-mensal-wrap');
  if(wrap) wrap.style.display=mensal?'block':'none';
  const demandaWrap=document.getElementById('proc-serv-demanda-meses-wrap');
  if(demandaWrap) demandaWrap.style.display=demanda?'block':'none';
  const demandaMeses=document.getElementById('proc-serv-demanda-meses');
  if(demandaMeses){
    demandaMeses.required=demanda;
    if(!demanda) demandaMeses.value='';
  }
  _procServicoMensalIds().forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.required=mensal;
    if(!mensal) el.value='';
  });
  if(mensal){
    _procEnsureServicoMensalItemRow();
    _procSetValorEstimadoServicoMensal(true);
    procRecalcServicoMensal();
  }else if(document.getElementById('proc-natureza')?.value==='SERVIÇO'){
    const lista=document.getElementById('proc-serv-mensal-itens-lista');
    if(lista) lista.innerHTML='';
    const valEl=document.getElementById('proc-valor');
    if(valEl?.readOnly) valEl.value='';
    _procSetValorEstimadoServicoMensal(false);
  }else{
    const lista=document.getElementById('proc-serv-mensal-itens-lista');
    if(lista) lista.innerHTML='';
  }
  const itensSec=document.getElementById('proc-itens-section');
  if(itensSec&&document.getElementById('proc-natureza')?.value==='SERVIÇO') itensSec.style.display=demanda?'block':'none';
  _procAplicarModoAta();
}

function procNaturezaChange(){
  const nat=document.getElementById('proc-natureza').value;
  const show=(nat==='AQUISIÇÃO'||nat==='ATA DE RP'||_procEhServicoDemanda());
  const showServico=(nat==='SERVIÇO');
  const tipoServicoWrap=document.getElementById('proc-tipo-servico-wrap');
  const tipoServico=document.getElementById('proc-tipo-servico');
  if(tipoServicoWrap) tipoServicoWrap.style.display=showServico?'block':'none';
  if(tipoServico){
    tipoServico.required=showServico;
    if(!showServico) tipoServico.value='';
  }
  const sec=document.getElementById('proc-itens-section');
  if(sec) sec.style.display=show?'block':'none';
  _procAplicarModoAta();
  const valEl=document.getElementById('proc-valor');
  if(valEl){
    if(show){ valEl.readOnly=true; valEl.placeholder=_procEhServicoDemanda()?'soma dos itens de demanda':'soma automática dos itens'; valEl.style.background='var(--surface2)'; valEl.style.opacity='.85'; _recalcProcValorEstimado(); }
    else { valEl.readOnly=false; valEl.placeholder='ex: 50000'; valEl.style.background=''; valEl.style.opacity=''; }
  }
  procTipoServicoChange();
}
function _recalcProcValorEstimado(){
  const nat=document.getElementById('proc-natureza').value;
  if(nat!=='AQUISIÇÃO'&&nat!=='ATA DE RP'&&!_procEhServicoDemanda()) return;
  let soma=0;
  document.querySelectorAll('#proc-itens-lista .proc-item-card').forEach(c=>{
    const q=parseFloat(c.querySelector('.pi-qtde')?.value)||0;
    const v=parseFloat(c.querySelector('.pi-valor')?.value)||0;
    soma+=q*v;
  });
  const el=document.getElementById('proc-valor'); if(el) el.value=soma?soma.toFixed(2):'';
  _renderProcEmendaSaldoResumo();
}
function _renderProcItensVazio(){
  const has=document.querySelectorAll('#proc-itens-lista .proc-item-card').length>0;
  const el=document.getElementById('proc-itens-vazio'); if(el) el.style.display=has?'none':'block';
}
// Item 3: ATA DE RP não exige emenda/unidade/fonte na criação do processo.
function _procEhAta(){ return document.getElementById('proc-natureza')?.value==='ATA DE RP'; }
function _procAplicarModoAta(){
  const ata=_procEhAta();
  const demanda=_procEhServicoDemanda();
  // botão "Puxar de emenda" some na ATA (vínculo de emenda só na execução da ata)
  const btn=document.getElementById('proc-btn-puxar-emenda'); if(btn) btn.style.display=(ata||demanda)?'none':'';
  if(ata||demanda){ const box=document.getElementById('proc-import-box'); if(box){ box.style.display='none'; box.innerHTML=''; } }
  // dica do cabeçalho
  const hint=document.getElementById('proc-itens-hint');
  if(hint) hint.textContent=ata?'(ata de registro de preços — sem emenda/unidade/fonte nesta fase)':(demanda?'(serviço por demanda — pelo menos 1 item obrigatório)':'(fonte de recurso obrigatória por item)');
  // em cada card de item, oculta Unidade destino e a linha de Fonte
  document.querySelectorAll('#proc-itens-lista .proc-item-card').forEach(c=>{
    const p=c.querySelector('.pi-prazo-col'); if(p) p.style.display=demanda?'none':'';
    const u=c.querySelector('.pi-unidade-col'); if(u) u.style.display=(ata||demanda)?'none':'';
    const f=c.querySelector('.pi-fonte-row'); if(f) f.style.display=(ata||demanda)?'none':'';
  });
}
function _procFonteOpts(sel){const fonte=(sel==='sem_emenda'||sel==='municipal')?'outra':sel;return PROC_FONTES.map(([v,l])=>`<option value="${v}"${fonte===v?' selected':''}>${l}</option>`).join('');}
function _procEmendaOpts(sel){return '<option value="">Selecione a emenda...</option>'+(cachedEmendas||[]).map(e=>`<option value="${e.id}"${String(sel)===String(e.id)?' selected':''}>${_sanEsc(String(e.emenda))}${e.parlamentar?(' — '+_sanEsc(e.parlamentar)):''}</option>`).join('');}
function _procUnidadeOpts(sel){return '<option value="">— Unidade destino —</option>'+(cachedUnidades||[]).map(u=>`<option value="${u.id}"${String(sel)===String(u.id)?' selected':''}>${_sanEsc(u.nome)}</option>`).join('');}

function procAddItemRow(data){
  data=data||{};
  const locked=!!(data.fromEmenda || data.emenda_item_id); // item vindo da emenda: descrição/qtde/unidade/fonte fixas
  const lista=document.getElementById('proc-itens-lista');
  const div=document.createElement('div');
  div.className='proc-item-card';
  div.dataset.itemId=data.id||'';
  div.dataset.grupo=data.grupo_item_id||'';
  div.dataset.emendaId=data.emenda_id||'';
  div.dataset.emendaItemId=data.emenda_item_id||'';
  div.dataset.emendaNumero=data.emenda_numero||'';
  div.dataset.emendaSaldo=data.emenda_saldo_atual??'';
  div.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.6rem .75rem';
  const fonte=data.fonte_tipo||'';
  const isEm=fonte==='emenda';
  const showDesc=(fonte && fonte!=='emenda' && fonte!=='sem_emenda');
  const inp='font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);width:100%';
  const ro=locked?'background:var(--surface2);opacity:.7;':'';
  const dis=locked?' disabled':'';
  const roAttr=locked?' readonly':'';
  div.innerHTML=`
    <div style="display:flex;gap:8px;align-items:flex-start">
      <div style="flex:1"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">Descrição *${locked?' <span style="text-transform:none;letter-spacing:0">· da emenda</span>':''}</div>
        <input type="text" class="pi-desc"${roAttr} placeholder="ex: AR CONDICIONADO 12000 BTU" value="${_sanEsc(String(data.descricao||'')).replace(/"/g,'&quot;')}" style="${inp};${ro}"></div>
      <button type="button" onclick="procRemoveItemCard(this)" title="Remover item" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;line-height:1;padding:2px 4px;margin-top:14px">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:90px 130px 100px 1fr;gap:8px;margin-top:6px">
      <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Qtde *</div><input type="number" class="pi-qtde"${roAttr} placeholder="ex: 25" value="${data.qtde??''}" oninput="_recalcProcValorEstimado()" style="${inp};${ro}"></div>
      <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Vl. unit. estimado</div><input type="number" step="0.01" class="pi-valor" placeholder="ex: 2500" value="${data.valor_estimado??''}" oninput="_recalcProcValorEstimado()" style="${inp}"></div>
      <div class="pi-prazo-col"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Prazo (dias)</div><input type="number" class="pi-prazo" placeholder="ex: 30" value="${data.prazo_entrega_dias??''}" style="${inp}"></div>
      <div class="pi-unidade-col"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Unidade destino${locked?' · da emenda':''}</div><select class="pi-unidade"${dis} style="${inp};${ro}">${_procUnidadeOpts(data.unidade_destino_id)}</select></div>
    </div>
    <div class="pi-fonte-row" style="display:grid;grid-template-columns:170px 1fr;gap:8px;margin-top:6px;align-items:end">
      <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Fonte de recurso *</div><select class="pi-fonte" onchange="procFonteChange(this)"${dis} style="${inp};${ro}"><option value="">Selecione...</option>${_procFonteOpts(fonte)}</select></div>
      <div class="pi-emenda-wrap" style="display:${isEm?'block':'none'}"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Emenda *</div><select class="pi-emenda"${dis} style="${inp};${ro}">${_procEmendaOpts(data.emenda_id)}</select></div>
      <div class="pi-fonte-desc-wrap" style="display:${showDesc?'block':'none'}"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Detalhe da fonte</div><input type="text" class="pi-fonte-desc" placeholder="ex: recurso próprio 2026" value="${_sanEsc(String(data.fonte_descricao||'')).replace(/"/g,'&quot;')}" style="${inp}"></div>
    </div>`;
  div.querySelector('.pi-emenda-wrap')?.remove();
  lista.appendChild(div);
  _renderProcItensVazio();
  _recalcProcValorEstimado();
  _procAplicarModoAta();
}
function procRemoveItemCard(btn){const c=btn.closest('.proc-item-card');if(c)c.remove();_renderProcItensVazio();_recalcProcValorEstimado();}

async function _procSaldoAtual(emendaId){
  if(!emendaId) return null;
  if(Object.prototype.hasOwnProperty.call(_procSaldoCache,emendaId)) return _procSaldoCache[emendaId];
  const {data,error}=await sb.from('vw_emendas_saldo').select('id,numero_emenda,valor_cedido,saldo_remanescente').eq('id',emendaId).maybeSingle();
  if(error){ console.warn('Saldo da emenda no processo:',error.message); _procSaldoCache[emendaId]=null; return null; }
  _procSaldoCache[emendaId]=data||null; return _procSaldoCache[emendaId];
}
function _procMoney(v){return fmtFull(Number(v)||0);}
function _procRenderSaldoRows(groups){
  const rows=Object.values(groups); if(!rows.length) return '';
  return `<div style="font-size:12px;font-weight:700;margin-bottom:6px">Saldo das emendas após vinculação</div><div style="display:flex;flex-direction:column;gap:6px">${rows.map(g=>{
    const saldoAntes=Number(g.baseSaldo)||0, novo=Number(g.novoTotal)||0, saldoApos=saldoAntes-novo;
    const cor=saldoApos<0?'var(--red)':(saldoApos===0?'var(--amber)':'var(--green)');
    return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;background:var(--surface2)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span style="font-weight:600">Emenda ${_sanEsc(g.numero||'—')}</span><span style="color:${cor};font-weight:700">Saldo após: ${_procMoney(saldoApos)}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:4px;margin-top:5px;color:var(--text2);font-size:11px"><span>Saldo atual: <b>${_procMoney(saldoAntes)}</b></span><span>Valor desta licitação: <b>${_procMoney(novo)}</b></span><span style="color:${cor}">${saldoApos<0?'Ultrapassa o saldo':'Dentro do saldo'}</span></div></div>`;
  }).join('')}</div>`;
}
async function _renderProcEmendaSaldoResumo(){
  const box=document.getElementById('proc-emenda-saldo-resumo'); if(!box) return;
  const cards=[...document.querySelectorAll('#proc-itens-lista .proc-item-card')].filter(c=>c.dataset.emendaId);
  if(!cards.length){box.style.display='none';box.innerHTML='';return;}
  const groups={};
  for(const card of cards){
    const id=String(card.dataset.emendaId), saldo=await _procSaldoAtual(id);
    const g=groups[id]||(groups[id]={numero:card.dataset.emendaNumero||saldo?.numero_emenda||id,baseSaldo:(Number(saldo?.saldo_remanescente)||Number(card.dataset.emendaSaldo)||0)+(_procEditOldByEmenda[id]||0),novoTotal:0});
    g.novoTotal+=(Number(card.querySelector('.pi-qtde')?.value)||0)*(Number(card.querySelector('.pi-valor')?.value)||0);
  }
  box.innerHTML=_procRenderSaldoRows(groups); box.style.display='block';
}
function procFonteChange(sel){
  const card=sel.closest('.proc-item-card');
  const descWrap=card.querySelector('.pi-fonte-desc-wrap');
  if(descWrap) descWrap.style.display=(sel.value && sel.value!=='emenda' && sel.value!=='sem_emenda')?'block':'none';
  if(sel.value!=='emenda'){
    card.dataset.emendaId='';
    card.dataset.emendaItemId='';
  }
}

async function procImportarDeEmenda(){
  const box=document.getElementById('proc-import-box');
  if(box.style.display==='block'){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  box.innerHTML=`<div style="font-size:12px;font-weight:600;margin-bottom:6px">Puxar itens previstos de uma emenda</div>
    <select id="proc-import-emenda" onchange="_procListarItensEmenda()" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);width:100%;background:var(--surface);color:var(--text);margin-bottom:6px">
      ${_procEmendaOpts('')}
    </select>
    <div id="proc-import-itens" style="font-size:12px;color:var(--text3)">Selecione uma emenda para listar os itens previstos.</div>`;
}
async function _procListarItensEmenda(){
  const emendaId=document.getElementById('proc-import-emenda').value;
  const cont=document.getElementById('proc-import-itens');
  if(!emendaId){ cont.innerHTML='Selecione uma emenda para listar os itens previstos.'; return; }
  cont.innerHTML='<span class="spinner"></span> Carregando...';
  const {data,error}=await sb
    .from('emenda_itens')
    .select('id,item,item_cadastrado,qtde,qtde_cadastrada,vl_unitario,vl_unitario_cadastrado,vl_total_cadastrado,unidade_beneficiada,unidade_beneficiada_id')
    .eq('emenda_id',emendaId)
    .order('created_at');
  if(error){ cont.innerHTML='<span style="color:var(--red)">Erro: '+_sanEsc(error.message)+'</span>'; return; }
  const saldoRes=await sb.from('vw_emendas_saldo').select('id,numero_emenda,valor_cedido,saldo_remanescente').eq('id',emendaId).maybeSingle();
  const usadosSet=await _neEmendaItensJaUsados((data||[]).map(i=>i.id));
  document.querySelectorAll('#proc-itens-lista .proc-item-card').forEach(c=>{ if(c.dataset.emendaItemId) usadosSet.add(String(c.dataset.emendaItemId)); });
  const itens=data||[];
  if(!itens.length){ cont.innerHTML='Esta emenda não tem itens previstos cadastrados.'; return; }
  cont.innerHTML=`<div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">${itens.map(it=>{
      const desc=it.item_cadastrado||it.item||'(sem descrição)';
      const q=it.qtde_cadastrada??it.qtde??'';
      const v=it.vl_unitario_cadastrado??it.vl_unitario??'';
      let uid=it.unidade_beneficiada_id;
      if(!uid && it.unidade_beneficiada){ const m=(cachedUnidades||[]).find(u=>u.nome&&u.nome.toLowerCase()===String(it.unidade_beneficiada).toLowerCase()); if(m) uid=m.id; }
      const un=it.unidade_beneficiada?(' · '+_sanEsc(it.unidade_beneficiada)):'';
      const sd=_sanEsc(String(desc)).replace(/"/g,'&quot;');
      if(usadosSet.has(String(it.id))){
        return `<label style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 4px;opacity:.5"><input type="checkbox" disabled style="width:14px;height:14px;flex-shrink:0"> <span style="text-decoration:line-through">${_sanEsc(String(desc))}</span> <span style="color:var(--amber);white-space:nowrap">· já vinculado</span></label>`;
      }
      return `<label style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 4px;cursor:pointer"><input type="checkbox" class="proc-imp-chk" data-id="${it.id}" data-desc="${sd}" data-qtde="${q}" data-valor="${v}" data-planejado="${Number(it.vl_total_cadastrado)||((Number(q)||0)*(Number(v)||0))}" data-emenda-numero="${_sanEsc(String(saldoRes.data?.numero_emenda||''))}" data-emenda-saldo="${Number(saldoRes.data?.saldo_remanescente)||0}" data-unidade="${uid||''}" style="width:14px;height:14px;flex-shrink:0"> <span>${_sanEsc(String(desc))} <span style="color:var(--text3)">· qtd ${q||'—'}${un} · ${v?fmtFull(v):'—'}</span></span></label>`;
    }).join('')}</div>
    <button type="button" onclick="procConfirmImport()" style="margin-top:6px;font-size:12px;padding:5px 12px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer">Adicionar selecionados</button>`;
}
function procConfirmImport(){
  const emendaId=document.getElementById('proc-import-emenda').value;
  const chks=[...document.querySelectorAll('.proc-imp-chk:checked')];
  if(!chks.length){ return; }
  chks.forEach(ch=>procAddItemRow({descricao:ch.dataset.desc, qtde:ch.dataset.qtde||'', valor_estimado:ch.dataset.valor||'', unidade_destino_id:ch.dataset.unidade||'', fonte_tipo:'emenda', emenda_id:emendaId, emenda_item_id:ch.dataset.id, emenda_numero:ch.dataset.emendaNumero, emenda_saldo_atual:ch.dataset.emendaSaldo, fromEmenda:true}));
  const box=document.getElementById('proc-import-box'); box.style.display='none'; box.innerHTML='';
}

async function _carregarProcItens(processoId){
  _procItensLoaded=[];
  document.getElementById('proc-itens-lista').innerHTML='';
  if(processoId){
    const {data}=await sb.from('itens').select('*').eq('processo_id',processoId).order('created_at');
    (data||[]).forEach(it=>{ if(it.emenda_id){ const valor=it.valor_contratado!==null&&it.valor_contratado!==undefined?Number(it.valor_contratado):Number(it.valor_estimado)||0; _procEditOldByEmenda[it.emenda_id]=(_procEditOldByEmenda[it.emenda_id]||0)+(Number(it.qtde)||0)*valor; } });
    (data||[]).forEach(it=>{ _procItensLoaded.push(String(it.id)); procAddItemRow({id:it.id, descricao:it.descricao, qtde:it.qtde, valor_estimado:it.valor_estimado, prazo_entrega_dias:it.prazo_entrega_dias, unidade_destino_id:it.unidade_destino_id, fonte_tipo:it.fonte_tipo, emenda_id:it.emenda_id, emenda_item_id:it.emenda_item_id, grupo_item_id:it.grupo_item_id, fonte_descricao:it.fonte_descricao}); });
  }
  _renderProcItensVazio();
  _recalcProcValorEstimado();
}
async function _persistProcItens(processoId, natureza){
  const ehAta=(natureza==='ATA DE RP');
  const ehDemanda=_procEhServicoDemanda();
  const origem=ehAta?'ata':(ehDemanda?'servico_demanda':'aquisicao');
  const cards=[...document.querySelectorAll('#proc-itens-lista .proc-item-card')];
  const current=[];
  for(const c of cards){
    const g=cl=>c.querySelector('.'+cl);
    const descricao=(g('pi-desc').value||'').trim();
    const qtde=parseFloat(g('pi-qtde').value);
    const fonte_tipo=g('pi-fonte').value;
    // Item 3: ATA DE RP não exige fonte/emenda/unidade nesta fase (vínculo ocorre na execução da ata)
    if(ehAta||ehDemanda){
      if(!descricao||!qtde) throw new Error(ehDemanda?'Cada item do servico por demanda precisa de descricao e quantidade estimada.':'Cada item da ata precisa de descrição e quantidade.');
      if(ehDemanda && !(parseFloat(g('pi-valor').value)>0)) throw new Error('Cada item do servico por demanda precisa de valor unitario estimado.');
    }else{
      if(!descricao||!qtde||!fonte_tipo) throw new Error('Cada item precisa de descrição, quantidade e fonte de recurso.');
    }
    let emenda_id=null, emenda_item_id=null, fonte_descricao=null;
    if(!ehAta && !ehDemanda && fonte_tipo==='emenda'){
      emenda_id=c.dataset.emendaId||null;
      emenda_item_id=c.dataset.emendaItemId||null;
      if(!emenda_item_id && !c.dataset.itemId) throw new Error('Itens com fonte = Emenda devem ser adicionados pelo botÃ£o Puxar de emenda.');
    }
    else if(!ehAta && !ehDemanda){ fonte_descricao=(g('pi-fonte-desc')?.value||'').trim()||null; }
    current.push({id:c.dataset.itemId||null, row:{
      processo_id:processoId, origem, fonte_tipo:(ehAta||ehDemanda)?'sem_emenda':(fonte_tipo||'sem_emenda'), emenda_id, emenda_item_id, fonte_descricao,
      grupo_item_id:c.dataset.grupo||null, descricao, qtde,
      valor_estimado:parseFloat(g('pi-valor').value)||null,
      prazo_entrega_dias:ehDemanda?null:(parseInt(g('pi-prazo').value)||null),
      unidade_destino_id:(!ehAta && !ehDemanda && g('pi-unidade').value)?Number(g('pi-unidade').value):null,
      status:'em licitação'
    }});
  }
  const atuais=current.filter(x=>x.id).map(x=>String(x.id));
  const toDelete=_procItensLoaded.filter(id=>!atuais.includes(id));
  if(toDelete.length){ const {error}=await sb.from('itens').delete().in('id',toDelete).is('contrato_id',null); if(error) throw error; }
  const inserts=current.filter(x=>!x.id).map(x=>x.row);
  if(inserts.length){ const {error}=await sb.from('itens').insert(inserts); if(error) throw error; }
  for(const x of current.filter(x=>x.id)){ const {error}=await sb.from('itens').update(x.row).eq('id',x.id); if(error) throw error; }
}
