// ═══════════════════════════════════════════════════════════════════════════
// CENTRAL DE NOTAS FISCAIS
// Cadastro unico, controle mensal de documentos e consulta de todas as origens.
// ═══════════════════════════════════════════════════════════════════════════

let nfControleContratos=[];
let nfChecklistDocumentos=[];
let nfChecklistMarcacoes=[];
let nfTodasRows=[];
let nfContratosCadastro=[];
let nfControleCarregado=false;
let nfTodasCarregado=false;
let nfSubAtual='controle';

function _nfEsc(value){ return typeof _sanEsc==='function'?_sanEsc(String(value??'')):String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _nfNum(value){ return typeof _ctNum==='function'?_ctNum(value):(Number(value)||0); }
function _nfMoney(value){ return 'R$ '+_nfNum(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _nfToday(){ return new Date().toISOString().slice(0,10); }
function _nfMonth(){ return new Date().toISOString().slice(0,7); }
function _nfMonthDate(){ return `${document.getElementById('nf-controle-mes')?.value||_nfMonth()}-01`; }
function _nfNormalize(value){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function _nfDocNumber(value){ return String(value||'').replace(/\D/g,''); }
function _nfContratoEncerrado(c){
  const status=_nfNormalize(c?.status).toUpperCase();
  return ['CONCLUIDO','CONCLUÍDO','ENCERRADO','CANCELADO','RESCINDIDO'].some(s=>status.includes(_nfNormalize(s).toUpperCase()));
}
function _nfEmpresa(c){ return c?.fornecedores?.razao_social||c?.prestador||'Empresa não informada'; }
function _nfProcesso(c){ return c?.processos?.identificador||c?.cpl||'Processo não informado'; }
function _nfContratoLabel(c){
  const partes=[c?.cpl,c?.numero_contrato].filter(Boolean).join(' · ');
  return `${partes||('Contrato '+(c?.id||''))} — ${_nfEmpresa(c)}`;
}
function _nfPodeEditar(){ return podeEditar('notas-fiscais'); }
function _nfPodeCadastrar(){ return podeEditar('notas-fiscais')||podeEditar('contratos')||podeEditar('fiscalizacao'); }

function loadNotasFiscais(){
  const pode=_nfPodeEditar();
  const btnNova=document.getElementById('nf-btn-nova');
  const btnCk=document.getElementById('nf-btn-checklist');
  if(btnNova) btnNova.style.display=pode?'inline-flex':'none';
  if(btnCk) btnCk.style.display=pode?'inline-flex':'none';
  const mes=document.getElementById('nf-controle-mes');
  if(mes&&!mes.value) mes.value=_nfMonth();
  if(nfSubAtual==='todas') loadTodasNotasFiscais();
  else loadNFControleMensal();
}

function nfShowSub(sub){
  nfSubAtual=sub==='todas'?'todas':'controle';
  document.querySelectorAll('.nf-subpanel').forEach(el=>el.style.display='none');
  const panel=document.getElementById('nf-sub-'+nfSubAtual); if(panel) panel.style.display='block';
  document.querySelectorAll('.nf-subtab-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.sub===nfSubAtual));
  if(nfSubAtual==='todas') loadTodasNotasFiscais(); else loadNFControleMensal();
  setTimeout(()=>{ if(typeof _setTableOffset==='function') _setTableOffset(); },50);
}

async function _nfCarregarContratosManutencao(){
  const {data,error}=await sb.from('contratos')
    .select('id,cpl,numero_contrato,status,prefixo_chamado,prestador,fornecedor_id,processo_id,secao_id,vencimento,tipo_instrumento,fornecedores(id,razao_social,cnpj_normalizado),processos(id,identificador)')
    .not('prefixo_chamado','is',null)
    .order('cpl',{ascending:true});
  if(error) throw error;
  return (data||[]).filter(c=>String(c.prefixo_chamado||'').trim()&&!_nfContratoEncerrado(c));
}

async function loadNFControleMensal(){
  const loading=document.getElementById('nf-controle-loading');
  const cards=document.getElementById('nf-controle-cards');
  const vazio=document.getElementById('nf-controle-vazio');
  if(loading) loading.style.display='flex';
  if(cards) cards.innerHTML='';
  if(vazio) vazio.style.display='none';
  const mes=document.getElementById('nf-controle-mes'); if(mes&&!mes.value) mes.value=_nfMonth();
  try{
    const competencia=_nfMonthDate();
    const [contratosRes,docsRes,marcasRes]=await Promise.all([
      _nfCarregarContratosManutencao(),
      sb.from('nf_checklist_documentos').select('*').eq('ativo',true).order('ordem').order('nome'),
      sb.from('nf_checklist_marcacoes').select('*').eq('competencia',competencia)
    ]);
    if(docsRes.error) throw docsRes.error;
    if(marcasRes.error) throw marcasRes.error;
    nfControleContratos=contratosRes;
    nfChecklistDocumentos=docsRes.data||[];
    nfChecklistMarcacoes=marcasRes.data||[];
    nfControleCarregado=true;
    renderNFControleMensal();
  }catch(e){
    if(vazio){vazio.innerHTML=`Não foi possível carregar o controle mensal.<br><small>${_nfEsc(e.message||e)}</small>`;vazio.style.display='block';}
  }finally{ if(loading) loading.style.display='none'; }
}

function _nfDocsContrato(contratoId){
  const contrato=nfControleContratos.find(c=>String(c.id)===String(contratoId));
  return nfChecklistDocumentos.filter(d=>String(d.secao_id)===String(contrato?.secao_id)&&(d.contrato_id==null||String(d.contrato_id)===String(contratoId)));
}
function _nfMarcacao(contratoId,documentoId){
  return nfChecklistMarcacoes.find(m=>String(m.contrato_id)===String(contratoId)&&String(m.documento_id)===String(documentoId));
}

function renderNFControleMensal(){
  const cards=document.getElementById('nf-controle-cards'); if(!cards) return;
  const vazio=document.getElementById('nf-controle-vazio');
  const busca=_nfNormalize(document.getElementById('nf-controle-busca')?.value||'');
  const filtro=document.getElementById('nf-controle-status')?.value||'pendentes';
  const info=nfControleContratos.map(c=>{
    const docs=_nfDocsContrato(c.id);
    const feitos=docs.filter(d=>_nfMarcacao(c.id,d.id)?.concluido).length;
    return {c,docs,feitos,completo:docs.length>0&&feitos===docs.length};
  });
  let rows=info.filter(x=>{
    if(busca&&!_nfNormalize([_nfEmpresa(x.c),_nfProcesso(x.c),x.c.cpl,x.c.numero_contrato,x.c.prefixo_chamado].filter(Boolean).join(' ')).includes(busca)) return false;
    if(filtro==='concluidos') return x.completo;
    return true;
  });
  rows.sort((a,b)=>Number(a.completo)-Number(b.completo)||_nfEmpresa(a.c).localeCompare(_nfEmpresa(b.c),'pt-BR'));
  const concluidos=info.filter(x=>x.completo).length;
  const pendentes=info.length-concluidos;
  const resumo=document.getElementById('nf-controle-resumo');
  if(resumo) resumo.innerHTML=`
    <span class="nf-summary-chip"><strong>${info.length}</strong> contratos acompanhados</span>
    <span class="nf-summary-chip pending"><strong>${pendentes}</strong> pendentes</span>
    <span class="nf-summary-chip done"><strong>${concluidos}</strong> concluídos</span>
    <span class="nf-summary-chip">${_nfEsc(new Date(_nfMonthDate()+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</span>`;
  if(!rows.length){
    cards.innerHTML='';
    if(vazio){vazio.textContent=nfControleContratos.length?'Nenhum contrato corresponde aos filtros.':'Nenhum contrato de manutenção com prefixo foi encontrado.';vazio.style.display='block';}
    return;
  }
  if(vazio) vazio.style.display='none';
  const pode=_nfPodeEditar();
  cards.innerHTML=rows.map(({c,docs,feitos,completo})=>{
    const pct=docs.length?Math.round((feitos/docs.length)*100):0;
    const checks=docs.map(d=>{
      const marcado=!!_nfMarcacao(c.id,d.id)?.concluido;
      return `<label class="nf-check-row${marcado?' is-checked':''}">
        <input type="checkbox" data-contrato-id="${c.id}" data-documento-id="${_nfEsc(d.id)}" ${marcado?'checked':''} ${pode?'':'disabled'} onchange="toggleDocumentoChecklistNF(this)">
        <span>${_nfEsc(d.nome)}${d.descricao?`<span class="nf-check-scope">${_nfEsc(d.descricao)}</span>`:''}</span>
      </label>`;
    }).join('');
    return `<article class="nf-control-card${completo?' is-complete':''}">
      <div class="nf-card-head">
        <div><div class="nf-card-company">${_nfEsc(_nfEmpresa(c))}</div>
          <div class="nf-card-meta">${_nfEsc(_nfProcesso(c))} · Contrato ${_nfEsc(c.numero_contrato||'—')} · Prefixo ${_nfEsc(c.prefixo_chamado||'—')}${c.vencimento?`<br>Vigência até ${_nfEsc(typeof fmtDate==='function'?fmtDate(c.vencimento):c.vencimento)}`:''}</div>
        </div>
        <span class="nf-card-status ${completo?'done':'pending'}">${completo?'Concluído':(docs.length?`${docs.length-feitos} pendente${docs.length-feitos===1?'':'s'}`:'Configurar')}</span>
      </div>
      <div class="nf-progress"><span style="width:${pct}%"></span></div>
      <div class="nf-check-items">${checks||'<div class="nf-card-empty">Nenhum documento configurado para este contrato.</div>'}</div>
      ${pode?`<div class="nf-card-footer"><button data-contrato-id="${c.id}" onclick="abrirGerenciadorChecklistNF(this.dataset.contratoId)">+ Documento específico</button></div>`:''}
    </article>`;
  }).join('');
}

async function toggleDocumentoChecklistNF(input){
  if(!_nfPodeEditar()){ input.checked=!input.checked; return; }
  const contratoId=Number(input.dataset.contratoId);
  const documentoId=input.dataset.documentoId;
  const concluido=!!input.checked;
  input.disabled=true;
  const payload={contrato_id:contratoId,documento_id:documentoId,competencia:_nfMonthDate(),concluido};
  const {data,error}=await sb.from('nf_checklist_marcacoes').upsert(payload,{onConflict:'contrato_id,documento_id,competencia'}).select('*').single();
  input.disabled=false;
  if(error){
    input.checked=!concluido;
    if(window.toast) toast('Não foi possível atualizar o checklist: '+error.message,'error');
    return;
  }
  const idx=nfChecklistMarcacoes.findIndex(m=>String(m.contrato_id)===String(contratoId)&&String(m.documento_id)===String(documentoId));
  if(idx>=0) nfChecklistMarcacoes[idx]=data; else nfChecklistMarcacoes.push(data);
  renderNFControleMensal();
}

async function abrirGerenciadorChecklistNF(contratoId=''){
  if(!_nfPodeEditar()){ alert('Você não tem permissão para editar o checklist.'); return; }
  if(!nfControleCarregado) await loadNFControleMensal();
  const select=document.getElementById('nfck-contrato');
  select.innerHTML='<option value="">Todos os contratos de manutenção</option>'+nfControleContratos.map(c=>`<option value="${c.id}">${_nfEsc(_nfContratoLabel(c))}</option>`).join('');
  select.value=String(contratoId||'');
  document.getElementById('nfck-nome').value='';
  document.getElementById('nfck-descricao').value='';
  document.getElementById('nfck-ordem').value=String((Math.max(0,...nfChecklistDocumentos.map(d=>Number(d.ordem)||0)))+10);
  const msg=document.getElementById('nfck-msg'); msg.textContent='';msg.className='fmsg';
  renderGerenciadorChecklistNF();
  document.getElementById('modal-nf-checklist').classList.add('active');
  setTimeout(()=>document.getElementById('nfck-nome')?.focus(),80);
}
function fecharGerenciadorChecklistNF(){ document.getElementById('modal-nf-checklist').classList.remove('active'); }

function renderGerenciadorChecklistNF(){
  const lista=document.getElementById('nfck-lista'); if(!lista) return;
  if(!nfChecklistDocumentos.length){lista.innerHTML='<div class="nf-empty">Nenhum documento configurado. Adicione o primeiro item acima.</div>';return;}
  lista.innerHTML=nfChecklistDocumentos.slice().sort((a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||a.nome.localeCompare(b.nome,'pt-BR')).map(d=>{
    const contrato=d.contrato_id?nfControleContratos.find(c=>String(c.id)===String(d.contrato_id)):null;
    return `<div class="nf-checklist-manager-item"><div><div class="nf-checklist-manager-name">${_nfEsc(d.nome)}</div>
      <div class="nf-checklist-manager-meta">${contrato?_nfEsc(_nfContratoLabel(contrato)):`Todos os contratos · seção ${_nfEsc(d.secao_id)}`} · ordem ${Number(d.ordem)||0}</div></div>
      <button data-documento-id="${_nfEsc(d.id)}" onclick="desativarDocumentoChecklistNF(this.dataset.documentoId)">Remover</button></div>`;
  }).join('');
}

async function salvarDocumentoChecklistNF(){
  if(!_nfPodeEditar()) return;
  const nome=(document.getElementById('nfck-nome').value||'').trim();
  const contratoId=document.getElementById('nfck-contrato').value;
  const descricao=(document.getElementById('nfck-descricao').value||'').trim();
  const ordem=Number(document.getElementById('nfck-ordem').value)||0;
  const msg=document.getElementById('nfck-msg');
  if(!nome){msg.textContent='Informe o nome do documento.';msg.className='fmsg err';return;}
  const btn=document.getElementById('nfck-adicionar');btn.disabled=true;
  const contrato=contratoId?nfControleContratos.find(c=>String(c.id)===String(contratoId)):null;
  const secoes=contrato?[contrato.secao_id]:[...new Set(nfControleContratos.map(c=>c.secao_id).filter(Boolean))];
  if(!secoes.length){btn.disabled=false;msg.textContent='Nenhuma seção com contrato de manutenção foi encontrada.';msg.className='fmsg err';return;}
  const payloads=secoes.map(secao_id=>({nome,descricao:descricao||null,ordem,contrato_id:contrato?Number(contrato.id):null,secao_id}));
  const {data,error}=await sb.from('nf_checklist_documentos').insert(payloads).select('*');
  btn.disabled=false;
  if(error){msg.textContent='Erro: '+error.message;msg.className='fmsg err';return;}
  nfChecklistDocumentos.push(...(data||[]));
  document.getElementById('nfck-nome').value='';document.getElementById('nfck-descricao').value='';
  document.getElementById('nfck-ordem').value=String(ordem+10);
  msg.textContent='Documento adicionado.';msg.className='fmsg ok';
  renderGerenciadorChecklistNF();renderNFControleMensal();
}

async function desativarDocumentoChecklistNF(id){
  if(!_nfPodeEditar()) return;
  const doc=nfChecklistDocumentos.find(d=>String(d.id)===String(id)); if(!doc) return;
  if(!await uiConfirm(`Remover "${doc.nome}" dos próximos controles? O histórico mensal será preservado.`)) return;
  const ids=doc.contrato_id==null
    ?nfChecklistDocumentos.filter(d=>d.contrato_id==null&&_nfNormalize(d.nome)===_nfNormalize(doc.nome)).map(d=>d.id)
    :[doc.id];
  const {error}=await sb.from('nf_checklist_documentos').update({ativo:false}).in('id',ids);
  if(error){if(window.toast)toast('Erro ao remover documento: '+error.message,'error');return;}
  nfChecklistDocumentos=nfChecklistDocumentos.filter(d=>!ids.some(x=>String(x)===String(d.id)));
  renderGerenciadorChecklistNF();renderNFControleMensal();
}

async function _nfCarregarContratosCadastro(){
  const {data,error}=await sb.from('contratos')
    .select('id,cpl,numero_contrato,status,tipo_instrumento,prefixo_chamado,prestador,fornecedor_id,processo_id,secao_id,fornecedores(id,razao_social,cnpj_normalizado),processos(id,identificador)')
    .order('cpl',{ascending:true});
  if(error) throw error;
  nfContratosCadastro=(data||[]).filter(c=>!_nfContratoEncerrado(c));
  return nfContratosCadastro;
}

async function abrirCadastroNotaFiscal(contratoId=''){
  if(!_nfPodeCadastrar()){alert('Você não tem permissão para cadastrar notas fiscais.');return;}
  const modal=document.getElementById('modal-nf-cadastro');
  const select=document.getElementById('nfc-contrato');
  select.innerHTML='<option value="">Carregando contratos...</option>';
  ['nfc-empresa','nfc-processo','nfc-numero','nfc-serie','nfc-chave','nfc-valor','nfc-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('nfc-competencia').value=_nfMonth();
  document.getElementById('nfc-emissao').value=_nfToday();
  document.getElementById('nfc-recebimento').value=_nfToday();
  document.getElementById('nfc-glosa').value='0';document.getElementById('nfc-status').value='recebida';document.getElementById('nfc-arquivo').value='';
  const msg=document.getElementById('nfc-msg');msg.textContent='';msg.className='fmsg';
  nfCadastroAtualizarAprovado();
  modal.classList.add('active');
  try{
    await _nfCarregarContratosCadastro();
    select.innerHTML='<option value="">Selecione o contrato...</option>'+nfContratosCadastro.map(c=>`<option value="${c.id}">${_nfEsc(_nfContratoLabel(c))}</option>`).join('');
    const preferido=contratoId||window._ctAtual?.id||'';
    if(preferido&&nfContratosCadastro.some(c=>String(c.id)===String(preferido))) select.value=String(preferido);
    nfCadastroContratoChange();
  }catch(e){msg.textContent='Erro ao carregar contratos: '+e.message;msg.className='fmsg err';}
}
function fecharCadastroNotaFiscal(){document.getElementById('modal-nf-cadastro').classList.remove('active');}
function nfCadastroContratoChange(){
  const id=document.getElementById('nfc-contrato')?.value;
  const c=nfContratosCadastro.find(x=>String(x.id)===String(id));
  document.getElementById('nfc-empresa').value=c?_nfEmpresa(c):'';
  document.getElementById('nfc-processo').value=c?_nfProcesso(c):'';
}
function nfCadastroAtualizarAprovado(){
  const bruto=_nfNum(document.getElementById('nfc-valor')?.value);
  const glosa=_nfNum(document.getElementById('nfc-glosa')?.value);
  const el=document.getElementById('nfc-aprovado'); if(el) el.value=_nfMoney(Math.max(bruto-glosa,0));
}

async function salvarCadastroNotaFiscal(){
  if(!_nfPodeCadastrar()) return;
  const contratoId=Number(document.getElementById('nfc-contrato').value||0);
  const contrato=nfContratosCadastro.find(c=>Number(c.id)===contratoId);
  const numero=(document.getElementById('nfc-numero').value||'').trim();
  const emissao=document.getElementById('nfc-emissao').value||null;
  const bruto=_nfNum(document.getElementById('nfc-valor').value);
  const glosa=_nfNum(document.getElementById('nfc-glosa').value);
  const aprovado=Math.max(bruto-glosa,0);
  const msg=document.getElementById('nfc-msg');
  if(!contrato){msg.textContent='Selecione o contrato.';msg.className='fmsg err';return;}
  if(!numero){msg.textContent='Informe o número da nota fiscal.';msg.className='fmsg err';return;}
  if(!emissao){msg.textContent='Informe a data de emissão.';msg.className='fmsg err';return;}
  if(bruto<=0){msg.textContent='Informe um valor bruto maior que zero.';msg.className='fmsg err';return;}
  if(glosa>bruto){msg.textContent='A glosa não pode ser maior que o valor bruto.';msg.className='fmsg err';return;}
  const normalizado=_nfDocNumber(numero);
  const {data:duplicadas,error:dupError}=await sb.from('notas_fiscais').select('id,numero,status').eq('contrato_id',contratoId).eq('numero_normalizado',normalizado).neq('status','cancelada').limit(5);
  if(dupError){msg.textContent='Erro ao conferir duplicidade: '+dupError.message;msg.className='fmsg err';return;}
  if(duplicadas?.length&&!await uiConfirm(`Já existe a NF ${duplicadas[0].numero} neste contrato. Deseja cadastrar outra mesmo assim?`)) return;
  const status=document.getElementById('nfc-status').value||'recebida';
  const validada=['aprovada','aprovada_com_glosa','encaminhada_para_pagamento'].includes(status);
  const payload={
    numero,numero_normalizado:normalizado||null,
    serie:(document.getElementById('nfc-serie').value||'').trim()||null,
    chave_acesso:(document.getElementById('nfc-chave').value||'').trim()||null,
    fornecedor_id:contrato.fornecedor_id||null,contrato_id:contrato.id,processo_id:contrato.processo_id||null,
    competencia:document.getElementById('nfc-competencia').value||null,
    data_emissao:emissao,data_recebimento:document.getElementById('nfc-recebimento').value||null,
    valor_total:bruto,valor_bruto:bruto,valor_liquido:aprovado,valor_glosa:glosa,valor_aprovado:aprovado,
    status,origem_sistema:'cadastro_central',observacoes:(document.getElementById('nfc-obs').value||'').trim()||null,
    validado_por:validada?(currentProfile?.nome||currentProfile?.email||null):null,
    validado_em:validada?new Date().toISOString():null,updated_at:new Date().toISOString()
  };
  const btn=document.getElementById('nfc-salvar');btn.disabled=true;btn.textContent='Salvando...';
  const {data,error}=await sb.from('notas_fiscais').insert(payload).select('*').single();
  if(error){btn.disabled=false;btn.textContent='Salvar nota fiscal';msg.textContent='Erro: '+error.message;msg.className='fmsg err';return;}
  let nota=data;
  const arquivo=document.getElementById('nfc-arquivo')?.files?.[0]||null;
  if(arquivo){
    try{ nota=await _recAnexarNotaFiscal(nota,arquivo); }
    catch(e){await sb.from('notas_fiscais').delete().eq('id',nota.id);btn.disabled=false;btn.textContent='Salvar nota fiscal';msg.textContent='Erro no anexo: '+e.message;msg.className='fmsg err';return;}
  }
  btn.disabled=false;btn.textContent='Salvar nota fiscal';
  nfTodasCarregado=false;
  fecharCadastroNotaFiscal();
  if(window.toast) toast(`NF ${nota.numero} cadastrada e disponível para medição.`,'success');
  if(window._activeTab==='notas-fiscais')nfShowSub('todas');
}

function _nfOrigem(row){
  if(String(row?.contratos?.tipo_instrumento||'').toUpperCase()==='ATA') return 'ata';
  const sistema=_nfNormalize(row?.origem_sistema);
  if(row?.medicao_id||row?.contratos?.prefixo_chamado||sistema.includes('fiscalizacao')||sistema.includes('contratos_medicoes')||sistema.includes('cadastro_central')) return 'servico';
  return 'aquisicao';
}
function _nfOrigemLabel(origem){return {servico:'Serviço',aquisicao:'Aquisição',ata:'Ata'}[origem]||'Outros';}
function _nfStatusLabel(status){return String(status||'sem status').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}

async function loadTodasNotasFiscais(force=false){
  if(nfTodasCarregado&&!force){renderTodasNotasFiscais();return;}
  const loading=document.getElementById('nf-todas-loading'); if(loading)loading.style.display='flex';
  try{
    const {data,error}=await sb.from('notas_fiscais')
      .select('*,fornecedores(id,razao_social,cnpj_normalizado),contratos(id,cpl,numero_contrato,tipo_instrumento,prefixo_chamado,prestador),processos(id,identificador),contratos_medicoes(id,competencia,status,valor_bruto,valor_liquido)')
      .order('created_at',{ascending:false}).limit(3000);
    if(error) throw error;
    nfTodasRows=data||[];nfTodasCarregado=true;renderTodasNotasFiscais();
  }catch(e){
    const vazio=document.getElementById('nf-todas-vazio');if(vazio){vazio.innerHTML=`Não foi possível carregar as notas fiscais.<br><small>${_nfEsc(e.message||e)}</small>`;vazio.style.display='block';}
  }finally{if(loading)loading.style.display='none';}
}

function renderTodasNotasFiscais(){
  const body=document.getElementById('nf-todas-body');if(!body)return;
  const busca=_nfNormalize(document.getElementById('nf-todas-busca')?.value||'');
  const origemFiltro=document.getElementById('nf-todas-origem')?.value||'';
  const medFiltro=document.getElementById('nf-todas-medicao')?.value||'';
  const rows=nfTodasRows.filter(n=>{
    const origem=_nfOrigem(n);
    if(origemFiltro&&origem!==origemFiltro)return false;
    if(medFiltro==='com'&&!n.medicao_id)return false;
    if(medFiltro==='sem'&&n.medicao_id)return false;
    if(busca&&!_nfNormalize([n.numero,n.serie,n.fornecedores?.razao_social,n.contratos?.cpl,n.contratos?.numero_contrato,n.processos?.identificador,n.competencia].filter(Boolean).join(' ')).includes(busca))return false;
    return true;
  });
  const comMed=rows.filter(n=>n.medicao_id).length;
  const total=rows.reduce((s,n)=>s+_nfNum(n.valor_total),0);
  const resumo=document.getElementById('nf-todas-resumo');if(resumo)resumo.innerHTML=`
    <span class="nf-summary-chip"><strong>${rows.length}</strong> notas</span>
    <span class="nf-summary-chip done"><strong>${comMed}</strong> com medição</span>
    <span class="nf-summary-chip pending"><strong>${rows.length-comMed}</strong> sem medição</span>
    <span class="nf-summary-chip"><strong>${_nfMoney(total)}</strong> valor listado</span>`;
  const vazio=document.getElementById('nf-todas-vazio');
  if(!rows.length){body.innerHTML='';if(vazio){vazio.textContent='Nenhuma nota fiscal corresponde aos filtros.';vazio.style.display='block';}return;}
  if(vazio)vazio.style.display='none';
  body.innerHTML=rows.map(n=>{
    const origem=_nfOrigem(n);
    const med=n.contratos_medicoes;
    const empresa=n.fornecedores?.razao_social||n.contratos?.prestador||'—';
    const contexto=[n.processos?.identificador,n.contratos?.numero_contrato].filter(Boolean).join(' · ')||n.contratos?.cpl||'—';
    return `<tr>
      <td><strong>${_nfEsc(n.numero||'—')}</strong>${n.serie?`<br><small>Série ${_nfEsc(n.serie)}</small>`:''}</td>
      <td><span class="nf-origin-badge ${origem}">${_nfOrigemLabel(origem)}</span></td>
      <td>${_nfEsc(empresa)}</td>
      <td>${_nfEsc(contexto)}${n.contratos?.cpl?`<br><small>${_nfEsc(n.contratos.cpl)}</small>`:''}</td>
      <td>${_nfEsc(n.data_emissao?(typeof fmtDate==='function'?fmtDate(n.data_emissao):n.data_emissao):'—')}</td>
      <td style="text-align:right;font-weight:600">${_nfMoney(n.valor_total)}</td>
      <td>${n.medicao_id?`<span class="nf-measure-badge with">Com medição</span><br><small>${_nfEsc(med?.competencia||n.competencia||'')}</small>`:'<span class="nf-measure-badge without">Sem medição</span>'}</td>
      <td>${_nfEsc(_nfStatusLabel(n.status))}</td>
      <td>${n.arquivo_url?`<button class="btn-secondary" data-path="${_nfEsc(n.arquivo_url)}" onclick="nfBaixarAnexo(this)" style="font-size:10px;padding:4px 7px">Baixar</button>`:'—'}</td>
    </tr>`;
  }).join('');
  if(typeof _scanResizableTables==='function')setTimeout(_scanResizableTables,50);
}

function nfBaixarAnexo(button){
  const path=button?.dataset?.path;if(!path)return;
  if(typeof baixarArquivoStoragePrivado==='function')baixarArquivoStoragePrivado('notas-fiscais',path);
}

async function nfNotasDisponiveisContrato(contratoId){
  if(!contratoId)return[];
  const {data,error}=await sb.from('notas_fiscais').select('*').eq('contrato_id',contratoId).is('medicao_id',null).order('data_emissao',{ascending:false});
  if(error)throw error;
  return (data||[]).filter(n=>!['cancelada','recusada'].includes(String(n.status||'').toLowerCase()));
}
function nfNotaOptionLabel(n){
  const data=n.data_emissao?(typeof fmtDate==='function'?fmtDate(n.data_emissao):n.data_emissao):'sem data';
  return `NF ${n.numero||'sem número'} · ${data} · ${_nfMoney(n.valor_total)}`;
}

async function nfVincularNotaMedicao({notaId,contratoId,medicao,competencia}){
  const validada=['aprovada_pelo_fiscal','aprovada_com_glosa'].includes(String(medicao.status||'').toLowerCase());
  const statusNF=validada?(_nfNum(medicao.valor_glosa)>0?'aprovada_com_glosa':'aprovada'):undefined;
  const patch={
    medicao_id:medicao.id,competencia:competencia||medicao.competencia||null,
    valor_glosa:_nfNum(medicao.valor_glosa),valor_aprovado:_nfNum(medicao.valor_liquido),valor_liquido:_nfNum(medicao.valor_liquido),
    updated_at:new Date().toISOString()
  };
  if(statusNF)patch.status=statusNF;
  if(validada){patch.validado_por=currentProfile?.nome||currentProfile?.email||medicao.fiscal_responsavel||null;patch.validado_em=new Date().toISOString();}
  const {data,error}=await sb.from('notas_fiscais').update(patch).eq('id',notaId).eq('contrato_id',contratoId).is('medicao_id',null).select('*');
  if(error)throw error;
  if(!data?.length)throw new Error('A nota fiscal já foi vinculada a outra medição. Atualize a tela e escolha outra NF.');
  nfTodasCarregado=false;
  return data[0];
}
