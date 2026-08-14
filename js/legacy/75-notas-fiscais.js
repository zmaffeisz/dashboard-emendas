// ═══════════════════════════════════════════════════════════════════════════
// CENTRAL DE NOTAS FISCAIS
// Cadastro unico, controle mensal de documentos e consulta de todas as origens.
// ═══════════════════════════════════════════════════════════════════════════

let nfControleContratos=[];
let nfChecklistDocumentos=[];
let nfChecklistVinculos=[];
let nfChecklistMarcacoes=[];
let nfTodasRows=[];
let nfContratosCadastro=[];
let nfControleCarregado=false;
let nfTodasCarregado=false;
let nfSubAtual='controle';
let nfChecklistEdicaoId='';
let nfChecklistContratosSelecionados=new Set();

function _nfEsc(value){ return typeof _sanEsc==='function'?_sanEsc(String(value??'')):String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _nfNum(value){ return typeof _ctNum==='function'?_ctNum(value):(Number(value)||0); }
function _nfMoney(value){ return 'R$ '+_nfNum(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _nfToday(referenceDate=new Date()){
  const data=new Date(referenceDate);
  return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
}
function _nfMonth(referenceDate=new Date()){ return _nfToday(referenceDate).slice(0,7); }
function _nfPreviousMonth(referenceDate=new Date()){
  const hoje=new Date(referenceDate);
  const anterior=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);
  return `${anterior.getFullYear()}-${String(anterior.getMonth()+1).padStart(2,'0')}`;
}
function _nfControleCompetencia(){ return document.getElementById('nf-controle-mes')?.value||_nfPreviousMonth(); }
function _nfMonthDate(){ return `${_nfControleCompetencia()}-01`; }
function _nfNormalize(value){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function _nfDocNumber(value){ return String(value||'').replace(/\D/g,''); }
function _nfNumeroExibicao(nota){
  return String(nota?.numero_normalizado||'').trim()||_nfDocNumber(nota?.numero)||String(nota?.numero||'').trim()||'—';
}
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
  const btnCk=document.getElementById('nf-btn-checklist');
  if(btnCk) btnCk.style.display=pode?'inline-flex':'none';
  const mes=document.getElementById('nf-controle-mes');
  if(mes&&!mes.value) mes.value=_nfPreviousMonth();
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
  const mes=document.getElementById('nf-controle-mes'); if(mes&&!mes.value) mes.value=_nfPreviousMonth();
  try{
    const competencia=_nfMonthDate();
    const [contratosRes,docsRes,vinculosRes,marcasRes]=await Promise.all([
      _nfCarregarContratosManutencao(),
      sb.from('nf_checklist_documentos').select('*').eq('ativo',true).order('ordem').order('nome'),
      sb.from('nf_checklist_documento_contratos').select('documento_id,contrato_id,secao_id'),
      sb.from('nf_checklist_marcacoes').select('*').eq('competencia',competencia)
    ]);
    if(docsRes.error) throw docsRes.error;
    if(vinculosRes.error) throw vinculosRes.error;
    if(marcasRes.error) throw marcasRes.error;
    nfControleContratos=contratosRes;
    nfChecklistDocumentos=docsRes.data||[];
    nfChecklistVinculos=vinculosRes.data||[];
    nfChecklistMarcacoes=marcasRes.data||[];
    nfControleCarregado=true;
    renderNFControleMensal();
  }catch(e){
    if(vazio){vazio.innerHTML=`Não foi possível carregar o controle mensal.<br><small>${_nfEsc(e.message||e)}</small>`;vazio.style.display='block';}
  }finally{ if(loading) loading.style.display='none'; }
}

function _nfDocsContrato(contratoId){
  const contrato=nfControleContratos.find(c=>String(c.id)===String(contratoId));
  return nfChecklistDocumentos.filter(d=>String(d.secao_id)===String(contrato?.secao_id)&&(d.aplica_todos||nfChecklistVinculos.some(v=>String(v.documento_id)===String(d.id)&&String(v.contrato_id)===String(contratoId))));
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
  const podeEditarChecklist=_nfPodeEditar();
  const podeCadastrarNF=_nfPodeCadastrar();
  cards.innerHTML=rows.map(({c,docs,feitos,completo})=>{
    const pct=docs.length?Math.round((feitos/docs.length)*100):0;
    const checks=docs.map(d=>{
      const marcado=!!_nfMarcacao(c.id,d.id)?.concluido;
      return `<label class="nf-check-row${marcado?' is-checked':''}">
        <input type="checkbox" data-contrato-id="${c.id}" data-documento-id="${_nfEsc(d.id)}" ${marcado?'checked':''} ${podeEditarChecklist?'':'disabled'} onchange="toggleDocumentoChecklistNF(this)">
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
      ${(podeCadastrarNF||podeEditarChecklist)?`<div class="nf-card-footer">
        ${podeCadastrarNF?`<button class="nf-card-new-button" data-contrato-id="${c.id}" onclick="abrirCadastroNotaFiscalDoCard(this.dataset.contratoId)">+ Nova NF</button>`:''}
        ${podeEditarChecklist?`<button class="nf-card-checklist-button" data-contrato-id="${c.id}" onclick="abrirGerenciadorChecklistNF(this.dataset.contratoId)">Configurar documentos</button>`:''}
      </div>`:''}
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
  limparFormularioDocumentoChecklistNF();
  if(contratoId){
    nfChecklistContratosSelecionados=new Set([String(contratoId)]);
    renderContratosDocumentoChecklistNF();
  }
  renderGerenciadorChecklistNF();
  document.getElementById('modal-nf-checklist').classList.add('active');
  setTimeout(()=>document.getElementById('nfck-nome')?.focus(),80);
}
function fecharGerenciadorChecklistNF(){ document.getElementById('modal-nf-checklist').classList.remove('active'); }

function _nfContratosVinculados(documentoId){
  return nfChecklistVinculos.filter(v=>String(v.documento_id)===String(documentoId)).map(v=>String(v.contrato_id));
}

function _nfEscopoChecklist(){ return document.querySelector('input[name="nfck-escopo"]:checked')?.value||'selecionados'; }

function atualizarEscopoDocumentoChecklistNF(){
  const wrap=document.getElementById('nfck-contratos-wrap');
  if(wrap) wrap.style.display=_nfEscopoChecklist()==='selecionados'?'block':'none';
  atualizarContagemContratosDocumentoChecklistNF();
}

function atualizarContagemContratosDocumentoChecklistNF(){
  const total=nfChecklistContratosSelecionados.size;
  const el=document.getElementById('nfck-selecionados');
  if(el) el.textContent=`${total} selecionado${total===1?'':'s'}`;
}

function toggleContratoDocumentoChecklistNF(input){
  if(input.checked) nfChecklistContratosSelecionados.add(String(input.value));
  else nfChecklistContratosSelecionados.delete(String(input.value));
  atualizarContagemContratosDocumentoChecklistNF();
}

function renderContratosDocumentoChecklistNF(){
  const lista=document.getElementById('nfck-contratos'); if(!lista) return;
  const busca=_nfNormalize(document.getElementById('nfck-busca-contrato')?.value||'');
  const doc=nfChecklistDocumentos.find(d=>String(d.id)===String(nfChecklistEdicaoId));
  const contratos=nfControleContratos.filter(c=>(!doc||String(c.secao_id)===String(doc.secao_id))&&(!busca||_nfNormalize(_nfContratoLabel(c)).includes(busca)));
  lista.innerHTML=contratos.map(c=>`<label class="nf-checklist-contract-option">
    <input type="checkbox" value="${c.id}" ${nfChecklistContratosSelecionados.has(String(c.id))?'checked':''} onchange="toggleContratoDocumentoChecklistNF(this)">
    <span>${_nfEsc(_nfContratoLabel(c))}</span>
  </label>`).join('')||'<div class="nf-checklist-contract-empty">Nenhum contrato encontrado.</div>';
  atualizarContagemContratosDocumentoChecklistNF();
}

function limparFormularioDocumentoChecklistNF(){
  nfChecklistEdicaoId='';
  nfChecklistContratosSelecionados=new Set();
  const nome=document.getElementById('nfck-nome'); if(nome) nome.value='';
  const descricao=document.getElementById('nfck-descricao'); if(descricao) descricao.value='';
  const busca=document.getElementById('nfck-busca-contrato'); if(busca) busca.value='';
  const radio=document.querySelector('input[name="nfck-escopo"][value="selecionados"]'); if(radio) radio.checked=true;
  const btn=document.getElementById('nfck-adicionar'); if(btn) btn.textContent='Salvar documentação';
  const cancelar=document.getElementById('nfck-cancelar-edicao'); if(cancelar) cancelar.style.display='none';
  const msg=document.getElementById('nfck-msg'); if(msg){msg.textContent='';msg.className='fmsg';}
  renderContratosDocumentoChecklistNF();
  atualizarEscopoDocumentoChecklistNF();
}

function editarDocumentoChecklistNF(id){
  const doc=nfChecklistDocumentos.find(d=>String(d.id)===String(id)); if(!doc) return;
  nfChecklistEdicaoId=String(doc.id);
  nfChecklistContratosSelecionados=new Set(_nfContratosVinculados(doc.id));
  document.getElementById('nfck-nome').value=doc.nome||'';
  document.getElementById('nfck-descricao').value=doc.descricao||'';
  document.getElementById('nfck-busca-contrato').value='';
  const escopo=doc.aplica_todos?'todos':'selecionados';
  const radio=document.querySelector(`input[name="nfck-escopo"][value="${escopo}"]`); if(radio) radio.checked=true;
  document.getElementById('nfck-adicionar').textContent='Atualizar documentação';
  document.getElementById('nfck-cancelar-edicao').style.display='inline-flex';
  renderContratosDocumentoChecklistNF();
  atualizarEscopoDocumentoChecklistNF();
  document.getElementById('nfck-nome')?.focus();
}

function renderGerenciadorChecklistNF(){
  const lista=document.getElementById('nfck-lista'); if(!lista) return;
  if(!nfChecklistDocumentos.length){lista.innerHTML='<div class="nf-empty">Nenhum documento configurado. Adicione o primeiro item acima.</div>';return;}
  lista.innerHTML=nfChecklistDocumentos.slice().sort((a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||a.nome.localeCompare(b.nome,'pt-BR')).map(d=>{
    const quantidade=_nfContratosVinculados(d.id).length;
    const escopo=d.aplica_todos?'Todos os contratos de manutenção':`${quantidade} contrato${quantidade===1?'':'s'}`;
    return `<div class="nf-checklist-manager-item"><div><div class="nf-checklist-manager-name">${_nfEsc(d.nome)}</div>
      <div class="nf-checklist-manager-meta">${_nfEsc(escopo)}</div></div>
      <div class="nf-checklist-manager-buttons"><button class="edit" data-documento-id="${_nfEsc(d.id)}" onclick="editarDocumentoChecklistNF(this.dataset.documentoId)">Editar</button><button data-documento-id="${_nfEsc(d.id)}" onclick="desativarDocumentoChecklistNF(this.dataset.documentoId)">Remover</button></div></div>`;
  }).join('');
}

async function salvarDocumentoChecklistNF(){
  if(!_nfPodeEditar()) return;
  const nome=(document.getElementById('nfck-nome').value||'').trim();
  const descricao=(document.getElementById('nfck-descricao').value||'').trim();
  const aplicaTodos=_nfEscopoChecklist()==='todos';
  const contratoIds=[...nfChecklistContratosSelecionados].map(Number);
  const msg=document.getElementById('nfck-msg');
  if(!nome){msg.textContent='Informe o nome do documento.';msg.className='fmsg err';return;}
  if(!aplicaTodos&&!contratoIds.length){msg.textContent='Selecione pelo menos um contrato.';msg.className='fmsg err';return;}
  const btn=document.getElementById('nfck-adicionar');btn.disabled=true;
  const editando=!!nfChecklistEdicaoId;
  try{
    if(editando){
      const doc=nfChecklistDocumentos.find(d=>String(d.id)===String(nfChecklistEdicaoId));
      const idsValidos=contratoIds.filter(id=>nfControleContratos.some(c=>Number(c.id)===id&&String(c.secao_id)===String(doc.secao_id)));
      const {error:updateError}=await sb.from('nf_checklist_documentos').update({nome,descricao:descricao||null,aplica_todos:aplicaTodos,contrato_id:null}).eq('id',doc.id);
      if(updateError) throw updateError;
      if(!aplicaTodos&&idsValidos.length){
        const {error:insertError}=await sb.from('nf_checklist_documento_contratos').upsert(idsValidos.map(contrato_id=>({documento_id:doc.id,contrato_id})),{onConflict:'documento_id,contrato_id'});
        if(insertError) throw insertError;
      }
      const idsRemover=_nfContratosVinculados(doc.id).map(Number).filter(id=>aplicaTodos||!idsValidos.includes(id));
      if(idsRemover.length){
        const {error:deleteError}=await sb.from('nf_checklist_documento_contratos').delete().eq('documento_id',doc.id).in('contrato_id',idsRemover);
        if(deleteError) throw deleteError;
      }
    }else{
      const secoes=aplicaTodos?[...new Set(nfControleContratos.map(c=>c.secao_id).filter(Boolean))]:[...new Set(nfControleContratos.filter(c=>contratoIds.includes(Number(c.id))).map(c=>c.secao_id).filter(Boolean))];
      if(!secoes.length) throw new Error('Nenhuma seção com contrato de manutenção foi encontrada.');
      for(const secaoId of secoes){
        const {data:doc,error:docError}=await sb.from('nf_checklist_documentos').insert({nome,descricao:descricao||null,aplica_todos:aplicaTodos,contrato_id:null,secao_id:secaoId}).select('*').single();
        if(docError) throw docError;
        const idsSecao=contratoIds.filter(id=>nfControleContratos.some(c=>Number(c.id)===id&&String(c.secao_id)===String(secaoId)));
        if(!aplicaTodos&&idsSecao.length){
          const {error:vinculoError}=await sb.from('nf_checklist_documento_contratos').insert(idsSecao.map(contrato_id=>({documento_id:doc.id,contrato_id})));
          if(vinculoError){await sb.from('nf_checklist_documentos').delete().eq('id',doc.id);throw vinculoError;}
        }
      }
    }
    await loadNFControleMensal();
    limparFormularioDocumentoChecklistNF();
    msg.textContent=editando?'Documentação atualizada.':'Documentação salva.';msg.className='fmsg ok';
    renderGerenciadorChecklistNF();
  }catch(error){msg.textContent='Erro: '+(error.message||error);msg.className='fmsg err';}
  finally{btn.disabled=false;}
}

async function desativarDocumentoChecklistNF(id){
  if(!_nfPodeEditar()) return;
  const doc=nfChecklistDocumentos.find(d=>String(d.id)===String(id)); if(!doc) return;
  if(!await uiConfirm(`Remover "${doc.nome}" dos próximos controles? O histórico mensal será preservado.`)) return;
  const ids=[doc.id];
  const {error}=await sb.from('nf_checklist_documentos').update({ativo:false}).eq('id',doc.id);
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

function abrirCadastroNotaFiscalDoCard(contratoId){
  return abrirCadastroNotaFiscal(contratoId,_nfControleCompetencia());
}

async function abrirCadastroNotaFiscal(contratoId='',competencia=''){
  if(!_nfPodeCadastrar()){alert('Você não tem permissão para cadastrar notas fiscais.');return;}
  const modal=document.getElementById('modal-nf-cadastro');
  const contratoDisplay=document.getElementById('nfc-contrato');
  const contratoIdEl=document.getElementById('nfc-contrato-id');
  contratoDisplay.value='Carregando contrato...';
  contratoIdEl.value='';
  ['nfc-empresa','nfc-processo','nfc-numero','nfc-valor','nfc-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('nfc-competencia').value=competencia||_nfMonth();
  document.getElementById('nfc-emissao').value=_nfToday();
  document.getElementById('nfc-recebimento').value=_nfToday();
  document.getElementById('nfc-arquivo').value='';
  const msg=document.getElementById('nfc-msg');msg.textContent='';msg.className='fmsg';
  modal.classList.add('active');
  try{
    await _nfCarregarContratosCadastro();
    const preferido=contratoId||window._ctAtual?.id||'';
    const contrato=nfContratosCadastro.find(c=>String(c.id)===String(preferido));
    contratoIdEl.value=contrato?String(contrato.id):'';
    contratoDisplay.value=contrato?_nfContratoLabel(contrato):'Contrato não identificado';
    document.getElementById('nfc-empresa').value=contrato?_nfEmpresa(contrato):'';
    document.getElementById('nfc-processo').value=contrato?_nfProcesso(contrato):'';
    if(!contrato){msg.textContent='Não foi possível identificar o contrato selecionado no card.';msg.className='fmsg err';}
  }catch(e){msg.textContent='Erro ao carregar contratos: '+e.message;msg.className='fmsg err';}
}
function fecharCadastroNotaFiscal(){document.getElementById('modal-nf-cadastro').classList.remove('active');}
async function salvarCadastroNotaFiscal(){
  if(!_nfPodeCadastrar()) return;
  const contratoId=Number(document.getElementById('nfc-contrato-id').value||0);
  const contrato=nfContratosCadastro.find(c=>Number(c.id)===contratoId);
  const numero=(document.getElementById('nfc-numero').value||'').trim();
  const competencia=document.getElementById('nfc-competencia').value||'';
  const emissao=document.getElementById('nfc-emissao').value||'';
  const recebimento=document.getElementById('nfc-recebimento').value||'';
  const bruto=_nfNum(document.getElementById('nfc-valor').value);
  const glosa=0;
  const aprovado=bruto;
  const msg=document.getElementById('nfc-msg');
  if(!contrato){msg.textContent='O contrato vinculado ao card não foi identificado.';msg.className='fmsg err';return;}
  if(!numero){msg.textContent='Informe o número da nota fiscal.';msg.className='fmsg err';return;}
  if(!competencia){msg.textContent='Informe a competência da nota fiscal.';msg.className='fmsg err';return;}
  if(!emissao){msg.textContent='Informe a data de emissão da nota fiscal.';msg.className='fmsg err';return;}
  if(!recebimento){msg.textContent='Informe a data de recebimento da nota fiscal.';msg.className='fmsg err';return;}
  if(bruto<=0){msg.textContent='Informe um valor bruto maior que zero.';msg.className='fmsg err';return;}
  const normalizado=_nfDocNumber(numero);
  const {data:duplicadas,error:dupError}=await sb.from('notas_fiscais').select('id,numero,status').eq('contrato_id',contratoId).eq('numero_normalizado',normalizado).neq('status','cancelada').limit(5);
  if(dupError){msg.textContent='Erro ao conferir duplicidade: '+dupError.message;msg.className='fmsg err';return;}
  if(duplicadas?.length&&!await uiConfirm(`Já existe a NF ${duplicadas[0].numero} neste contrato. Deseja cadastrar outra mesmo assim?`)) return;
  const status='recebida';
  const payload={
    numero,numero_normalizado:normalizado||null,
    fornecedor_id:contrato.fornecedor_id||null,contrato_id:contrato.id,processo_id:contrato.processo_id||null,
    competencia,
    data_emissao:emissao,data_recebimento:recebimento,
    valor_total:bruto,valor_bruto:bruto,valor_liquido:aprovado,valor_glosa:glosa,valor_aprovado:aprovado,
    status,origem_sistema:'cadastro_central',observacoes:(document.getElementById('nfc-obs').value||'').trim()||null,
    validado_por:null,validado_em:null,updated_at:new Date().toISOString()
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
    if(busca&&!_nfNormalize([n.numero_normalizado,n.numero,n.serie,n.fornecedores?.razao_social,n.contratos?.cpl,n.contratos?.numero_contrato,n.processos?.identificador,n.competencia].filter(Boolean).join(' ')).includes(busca))return false;
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
      <td><strong>${_nfEsc(_nfNumeroExibicao(n))}</strong>${n.serie?`<br><small>Série ${_nfEsc(n.serie)}</small>`:''}</td>
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
  return `NF ${_nfNumeroExibicao(n)} · ${data} · ${_nfMoney(n.valor_total)}`;
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
