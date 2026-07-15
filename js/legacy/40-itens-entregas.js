// ═══ ABA ITENS (Fase 2) ═══
function itensShowSub(sub){
  document.querySelectorAll('.itens-sub').forEach(s=>s.style.display='none');
  const el=document.getElementById('itens-sub-'+sub); if(el) el.style.display='block';
  document.querySelectorAll('.itens-subtab-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.sub===sub);
  });
  if(sub==='atas' && !itensAtasCarregado && typeof loadItensAtas==='function'){ loadItensAtas(); }
  if(sub==='entregas' && !itensEntregasCarregado && typeof loadItensEntregas==='function'){ loadItensEntregas(); }
  if(sub==='confirmacao' && !confirmacoesCarregado && typeof loadConfirmacoes==='function'){ loadConfirmacoes(); }
}
// Fase 4: subaba read-only "Itens de Atas" — mostra os itens origem='ata' e se já foram espelhados (ata_item_id)
let itensAtasRows=[], itensAtasCarregado=false;
async function loadItensAtas(){
  if(!userCanView('itens')&&!_isAdmin()) return;
  const wrap=document.getElementById('itens-atas-wrap'); if(!wrap) return;
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando itens de ata...</div>';
  const {data,error}=await sb.from('itens')
    .select('*, processos(identificador,natureza,status), fornecedores(razao_social), contratos(cpl,numero_contrato,status)')
    .eq('origem','ata')
    .order('created_at',{ascending:false});
  if(error){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro: '+_sanEsc(error.message)+'</div>'; return; }
  itensAtasRows=(data||[]).map(it=>({...it,
    _processo:it.processos?.identificador||'',
    _fornecedor:it.fornecedores?.razao_social||'',
    _cpl:it.contratos?.cpl||'',
    _numero:it.contratos?.numero_contrato||''
  }));
  itensAtasCarregado=true;
  renderItensAtas();
}
function renderItensAtas(){
  const wrap=document.getElementById('itens-atas-wrap'); if(!wrap) return;
  const q=(document.getElementById('itens-atas-busca')?.value||'').toLowerCase();
  const rows=itensAtasRows.filter(r=>{
    if(q){ const hay=[r.descricao,r._processo,r._fornecedor,r._cpl,r.fonte_descricao].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
  const cEl=document.getElementById('itens-atas-count'); if(cEl) cEl.textContent=`${rows.length} item(ns)`;
  if(!rows.length){ wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:13px">Nenhum item de ata. Itens aparecem aqui ao gerar contrato do tipo <b>ATA</b> a partir de um processo <b>ATA DE RP</b> na aba Licitações.</div>'; return; }
  wrap.innerHTML=`<table style="width:100%;font-size:12px;border-collapse:collapse;background:var(--surface)">
    <thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border)">
      <th style="padding:7px 8px">Descrição</th><th style="padding:7px 8px;text-align:right">Qtde</th><th style="padding:7px 8px">Fonte</th><th style="padding:7px 8px">Processo</th><th style="padding:7px 8px">ATA / Contrato</th><th style="padding:7px 8px">Empresa</th><th style="padding:7px 8px">Espelhado p/ ATA</th><th style="padding:7px 8px">Saldo / execução</th>
    </tr></thead><tbody>${rows.map(r=>{
      const esp=!!r.ata_item_id;
      return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px">${_sanEsc(r.descricao||'—')}</td>
      <td style="padding:6px 8px;text-align:right">${r.qtde??'—'}</td>
      <td style="padding:6px 8px">${_itemFonteLabel(r.fonte_tipo)}${r.fonte_descricao?(' · '+_sanEsc(r.fonte_descricao)):''}</td>
      <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r._processo||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">${r._cpl?_sanEsc(r._cpl):'—'}${r._numero?(' · '+_sanEsc(r._numero)):''}</td>
      <td style="padding:6px 8px">${r._fornecedor?_sanEsc(r._fornecedor):'—'}</td>
      <td style="padding:6px 8px">${esp?'<span class="badge" style="background:#3FB95022;color:#3FB950;white-space:nowrap">✓ espelhado</span>':'<span class="badge" style="background:#88878022;color:#888780;white-space:nowrap">não espelhado</span>'}</td>
      <td style="padding:6px 8px;color:var(--text3);white-space:nowrap">na aba <b>ATAs</b></td>
    </tr>`;}).join('')}</tbody></table>`;
}
function _itemFonteLabel(ft){const m=Object.fromEntries(PROC_FONTES);return m[ft]||ft||'—';}
function _itemStatusBadge(s){ s=s||'—'; const cor=(s==='em licitação')?'#EF9F27':(s==='contratado')?'#378ADD':'#888780'; return `<span class="badge" style="background:${cor}22;color:${cor};white-space:nowrap">${_sanEsc(s)}</span>`; }

// ═══ Fase 8: cadastro/controle de empenhos ═══
let empenhosRows=[], empenhosCarregado=false, _empContratoItens=[], _empEmendasCache=[], _empContratosCache=[];
function _empNum(id){ const v=document.getElementById(id)?.value; if(v==null||String(v).trim()==='') return null; const n=Number(String(v).replace(',','.')); return Number.isFinite(n)?n:null; }
function _empVinculado(e){ return (e.empenho_itens||[]).reduce((s,ei)=>s+(Number(ei.valor_vinculado)||0),0); }
function _empSaldoCalc(e){ return (Number(e.valor_empenhado)||0)-(Number(e.valor_anulado)||0)-_empVinculado(e); }
async function _recalcularSaldoEmpenho(eid){
  if(!eid) return;
  const {data:e}=await sb.from('empenhos').select('valor_empenhado,valor_anulado').eq('id',eid).maybeSingle();
  const {data:lis}=await sb.from('empenho_itens').select('valor_vinculado').eq('empenho_id',eid);
  const vinc=(lis||[]).reduce((s,x)=>s+(Number(x.valor_vinculado)||0),0);
  await sb.from('empenhos').update({saldo_empenho:(Number(e?.valor_empenhado)||0)-(Number(e?.valor_anulado)||0)-vinc}).eq('id',eid);
}
async function loadEmpenhos(){
  if(!userCanView('empenhos')&&!_isAdmin()) return;
  const wrap=document.getElementById('empenhos-wrap'); if(!wrap) return;
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando empenhos...</div>';
  const {data,error}=await sb.from('empenhos')
    .select('*, contratos(cpl,numero_contrato,tipo_instrumento), emendas(emenda,ano), fornecedores(razao_social), empenho_itens(id,valor_vinculado,quantidade_vinculada,item_id,emenda_item_id)')
    .order('created_at',{ascending:false});
  if(error){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro: '+_sanEsc(error.message)+'</div>'; return; }
  empenhosRows=(data||[]).map(e=>({...e,
    _contrato:[e.contratos?.tipo_instrumento==='ATA'?'ATA':'Contrato',e.contratos?.cpl,e.contratos?.numero_contrato].filter(Boolean).join(' · '),
    _emenda:e.emendas?.emenda?(e.emendas.emenda+(e.emendas.ano?('/'+e.emendas.ano):'')):'',
    _fornecedor:e.fornecedores?.razao_social||'',
    _vinc:_empVinculado(e), _saldo:_empSaldoCalc(e)
  }));
  empenhosCarregado=true;
  renderEmpenhos();
}
function renderEmpenhos(){
  const wrap=document.getElementById('empenhos-wrap'); if(!wrap) return;
  const q=(document.getElementById('emp-busca')?.value||'').toLowerCase();
  const rows=empenhosRows.filter(e=>{ if(!q) return true; const hay=[e.numero,e.ano,e.numero_despesa,e._contrato,e._emenda,e._fornecedor,e.fonte_descricao].filter(Boolean).join(' ').toLowerCase(); return hay.includes(q); });
  const cEl=document.getElementById('emp-count'); if(cEl) cEl.textContent=`${rows.length} empenho(s)`;
  const podeEd=podeEditar('empenhos');
  if(!rows.length){ wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:13px">Nenhum empenho cadastrado. Clique em <b>+ Novo empenho</b>.</div>'; return; }
  wrap.innerHTML=`<table style="width:100%;font-size:12px;border-collapse:collapse;background:var(--surface)">
    <thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border)">
      <th style="padding:7px 8px">Número</th><th style="padding:7px 8px">Despesa</th><th style="padding:7px 8px">Fonte</th><th style="padding:7px 8px">Contrato</th><th style="padding:7px 8px">Emenda</th><th style="padding:7px 8px;text-align:right">Valor</th><th style="padding:7px 8px;text-align:right">Vinculado</th><th style="padding:7px 8px;text-align:right">Saldo</th><th style="padding:7px 8px"></th>
    </tr></thead><tbody>${rows.map(e=>{
      const saldoCor=e._saldo<0?'var(--red)':(e._saldo===0?'var(--text3)':'var(--green)');
      return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;white-space:nowrap"><b>${_sanEsc(e.numero||'—')}</b>${e.ano?(' / '+e.ano):''}</td>
      <td style="padding:6px 8px">${_sanEsc(e.numero_despesa||'—')}</td>
      <td style="padding:6px 8px">${_itemFonteLabel(e.fonte_tipo)}${e.fonte_descricao?(' · '+_sanEsc(e.fonte_descricao)):''}</td>
      <td style="padding:6px 8px;white-space:nowrap">${e._contrato?_sanEsc(e._contrato):'—'}</td>
      <td style="padding:6px 8px;white-space:nowrap">${e._emenda?_sanEsc(e._emenda):'—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">${fmtFull(e.valor_empenhado)}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">${fmtFull(e._vinc)}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;color:${saldoCor};font-weight:600">${fmtFull(e._saldo)}</td>
      <td style="padding:6px 8px;white-space:nowrap">${podeEd?`<button onclick="abrirModalEmpenho('${e.id}')" style="font-size:11px;padding:4px 9px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer">Editar</button> <button onclick="excluirEmpenho('${e.id}')" style="font-size:11px;padding:4px 9px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--red);cursor:pointer">Excluir</button>`:''}</td>
    </tr>`;}).join('')}</tbody></table>`;
}
/* ── select pesquisável genérico ── */
const _s2Data={};
function _s2Init(key,opts){
  _s2Data[key]=opts;
  _s2Render(key,'');
}
function _s2Toggle(key){
  const dd=document.getElementById(key+'-dropdown');
  if(!dd) return;
  if(dd.style.display==='none'||!dd.style.display){
    dd.style.display='block';
    const srch=document.getElementById(key+'-search');
    if(srch){srch.value='';srch.focus();}
    _s2Render(key,'');
    document.getElementById(key+'-wrap').classList.add('open');
    setTimeout(()=>document.addEventListener('click',_s2OutsideHandler,{capture:true,once:true}),0);
  } else {
    _s2Close(key);
  }
}
function _s2OutsideHandler(e){
  document.querySelectorAll('.s2-dropdown').forEach(dd=>{
    if(dd.style.display!=='none' && !dd.contains(e.target)){
      const key=dd.id.replace('-dropdown','');
      const wrap=document.getElementById(key+'-wrap');
      dd.style.display='none';
      if(wrap) wrap.classList.remove('open');
    }
  });
}
function _s2Close(key){
  const dd=document.getElementById(key+'-dropdown');
  if(dd) dd.style.display='none';
  const wrap=document.getElementById(key+'-wrap');
  if(wrap) wrap.classList.remove('open');
}
function _s2Filter(key){
  const q=(document.getElementById(key+'-search')?.value||'').toLowerCase();
  _s2Render(key,q);
}
function _s2Render(key,q){
  const list=document.getElementById(key+'-list');
  if(!list) return;
  const data=_s2Data[key]||[];
  const cur=String(document.getElementById(key)?.value||'');
  const filtered=q?data.filter(o=>o.label.toLowerCase().includes(q)):data;
  list.innerHTML='';
  filtered.forEach(o=>{
    const div=document.createElement('div');
    div.className='s2-opt'+(o.value===''?' placeholder-opt':'')+(String(o.value)===cur?' selected':'');
    div.textContent=o.label;
    div.addEventListener('mousedown',ev=>{ev.preventDefault();ev.stopPropagation();_s2Select(key,o.value,o.label,o.cb);});
    list.appendChild(div);
  });
}
function _s2Select(key,value,label,cb){
  const hidden=document.getElementById(key);
  if(hidden) hidden.value=value;
  const disp=document.getElementById(key+'-display');
  if(disp){ disp.textContent=label; disp.classList.toggle('placeholder',value===''); }
  _s2Close(key);
  if(cb) cb(value);
}
function _s2SetValue(key,value){
  const data=_s2Data[key]||[];
  const opt=data.find(o=>String(o.value)===String(value));
  const hidden=document.getElementById(key);
  if(hidden) hidden.value=value??'';
  const disp=document.getElementById(key+'-display');
  if(disp){
    disp.textContent=opt?opt.label:(value?'(#'+value+')':'— selecione um contrato —');
    disp.classList.toggle('placeholder',!value);
  }
  _s2Close(key);
}
/* ── fim select pesquisável ── */
async function _empPopularSelects(){
  document.getElementById('emp-fonte-tipo').innerHTML='<option value="">—</option>'+PROC_FONTES.map(([v,l])=>`<option value="${v}">${_sanEsc(l)}</option>`).join('');
  if(!_empEmendasCache.length){ const {data}=await sb.from('emendas').select('id,emenda,ano,parlamentar').order('ano',{ascending:false}); _empEmendasCache=data||[]; }
  if(!_empContratosCache.length){ const {data}=await sb.from('contratos').select('id,cpl,numero_contrato,prestador,fornecedor_id,tipo_instrumento').order('id',{ascending:false}); _empContratosCache=data||[]; }
  document.getElementById('emp-emenda').innerHTML='<option value="">— sem emenda —</option>'+_empEmendasCache.map(e=>`<option value="${e.id}">${_sanEsc(e.emenda||'?')}${e.ano?('/'+e.ano):''}${e.parlamentar?(' · '+_sanEsc(e.parlamentar)):''}</option>`).join('');
  _s2Init('emp-contrato',[
    {value:'',label:'— selecione um contrato —'},
    ..._empContratosCache.map(c=>({value:String(c.id),label:[c.tipo_instrumento==='ATA'?'ATA':'Contrato',c.cpl,c.numero_contrato,c.prestador].filter(Boolean).join(' · ')||'Contrato '+c.id, cb:()=>_empContratoChange()}))
  ]);
}
async function abrirModalEmpenho(id){
  if(bloquearSeVisualiz('empenhos')) return;
  await _empPopularSelects();
  document.getElementById('emp-msg').textContent='';
  const e=id?empenhosRows.find(r=>String(r.id)===String(id)):null;
  document.getElementById('emp-modal-titulo').textContent=e?'Editar empenho':'Novo empenho';
  document.getElementById('emp-id').value=e?e.id:'';
  document.getElementById('emp-numero').value=e?.numero||'';
  document.getElementById('emp-ano').value=e?.ano||new Date().getFullYear();
  document.getElementById('emp-despesa').value=e?.numero_despesa||'';
  document.getElementById('emp-fonte-tipo').value=e?.fonte_tipo||'';
  document.getElementById('emp-fonte-desc').value=e?.fonte_descricao||'';
  document.getElementById('emp-valor').value=e?.valor_empenhado??'';
  document.getElementById('emp-data').value=e?.data_emissao||'';
  document.getElementById('emp-emenda').value=e?.emenda_id||'';
  _s2SetValue('emp-contrato',e?.contrato_id||'');
  document.getElementById('emp-obs').value=e?.observacoes||'';
  const prev=e?(e.empenho_itens||[]).reduce((m,ei)=>{
    if(ei.item_id) m['item:'+ei.item_id]={q:ei.quantidade_vinculada,v:ei.valor_vinculado};
    if(ei.emenda_item_id) m['ata:'+ei.emenda_item_id]={q:ei.quantidade_vinculada,v:ei.valor_vinculado};
    return m;
  },{}):{};
  await _empContratoChange(prev);
  document.getElementById('modal-empenho').classList.add('active');
}
async function _empContratoChange(prev){
  const wrap=document.getElementById('emp-itens-wrap');
  const cid=document.getElementById('emp-contrato').value;
  _empContratoItens=[];
  if(!cid){ wrap.innerHTML='Selecione um contrato para listar os itens.'; _empRecalcSaldo(); return; }
  wrap.innerHTML='<span class="spinner"></span> carregando itens...';
  const contrato=_empContratosCache.find(c=>String(c.id)===String(cid));
  if(contrato?.tipo_instrumento==='ATA'){
    await _empContratoAtaChange(cid,prev||{});
    return;
  }
  const {data,error}=await sb.from('itens').select('id,descricao,qtde,valor_contratado,valor_estimado').eq('contrato_id',cid).order('created_at');
  if(error){ wrap.innerHTML='<span style="color:var(--red)">Erro: '+_sanEsc(error.message)+'</span>'; return; }
  _empContratoItens=data||[];
  if(!_empContratoItens.length){ wrap.innerHTML='Nenhum item vinculado a este contrato.'; _empRecalcSaldo(); return; }
  const pv=prev||{};
  wrap.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="color:var(--text2);text-align:left">
    <th style="padding:4px 6px">Item</th><th style="padding:4px 6px;text-align:right">Qtde contr.</th><th style="padding:4px 6px;width:110px">Qtde vinc.</th><th style="padding:4px 6px;width:130px">Valor vinc. (R$)</th></tr></thead><tbody>${
    _empContratoItens.map(it=>`<tr data-item="${it.id}" style="border-top:1px solid var(--border)">
      <td style="padding:4px 6px">${_sanEsc(it.descricao||'—')}</td>
      <td style="padding:4px 6px;text-align:right">${it.qtde??'—'}</td>
      <td style="padding:4px 6px"><input type="number" class="empi-q" min="0" step="any" value="${pv['item:'+it.id]?.q??''}" style="width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box"></td>
      <td style="padding:4px 6px"><input type="number" class="empi-v" min="0" step="any" oninput="_empRecalcSaldo()" value="${pv['item:'+it.id]?.v??''}" style="width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box"></td>
    </tr>`).join('')}</tbody></table>`;
  _empRecalcSaldo();
}
function _empFiltrarAtaPedidos(){
  const q=(document.getElementById('emp-ata-busca')?.value||'').toLowerCase();
  document.querySelectorAll('#emp-itens-wrap .emp-ata-row').forEach(tr=>{
    tr.style.display=(!q||String(tr.dataset.search||'').includes(q))?'':'none';
  });
}
async function _empContratoAtaChange(cid,prev){
  const wrap=document.getElementById('emp-itens-wrap');
  const empAtual=document.getElementById('emp-id')?.value||'';
  const {data:atas,error:eAta}=await sb.from('atas_itens').select('id,item,cpl,sim,empresa,valor_unit').eq('contrato_id',cid);
  if(eAta){ wrap.innerHTML='<span style="color:var(--red)">Erro: '+_sanEsc(eAta.message)+'</span>'; return; }
  const ataIds=(atas||[]).map(a=>a.id);
  if(!ataIds.length){ wrap.innerHTML='Nenhum item de ATA vinculado a este contrato.'; _empRecalcSaldo(); return; }
  const ataMap=Object.fromEntries((atas||[]).map(a=>[String(a.id),a]));
  const {data:execs,error:eExec}=await sb.from('atas_execucao')
    .select('id,ata_item_id,emenda_id,emenda_item_id,item,unidade,qtde,valor,empenho,af_numero,data_af,prev_entrega,cpl,sim')
    .in('ata_item_id',ataIds)
    .order('created_at',{ascending:false});
  if(eExec){ wrap.innerHTML='<span style="color:var(--red)">Erro: '+_sanEsc(eExec.message)+'</span>'; return; }
  const emendaItemIds=[...new Set((execs||[]).map(e=>e.emenda_item_id).filter(Boolean))];
  let vincPorEmendaItem={};
  if(emendaItemIds.length){
    const {data:vincs}=await sb.from('empenho_itens').select('empenho_id,emenda_item_id,empenhos(numero,ano)').in('emenda_item_id',emendaItemIds);
    (vincs||[]).forEach(v=>{ vincPorEmendaItem[String(v.emenda_item_id)]=v; });
  }
  const rows=(execs||[]).map(ex=>{
    const ai=ataMap[String(ex.ata_item_id)]||{};
    const key=ex.emenda_item_id?('ata:'+ex.emenda_item_id):('exec:'+ex.id);
    const pv=prev[key];
    const vinc=vincPorEmendaItem[String(ex.emenda_item_id||'')];
    const vincOutro=vinc&&String(vinc.empenho_id)!==String(empAtual);
    return {...ex,_ai:ai,_key:key,_prev:pv,_vinc:vinc,_vincOutro:vincOutro};
  }).filter(ex=>ex._prev || (!ex._vincOutro && !String(ex.empenho||'').trim()));
  if(!rows.length){ wrap.innerHTML='Nenhum pedido de ATA aguardando vínculo de empenho para este contrato.'; _empRecalcSaldo(); return; }
  const inp='width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
  wrap.innerHTML=`<input type="text" id="emp-ata-busca" placeholder="Pesquisar pedido por item, unidade, CPL, SIM, fornecedor..." oninput="_empFiltrarAtaPedidos()" style="width:100%;margin-bottom:8px;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)">
  <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="color:var(--text2);text-align:left">
    <th style="padding:4px 6px;width:26px"></th><th style="padding:4px 6px">Pedido da ATA</th><th style="padding:4px 6px;text-align:right">Qtde</th><th style="padding:4px 6px;text-align:right">Valor</th><th style="padding:4px 6px">Situação</th></tr></thead><tbody>${
    rows.map(ex=>{
      const ai=ex._ai||{};
      const valor=Number(ex.valor)||((Number(ai.valor_unit)||0)*(Number(ex.qtde)||0))||0;
      const checked=!!ex._prev;
      const situacao=ex._vinc?`vinculado a ${_sanEsc(ex._vinc.empenhos?.numero||'empenho')}`:(ex.af_numero?'AF emitida':'aguardando empenho');
      const search=[ex.item,ai.item,ex.unidade,ex.cpl,ai.cpl,ex.sim,ai.sim,ai.empresa,ex.af_numero].filter(Boolean).join(' ').toLowerCase();
      return `<tr class="emp-ata-row" data-ata-exec="${ex.id}" data-emenda-item="${ex.emenda_item_id||''}" data-search="${_sanEsc(search)}" style="border-top:1px solid var(--border)">
        <td style="padding:4px 6px"><input type="checkbox" class="empi-ata-chk" ${checked?'checked':''} onchange="_empRecalcSaldo()"></td>
        <td style="padding:4px 6px"><b>${_sanEsc(ex.item||ai.item||'item')}</b><br><span style="color:var(--text3)">${_sanEsc(ex.unidade||'—')} · ${_sanEsc(ex.cpl||ai.cpl||'—')} · ${_sanEsc(ex.sim||ai.sim||'—')}</span></td>
        <td style="padding:4px 6px;text-align:right"><input type="hidden" class="empi-q" value="${ex._prev?.q??(ex.qtde||'')}">${ex.qtde??'—'}</td>
        <td style="padding:4px 6px;text-align:right"><input type="hidden" class="empi-v" value="${ex._prev?.v??valor}">${fmtFull(ex._prev?.v??valor)}</td>
        <td style="padding:4px 6px;color:${ex._vinc?'var(--green)':'var(--text3)'}">${situacao}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  _empRecalcSaldo();
}
function _empRecalcSaldo(){
  const valor=_empNum('emp-valor')||0;
  let vinc=0;
  document.querySelectorAll('#emp-itens-wrap tr[data-item]').forEach(tr=>{ vinc+=Number(String(tr.querySelector('.empi-v')?.value||'').replace(',','.'))||0; });
  document.querySelectorAll('#emp-itens-wrap tr[data-ata-exec]').forEach(tr=>{ if(tr.querySelector('.empi-ata-chk')?.checked) vinc+=Number(String(tr.querySelector('.empi-v')?.value||'').replace(',','.'))||0; });
  const saldo=valor-vinc;
  document.getElementById('emp-resumo-valor').textContent=fmtFull(valor);
  document.getElementById('emp-resumo-vinc').textContent=fmtFull(vinc);
  const sEl=document.getElementById('emp-resumo-saldo'); sEl.textContent=fmtFull(saldo); sEl.style.color=saldo<0?'var(--red)':(saldo===0?'var(--text3)':'var(--green)');
}
async function salvarEmpenho(){
  if(bloquearSeVisualiz('empenhos')) return;
  const msg=document.getElementById('emp-msg'); msg.className='fmsg';
  const numero=document.getElementById('emp-numero').value.trim();
  const valor=_empNum('emp-valor');
  if(!numero){ msg.textContent='Informe o número do empenho.'; msg.classList.add('err'); return; }
  if(valor==null){ msg.textContent='Informe o valor do empenho.'; msg.classList.add('err'); return; }
  const _cidVal=document.getElementById('emp-contrato').value;
  if(!_cidVal){ msg.textContent='Selecione um contrato.'; msg.classList.add('err'); return; }
  const vincs=[];
  document.querySelectorAll('#emp-itens-wrap tr[data-item]').forEach(tr=>{
    const q=Number(String(tr.querySelector('.empi-q').value).replace(',','.'))||null;
    const v=Number(String(tr.querySelector('.empi-v').value).replace(',','.'))||null;
    if(q||v) vincs.push({item_id:tr.dataset.item, quantidade_vinculada:q, valor_vinculado:v});
  });
  const ataVincs=[];
  document.querySelectorAll('#emp-itens-wrap tr[data-ata-exec]').forEach(tr=>{
    if(!tr.querySelector('.empi-ata-chk')?.checked) return;
    const q=Number(String(tr.querySelector('.empi-q')?.value||'').replace(',','.'))||null;
    const v=Number(String(tr.querySelector('.empi-v')?.value||'').replace(',','.'))||null;
    ataVincs.push({exec_id:tr.dataset.ataExec, emenda_item_id:tr.dataset.emendaItem||null, quantidade_vinculada:q, valor_vinculado:v});
  });
  const totalVinc=vincs.reduce((s,x)=>s+(x.valor_vinculado||0),0);
  const totalAtaVinc=ataVincs.reduce((s,x)=>s+(x.valor_vinculado||0),0);
  if((totalVinc+totalAtaVinc)-valor>0.005){ if(!await uiConfirm(`O valor vinculado (${fmtFull(totalVinc+totalAtaVinc)}) excede o valor do empenho (${fmtFull(valor)}). Salvar mesmo assim?`)) return; }
  const cid=document.getElementById('emp-contrato').value||null;
  const eid=document.getElementById('emp-emenda').value||null;
  const reg={
    numero, ano:_empNum('emp-ano')||null, numero_despesa:document.getElementById('emp-despesa').value.trim()||null,
    fonte_tipo:document.getElementById('emp-fonte-tipo').value||null, fonte_descricao:document.getElementById('emp-fonte-desc').value.trim()||null,
    valor_empenhado:valor, data_emissao:document.getElementById('emp-data').value||null,
    emenda_id:eid, contrato_id:cid?Number(cid):null, observacoes:document.getElementById('emp-obs').value.trim()||null,
    numero_normalizado:(typeof normalizarNumeroDocumento==='function'?normalizarNumeroDocumento(numero):numero),
    saldo_empenho:valor-totalVinc-totalAtaVinc, updated_at:new Date().toISOString()
  };
  // herda fornecedor do contrato, se houver
  if(cid){ const c=_empContratosCache.find(x=>String(x.id)===String(cid)); if(c?.fornecedor_id) reg.fornecedor_id=c.fornecedor_id; }
  const btn=document.getElementById('emp-salvar'); btn.disabled=true;
  const idAtual=document.getElementById('emp-id').value;
  let empId=idAtual;
  let res;
  if(idAtual){ res=await sb.from('empenhos').update(reg).eq('id',idAtual); }
  else{ const ins=await sb.from('empenhos').insert(reg).select('id').single(); res=ins; empId=ins.data?.id; }
  if(res.error){ btn.disabled=false; msg.textContent='Erro: '+res.error.message; msg.classList.add('err'); return; }
  // substitui vínculos
  const {data:antigosDoEmp}=await sb.from('empenho_itens').select('emenda_item_id').eq('empenho_id',empId);
  const antigosAtaIds=(antigosDoEmp||[]).map(x=>x.emenda_item_id).filter(Boolean).map(String);
  const novosAtaIds=ataVincs.map(x=>x.emenda_item_id).filter(Boolean).map(String);
  const removidosAtaIds=antigosAtaIds.filter(id=>!novosAtaIds.includes(id));
  await sb.from('empenho_itens').delete().eq('empenho_id',empId);
  if(removidosAtaIds.length) await sb.from('atas_execucao').update({empenho:null}).in('emenda_item_id',removidosAtaIds);
  if(vincs.length){ const linhas=vincs.map(v=>({...v, empenho_id:empId, emenda_id:eid})); const r2=await sb.from('empenho_itens').insert(linhas); if(r2.error){ btn.disabled=false; msg.textContent='Empenho salvo, mas erro nos vínculos: '+r2.error.message; msg.classList.add('err'); return; } }
  const empTexto=`${numero}${(_empNum('emp-ano')||null)?('/'+(_empNum('emp-ano')||'')):''}`;
  for(const v of ataVincs){
    const {data:ex}=await sb.from('atas_execucao').select('id,emenda_id,emenda_item_id,qtde,valor').eq('id',v.exec_id).maybeSingle();
    await sb.from('atas_execucao').update({empenho:empTexto}).eq('id',v.exec_id);
    const emi=v.emenda_item_id||ex?.emenda_item_id||null;
    if(!emi) continue;
    const {data:ant}=await sb.from('empenho_itens').select('id,empenho_id').eq('emenda_item_id',emi);
    const linha={empenho_id:empId,item_id:null,emenda_id:ex?.emenda_id||eid||null,emenda_item_id:emi,quantidade_vinculada:v.quantidade_vinculada||ex?.qtde||null,valor_vinculado:v.valor_vinculado||ex?.valor||null};
    const rAta=await sb.from('empenho_itens').insert(linha).select('id').single();
    if(rAta.error){ btn.disabled=false; msg.textContent='Empenho salvo, mas erro no vínculo da ATA: '+rAta.error.message; msg.classList.add('err'); return; }
    if(ant?.length) await sb.from('empenho_itens').delete().in('id',ant.map(x=>x.id));
    for(const old of [...new Set((ant||[]).map(x=>String(x.empenho_id)).filter(x=>x&&x!==String(empId)))]) await _recalcularSaldoEmpenho(old);
  }
  await _recalcularSaldoEmpenho(empId);
  btn.disabled=false;
  if(window.toast) toast(idAtual?'Empenho atualizado!':'Empenho cadastrado!','success');
  document.getElementById('modal-empenho').classList.remove('active');
  loadEmpenhos();
  itensEntregasCarregado=false;
  if(document.getElementById('itens-sub-entregas')?.style.display!=='none') loadItensEntregas();
}
async function excluirEmpenho(id){
  if(bloquearSeVisualiz('empenhos')) return;
  if(!await uiConfirm('Excluir este empenho e seus vínculos?')) return;
  await sb.from('empenho_itens').delete().eq('empenho_id',id);
  const {error}=await sb.from('empenhos').delete().eq('id',id);
  if(error){ if(window.toast) toast('Erro ao excluir: '+error.message,'error'); return; }
  if(window.toast) toast('Empenho excluído.','success');
  loadEmpenhos();
}
async function loadItens(){
  if(!userCanView('itens')&&!_isAdmin()) return;
  const wrap=document.getElementById('itens-aquisicoes-wrap');
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando itens...</div>';
  const {data,error}=await sb.from('itens')
    .select('*, processos(identificador,natureza,status), emendas(emenda,parlamentar), fornecedores(razao_social), unidades(nome)')
    .eq('origem','aquisicao')
    .order('created_at',{ascending:false});
  if(error){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro: '+_sanEsc(error.message)+'</div>'; return; }
  itensRows=(data||[]).map(it=>({...it,
    _processo:it.processos?.identificador||'',
    _emenda:it.emendas?.emenda||'',
    _fornecedor:it.fornecedores?.razao_social||'',
    _unidade:it.unidades?.nome||''
  }));
  // Fase 5: soma de qtde autorizada por item (AFs não canceladas) p/ saldo a autorizar
  await _carregarAFsResumo();
  itensCarregado=true;
  const fS=document.getElementById('itens-f-status');
  if(fS){const c=fS.value;const sts=[...new Set(itensRows.map(r=>r.status).filter(Boolean))].sort();fS.innerHTML='<option value="">Todos os status</option>'+sts.map(s=>`<option${s===c?' selected':''}>${_sanEsc(s)}</option>`).join('');}
  renderItensAquisicoes();
}
function renderItensAquisicoes(){
  const wrap=document.getElementById('itens-aquisicoes-wrap');
  const q=(document.getElementById('itens-busca').value||'').toLowerCase();
  const fF=document.getElementById('itens-f-fonte').value;
  const fS=document.getElementById('itens-f-status').value;
  const rows=itensRows.filter(r=>{
    if(fF && r.fonte_tipo!==fF) return false;
    if(fS && (r.status||'')!==fS) return false;
    if(q){ const hay=[r.descricao,r._processo,r._emenda,r._fornecedor,r._unidade,r.fonte_descricao].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
  document.getElementById('itens-count').textContent=`${rows.length} item(ns)`;
  if(!rows.length){ wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:13px">Nenhum item de aquisição encontrado. Cadastre itens ao criar/editar um processo (natureza AQUISIÇÃO ou ATA DE RP) na aba Licitações.</div>'; return; }
  wrap.innerHTML=`<table style="width:100%;font-size:12px;border-collapse:collapse;background:var(--surface)">
    <thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border)">
      <th style="padding:7px 8px">Descrição</th><th style="padding:7px 8px;text-align:right">Qtde</th><th style="padding:7px 8px;text-align:right">Vl. unit. est.</th><th style="padding:7px 8px">Fonte</th><th style="padding:7px 8px">Emenda</th><th style="padding:7px 8px">Processo</th><th style="padding:7px 8px">Unidade destino</th><th style="padding:7px 8px">Status</th><th style="padding:7px 8px">Contratado</th><th style="padding:7px 8px">Cadastrado</th><th style="padding:7px 8px">AF / saldo</th>
    </tr></thead><tbody>${rows.map(r=>`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px">${_sanEsc(r.descricao||'—')}</td>
      <td style="padding:6px 8px;text-align:right">${r.qtde??'—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">${r.valor_estimado?fmtFull(r.valor_estimado):'—'}</td>
      <td style="padding:6px 8px">${_itemFonteLabel(r.fonte_tipo)}${r.fonte_descricao?(' · '+_sanEsc(r.fonte_descricao)):''}</td>
      <td style="padding:6px 8px">${_sanEsc(r._emenda||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r._processo||'—')}</td>
      <td style="padding:6px 8px">${_sanEsc(r._unidade||'—')}</td>
      <td style="padding:6px 8px">${_itemStatusBadge(r.status)}</td>
      <td style="padding:6px 8px;white-space:nowrap">${r._fornecedor?_sanEsc(r._fornecedor):'—'}${r.valor_contratado?('<br><span style="color:var(--text3)">'+fmtFull(r.valor_contratado)+'</span>'):''}</td>
      <td style="padding:6px 8px;white-space:nowrap;color:var(--text3)">${r.created_at?new Date(r.created_at).toLocaleDateString('pt-BR'):'—'}</td>
      <td style="padding:6px 8px;white-space:nowrap">${_afCelula(r)}</td>
    </tr>`).join('')}</tbody></table>`;
}
// Fase 5/6 — resumo de AF e recebimento por item
let _afPorItem={}, _recebidoPorItem={};
async function _carregarAFsResumo(){
  _afPorItem={}; _recebidoPorItem={};
  const ids=itensRows.filter(r=>r.contrato_id).map(r=>r.id);
  if(!ids.length) return;
  const {data,error}=await sb.from('itens_entregas')
    .select('item_id,qtde_autorizada,qtde_recebida,status').in('item_id',ids);
  if(error){ console.warn('AF resumo:',error.message); return; }
  (data||[]).forEach(e=>{
    if((e.status||'')==='cancelada') return;
    _afPorItem[e.item_id]=(_afPorItem[e.item_id]||0)+(Number(e.qtde_autorizada)||0);
    _recebidoPorItem[e.item_id]=(_recebidoPorItem[e.item_id]||0)+(Number(e.qtde_recebida)||0);
  });
}
function _afSaldo(r){ return (Number(r.qtde)||0) - (Number(_afPorItem[r.id])||0); }
function _afCelula(r){
  if(!r.contrato_id) return '<span style="color:var(--text3)">—</span>';
  // Fase 11: subaba "Itens de Aquisições" é só rastreabilidade. AF/recebimento ficam em Controle de Entregas/Prazos.
  const aut=Number(_afPorItem[r.id])||0, rec=Number(_recebidoPorItem[r.id])||0, saldo=_afSaldo(r), saldoRec=(Number(r.qtde)||0)-rec;
  const resumo=aut>0?`<div style="font-size:11px;color:var(--text3)">autoriz. ${aut} · recebido ${rec} · saldo rec. ${saldoRec}</div><div style="font-size:11px;color:var(--text3)">saldo AF ${saldo}</div>`:`<div style="font-size:11px;color:var(--text3)">saldo ${saldo}</div>`;
  return resumo;
}
// Fase 5 — soma N dias a uma data ISO (yyyy-mm-dd) preservando data local
function _addDiasISO(iso,dias){
  if(!iso) return '';
  const p=iso.split('-'); if(p.length!==3) return '';
  const d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));
  d.setDate(d.getDate()+(Number(dias)||0));
  const mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function _afRecalcLimite(){
  const data=document.getElementById('af-data').value;
  const dias=document.getElementById('af-prazo-dias').value;
  if(data && dias!=='' && !isNaN(Number(dias))){
    document.getElementById('af-data-limite').value=_addDiasISO(data,dias);
  }else{
    document.getElementById('af-data-limite').value='';
  }
}
function _afSetMsg(txt,tipo='info'){
  const msg=document.getElementById('af-msg');
  if(!msg) return;
  msg.textContent=txt||'';
  msg.className='fmsg'+(tipo==='ok'?' ok':tipo==='err'?' err':'');
  msg.style.display=txt?'inline-block':'none';
  msg.style.color=tipo==='err'?'var(--red)':(tipo==='warn'?'var(--amber-text)':(tipo==='ok'?'var(--green-text)':'var(--text3)'));
}
function _afInvalid(id,txt){
  _afSetMsg(txt,'err');
  const el=document.getElementById(id);
  if(el) el.focus();
  return false;
}
async function _ataExecEmpenhoVinculado(exec){
  if(exec?.empenho && String(exec.empenho).trim()) return String(exec.empenho).trim();
  const emendaItemId=exec?.emenda_item_id||exec?._ataEmendaItemId||null;
  if(!emendaItemId) return '';
  const {data}=await sb.from('empenho_itens')
    .select('empenhos(numero,ano)')
    .eq('emenda_item_id',emendaItemId)
    .limit(1);
  const emp=data?.[0]?.empenhos;
  return emp?.numero ? `${emp.numero}${emp.ano?('/'+emp.ano):''}` : '';
}
async function _itemEmpenhoVinculado(row){
  if(row?.empenho && String(row.empenho).trim()) return String(row.empenho).trim();
  const vinc=await _itemEmpenhoVinculo(row);
  if(vinc.label) return vinc.label;
  return '';
}
async function _itemEmpenhoVinculo(row){
  if(row?.empenho && String(row.empenho).trim()) return {id:row.empenho_id||null, label:String(row.empenho).trim()};
  if(row?.item_id){
    const {data}=await sb.from('empenho_itens')
      .select('empenho_id, empenhos(id,numero,ano)')
      .eq('item_id',row.item_id)
      .limit(1);
    const vinc=data?.[0];
    const emp=vinc?.empenhos;
    if(emp?.numero) return {id:emp.id||vinc.empenho_id||null, label:`${emp.numero}${emp.ano?('/'+emp.ano):''}`};
  }
  if(row?.contrato_id){
    const {data}=await sb.from('empenhos')
      .select('id,numero,ano')
      .eq('contrato_id',row.contrato_id)
      .limit(1);
    const emp=data?.[0];
    if(emp?.numero) return {id:emp.id||null, label:`${emp.numero}${emp.ano?('/'+emp.ano):''}`};
  }
  return {id:null, label:''};
}
async function abrirModalAF(itemId, execId){
  if(bloquearSeVisualiz('itens')) return;
  const isAta=!!execId;
  let r, qtde=0, saldo=0, prazoItem=null, infoExtra='';
  if(isAta){
    // ── ATA: carrega da ata_execucao + atasItens ──
    const er=entregasRows.find(x=>String(x.exec_id)===String(execId)&&x.tipo==='ATA');
    let exec=er||null;
    if(!exec || !exec.ata_item_id || typeof exec.emenda_item_id==='undefined'){
      const {data}=await sb.from('atas_execucao').select('*').eq('id',execId).single();
      if(data) exec={...(exec||{}),...data};
    }
    if(!exec){ if(window.toast)toast('Solicitação de ATA não encontrada','error'); return; }
    const empAta=await _ataExecEmpenhoVinculado(exec);
    if(!empAta){
      if(window.toast) toast('Nenhum empenho vinculado. Vincule um empenho antes de emitir a AF.','error');
      return;
    }
    exec.empenho=exec.empenho||empAta;
    // busca prazo de entrega do item da ATA (múltiplas fontes)
    const ataId=exec.ata_item_id||er?.ata_item_id;
    let pa=Number(exec.prazo_entrega_dias||er?.prazo_entrega_dias)||0;
    if(ataId){
      // 1) cache atasItens
      const ai=atasItens.find(x=>String(x.id)===String(ataId));
      if(ai && !pa) pa=ai.prazo_entrega||0;
      // 2) query direta em atas_itens
      if(!pa){
        const {data:ait}=await sb.from('atas_itens').select('prazo_entrega,contrato_id,item,cpl,sim').eq('id',ataId).single();
        if(ait){ pa=ait.prazo_entrega||0; }
      }
      // 3) fallback: busca no itens original (origem='ata' vinculado ao ata_item_id)
      if(!pa){
        const {data:itf}=await sb.from('itens').select('prazo_entrega_dias').eq('ata_item_id',ataId).maybeSingle();
        if(itf) pa=itf.prazo_entrega_dias||0;
      }
    }
    prazoItem=pa;
    qtde=Number(exec.qtde)||0; saldo=qtde; // saldo = total (simplificado para ATA)
    const cpl=exec.cpl||er?.processo||'';
    const sim=exec.sim||er?.contrato||'';
    const itemNome=exec.item||er?.item||'';
    const und=exec.unidade||er?.unidade||'';
    infoExtra=`<b>${_sanEsc(itemNome||'—')}</b><br>CPL ${_sanEsc(cpl||'—')} · SIM ${_sanEsc(sim||'—')} · Unidade ${_sanEsc(und||'—')}`;
    r={id:null,descricao:itemNome,qtde:qtde,prazo_entrega_dias:pa,contrato_id:'ata',_processo:cpl,_fornecedor:'',_isAta:true};
    window._afItemCache={...r, _ataExecId:execId, _ataItemId:ataId, _ataEmendaItemId:exec.emenda_item_id||er?.emenda_item_id||null, _ataEmendaId:exec.emenda_id||er?.emenda_id||null};
    document.getElementById('af-item-id').value='';
    document.getElementById('af-exec-id').value=execId;
    document.getElementById('af-qtde-contratada').value=qtde;
    document.getElementById('af-ja-autorizado').value='0';
  }else{
    // ── Aquisição: comportamento original ──
    const entregaPendente=entregasRows.find(x=>String(x.item_id)===String(itemId));
    let it=itensRows.find(x=>String(x.id)===String(itemId));
    if(!it){
      const {data}=await sb.from('itens').select('id,descricao,qtde,prazo_entrega_dias,contrato_id,processos(identificador),fornecedores(razao_social)').eq('id',itemId).single();
      if(data) it={...data,_processo:data.processos?.identificador||'',_fornecedor:data.fornecedores?.razao_social||''};
    }
    if(!it){ if(window.toast)toast('Item não encontrado','error'); return; }
    if(!it.contrato_id){ if(window.toast)toast('Item ainda não está contratado','error'); return; }
    let temEmp=false;
    const {data:vinc}=await sb.from('empenho_itens').select('id').eq('item_id',itemId).limit(1);
    temEmp=!!(vinc&&vinc.length);
    if(!temEmp && it.contrato_id){ const {data:ec}=await sb.from('empenhos').select('id').eq('contrato_id',it.contrato_id).limit(1); temEmp=!!(ec&&ec.length); }
    if(!temEmp){ if(window.toast)toast('Vincule um empenho a este item (ou ao contrato) antes de emitir a AF.','error'); return; }
    const {data:afs,error}=await sb.from('itens_entregas').select('qtde_autorizada,status').eq('item_id',itemId);
    let aut=0; if(!error){(afs||[]).forEach(e=>{ if((e.status||'')!=='cancelada') aut+=(Number(e.qtde_autorizada)||0); });}
    qtde=Number(it.qtde)||0; saldo=qtde-aut;
    prazoItem=it.prazo_entrega_dias ?? entregaPendente?.prazo_entrega_dias ?? null;
    r=it;
    if((r.prazo_entrega_dias==null || r.prazo_entrega_dias==='') && prazoItem!=null && prazoItem!=='') r={...r,prazo_entrega_dias:prazoItem};
    window._afItemCache=r;
    document.getElementById('af-item-id').value=itemId;
    document.getElementById('af-exec-id').value='';
    infoExtra=`<b>${_sanEsc(r.descricao||'—')}</b><br>Processo ${_sanEsc(r._processo||'—')} · Fornecedor ${_sanEsc(r._fornecedor||'—')}`;
    document.getElementById('af-qtde-contratada').value=qtde;
    document.getElementById('af-ja-autorizado').value=aut;
  }
  document.getElementById('af-info').innerHTML=infoExtra;
  document.getElementById('af-saldo').value=saldo;
  document.getElementById('af-numero').value='';
  document.getElementById('af-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('af-qtde-autorizada').value=saldo>0?saldo:'';
  const temPrazo=prazoItem!=null && prazoItem!=='' && !isNaN(Number(prazoItem)) && Number(prazoItem)>0;
  const prazoInput=document.getElementById('af-prazo-dias');
  document.getElementById('af-prazo-dias').value=(temPrazo?Number(prazoItem):'');
  document.getElementById('af-obs').value='';
  const btnAF=document.getElementById('af-salvar');
  if(!temPrazo){
    _afSetMsg(isAta?'Prazo de entrega nao encontrado na ATA/licitacao. Cadastre o prazo na origem antes de emitir a AF.':'Prazo de entrega nao encontrado. Informe o numero de dias manualmente.','warn');
    if(prazoInput){
      prazoInput.readOnly=!!isAta;
      prazoInput.style.background=isAta?'var(--surface2)':'';
      prazoInput.style.opacity=isAta?'.85':'';
      prazoInput.placeholder=isAta?'sem prazo na origem':'ex: 30';
    }
    if(btnAF) btnAF.disabled=!!isAta;
  }else{
    _afSetMsg('');
    if(prazoInput){ prazoInput.readOnly=true; prazoInput.style.background='var(--surface2)'; prazoInput.style.opacity='.85'; }
    if(btnAF) btnAF.disabled=false;
  }
  _afRecalcLimite();
  document.getElementById('modal-af').classList.add('active');
}
// Transição automática do status do contrato de aquisição ("Aguardando emissão da AF" -> VIGENTE
// -> CONCLUIDO) é feita pelo trigger trg_itens_entregas_sync_contrato_status no banco (fonte única
// da verdade — ver supabase/migrations/20260703_trigger_status_contrato_aquisicao.sql). Aqui só
// recarregamos a aba de Contratos pra refletir o status já atualizado pelo trigger.
function _ctRecarregarAposEntrega(){
  if(typeof loadContratos==='function') loadContratos().catch(e=>console.error('reload contratos:',e));
}
let _salvarAFEmAndamento=false;
async function salvarAF(){
  if(_salvarAFEmAndamento) return;
  const btn=document.getElementById('af-salvar');
  _salvarAFEmAndamento=true;
  if(btn){ btn.disabled=true; btn.textContent='Emitindo...'; }
  try{
    await _salvarAFInterno();
  }finally{
    _salvarAFEmAndamento=false;
    if(btn){ btn.disabled=false; btn.textContent='Emitir AF'; }
  }
}
async function _salvarAFInterno(){
  if(bloquearSeVisualiz('itens')) return;
  const itemId=document.getElementById('af-item-id').value;
  const execId=document.getElementById('af-exec-id').value;
  const isAta=!!execId;
  const cache=window._afItemCache||null;
  const numero=document.getElementById('af-numero').value.trim();
  const afData=document.getElementById('af-data').value;
  const qtdeAut=Number(document.getElementById('af-qtde-autorizada').value);
  const prazo=document.getElementById('af-prazo-dias').value;
  const limite=document.getElementById('af-data-limite').value||null;
  const obs=document.getElementById('af-obs').value.trim()||null;
  if(!numero) return _afInvalid('af-numero','Informe o número da AF.');
  if(!afData) return _afInvalid('af-data','Informe a data da AF.');
  if(!qtdeAut||qtdeAut<=0) return _afInvalid('af-qtde-autorizada','Quantidade autorizada deve ser maior que zero.');
  if(prazo===''||isNaN(Number(prazo))) return _afInvalid('af-prazo-dias','Item sem prazo de entrega. Cadastre o prazo no item antes de emitir a AF.');
  if(!limite) return _afInvalid('af-data-limite','Data limite de entrega nao calculada. Verifique a data da AF e o prazo da origem.');
  _afSetMsg('Salvando...');
  if(isAta){
    const {data:execAtual}=await sb.from('atas_execucao').select('id,empenho,emenda_item_id').eq('id',execId).maybeSingle();
    const empAta=await _ataExecEmpenhoVinculado(execAtual||cache||{});
    if(!empAta){
      _afSetMsg('Nenhum empenho vinculado. Vincule um empenho antes de emitir a AF.','err');
      return;
    }
    // ── ATA: atualiza atas_execucao com dados da AF ──
    const {error}=await sb.from('atas_execucao').update({af_numero:numero, data_af:afData, prev_entrega:limite}).eq('id',execId);
    if(error){ _afSetMsg('Erro: '+error.message,'err'); return; }
    document.getElementById('modal-af').classList.remove('active');
    if(window.toast) toast('AF emitida','success');
    // Atualiza entregasRows in-loco: substituti o item ATA pendente
    const limISO=_toISODate(limite);
    const idx=entregasRows.findIndex(x=>x.tipo==='ATA'&&String(x.exec_id)===String(execId));
    if(idx>=0){
      const old=entregasRows[idx];
      entregasRows[idx]={...old, af_numero:numero, af_dataISO:_toISODate(afData),
        qtde:qtdeAut, saldo_af:qtdeAut, limiteISO:limISO,
        recebido:false, status:_prazoStatus(limISO,false,false),
        _ataPendenteAF:false, _afRecemEmitida:true};
    }
    renderItensEntregas();
    itensEntregasCarregado=false;
    // Write-back emenda_itens se houver vínculo
    if(cache?._ataExecId){
      let emendaItemId=cache?._ataEmendaItemId||entregasRows.find(x=>x.tipo==='ATA'&&String(x.exec_id)===String(execId))?.emenda_item_id||null;
      if(!emendaItemId){
        const {data:execRow}=await sb.from('atas_execucao').select('emenda_item_id').eq('id',execId).maybeSingle();
        emendaItemId=execRow?.emenda_item_id||null;
      }
      if(emendaItemId){
        const {error:wbErr}=await sb.from('emenda_itens').update({status:'AF EMITIDA - AGUARDANDO ENTREGA/CONFIRMACAO'}).eq('id',emendaItemId);
        if(wbErr) console.error('writeback emenda_itens ATA AF:',wbErr);
      }
      if(typeof loadData==='function') loadData().catch(e=>console.error(e));
    }
    try{ await loadItensEntregas(); }catch(e){ console.error(e); }
    return;
  }
  // ── Aquisição: comportamento existente ──
  const r=itensRows.find(x=>String(x.id)===String(itemId))||cache||null;
  const {data:afs}=await sb.from('itens_entregas').select('qtde_autorizada,status').eq('item_id',itemId);
  let aut=0;(afs||[]).forEach(e=>{ if((e.status||'')!=='cancelada') aut+=(Number(e.qtde_autorizada)||0); });
  const saldo=(Number(r?.qtde)||0)-aut;
  if(qtdeAut>saldo){ _afSetMsg(`Quantidade autorizada (${qtdeAut}) excede o saldo a autorizar (${saldo}).`,'err'); return; }
  const empVinc=await _itemEmpenhoVinculo({item_id:itemId, contrato_id:r?.contrato_id, empenho:r?.empenho, empenho_id:r?.empenho_id});
  const reg={ item_id:itemId, af_numero:numero, af_data:afData, qtde_autorizada:qtdeAut,
    data_limite_entrega:limite, af_obs:obs, status:'af_emitida',
    empenho_id:empVinc.id||null, empenho:empVinc.label||null };
  const {data:inserted,error}=await sb.from('itens_entregas').insert(reg).select('id');
  if(error){ _afSetMsg('Erro: '+error.message,'err'); return; }
  const entregaId=inserted?.[0]?.id;
  if(prazo!=='' && !isNaN(Number(prazo)) && Number(prazo)!==Number(r?.prazo_entrega_dias)){
    await sb.from('itens').update({prazo_entrega_dias:Number(prazo)}).eq('id',itemId);
  }
  document.getElementById('modal-af').classList.remove('active');
  if(window.toast) toast('AF emitida','success');
  // Atualização in-loco em entregasRows — NÃO depende de reload do Supabase.
  const limISO=_toISODate(limite), itC=r||{};
  const rowAF={tipo:'Aquisição',entrega_id:entregaId,item_id:itemId,
    processo:itC.processos?.identificador||itC._processo||'',processo_id:itC.processo_id||null,
    contrato:'',contrato_id:itC.contrato_id||null,
    fornecedor_id:itC.fornecedor_id||null,empresa:itC.fornecedores?.razao_social||itC._fornecedor||'',
    item:itC.descricao||'',unidade:itC.unidades?.nome||'',
    af_numero:numero,af_dataISO:_toISODate(afData),
    qtde:qtdeAut,qtde_recebida:0,saldo_af:qtdeAut,
    limiteISO:limISO,recebido:false,cancelado:false,
    status:_prazoStatus(limISO,false,false),
    empenho_id:empVinc.id||null,empenho:empVinc.label||'',nota_fiscal:'',_afRecemEmitida:true};
  const idxP=entregasRows.findIndex(x=>x._pendente&&String(x.item_id)===String(itemId));
  if(idxP>=0) entregasRows.splice(idxP,1,rowAF); else entregasRows.unshift(rowAF);
  renderItensEntregas();
  itensEntregasCarregado=false; confirmacoesCarregado=false;
  setTimeout(()=>{ loadItensEntregas().catch(e=>console.error('bg entregas:',e)); },2000);
  loadConfirmacoes().catch(e=>console.error('bg conf:',e));
  loadItens().catch(e=>console.error('bg itens:',e));
  if(itC.contrato_id) _ctRecarregarAposEntrega();
}

// ═══ Fase 11: vincular empenho ao item (Controle de Entregas/Prazos) ═══
let _veEmpenhos=[];
let _veContext={tipo:'item', itemId:null, execId:null, exec:null};
function _veAtaSingle(chk){ document.querySelectorAll('#ve-lista .ve-chk').forEach(c=>{ if(c!==chk) c.checked=false; }); }
function _veFiltrarEmpenhos(){
  const q=(document.getElementById('ve-busca')?.value||'').toLowerCase();
  document.querySelectorAll('#ve-lista tr[data-emp]').forEach(tr=>{
    tr.style.display=(!q||String(tr.dataset.search||'').includes(q))?'':'none';
  });
}
async function abrirVincularEmpenho(itemId, execId){
  if(bloquearSeVisualiz('itens')) return;
  const isAta=!!execId;
  _veContext={tipo:isAta?'ata':'item', itemId:itemId||null, execId:execId||null, exec:null};
  document.getElementById('ve-item-id').value=itemId||'';
  document.getElementById('ve-msg').textContent='';
  const lista=document.getElementById('ve-lista'); lista.innerHTML='<span class="spinner"></span> carregando...';
  let it=null, prev={};
  if(isAta){
    const {data:ex,error:exErr}=await sb.from('atas_execucao').select('id,ata_item_id,emenda_id,emenda_item_id,item,unidade,qtde,valor,empenho,cpl,sim').eq('id',execId).single();
    if(exErr||!ex){ lista.innerHTML='<div style="color:var(--red)">Execução de ATA não encontrada.</div>'; document.getElementById('modal-vincular-empenho').classList.add('active'); return; }
    _veContext.exec=ex;
    let ai={};
    if(ex.ata_item_id){
      const {data:ait}=await sb.from('atas_itens').select('contrato_id,item,cpl,sim,empresa,contratos(cpl,numero_contrato)').eq('id',ex.ata_item_id).maybeSingle();
      ai=ait||{};
    }
    it={id:null,descricao:ex.item||ai.item||'item da ATA',qtde:ex.qtde,contrato_id:ai.contrato_id||null,emenda_id:ex.emenda_id||null,emenda_item_id:ex.emenda_item_id||null,processos:{identificador:ex.cpl||ai.cpl||''}};
    if(ex.emenda_item_id){
      const {data:jaAta}=await sb.from('empenho_itens').select('empenho_id,quantidade_vinculada,valor_vinculado').eq('emenda_item_id',ex.emenda_item_id).limit(1);
      prev=Object.fromEntries((jaAta||[]).map(x=>[String(x.empenho_id),x]));
    }
    document.getElementById('ve-info').innerHTML=`<b>${_sanEsc(it.descricao)}</b> · ATA · qtde ${it.qtde??'—'} · ${_sanEsc(ex.sim||ai.sim||ai.contratos?.numero_contrato||'')}`;
  }else{
    const {data}=await sb.from('itens').select('id,descricao,qtde,contrato_id,emenda_id,processos(identificador)').eq('id',itemId).single();
    it=data;
    document.getElementById('ve-info').innerHTML=`<b>${_sanEsc(it?.descricao||'item')}</b> · qtde ${it?.qtde??'—'} · ${_sanEsc(it?.processos?.identificador||'')}`;
    const {data:ja}=await sb.from('empenho_itens').select('empenho_id,quantidade_vinculada,valor_vinculado').eq('item_id',itemId);
    prev=Object.fromEntries((ja||[]).map(x=>[String(x.empenho_id),x]));
  }
  // empenhos compatíveis: do mesmo contrato ou ainda sem contrato
  let qb=sb.from('empenhos').select('id,numero,ano,valor_empenhado,saldo_empenho,contrato_id').order('created_at',{ascending:false});
  const {data:emps}=await qb;
  _veEmpenhos=(emps||[]).filter(e=>!e.contrato_id || String(e.contrato_id)===String(it?.contrato_id));
  if(!_veEmpenhos.length){ lista.innerHTML='<div style="color:var(--text3)">Nenhum empenho compatível. Cadastre na aba <b>Empenhos</b> (vinculando ao contrato deste item).</div>'; document.getElementById('modal-vincular-empenho').classList.add('active'); return; }
  const inp='font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
  lista.innerHTML=`<input type="text" id="ve-busca" placeholder="Pesquisar empenho..." oninput="_veFiltrarEmpenhos()" style="width:100%;margin-bottom:8px;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)">
  <table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--text2);text-align:left;font-size:11px">
    <th style="padding:4px 6px"></th><th style="padding:4px 6px">Empenho</th><th style="padding:4px 6px;text-align:right">Saldo</th><th style="padding:4px 6px;width:90px">Qtde</th><th style="padding:4px 6px;width:120px">Valor</th></tr></thead><tbody>${
    _veEmpenhos.map(e=>{const p=prev[String(e.id)]; const qAta=isAta?(it.qtde??''):''; const vAta=isAta?(_veContext.exec?.valor??''):''; const search=[e.numero,e.ano,e.valor_empenhado,e.saldo_empenho].filter(Boolean).join(' ').toLowerCase(); return `<tr data-emp="${e.id}" data-search="${_sanEsc(search)}" style="border-top:1px solid var(--border)">
      <td style="padding:4px 6px"><input type="checkbox" class="ve-chk" ${p?'checked':''} ${isAta?'onchange="_veAtaSingle(this)"':''}></td>
      <td style="padding:4px 6px">${_sanEsc(e.numero)}${e.ano?('/'+e.ano):''}</td>
      <td style="padding:4px 6px;text-align:right;white-space:nowrap">${fmtFull(e.saldo_empenho!=null?e.saldo_empenho:e.valor_empenhado)}</td>
      <td style="padding:4px 6px"><input type="number" class="ve-q" min="0" step="any" ${isAta?'readonly':''} value="${p?.quantidade_vinculada??qAta}" style="width:100%;${inp}${isAta?'background:var(--surface2);color:var(--text3);':''}"></td>
      <td style="padding:4px 6px"><input type="number" class="ve-v" min="0" step="any" ${isAta?'readonly':''} value="${p?.valor_vinculado??vAta}" style="width:100%;${inp}${isAta?'background:var(--surface2);color:var(--text3);':''}"></td>
    </tr>`;}).join('')}</tbody></table>`;
  document.getElementById('modal-vincular-empenho').classList.add('active');
}
async function salvarVincularEmpenho(){
  if(bloquearSeVisualiz('itens')) return;
  const itemId=document.getElementById('ve-item-id').value;
  const msg=document.getElementById('ve-msg'); msg.className='fmsg';
  const isAta=_veContext.tipo==='ata';
  const selected=[];
  document.querySelectorAll('#ve-lista tr[data-emp]').forEach(tr=>{
    if(!tr.querySelector('.ve-chk')?.checked) return;
    const q=Number(String(tr.querySelector('.ve-q').value).replace(',','.'))||null;
    const v=Number(String(tr.querySelector('.ve-v').value).replace(',','.'))||null;
    selected.push({empenho_id:tr.dataset.emp, quantidade_vinculada:q, valor_vinculado:v});
  });
  if(isAta){
    if(!selected.length){ msg.textContent='Selecione um empenho para vincular.'; msg.classList.add('err'); return; }
    const btn=document.getElementById('ve-salvar'); btn.disabled=true;
    const ex=_veContext.exec||{};
    const emp=_veEmpenhos.find(e=>String(e.id)===String(selected[0].empenho_id));
    const empTexto=emp?`${emp.numero}${emp.ano?('/'+emp.ano):''}`:'';
    const {error:upErr}=await sb.from('atas_execucao').update({empenho:empTexto}).eq('id',_veContext.execId);
    if(upErr){ btn.disabled=false; msg.textContent='Erro: '+upErr.message; msg.classList.add('err'); return; }
    if(ex.emenda_item_id){
      const {data:antVinc}=await sb.from('empenho_itens').select('id,empenho_id').eq('emenda_item_id',ex.emenda_item_id);
      const vinc={empenho_id:selected[0].empenho_id,item_id:null,emenda_id:ex.emenda_id||null,emenda_item_id:ex.emenda_item_id,quantidade_vinculada:selected[0].quantidade_vinculada||ex.qtde||null,valor_vinculado:selected[0].valor_vinculado||ex.valor||null};
      const ins=await sb.from('empenho_itens').insert(vinc).select('id').single();
      if(ins.error) console.error('vinculo empenho_itens ATA:',ins.error);
      else if(antVinc?.length){
        await sb.from('empenho_itens').delete().in('id',antVinc.map(x=>x.id));
        for(const old of [...new Set(antVinc.map(x=>String(x.empenho_id)).filter(x=>x&&x!==String(selected[0].empenho_id)))]) await _recalcularSaldoEmpenho(old);
      }
    }
    await _recalcularSaldoEmpenho(selected[0].empenho_id);
    btn.disabled=false;
    if(window.toast) toast('Empenho vinculado à ATA.','success');
    document.getElementById('modal-vincular-empenho').classList.remove('active');
    itensEntregasCarregado=false;
    if(empenhosCarregado) loadEmpenhos();
    if(document.getElementById('itens-sub-entregas')?.style.display!=='none') loadItensEntregas();
    if(typeof loadData==='function') loadData().catch(e=>console.error(e));
    return;
  }
  const {data:it}=await sb.from('itens').select('emenda_id').eq('id',itemId).single();
  const novos=selected.map(x=>({empenho_id:x.empenho_id, item_id:itemId, emenda_id:it?.emenda_id||null, quantidade_vinculada:x.quantidade_vinculada, valor_vinculado:x.valor_vinculado}));
  const btn=document.getElementById('ve-salvar'); btn.disabled=true;
  // empenhos afetados (antigos + novos) p/ recálculo de saldo
  const {data:ant}=await sb.from('empenho_itens').select('empenho_id').eq('item_id',itemId);
  const afetados=new Set([...(ant||[]).map(x=>String(x.empenho_id)), ...novos.map(x=>String(x.empenho_id))]);
  await sb.from('empenho_itens').delete().eq('item_id',itemId);
  if(novos.length){ const r=await sb.from('empenho_itens').insert(novos); if(r.error){ btn.disabled=false; msg.textContent='Erro: '+r.error.message; msg.classList.add('err'); return; } }
  // recalcula saldo de cada empenho afetado
  for(const eid of afetados){
    const {data:e}=await sb.from('empenhos').select('valor_empenhado,valor_anulado').eq('id',eid).single();
    const {data:lis}=await sb.from('empenho_itens').select('valor_vinculado').eq('empenho_id',eid);
    const vinc=(lis||[]).reduce((s,x)=>s+(Number(x.valor_vinculado)||0),0);
    await sb.from('empenhos').update({saldo_empenho:(Number(e?.valor_empenhado)||0)-(Number(e?.valor_anulado)||0)-vinc}).eq('id',eid);
  }
  btn.disabled=false;
  if(window.toast) toast('Empenho(s) vinculado(s).','success');
  document.getElementById('modal-vincular-empenho').classList.remove('active');
  if(empenhosCarregado) loadEmpenhos();
  itensEntregasCarregado=false;
  if(document.getElementById('itens-sub-entregas')?.style.display!=='none') loadItensEntregas();
}

// ═══ Fase 11: advertência/sanção para itens de aquisição (migrada da aba ATAs) ═══
let _sancaoAquisicaoRow=null, _sancaoAquisicaoContrato=null;
function gerarSancaoDoc(){ return _ceAdvAtivo ? gerarAdvertenciaCE() : (_sancaoAquisicaoRow ? gerarAdvertenciaAquisicao() : gerarSolicitacaoSancaoAta()); }
async function abrirAdvertenciaAquisicao(entregaId){
  if(bloquearSeVisualiz('itens')) return;
  _ceAdvAtivo=false;
  const row=entregasRows.find(r=>String(r.entrega_id)===String(entregaId)); if(!row){ if(window.toast)toast('Registro não encontrado','error'); return; }
  let c={}; if(row.contrato_id){ const {data}=await sb.from('contratos').select('id,numero_contrato,cnpj,objeto').eq('id',row.contrato_id).single(); c=data||{}; }
  _sancaoAquisicaoRow=row; _sancaoAquisicaoContrato=c;
  const modal=document.getElementById('modal-solicitar-sancao'); document.body.appendChild(modal);
  const numero=c.numero_contrato||row.contrato||'—';
  document.getElementById('sancao-contrato-info').innerHTML=`<strong>Processo/CPL:</strong> ${_sanEsc(row.processo||'—')} &nbsp;·&nbsp; <strong>Contrato:</strong> ${_sanEsc(numero)}<br><strong>Empresa:</strong> ${_sanEsc(row.empresa||'—')} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||'—')}<br><strong>Objeto:</strong> ${_sanEsc(c.objeto||row.item||'—')}`;
  document.querySelectorAll('input[name="sancao-tipo"]').forEach(el=>el.checked=false);
  const mot=document.querySelector('input[name="sancao-motivo"][value="Atraso na entrega"]'); if(mot) mot.checked=true;
  ['sancao-motivo-livre','sancao-clausula','sancao-artigo','sancao-percentual'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  const d=_diasRestantes(row.limiteISO);
  document.getElementById('sancao-dias').value=(d!=null&&d<0)?Math.abs(d):'';
  document.getElementById('sancao-itens-modal').innerHTML=`<div style="padding:8px 10px;font-size:12px"><strong>${_sanEsc(row.item)}</strong> · ${_sanEsc(row.unidade||'—')}<br><span style="color:var(--text3)">Qtde: ${row.qtde||'—'} · AF: ${_sanEsc(row.af_numero||'—')} · Empenho: ${_sanEsc(row.empenho||'—')} · Limite: ${row.limiteISO?fmtDate(row.limiteISO):'—'}</span></div>`;
  const msg=document.getElementById('sancao-doc-msg'); msg.className='fmsg'; msg.textContent='';
  atualizarCamposSancao();
  modal.classList.add('active');
}
async function gerarAdvertenciaAquisicao(){
  if(bloquearSeVisualiz('itens')) return;
  const row=_sancaoAquisicaoRow, c=_sancaoAquisicaoContrato||{};
  const tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||'';
  const motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||'';
  const motivoLivre=document.getElementById('sancao-motivo-livre').value.trim();
  const clausula=document.getElementById('sancao-clausula').value.trim();
  const artigo=document.getElementById('sancao-artigo').value.trim();
  const percentualRaw=document.getElementById('sancao-percentual').value;
  const diasRaw=document.getElementById('sancao-dias').value;
  const msg=document.getElementById('sancao-doc-msg');
  if(!row){ msg.textContent='Registro não encontrado.'; msg.className='fmsg err'; return; }
  if(!tipo||!motivo){ msg.textContent='Escolha o tipo e o motivo da sanção.'; msg.className='fmsg err'; return; }
  if(motivo==='Outro motivo'&&!motivoLivre){ msg.textContent='Descreva o outro motivo.'; msg.className='fmsg err'; return; }
  const janela=window.open('','_blank'); if(!janela){ msg.textContent='Permita pop-ups e tente novamente.'; msg.className='fmsg err'; return; }
  janela.document.write('<!doctype html><meta charset="utf-8"><p style="font-family:Arial;padding:24px">Registrando solicitação...</p>');
  const btn=document.getElementById('btn-confirmar-sancao'); btn.disabled=true; btn.textContent='Registrando...';
  const numero=c.numero_contrato||row.contrato||'—';
  const snapshot={artigo_adicional:artigo||null,itens:[{id:row.entrega_id,cpl:row.processo,sim:numero,item:row.item,unidade:row.unidade,qtde:row.qtde,vl_unitario:null,vl_total:row.valor_item||null,empenho:row.empenho,data_af:row.af_dataISO,prev_entrega:row.limiteISO,dt_entrega:row.data_recebimentoISO}]};
  const registro={cpl_contrato:row.processo,contrato_id:c.id||row.contrato_id||null,empresa:row.empresa,tipo_sancao:tipo,motivo,motivo_livre:motivo==='Outro motivo'?motivoLivre:null,clausula_contratual:clausula||null,percentual_multa:tipo==='Multa'&&percentualRaw!==''?Number(percentualRaw):null,dias_atraso:diasRaw!==''?Number(diasRaw):null,itens_ids:JSON.stringify([row.entrega_id]),itens_json:JSON.stringify(snapshot),solicitado_por:currentProfile?.nome||currentProfile?.email||'Usuário do sistema',gerado_em:new Date().toISOString().slice(0,10)};
  const {data:_san,error}=await sb.from('sancoes_solicitadas').insert(registro).select().single();
  btn.disabled=false; btn.textContent='Gerar documento';
  if(error){ janela.close(); msg.textContent='Erro ao registrar: '+error.message; msg.className='fmsg err'; return; }
  if(_san) await sb.from('sancao_itens').insert(snapshot.itens.map(it=>({sancao_id:_san.id,ref_origem:String(it.id),descricao:it.item,cpl:it.cpl,sim:it.sim,unidade:it.unidade,qtde:it.qtde,vl_unitario:it.vl_unitario,vl_total:it.vl_total,empenho:it.empenho,data_af:it.data_af,prev_entrega:it.prev_entrega,dt_entrega:it.dt_entrega})));
  const incisos={'Advertência':'I','Multa':'II','Impedimento de licitar e contratar':'III','Declaração de inidoneidade':'IV'};
  const hoje=new Date().toLocaleDateString('pt-BR');
  const dias=_diasRestantes(row.limiteISO);
  const fundamento=motivo==='Atraso na entrega'?'ao ensejar o retardamento da entrega do objeto contratual sem motivo justificado':_sanEsc(motivoLivre);
  const linha=`<tr><td>1</td><td><strong>${_sanEsc(row.processo||'—')}</strong><br>${_sanEsc(row.empresa||'—')}</td><td>${_sanEsc(row.item||'—')}</td><td>${_sanEsc(row.unidade||'—')}</td><td>${row.qtde||'—'}</td><td>${_sanEsc(row.empenho||'—')}</td><td>${(dias!=null&&dias<0)?Math.abs(dias)+' dias de atraso':'Aguardando entrega'}</td></tr>`;
  janela.document.open();
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Sanção - ${_sanEsc(row.processo||'')}</title><link rel="stylesheet" href="css/print-sancao.css"></head><body><header><strong>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO ADMINISTRATIVA</h1><p>Gerado em ${hoje}</p></header><div class="ident"><div>Processo/CPL: <strong>${_sanEsc(row.processo||'—')}</strong></div><div>Contrato nº: <strong>${_sanEsc(numero)}</strong></div><div>Empresa contratada: <strong>${_sanEsc(row.empresa||'—')}</strong></div><div>CNPJ: ${_sanEsc(c.cnpj||'—')}</div><div>Objeto: ${_sanEsc(c.objeto||row.item||'—')}</div></div><h2>Fundamentação legal</h2><p class="corpo">A contratada incorreu na infração prevista no art. 155, inciso VII, da Lei nº 14.133/2021, ${fundamento}, sujeitando-se às sanções previstas no art. 156, inciso ${incisos[tipo]||''} da mesma Lei. ${clausula?`Ademais, a conduta viola a ${_sanEsc(clausula)} do instrumento contratual.`:''} ${artigo?_sanEsc(artigo)+'.':''}</p><h2>Item relacionado</h2><table><thead><tr><th>#</th><th>Processo / Empresa</th><th>Item</th><th>Unidade</th><th>Qtde</th><th>Empenho</th><th>Situação</th></tr></thead><tbody>${linha}</tbody></table><h2>Solicitação</h2><p class="corpo">Diante do exposto, solicita-se a instauração de processo administrativo sancionador e aplicação de <strong>${_sanEsc(tipo.toUpperCase())}</strong> à empresa <strong>${_sanEsc(row.empresa||'—')}</strong>, garantidos o contraditório e a ampla defesa, nos termos do art. 157 da Lei nº 14.133/2021.</p>${tipo==='Multa'&&percentualRaw!==''?`<p class="corpo">A multa sugerida é de <strong>${_sanEsc(percentualRaw)}% ao dia de atraso</strong> sobre o valor do item em atraso.</p>`:''}<div class="assinatura"><strong>${_sanEsc(registro.solicitado_por)}</strong><br>Secretaria da Saúde - Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);
  janela.document.close();
  document.getElementById('modal-solicitar-sancao').classList.remove('active');
  _sancaoAquisicaoRow=null; _sancaoAquisicaoContrato=null;
}

// ───────── Fase 5 — Controle de Entregas / Prazos (aquisições + atas) ─────────
let entregasRows=[], itensEntregasCarregado=false;
function _toISODate(s){
  if(!s) return '';
  s=String(s).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){ let y=m[3]; if(y.length===2) y='20'+y; return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
  return '';
}
function _unidadeFisicaTemId(u){
  return !!String(u?.patrimonio||u?.numero_serie||'').trim();
}
function _unidadeFisicaLabel(u){
  const p=String(u?.patrimonio||'').trim();
  const s=String(u?.numero_serie||'').trim();
  if(p&&s) return `${p} (serie ${s})`;
  return p||s||'';
}
function _chunkArray(arr,tam){
  const out=[];
  for(let i=0;i<(arr||[]).length;i+=tam) out.push(arr.slice(i,i+tam));
  return out;
}
function _diasRestantes(iso){
  if(!iso) return null;
  const p=iso.split('-'); if(p.length!==3) return null;
  const d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));
  const t=new Date(); const today=new Date(t.getFullYear(),t.getMonth(),t.getDate());
  return Math.round((d-today)/86400000);
}
function _prazoStatus(limiteISO,recebido,cancelado){
  if(cancelado) return 'cancelado';
  if(recebido) return 'recebido';
  if(!limiteISO) return 'sem prazo';
  const d=_diasRestantes(limiteISO);
  if(d===null) return 'sem prazo';
  if(d>0) return 'no prazo';
  if(d===0) return 'vence hoje';
  return 'atrasado';
}
function _prazoBadge(status,dias){
  const map={'sem prazo':'#888780','no prazo':'#3FB950','vence hoje':'#EF9F27','atrasado':'#F85149','recebido':'#378ADD','cancelado':'#888780','aguardando AF':'#EF9F27'};
  const cor=map[status]||'#888780';
  let extra='';
  if(status==='no prazo'&&dias!=null) extra=` · ${dias}d`;
  else if(status==='atrasado'&&dias!=null) extra=` · ${Math.abs(dias)}d`;
  return `<span class="badge" style="background:${cor}22;color:${cor};white-space:nowrap">${status}${extra}</span>`;
}
async function loadItensEntregas(){
  if(!userCanView('itens')&&!_isAdmin()) return;
  const wrap=document.getElementById('entregas-wrap'); if(!wrap) return;
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando controle de prazos...</div>';
  const out=[];
  // Aquisições: itens_entregas + item + processo/contrato/fornecedor/unidade/documentos
  const {data:aq,error:e1}=await sb.from('itens_entregas')
    .select('*, empenhos(numero), notas_fiscais(numero,data_emissao,valor_total), itens(id,descricao,qtde,valor_estimado,valor_contratado,marca,modelo,processo_id,contrato_id,fornecedor_id,fonte_tipo,fonte_descricao,emenda_id,emenda_item_id,processos(identificador),contratos(cpl,numero_contrato),fornecedores(razao_social),unidades(nome))')
    .order('af_data',{ascending:false});
  if(e1){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro (aquisições): '+_sanEsc(e1.message)+'</div>'; return; }
  const {data:aqBase,error:e1b}=await sb.from('itens_entregas')
    .select('id,item_id,af_numero,af_data,qtde_autorizada,qtde_recebida,status,data_limite_entrega,data_recebimento,recebido_por,recebimento_tipo,possui_patrimonio,patrimonio,numero_serie,empenho_id,empenho,nota_fiscal_id,nota_fiscal,nf_data')
    .order('af_data',{ascending:false});
  if(e1b) console.warn('AF base:',e1b.message);
  const aqCalc=(!e1b&&Array.isArray(aqBase))?aqBase:(aq||[]);
  const empAqPorItem={};
  const aqItemIds=[...new Set([...(aqCalc||[]),(aq||[])].map(r=>r.item_id||r.itens?.id).filter(Boolean))];
  if(aqItemIds.length){
    const {data:eiAq}=await sb.from('empenho_itens')
      .select('item_id,empenho_id,empenhos(id,numero,ano)')
      .in('item_id',aqItemIds);
    (eiAq||[]).forEach(v=>{
      if(!v.item_id || empAqPorItem[String(v.item_id)]) return;
      const emp=v.empenhos;
      if(emp?.numero) empAqPorItem[String(v.item_id)]={id:emp.id||v.empenho_id||null,label:`${emp.numero}${emp.ano?('/'+emp.ano):''}`};
    });
  }
  const recebidoPorItem={};
  (aqCalc||[]).forEach(r=>{
    if((r.status||'')==='cancelada') return;
    recebidoPorItem[r.item_id]=(recebidoPorItem[r.item_id]||0)+(Number(r.qtde_recebida)||0);
  });
  const aqDetalhadaIds=new Set();
  (aq||[]).forEach(r=>{
    const it=r.itens||{};
    if(!it.id) return;
    aqDetalhadaIds.add(String(r.id));
    const cancelado=(r.status||'')==='cancelada';
    const recebido=!cancelado && ((Number(r.qtde_recebida)||0)>0 || !!r.data_recebimento);
    const limiteISO=_toISODate(r.data_limite_entrega);
    const qtdeAut=Number(r.qtde_autorizada)||0;
    const qtdeRec=Number(r.qtde_recebida)||0;
    const saldoAf=qtdeAut-qtdeRec;
    const itemQtde=Number(it.qtde)||0;
    const saldoItem=itemQtde-(Number(recebidoPorItem[r.item_id])||0);
    out.push({
      tipo:'Aquisição', entrega_id:r.id, item_id:r.item_id,
      processo:it.processos?.identificador||'', processo_id:it.processo_id||null,
      contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
      contrato_id:it.contrato_id||null, fornecedor_id:it.fornecedor_id||null,
      fonte_tipo:it.fonte_tipo||'', fonte_descricao:it.fonte_descricao||'',
      emenda_id:it.emenda_id||null, emenda_item_id:it.emenda_item_id||null,
      empresa:it.fornecedores?.razao_social||'', item:it.descricao||'',
      marca:it.marca||'', modelo:it.modelo||'',
      numero_serie:r.numero_serie||'',
      unidade:it.unidades?.nome||'', af_numero:r.af_numero||'',
      af_dataISO:_toISODate(r.af_data), qtde:qtdeAut, qtde_recebida:qtdeRec,
      saldo_af:saldoAf, saldo_item:saldoItem, limiteISO, recebido, cancelado,
      data_recebimentoISO:_toISODate(r.data_recebimento), recebido_por:r.recebido_por||'',
      recebimento_tipo:r.recebimento_tipo||'', possui_patrimonio:r.possui_patrimonio, patrimonio:r.patrimonio||'',
      empenho_id:r.empenho_id||empAqPorItem[String(r.item_id)]?.id||null, empenho:r.empenhos?.numero||r.empenho||empAqPorItem[String(r.item_id)]?.label||'',
      nota_fiscal_id:r.nota_fiscal_id||null, nota_fiscal:r.notas_fiscais?.numero||r.nota_fiscal||'',
      nf_dataISO:_toISODate(r.notas_fiscais?.data_emissao||r.nf_data),
      valor_item:Number(it.valor_contratado)||Number(it.valor_estimado)||0,
      status:_prazoStatus(limiteISO,recebido,cancelado)
    });
  });
  // Atas: atas_execucao. Enriquece com atas_itens; se o cache estiver parcial, busca os IDs faltantes.
  const {data:at,error:e2}=await sb.from('atas_execucao').select('*');
  if(e2){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro (atas): '+_sanEsc(e2.message)+'</div>'; return; }
  let _ataItemPorId={};
  if(atasItens&&atasItens.length) _ataItemPorId=Object.fromEntries(atasItens.map(i=>[String(i.id),i]));
  if(at&&at.length){
    const ids=[...new Set(at.map(r=>r.ata_item_id).filter(Boolean).map(String))]
      .filter(id=>!_ataItemPorId[id]);
    if(ids.length){
      const {data:ait}=await sb.from('atas_itens').select('id,cpl,sim,item,marca_modelo,empresa,status_contrato,prazo_entrega,contrato_id,valor_unit,contratos(cpl,numero_contrato,prestador,status)').in('id',ids);
      (ait||[]).forEach(i=>{ _ataItemPorId[String(i.id)]={cpl:i.cpl||i.contratos?.cpl||'',sim:i.sim||i.contratos?.numero_contrato||'',item:i.item||'',marca:i.marca_modelo||'',empresa:i.empresa||i.contratos?.prestador||'',status:i.contratos?.status||i.status_contrato||'',prazo_entrega:i.prazo_entrega||null,contrato_id:i.contrato_id||null,valor_unit:i.valor_unit||null}; });
    }
  }
  const _empAtaPorEmendaItem={};
  const _ataEmendaItemIds=[...new Set((at||[]).map(r=>r.emenda_item_id).filter(Boolean))];
  if(_ataEmendaItemIds.length){
    const {data:vAta}=await sb.from('empenho_itens').select('emenda_item_id,empenhos(numero,ano)').in('emenda_item_id',_ataEmendaItemIds);
    (vAta||[]).forEach(v=>{
      const emp=v.empenhos;
      if(emp?.numero) _empAtaPorEmendaItem[String(v.emenda_item_id)]=`${emp.numero}${emp.ano?('/'+emp.ano):''}`;
    });
  }
  const _emendaInfoPorId={};
  if(_ataEmendaItemIds.length){
    const {data:emInfo}=await sb.from('emenda_itens').select('id,empenho,nota_fiscal,patrimonio').in('id',_ataEmendaItemIds);
    (emInfo||[]).forEach(e=>{ _emendaInfoPorId[String(e.id)]=e; });
  }
  const _ataUnidadesPorExec={};
  const _ataExecIds=[...new Set((at||[]).map(r=>r.id).filter(Boolean))];
  for(const ids of _chunkArray(_ataExecIds,200)){
    const {data:unsAta}=await sb.from('atas_execucao_unidades')
      .select('exec_id,patrimonio,numero_serie,unidade_seq')
      .in('exec_id',ids)
      .order('unidade_seq',{ascending:true});
    (unsAta||[]).forEach(u=>{ (_ataUnidadesPorExec[String(u.exec_id)]=_ataUnidadesPorExec[String(u.exec_id)]||[]).push(u); });
  }
  (at||[]).forEach(r=>{
    const recebido=!!(r.dt_entrega && String(r.dt_entrega).trim());
    const limiteISO=_toISODate(r.prev_entrega);
    const temAF=!!(r.data_af && String(r.data_af).trim());
    const pendenteAF=!temAF && !recebido;
    const ai=_ataItemPorId[String(r.ata_item_id)]||{};
    if(String(ai.status||'').toUpperCase().startsWith('ENCERRAD')) return;
    const emInfo=_emendaInfoPorId[String(r.emenda_item_id||'')]||{};
    const empAta=(r.empenho&&String(r.empenho).trim())||_empAtaPorEmendaItem[String(r.emenda_item_id||'')]||emInfo.empenho||'';
    const unidadesAta=_ataUnidadesPorExec[String(r.id)]||[];
    const patrimonioAta=unidadesAta.map(_unidadeFisicaLabel).filter(Boolean).join('; ');
    const seriesAta=[...new Set(unidadesAta.map(u=>String(u.numero_serie||'').trim()).filter(Boolean))].join('; ');
    out.push({
      tipo:'ATA', exec_id:r.id, ata_item_id:r.ata_item_id||null, emenda_id:r.emenda_id||null, emenda_item_id:r.emenda_item_id||null, processo:r.cpl||ai.cpl||'', contrato:r.sim||ai.sim||'', contrato_id:ai.contrato_id||null,
      empresa:ai.empresa||'', item:r.item||ai.item||'', marca:ai.marca||'', modelo:'', unidade:r.unidade||'', af_numero:r.af_numero||'', empenho:empAta,
      af_dataISO:_toISODate(r.data_af), qtde:r.qtde,
      limiteISO, recebido, cancelado:false, entregaISO:_toISODate(r.dt_entrega), prazo_entrega_dias:r.prazo_entrega_dias||ai.prazo_entrega||null,
      valor_item:(Number(r.valor)&&Number(r.qtde))?(Number(r.valor)/Number(r.qtde)):(Number(ai.valor_unit)||0),
      nota_fiscal:r.nf||emInfo.nota_fiscal||'', possui_patrimonio:r.possui_patrimonio, patrimonio:patrimonioAta||emInfo.patrimonio||'', numero_serie:seriesAta,
      empenho_vinculado:!!empAta,
      _ataPendenteAF:pendenteAF,
      status:pendenteAF?'aguardando AF':_prazoStatus(limiteISO,recebido,false)
    });
  });
  // Fase 11: itens de aquisição contratados com saldo a autorizar aparecem aqui (aguardando AF)
  const {data:itc,error:e3}=await sb.from('itens')
    .select('id,descricao,qtde,marca,modelo,prazo_entrega_dias,processo_id,contrato_id,fornecedor_id,status,processos(identificador),contratos(cpl,numero_contrato,tipo_instrumento),fornecedores(razao_social),unidades(nome)')
    .eq('origem','aquisicao').not('contrato_id','is',null);
  let itemPorId={};
	  if(!e3){
    const autPorItem={};
    const itemIds=(itc||[]).map(i=>i.id);
    if(itemIds.length){
      const {data:afsSaldo,error:eSaldo}=await sb.from('itens_entregas')
        .select('item_id,qtde_autorizada,status')
        .in('item_id',itemIds);
      const fonteSaldo=eSaldo?aqCalc:afsSaldo;
      if(eSaldo) console.warn('AF saldo pendente:',eSaldo.message);
      (fonteSaldo||[]).forEach(r=>{
        const st=String(r.status||'').toLowerCase();
        if(st.startsWith('cancelad')) return;
        autPorItem[r.item_id]=(autPorItem[r.item_id]||0)+(Number(r.qtde_autorizada)||0);
      });
    }
    const contratoIds=[...new Set((itc||[]).map(i=>i.contrato_id).filter(Boolean))];
    const empPorItem={}, empPorContrato={};
    if(itemIds.length){
      const {data:ei}=await sb.from('empenho_itens').select('item_id,empenhos(numero)').in('item_id',itemIds);
      (ei||[]).forEach(x=>{ if(x.item_id){ (empPorItem[x.item_id]=empPorItem[x.item_id]||[]).push(x.empenhos?.numero||''); } });
    }
    if(contratoIds.length){
      const {data:ec}=await sb.from('empenhos').select('numero,contrato_id').in('contrato_id',contratoIds);
      (ec||[]).forEach(e=>{ if(e.contrato_id){ (empPorContrato[e.contrato_id]=empPorContrato[e.contrato_id]||[]).push(e.numero||''); } });
    }
    itemPorId=Object.fromEntries((itc||[]).map(it=>[String(it.id),it]));
    (aqCalc||[]).forEach(r=>{
      if(!r.id || aqDetalhadaIds.has(String(r.id)) || (r.status||'')==='cancelada') return;
      const it=itemPorId[String(r.item_id)]||{};
      if(!it.id) return;
      const cancelado=(r.status||'')==='cancelada';
      const recebido=!cancelado && ((Number(r.qtde_recebida)||0)>0 || !!r.data_recebimento);
      const limiteISO=_toISODate(r.data_limite_entrega);
      const qtdeAut=Number(r.qtde_autorizada)||0;
      const qtdeRec=Number(r.qtde_recebida)||0;
      const saldoAf=qtdeAut-qtdeRec;
      const itemQtde=Number(it.qtde)||0;
      const saldoItem=itemQtde-(Number(recebidoPorItem[r.item_id])||0);
      out.push({
        tipo:'Aquisição', entrega_id:r.id, item_id:r.item_id,
        processo:it.processos?.identificador||'', processo_id:it.processo_id||null,
        contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
        contrato_id:it.contrato_id||null, fornecedor_id:it.fornecedor_id||null,
        fonte_tipo:it.fonte_tipo||'', fonte_descricao:it.fonte_descricao||'',
        emenda_id:it.emenda_id||null, emenda_item_id:it.emenda_item_id||null,
        empresa:it.fornecedores?.razao_social||'', item:it.descricao||'',
        marca:it.marca||'', modelo:it.modelo||'', numero_serie:r.numero_serie||'',
        unidade:it.unidades?.nome||'', af_numero:r.af_numero||'',
        af_dataISO:_toISODate(r.af_data), qtde:qtdeAut, qtde_recebida:qtdeRec,
        saldo_af:saldoAf, saldo_item:saldoItem, limiteISO, recebido, cancelado,
        data_recebimentoISO:_toISODate(r.data_recebimento), recebido_por:r.recebido_por||'',
        recebimento_tipo:r.recebimento_tipo||'', possui_patrimonio:r.possui_patrimonio, patrimonio:r.patrimonio||'',
        empenho_id:r.empenho_id||empAqPorItem[String(r.item_id)]?.id||null, empenho:r.empenho||empAqPorItem[String(r.item_id)]?.label||'',
        nota_fiscal_id:r.nota_fiscal_id||null, nota_fiscal:r.nota_fiscal||'',
        nf_dataISO:_toISODate(r.nf_data),
        valor_item:Number(it.valor_contratado)||Number(it.valor_estimado)||0,
        status:_prazoStatus(limiteISO,recebido,cancelado)
      });
    });
    (itc||[]).forEach(it=>{
      // Só itens realmente pendentes de AF entram aqui: exclui itens ainda em licitação
      // (status diferente de "contratado", valor gravado por _ncVincularItens) e itens de
      // ATA — estes têm execução própria rastreada exclusivamente em "Atas Rp Vigentes" (atas_execucao).
      if(it.status!=='contratado') return;
      if(it.contratos?.tipo_instrumento==='ATA') return;
      const saldoAut=(Number(it.qtde)||0)-(Number(autPorItem[it.id])||0);
      if(saldoAut<=0) return; // já totalmente autorizado por AFs
      const emps=empPorItem[it.id]||empPorContrato[it.contrato_id]||[];
      out.push({
        tipo:'Aquisição', _pendente:true, item_id:it.id,
        processo:it.processos?.identificador||'', processo_id:it.processo_id||null,
        contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
        contrato_id:it.contrato_id||null, fornecedor_id:it.fornecedor_id||null,
        empresa:it.fornecedores?.razao_social||'', item:it.descricao||'',
        marca:it.marca||'', modelo:it.modelo||'', unidade:it.unidades?.nome||'',
        af_numero:'', af_dataISO:'', qtde:saldoAut, prazo_entrega_dias:it.prazo_entrega_dias,
        empenho_vinculado:emps.length>0, empenho:emps.filter(Boolean).join(', '),
        limiteISO:'', recebido:false, cancelado:false, status:'aguardando AF'
      });
    });
  }
  // Salvaguarda: garante que registros com AF emitida não sumam por falha de join
  const _outIds=new Set(out.map(r=>r.entrega_id).filter(Boolean));
  (aqCalc||[]).forEach(r=>{
    if(!r.id||_outIds.has(String(r.id))||(r.status||'')==='cancelada') return;
    if(!r.af_numero&&!r.af_data) return; // sem AF → não deveria aparecer aqui
    const it=itemPorId[String(r.item_id)]||{};
    const qA=Number(r.qtde_autorizada)||0, qR=Number(r.qtde_recebida)||0, rec=!!qR||!!r.data_recebimento;
    out.push({tipo:'Aquisição',entrega_id:r.id,item_id:r.item_id,_salvaguarda:true,
      processo:it.processos?.identificador||'',contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
      contrato_id:it.contrato_id||null,fornecedor_id:it.fornecedor_id||null,
      empresa:it.fornecedores?.razao_social||'',item:it.descricao||'(item '+r.item_id+')',
      unidade:it.unidades?.nome||'',af_numero:r.af_numero||'',af_dataISO:_toISODate(r.af_data),
      qtde:qA,qtde_recebida:qR,saldo_af:qA-qR,limiteISO:_toISODate(r.data_limite_entrega),
      recebido:rec,cancelado:false,status:_prazoStatus(_toISODate(r.data_limite_entrega),rec,false),
      empenho_id:r.empenho_id||empAqPorItem[String(r.item_id)]?.id||null,empenho:r.empenho||empAqPorItem[String(r.item_id)]?.label||'',nota_fiscal:r.nota_fiscal||'',possui_patrimonio:r.possui_patrimonio,patrimonio:r.patrimonio||'',numero_serie:r.numero_serie||'',
      valor_item:Number(it.valor_contratado)||Number(it.valor_estimado)||0});
  });
  // RESGATE FINAL: query direta sem joins. Se RLS bloqueou o SELECT com joins
  // aninhados mas o INSERT passou, esta query resgata os registros órfãos.
  const _outIds2=new Set(out.map(r=>r.entrega_id).filter(Boolean));
  const {data:_resgate}=await sb.from('itens_entregas')
    .select('id,item_id,af_numero,af_data,qtde_autorizada,qtde_recebida,status,data_limite_entrega,data_recebimento,empenho_id,empenho,nota_fiscal,possui_patrimonio,patrimonio,numero_serie')
    .not('af_numero','is',null).neq('status','cancelada').order('af_data',{ascending:false});
  if(_resgate) _resgate.forEach(r=>{
    if(_outIds2.has(String(r.id))) return;
    const it=itemPorId[String(r.item_id)]||{};
    const qA=Number(r.qtde_autorizada)||0, qR=Number(r.qtde_recebida)||0, rec=!!qR||!!r.data_recebimento;
    out.push({tipo:'Aquisição',entrega_id:r.id,item_id:r.item_id,_resgate:true,
      processo:it.processos?.identificador||'',contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
      contrato_id:it.contrato_id||null,fornecedor_id:it.fornecedor_id||null,
      empresa:it.fornecedores?.razao_social||'',item:it.descricao||'(item '+r.item_id+')',
      unidade:it.unidades?.nome||'',af_numero:r.af_numero||'',af_dataISO:_toISODate(r.af_data),
      qtde:qA,qtde_recebida:qR,saldo_af:qA-qR,limiteISO:_toISODate(r.data_limite_entrega),
      recebido:rec,cancelado:false,status:_prazoStatus(_toISODate(r.data_limite_entrega),rec,false),
      empenho_id:r.empenho_id||empAqPorItem[String(r.item_id)]?.id||null,empenho:r.empenho||empAqPorItem[String(r.item_id)]?.label||'',nota_fiscal:r.nota_fiscal||'',possui_patrimonio:r.possui_patrimonio,patrimonio:r.patrimonio||'',numero_serie:r.numero_serie||'',
      valor_item:Number(it.valor_contratado)||Number(it.valor_estimado)||0});
  });
  entregasRows=out;
  itensEntregasCarregado=true;
  renderItensEntregas();
}
function renderItensEntregas(){
  const wrap=document.getElementById('entregas-wrap'); if(!wrap) return;
  const q=(document.getElementById('entregas-busca')?.value||'').toLowerCase();
  const fT=document.getElementById('entregas-f-tipo')?.value||'';
  const fP=document.getElementById('entregas-f-prazo')?.value||'';
  const rows=entregasRows.filter(r=>{
    // Aquisição só sai desta sub-aba quando comprovadamente recebida por completo
    // (recebido=true E saldo_af <= 0). Saldo_af undefined/null → mantém visível.
    // Após emitir AF, o item permanece aqui com os botões Receber e Prazo.
    if(r.tipo==='Aquisição' && !r._pendente) {
      const saldoAF = (r.saldo_af != null) ? Number(r.saldo_af) : 1;
      const totalmenteRecebido = r.recebido === true && saldoAF <= 0;
      if(totalmenteRecebido && fP !== 'recebido') return false;
    }
    // ATAs já entregues saem desta sub-aba; ainda acessíveis pelo filtro de prazo = "recebido".
    const entregue = r.recebido && (r.tipo==='ATA' ? true : (Number(r.saldo_af)||0)<=0);
    if(entregue && fP!=='recebido') return false;
    if(fT && r.tipo!==fT) return false;
    if(fP && r.status!==fP) return false;
    if(q){ const hay=[r.item,r.processo,r.contrato,r.empresa,r.af_numero,r.unidade].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>{ // atrasados primeiro, depois por dias restantes
    const ord={'atrasado':0,'aguardando AF':1,'vence hoje':2,'no prazo':3,'sem prazo':4,'recebido':5,'cancelado':6};
    const da=(ord[a.status]??9)-(ord[b.status]??9); if(da) return da;
    return (_diasRestantes(a.limiteISO)??99999)-(_diasRestantes(b.limiteISO)??99999);
  });
  const cEl=document.getElementById('entregas-count'); if(cEl) cEl.textContent=`${rows.length} registro(s)`;
  if(!rows.length){ wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:13px">Nenhum item encontrado. Itens aguardando AF e itens com AF emitida (aguardando recebimento) aparecem aqui. Após o recebimento total, passam para <b>Confirmação de Entrega na Unidade</b>.</div>'; return; }
  wrap.innerHTML=_ceAdvBar()+`<table style="width:100%;font-size:12px;border-collapse:collapse;background:var(--surface)">
    <thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border)">
      <th style="padding:7px 8px;width:28px" title="Selecionar para advertência">⚖️</th><th style="padding:7px 8px">Tipo</th><th style="padding:7px 8px">Processo/CPL</th><th style="padding:7px 8px">Contrato/SIM</th><th style="padding:7px 8px">Empresa</th><th style="padding:7px 8px">Item</th><th style="padding:7px 8px">Unidade</th><th style="padding:7px 8px">AF</th><th style="padding:7px 8px">AF data</th><th style="padding:7px 8px;text-align:right">Qtde</th><th style="padding:7px 8px;text-align:right">Recebido</th><th style="padding:7px 8px">Documentos</th><th style="padding:7px 8px">Data limite</th><th style="padding:7px 8px">Prazo</th><th style="padding:7px 8px">Ações</th>
    </tr></thead><tbody>${rows.map(r=>{
      const dias=_diasRestantes(r.limiteISO);
      const tipoCor=r.tipo==='ATA'?'#A371F7':'#378ADD';
      const pode=podeEditar('itens');
      const marcaMod=[r.marca,r.modelo].filter(Boolean).join(' ');
      let acoes='—', docs='—', recInfo, rowBg='';
      if(r._pendente){
        rowBg=';background:#EF9F2710';
        const vincBtn=pode?`<button onclick="abrirVincularEmpenho('${r.item_id}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);cursor:pointer;white-space:nowrap">Vincular empenho</button>`:'';
        const afBtn=pode?`<button onclick="abrirModalAF('${r.item_id}')" ${r.empenho_vinculado?'':'disabled title="Vincule um empenho antes de emitir a AF"'} style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--blue);background:${r.empenho_vinculado?'var(--blue)':'var(--surface2)'};color:${r.empenho_vinculado?'#fff':'var(--text3)'};cursor:${r.empenho_vinculado?'pointer':'not-allowed'};white-space:nowrap">Emitir AF</button>`:'';
        acoes=`<div style="display:flex;gap:4px;flex-wrap:wrap">${vincBtn}${afBtn}</div>`;
        docs=`<div>Emp: ${r.empenho_vinculado?_sanEsc(r.empenho||'sim'):'<span style="color:var(--red)">não vinculado</span>'}</div>${marcaMod?('<div>'+_sanEsc(marcaMod)+'</div>'):''}`;
        recInfo='<span style="color:var(--text3)">aguardando AF</span>';
      }else{
        // Item 14: só permite receber enquanto houver saldo na AF; recebido total => "Ver recebimento"
        const saldoAF=Number(r.saldo_af)||0;
        const totalmenteRecebido=r.tipo==='Aquisição' && saldoAF<=0 && (Number(r.qtde_recebida)||0)>0;
        const podeRec=r.tipo==='Aquisição'&&!r.cancelado&&pode&&saldoAF>0;
        const recBtn=podeRec?`<button onclick="abrirRecebimento('${r.entrega_id}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--green);background:var(--green);color:#fff;cursor:pointer;white-space:nowrap">Receber item</button>`:'';
        const verBtn=totalmenteRecebido?`<button onclick="verRecebimento('${r.entrega_id}')" title="Item totalmente recebido — visualizar dados do recebimento" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--green);background:var(--surface);color:var(--green);cursor:pointer;white-space:nowrap">✓ Ver recebimento</button>`:'';
        const aqPrazoBtn=(r.tipo==='Aquisição'&&!r.recebido&&!r.cancelado&&pode)?`<button onclick="abrirModalProrrogarPrazoAquisicao('${r.entrega_id}')" title="Prorrogar prazo de entrega" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--amber-bg);color:var(--amber-text);background:var(--amber-bg);cursor:pointer;white-space:nowrap">📅 Prazo</button>`:'';
        // ATA aguardando AF: só "Emitir AF" (define data AF + prazo). Após emitir, libera Receber/Prazo.
        const ataPodeAF=!!(r.empenho_vinculado||r.empenho);
        const ataVincBtn=(r.tipo==='ATA'&&r._ataPendenteAF&&r.exec_id&&pode&&!ataPodeAF)?`<button onclick="abrirVincularEmpenho('', '${r.exec_id}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);cursor:pointer;white-space:nowrap">Vincular empenho</button>`:'';
        const ataAFBtn=(r.tipo==='ATA'&&r._ataPendenteAF&&r.exec_id&&pode)?`<button onclick="abrirModalAF('','${r.exec_id}')" ${ataPodeAF?'':'disabled title="Nenhum empenho vinculado. Vincule um empenho antes de emitir a AF."'} style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--blue);background:${ataPodeAF?'var(--blue)':'var(--surface2)'};color:${ataPodeAF?'#fff':'var(--text3)'};cursor:${ataPodeAF?'pointer':'not-allowed'};white-space:nowrap">📄 Emitir AF</button>`:'';
        const ataPrazoBtn=(r.tipo==='ATA'&&!r._ataPendenteAF&&!r.recebido&&r.exec_id&&pode)?`<button onclick="abrirModalProrrogarPrazo('${r.exec_id}')" title="Prorrogar prazo de entrega" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--amber-bg);color:var(--amber-text);background:var(--amber-bg);cursor:pointer;white-space:nowrap">📅 Prazo</button>`:'';
        const ataRecBtn=(r.tipo==='ATA'&&!r._ataPendenteAF&&r.exec_id&&pode)?`<button onclick="abrirRecebimentoAta('${r.exec_id}')" title="Registrar recebimento administrativo" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--green);background:${r.recebido?'var(--surface)':'var(--green)'};color:${r.recebido?'var(--green)':'#fff'};cursor:pointer;white-space:nowrap">${r.recebido?'✓ Ver recebimento':'📥 Receber'}</button>`:'';
        const pdfBtn=r.af_numero?`<button onclick="baixarAFPDF('${_ceRowKey(r)}')" title="Baixar AF em PDF" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--blue);background:var(--surface);color:var(--blue);cursor:pointer;white-space:nowrap">Baixar AF em PDF</button>`:'';
        acoes=(recBtn||verBtn||aqPrazoBtn||ataVincBtn||ataAFBtn||ataPrazoBtn||ataRecBtn||pdfBtn)?`<div style="display:flex;gap:4px;flex-wrap:wrap">${recBtn}${verBtn}${ataVincBtn}${ataAFBtn}${ataRecBtn}${aqPrazoBtn}${ataPrazoBtn}${pdfBtn}</div>`:'—';
        docs=r.tipo==='Aquisição'
          ?`<div>Emp: ${_sanEsc(r.empenho||'—')}</div><div>NF: ${_sanEsc(r.nota_fiscal||'—')}${r.nf_dataISO?(' · '+fmtDate(r.nf_dataISO)):''}</div>${r.patrimonio?('<div>Pat: '+_sanEsc(r.patrimonio)+'</div>'):''}${r.numero_serie?('<div>Série: '+_sanEsc(r.numero_serie)+'</div>'):''}${marcaMod?('<div>'+_sanEsc(marcaMod)+'</div>'):''}`
          :`<div>Emp: ${r.empenho?_sanEsc(r.empenho):'<span style="color:var(--red)">não vinculado</span>'}</div><div>NF: ${_sanEsc(r.nota_fiscal||'—')}</div>${r.patrimonio?('<div>Pat: '+_sanEsc(r.patrimonio)+'</div>'):''}`;
        recInfo=r.tipo==='Aquisição'
          ?`${r.qtde_recebida||0}<br><span style="color:var(--text3)">saldo AF ${r.saldo_af}</span><br><span style="color:var(--text3)">saldo item ${r.saldo_item}</span>`
          :(r.recebido?'sim':'—');
      }
      return `<tr style="border-bottom:1px solid var(--border)${rowBg}">
      <td style="padding:6px 8px;text-align:center">${_ceAdvCheckbox(r)}</td>
      <td style="padding:6px 8px"><span class="badge" style="background:${tipoCor}22;color:${tipoCor};white-space:nowrap">${r.tipo}</span></td>
      <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r.processo||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r.contrato||'—')}</td>
      <td style="padding:6px 8px">${_sanEsc(r.empresa||'—')}</td>
      <td style="padding:6px 8px">${_sanEsc(r.item||'—')}</td>
      <td style="padding:6px 8px">${_sanEsc(r.unidade||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r.af_numero||'—')}</td>
      <td style="padding:6px 8px;white-space:nowrap;color:var(--text3)">${r.af_dataISO?fmtDate(r.af_dataISO):'—'}</td>
      <td style="padding:6px 8px;text-align:right">${r.qtde??'—'}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">${recInfo}</td>
      <td style="padding:6px 8px;white-space:nowrap;color:var(--text3)">${docs}</td>
      <td style="padding:6px 8px;white-space:nowrap">${r.limiteISO?fmtDate(r.limiteISO):'—'}${r.entregaISO?('<br><span style="color:var(--text3)">entregue '+fmtDate(r.entregaISO)+'</span>'):''}</td>
      <td style="padding:6px 8px">${_prazoBadge(r.status,dias)}</td>
      <td style="padding:6px 8px">${acoes}</td>
    </tr>`;}).join('')}</tbody></table>`;
}

// ── Advertência multi-item no Controle de Entregas (mesmo contrato) ──
let _ceAdvSel=new Set(), _ceAdvLock='', _ceAdvAtivo=false, _ceAdvRows=[], _ceAdvContrato=null;
function _ceRowKey(r){ return r.entrega_id?('a'+r.entrega_id):(r.exec_id?('t'+r.exec_id):('i'+(r.item_id||r.item||''))); }
function _ceAdvLockKey(r){ return String(r.contrato||r.processo||''); }
async function baixarAFPDF(key){
  const row=entregasRows.find(r=>_ceRowKey(r)===key);
  if(!row){ if(window.toast) toast('Registro da AF não encontrado.','error'); return; }
  if(!row.af_numero){ if(window.toast) toast('Este item ainda não tem AF emitida.','error'); return; }
  let c={};
  if(row.contrato_id){
    const {data}=await sb.from('contratos').select('id,cpl,numero_contrato,prestador,cnpj,objeto,secao').eq('id',row.contrato_id).maybeSingle();
    c=data||{};
  }
  const afData=row.af_dataISO?fmtDate(row.af_dataISO):'—';
  const limite=row.limiteISO?fmtDate(row.limiteISO):'—';
  const qtde=Number(row.qtde)||0;
  const unit=Number(row.valor_item)||0;
  const total=unit&&qtde?unit*qtde:0;
  const empresa=c.prestador||row.empresa||'—';
  const contrato=c.numero_contrato||row.contrato||'—';
  const cnpj=c.cnpj||'—';
  const objeto=c.objeto||row.item||'—';
  const responsavel=currentProfile?.nome||currentProfile?.email||'Responsável';
  let empPDF=row.empenho||'';
  if(row.tipo==='ATA'&&row.exec_id){
    const {data:ex}=await sb.from('atas_execucao').select('id,empenho,emenda_item_id').eq('id',row.exec_id).maybeSingle();
    empPDF=await _ataExecEmpenhoVinculado({...row,...(ex||{})})||empPDF;
  }else{
    empPDF=await _itemEmpenhoVinculado(row)||empPDF;
  }
  if(empPDF) row.empenho=empPDF;
  const pdfCell='border:1px solid #777!important;padding:5px!important;background:#fff!important;color:#111!important';
  const pdfLabel=pdfCell+';width:30%;font-weight:700!important';
  const pdfHead='border:1px solid #777!important;padding:5px!important;background:#eee!important;color:#111!important;font-weight:700!important';
  const pdfRight=pdfCell+';text-align:right!important';
  const html=document.createElement('div');
  html.style.cssText='width:190mm;min-height:267mm;padding:12mm;background:#fff!important;color:#111!important;font-family:Arial,sans-serif;font-size:10pt;color-scheme:light';
  html.innerHTML=`<div style="background:#fff!important;color:#111!important">
  <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:8mm;margin-bottom:8mm;background:#fff!important;color:#111!important">
    <div style="font-weight:700;font-size:11pt;background:#fff!important;color:#111!important">PREFEITURA DE SOROCABA - SECRETARIA DA SAÚDE</div>
    <div>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde</div>
    <h1 style="font-size:15pt;margin:7mm 0 1mm;background:#fff!important;color:#111!important">AUTORIZAÇÃO DE FORNECIMENTO</h1>
    <div style="font-size:12pt;font-weight:700;background:#fff!important;color:#111!important">AF nº ${_sanEsc(row.af_numero)}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:7mm;background:#fff!important;color:#111!important">
    <tbody>
      <tr><td style="${pdfLabel}">Data da AF</td><td style="${pdfCell}">${afData}</td></tr>
      <tr><td style="${pdfLabel}">Processo/CPL</td><td style="${pdfCell}">${_sanEsc(row.processo||c.cpl||'—')}</td></tr>
      <tr><td style="${pdfLabel}">Contrato/ATA</td><td style="${pdfCell}">${_sanEsc(contrato)}</td></tr>
      <tr><td style="${pdfLabel}">Fornecedor</td><td style="${pdfCell}">${_sanEsc(empresa)}</td></tr>
      <tr><td style="${pdfLabel}">CNPJ</td><td style="${pdfCell}">${_sanEsc(cnpj)}</td></tr>
      <tr><td style="${pdfLabel}">Empenho</td><td style="${pdfCell}">${_sanEsc(empPDF||'—')}</td></tr>
      <tr><td style="${pdfLabel}">Local de entrega</td><td style="${pdfCell}">${_sanEsc(row.unidade||'—')}</td></tr>
      <tr><td style="${pdfLabel}">Prazo/data limite</td><td style="${pdfCell}">${limite}</td></tr>
      <tr><td style="${pdfLabel}">Objeto</td><td style="${pdfCell}">${_sanEsc(objeto)}</td></tr>
    </tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;background:#fff!important;color:#111!important">
    <thead><tr><th style="${pdfHead}">Item</th><th style="${pdfHead}">Unidade</th><th style="${pdfHead};text-align:right!important">Qtde</th><th style="${pdfHead};text-align:right!important">Valor unitário</th><th style="${pdfHead};text-align:right!important">Valor total</th></tr></thead>
    <tbody><tr><td style="${pdfCell}">${_sanEsc(row.item||'—')}</td><td style="${pdfCell}">${_sanEsc(row.unidade||'—')}</td><td style="${pdfRight}">${qtde||'—'}</td><td style="${pdfRight}">${unit?fmtFull(unit):'—'}</td><td style="${pdfRight}">${total?fmtFull(total):'—'}</td></tr></tbody>
  </table>
  <p style="margin-top:8mm;text-align:justify;background:#fff!important;color:#111!important">Autorizamos o fornecimento do item acima, conforme condições pactuadas no contrato/ata e documentos vinculados.</p>
  <div style="margin-top:28mm;text-align:center;background:#fff!important;color:#111!important"><div style="border-top:1px solid #111;width:80mm;margin:0 auto 2mm;background:#fff!important;color:#111!important"></div><strong>${_sanEsc(responsavel)}</strong><br>Responsável pela emissão</div>
  </div>`;
  document.body.appendChild(html);
  try{
    await ensureLib('html2pdf');
    await html2pdf().set({margin:[8,8,8,8],filename:`AF-${_safeFileName(row.af_numero)}.pdf`,html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(html).save();
  }finally{
    html.remove();
  }
}
function _ceAdvElegivel(r){ return !r.recebido && !r.cancelado && !!(r.contrato||r.processo); }
function _ceAdvCheckbox(r){
  if(!_ceAdvElegivel(r)||!podeEditar('itens')) return '';
  const key=_ceRowKey(r), checked=_ceAdvSel.has(key);
  const disabled=_ceAdvLock && _ceAdvLockKey(r)!==_ceAdvLock && !checked;
  return `<input type="checkbox" class="ce-adv-chk" ${checked?'checked':''} ${disabled?'disabled':''} onchange="_ceAdvToggle('${key}',this)" title="${disabled?('Seleção limitada ao contrato '+_sanEsc(_ceAdvLock)):'Selecionar para advertência'}" style="accent-color:#EF9F27;cursor:${disabled?'not-allowed':'pointer'}">`;
}
function _ceAdvToggle(key,cb){
  const r=entregasRows.find(x=>_ceRowKey(x)===key); if(!r){cb.checked=false;return;}
  if(cb.checked){ if(!_ceAdvLock) _ceAdvLock=_ceAdvLockKey(r); _ceAdvSel.add(key); }
  else { _ceAdvSel.delete(key); if(!_ceAdvSel.size) _ceAdvLock=''; }
  renderItensEntregas();
}
function _ceAdvLimpar(){ _ceAdvSel.clear(); _ceAdvLock=''; renderItensEntregas(); }
function _ceSelRows(){ return entregasRows.filter(r=>_ceAdvSel.has(_ceRowKey(r))); }
function _ceAdvBar(){
  const n=_ceAdvSel.size; if(!n) return '';
  const pendentesAF=_ceSelRows().filter(r=>r._pendente && r.tipo==='Aquisição');
  const afBtn=pendentesAF.length?`<button onclick="abrirAFLote()" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600">📄 Gerar AF (${pendentesAF.length})</button>`:'';
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--amber-bg,#fff7e6);border:1px solid var(--amber);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:10px">
    <span style="font-size:12px;color:var(--text2)">${n} item(ns) · contrato <b>${_sanEsc(_ceAdvLock||'—')}</b></span>
    ${afBtn}
    <button onclick="abrirAdvertenciaCE()" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:none;background:var(--amber);color:#fff;cursor:pointer;font-weight:600">⚖️ Gerar advertência</button>
    <button onclick="_ceAdvLimpar()" style="font-size:12px;padding:5px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);cursor:pointer">Limpar seleção</button>
  </div>`;
}
// ── Emitir AF para vários itens do mesmo contrato (a partir da seleção) ──
let _aflRows=[], _aflContrato=null;
async function abrirAFLote(){
  if(bloquearSeVisualiz('itens')) return;
  const sel=_ceSelRows().filter(r=>r._pendente && r.tipo==='Aquisição');
  if(!sel.length){ if(window.toast) toast('Selecione itens de aquisição aguardando AF (mesmo contrato).','error'); return; }
  const cid=sel.find(r=>r.contrato_id)?.contrato_id;
  let c={}; if(cid){ const {data}=await sb.from('contratos').select('id,numero_contrato,cnpj,objeto,prestador').eq('id',cid).single(); c=data||{}; }
  _aflContrato=c;
  const ids=[...new Set(sel.map(r=>r.item_id).filter(Boolean))];
  const valById={};
  if(ids.length){ const {data}=await sb.from('itens').select('id,valor_contratado,valor_estimado').in('id',ids); (data||[]).forEach(it=>{ valById[it.id]=Number(it.valor_contratado)||Number(it.valor_estimado)||0; }); }
  _aflRows=sel.map(r=>{
    const semPrazo=(r.prazo_entrega_dias==null||r.prazo_entrega_dias===''||isNaN(Number(r.prazo_entrega_dias)));
    const semEmp=!r.empenho_vinculado;
    return {...r, _vlUnit:valById[r.item_id]||0, _bloqueio: semEmp?'sem empenho':(semPrazo?'sem prazo de entrega':'')};
  });
  const numero=c.numero_contrato||sel[0].contrato||'—';
  const empresa=c.prestador||sel.find(r=>r.empresa)?.empresa||'—';
  document.getElementById('afl-info').innerHTML=`<strong>Contrato:</strong> ${_sanEsc(numero)} &nbsp;·&nbsp; <strong>Empresa:</strong> ${_sanEsc(empresa)} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||'—')}`;
  document.getElementById('afl-numero').value='';
  document.getElementById('afl-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('afl-itens').innerHTML=_aflRows.map(r=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 6px;border-bottom:1px solid var(--border)">
    <span><strong>${_sanEsc(r.item)}</strong> · ${_sanEsc(r.unidade||'—')} <span style="color:var(--text3)">· qtde ${r.qtde||'—'}${r._vlUnit?(' · '+fmtFull(r._vlUnit)):''}</span></span>
    ${r._bloqueio?`<span style="color:var(--red);white-space:nowrap">⚠ ${r._bloqueio}</span>`:'<span style="color:var(--green);white-space:nowrap">ok</span>'}
  </div>`).join('');
  const msg=document.getElementById('afl-msg'); msg.className='fmsg'; msg.textContent='';
  document.getElementById('modal-af-lote').classList.add('active');
}
async function confirmarAFLote(){
  if(bloquearSeVisualiz('itens')) return;
  const numero=document.getElementById('afl-numero').value.trim();
  const afData=document.getElementById('afl-data').value;
  const msg=document.getElementById('afl-msg'); msg.className='fmsg';
  if(!numero){ msg.textContent='Informe o número da AF.'; msg.classList.add('err'); return; }
  if(!afData){ msg.textContent='Informe a data da AF.'; msg.classList.add('err'); return; }
  const validos=_aflRows.filter(r=>!r._bloqueio);
  if(!validos.length){ msg.textContent='Nenhum item elegível (todos sem empenho ou sem prazo).'; msg.classList.add('err'); return; }
  const btn=document.getElementById('afl-salvar'); btn.disabled=true; btn.textContent='Emitindo...';
  const regs=[], usados=[];
  for(const r of validos){
    const {data:afs}=await sb.from('itens_entregas').select('qtde_autorizada,status').eq('item_id',r.item_id);
    let aut=0;(afs||[]).forEach(e=>{ if((e.status||'')!=='cancelada') aut+=(Number(e.qtde_autorizada)||0); });
    const {data:it}=await sb.from('itens').select('qtde').eq('id',r.item_id).single();
    const saldo=(Number(it?.qtde)||0)-aut;
    const q=Math.min(Number(r.qtde)||0, saldo);
    if(q<=0) continue;
    const limite=_addDiasISO(afData, Number(r.prazo_entrega_dias));
    regs.push({item_id:r.item_id, af_numero:numero, af_data:afData, qtde_autorizada:q, data_limite_entrega:limite||null, status:'af_emitida'});
    usados.push({...r, _q:q, _limite:limite});
  }
  if(!regs.length){ btn.disabled=false; btn.textContent='Emitir AF e gerar PDF'; msg.textContent='Sem saldo a autorizar nos itens selecionados.'; msg.classList.add('err'); return; }
  const {error}=await sb.from('itens_entregas').insert(regs);
  if(error){ btn.disabled=false; btn.textContent='Emitir AF e gerar PDF'; msg.textContent='Erro: '+error.message; msg.classList.add('err'); return; }
  _afLotePDF(numero, afData, usados, _aflContrato||{});
  document.getElementById('modal-af-lote').classList.remove('active');
  btn.disabled=false; btn.textContent='Emitir AF e gerar PDF';
  if(window.toast) toast(`AF ${numero} emitida para ${regs.length} item(ns)`,'success');
  _ceAdvLimpar();
  itensEntregasCarregado=false;
  try{ await loadItensEntregas(); }catch(e){ console.error('reload entregas:',e); }
}
function _afLotePDF(numero, afData, rows, c){
  const janela=window.open('','_blank'); if(!janela){ if(window.toast) toast('Permita pop-ups para gerar o PDF.','error'); return; }
  const empresa=c.prestador||rows.find(r=>r.empresa)?.empresa||'—';
  const numContrato=c.numero_contrato||rows[0]?.contrato||'—';
  const hoje=new Date().toLocaleDateString('pt-BR');
  const dataFmt=afData?afData.split('-').reverse().join('/'):hoje;
  const linhas=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${_sanEsc(r.item||'—')}</td><td>${_sanEsc(r.unidade||'—')}</td><td style="text-align:right">${r._q||r.qtde||'—'}</td><td style="text-align:right">${r._vlUnit?fmtFull(r._vlUnit):'—'}</td><td style="text-align:right">${(r._vlUnit&&r._q)?fmtFull(r._vlUnit*r._q):'—'}</td><td>${r._limite?r._limite.split('-').reverse().join('/'):'—'}</td><td>${_sanEsc(r.empenho||'—')}</td></tr>`).join('');
  const total=rows.reduce((s,r)=>s+((r._vlUnit||0)*(r._q||0)),0);
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AF ${_sanEsc(numero)}</title><link rel="stylesheet" href="css/print-af.css"></head><body>
  <header><strong>PREFEITURA DE SOROCABA · SECRETARIA DA SAÚDE</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>AUTORIZAÇÃO DE FORNECIMENTO Nº ${_sanEsc(numero)}</h1><p>Emitida em ${dataFmt}</p></header>
  <div class="ident"><div><strong>Contrato/SIM:</strong> ${_sanEsc(numContrato)}</div><div><strong>Empresa:</strong> ${_sanEsc(empresa)}</div><div><strong>CNPJ:</strong> ${_sanEsc(c.cnpj||'—')}</div><div><strong>Objeto:</strong> ${_sanEsc(c.objeto||'—')}</div></div>
  <p class="corpo">Autorizamos o fornecimento dos itens abaixo discriminados, nos termos do contrato/ata acima e da Lei nº 14.133/2021, devendo a entrega ocorrer no prazo indicado para cada item.</p>
  <table><thead><tr><th>#</th><th>Item</th><th>Unidade</th><th>Qtde</th><th>Vl. unit.</th><th>Vl. total</th><th>Prazo entrega</th><th>Empenho</th></tr></thead><tbody>${linhas}</tbody></table>
  <div class="total">TOTAL: ${fmtFull(total)}</div>
  <div class="assinatura"><strong>${_sanEsc(currentProfile?.nome||currentProfile?.email||'Responsável')}</strong><br>Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);
  janela.document.close();
}
async function abrirAdvertenciaCE(){
  if(bloquearSeVisualiz('itens')) return;
  const rows=entregasRows.filter(r=>_ceAdvSel.has(_ceRowKey(r))); if(!rows.length) return;
  _ceAdvRows=rows; _ceAdvAtivo=true; _sancaoAquisicaoRow=null;
  let c={}; const cid=rows.find(r=>r.contrato_id)?.contrato_id;
  if(cid){ const {data}=await sb.from('contratos').select('id,numero_contrato,cnpj,objeto,prestador').eq('id',cid).single(); c=data||{}; }
  _ceAdvContrato=c;
  const empresa=c.prestador||rows.find(r=>r.empresa)?.empresa||'';
  const numero=c.numero_contrato||rows[0].contrato||'—';
  const modal=document.getElementById('modal-solicitar-sancao'); document.body.appendChild(modal);
  document.getElementById('sancao-contrato-info').innerHTML=`<strong>Processo/CPL:</strong> ${_sanEsc(rows[0].processo||'—')} &nbsp;·&nbsp; <strong>Contrato:</strong> ${_sanEsc(numero)}<br><strong>Empresa:</strong> ${_sanEsc(empresa||'—')} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||'—')}`;
  document.querySelectorAll('input[name="sancao-tipo"]').forEach(el=>el.checked=false);
  const mot=document.querySelector('input[name="sancao-motivo"][value="Atraso na entrega"]'); if(mot) mot.checked=true;
  ['sancao-motivo-livre','sancao-clausula','sancao-artigo','sancao-percentual'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  const atrasos=rows.map(r=>_diasRestantes(r.limiteISO)).filter(d=>d!=null&&d<0).map(d=>Math.abs(d));
  document.getElementById('sancao-dias').value=atrasos.length?Math.max(...atrasos):'';
  document.getElementById('sancao-itens-modal').innerHTML=rows.map(r=>`<div style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px"><strong>${_sanEsc(r.item)}</strong> · ${_sanEsc(r.unidade||'—')} <span style="color:var(--text3)">· Qtde ${r.qtde||'—'} · ${r.limiteISO?('limite '+fmtDate(r.limiteISO)):'sem prazo'}</span></div>`).join('');
  const msg=document.getElementById('sancao-doc-msg'); msg.className='fmsg'; msg.textContent='';
  atualizarCamposSancao();
  modal.classList.add('active');
}
async function gerarAdvertenciaCE(){
  if(bloquearSeVisualiz('itens')) return;
  const rows=_ceAdvRows, c=_ceAdvContrato||{};
  const tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||'';
  const motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||'';
  const motivoLivre=document.getElementById('sancao-motivo-livre').value.trim();
  const clausula=document.getElementById('sancao-clausula').value.trim();
  const artigo=document.getElementById('sancao-artigo').value.trim();
  const percentualRaw=document.getElementById('sancao-percentual').value;
  const diasRaw=document.getElementById('sancao-dias').value;
  const msg=document.getElementById('sancao-doc-msg');
  if(!rows||!rows.length){ msg.textContent='Nenhum item selecionado.'; msg.className='fmsg err'; return; }
  if(!tipo||!motivo){ msg.textContent='Escolha o tipo e o motivo da sanção.'; msg.className='fmsg err'; return; }
  if(motivo==='Outro motivo'&&!motivoLivre){ msg.textContent='Descreva o outro motivo.'; msg.className='fmsg err'; return; }
  const empresa=c.prestador||rows.find(r=>r.empresa)?.empresa||'—';
  const numero=c.numero_contrato||rows[0].contrato||'—';
  const janela=window.open('','_blank'); if(!janela){ msg.textContent='Permita pop-ups e tente novamente.'; msg.className='fmsg err'; return; }
  janela.document.write('<!doctype html><meta charset="utf-8"><p style="font-family:Arial;padding:24px">Registrando solicitação...</p>');
  const btn=document.getElementById('btn-confirmar-sancao'); btn.disabled=true; btn.textContent='Registrando...';
  const itensSnap=rows.map(r=>({id:_ceRowKey(r),cpl:r.processo,sim:numero,item:r.item,unidade:r.unidade,qtde:r.qtde,vl_unitario:null,vl_total:r.valor_item||null,empenho:r.empenho,data_af:r.af_dataISO,prev_entrega:r.limiteISO,dt_entrega:r.data_recebimentoISO}));
  const snapshot={artigo_adicional:artigo||null,itens:itensSnap};
  const registro={cpl_contrato:rows[0].processo,contrato_id:c.id||rows.find(r=>r.contrato_id)?.contrato_id||null,empresa,tipo_sancao:tipo,motivo,motivo_livre:motivo==='Outro motivo'?motivoLivre:null,clausula_contratual:clausula||null,percentual_multa:tipo==='Multa'&&percentualRaw!==''?Number(percentualRaw):null,dias_atraso:diasRaw!==''?Number(diasRaw):null,itens_ids:JSON.stringify(itensSnap.map(i=>i.id)),itens_json:JSON.stringify(snapshot),solicitado_por:currentProfile?.nome||currentProfile?.email||'Usuário do sistema',gerado_em:new Date().toISOString().slice(0,10)};
  const {data:_san,error}=await sb.from('sancoes_solicitadas').insert(registro).select().single();
  btn.disabled=false; btn.textContent='Gerar documento';
  if(error){ janela.close(); msg.textContent='Erro ao registrar: '+error.message; msg.className='fmsg err'; return; }
  if(_san) await sb.from('sancao_itens').insert(itensSnap.map(it=>({sancao_id:_san.id,ref_origem:String(it.id),descricao:it.item,cpl:it.cpl,sim:it.sim,unidade:it.unidade,qtde:it.qtde,vl_unitario:it.vl_unitario,vl_total:it.vl_total,empenho:it.empenho,data_af:it.data_af,prev_entrega:it.prev_entrega,dt_entrega:it.dt_entrega})));
  const incisos={'Advertência':'I','Multa':'II','Impedimento de licitar e contratar':'III','Declaração de inidoneidade':'IV'};
  const hoje=new Date().toLocaleDateString('pt-BR');
  const fundamento=motivo==='Atraso na entrega'?'ao ensejar o retardamento da entrega do objeto contratual sem motivo justificado':_sanEsc(motivoLivre);
  const linhas=rows.map((r,idx)=>{ const dias=_diasRestantes(r.limiteISO); return `<tr><td>${idx+1}</td><td><strong>${_sanEsc(r.processo||'—')}</strong><br>${_sanEsc(empresa)}</td><td>${_sanEsc(r.item||'—')}</td><td>${_sanEsc(r.unidade||'—')}</td><td>${r.qtde||'—'}</td><td>${_sanEsc(r.empenho||'—')}</td><td>${(dias!=null&&dias<0)?Math.abs(dias)+' dias de atraso':'Aguardando entrega'}</td></tr>`; }).join('');
  janela.document.open();
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Sanção - ${_sanEsc(rows[0].processo||'')}</title><link rel="stylesheet" href="css/print-sancao.css"></head><body><header><strong>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO ADMINISTRATIVA</h1><p>Gerado em ${hoje}</p></header><div class="ident"><div>Processo/CPL: <strong>${_sanEsc(rows[0].processo||'—')}</strong></div><div>Contrato nº: <strong>${_sanEsc(numero)}</strong></div><div>Empresa contratada: <strong>${_sanEsc(empresa)}</strong></div><div>CNPJ: ${_sanEsc(c.cnpj||'—')}</div><div>Objeto: ${_sanEsc(c.objeto||'—')}</div></div><h2>Fundamentação legal</h2><p class="corpo">A contratada incorreu na infração prevista no art. 155, inciso VII, da Lei nº 14.133/2021, ${fundamento}, sujeitando-se às sanções previstas no art. 156, inciso ${incisos[tipo]||''} da mesma Lei. ${clausula?`Ademais, a conduta viola a ${_sanEsc(clausula)} do instrumento contratual.`:''} ${artigo?_sanEsc(artigo)+'.':''}</p><h2>Itens relacionados</h2><table><thead><tr><th>#</th><th>Processo / Empresa</th><th>Item</th><th>Unidade</th><th>Qtde</th><th>Empenho</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table><h2>Solicitação</h2><p class="corpo">Diante do exposto, solicita-se a instauração de processo administrativo sancionador e aplicação de <strong>${_sanEsc(tipo.toUpperCase())}</strong> à empresa <strong>${_sanEsc(empresa)}</strong>, garantidos o contraditório e a ampla defesa, nos termos do art. 157 da Lei nº 14.133/2021.</p>${tipo==='Multa'&&percentualRaw!==''?`<p class="corpo">A multa sugerida é de <strong>${_sanEsc(percentualRaw)}% ao dia de atraso</strong> sobre o valor dos itens em atraso.</p>`:''}<div class="assinatura"><strong>${_sanEsc(registro.solicitado_por)}</strong><br>Secretaria da Saúde - Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);
  janela.document.close();
  document.getElementById('modal-solicitar-sancao').classList.remove('active');
  _ceAdvAtivo=false; _ceAdvSel.clear(); _ceAdvLock=''; _ceAdvRows=[];
  renderItensEntregas();
}

let _recEmpenhosRows=[], _recNFsRows=[];
function normalizarNumeroDocumento(valor){
  let s=String(valor||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  s=s.replace(/\b(EMPENHO|EMP|NOTA\s*FISCAL|NF|NRO|NUMERO|NO|N)\b/g,'');
  s=s.replace(/[º°ª.:]/g,'').replace(/\s+/g,'').replace(/[^A-Z0-9\/-]/g,'');
  s=s.replace(/\d+/g,m=>String(Number(m)));
  const somenteDigitos=s.replace(/\D/g,'');
  if(somenteDigitos && somenteDigitos===s) return String(Number(somenteDigitos));
  return s;
}
function _recNum(id){
  const v=document.getElementById(id)?.value;
  if(v==null||String(v).trim()==='') return null;
  const n=Number(String(v).replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function _recSetMsg(txt,tipo){
  const msg=document.getElementById('rec-msg'); if(!msg) return;
  msg.textContent=txt||''; msg.className='fmsg '+(tipo||'');
}
function _recToggleNovoDoc(tipo){
  const box=document.getElementById(tipo==='empenho'?'rec-empenho-novo':'rec-nf-novo');
  const sel=document.getElementById(tipo==='empenho'?'rec-empenho-select':'rec-nf-select');
  if(box&&sel) box.style.display=sel.value==='__novo'?'grid':'none';
}
function _recOption(label,value,selected){
  return `<option value="${_sanEsc(value)}"${selected?' selected':''}>${_sanEsc(label)}</option>`;
}
function _recCompatDocs(row, docs){
  return docs.filter(d=>{
    if(row.contrato_id && d.contrato_id && String(row.contrato_id)===String(d.contrato_id)) return true;
    if(row.processo_id && d.processo_id && String(row.processo_id)===String(d.processo_id)) return true;
    if(row.fornecedor_id && d.fornecedor_id && String(row.fornecedor_id)===String(d.fornecedor_id)) return true;
    if(row.emenda_id && d.emenda_id && String(row.emenda_id)===String(d.emenda_id)) return true;
    return !d.contrato_id&&!d.processo_id&&!d.fornecedor_id&&!d.emenda_id;
  });
}
async function _recCarregarDocs(row){
  const [{data:emps,error:e1},{data:nfs,error:e2}]=await Promise.all([
    sb.from('empenhos').select('*').order('created_at',{ascending:false}).limit(300),
    sb.from('notas_fiscais').select('*').order('created_at',{ascending:false}).limit(300)
  ]);
  if(e1) throw e1;
  if(e2) throw e2;
  _recEmpenhosRows=_recCompatDocs(row,emps||[]);
  _recNFsRows=_recCompatDocs(row,nfs||[]);
  // Empenho NÃO é cadastrado/selecionado no recebimento — apenas herdado (vinculado antes da AF).
  const nfSel=document.getElementById('rec-nf-select');
  nfSel.innerHTML=_recOption('Selecione uma nota fiscal...', '', false)+
    _recNFsRows.map(n=>_recOption(`${n.numero}${n.serie?(' serie '+n.serie):''}${n.data_emissao?(' - '+fmtDate(n.data_emissao)):''}`,n.id,String(n.id)===String(row.nota_fiscal_id))).join('')+
    _recOption('+ Cadastrar nova NF','__novo',!row.nota_fiscal_id);
  _recToggleNovoDoc('nf');
}
// Empenho herdado: vinculado ao item (empenho_itens) antes da AF, ou ao contrato.
async function _recCarregarEmpenhoHerdado(row){
  let emp=null;
  if(row.tipo==='ATA'){
    if(row.emenda_item_id){
      const {data:ei}=await sb.from('empenho_itens').select('empenho_id, empenhos(id,numero,ano)').eq('emenda_item_id',row.emenda_item_id).limit(1);
      if(ei&&ei.length&&ei[0].empenhos) emp=ei[0].empenhos;
    }
    if(!emp && row.empenho) emp={id:null,numero:row.empenho,ano:null};
    window._recEmpenhoHerdado=emp;
    const info=document.getElementById('rec-empenho-info');
    const hid=document.getElementById('rec-empenho-id-herdado');
    if(info) info.value=emp?`${emp.numero}${emp.ano?(' / '+emp.ano):''}`:'(nenhum empenho vinculado)';
    if(hid) hid.value=emp?.id||'';
    return emp;
  }
  const {data:ei}=await sb.from('empenho_itens').select('empenho_id, empenhos(id,numero,ano)').eq('item_id',row.item_id).limit(1);
  if(ei&&ei.length&&ei[0].empenhos) emp=ei[0].empenhos;
  if(!emp && row.contrato_id){
    const {data:ec}=await sb.from('empenhos').select('id,numero,ano').eq('contrato_id',row.contrato_id).limit(1);
    if(ec&&ec.length) emp=ec[0];
  }
  window._recEmpenhoHerdado=emp;
  const info=document.getElementById('rec-empenho-info');
  const hid=document.getElementById('rec-empenho-id-herdado');
  if(info) info.value=emp?`${emp.numero}${emp.ano?(' / '+emp.ano):''}`:'(nenhum empenho vinculado)';
  if(hid) hid.value=emp?emp.id:'';
  return emp;
}
// Item 14: visualização somente-leitura do recebimento de um item já totalmente recebido
function verRecebimento(entregaId){
  const r=entregasRows.find(x=>String(x.entrega_id)===String(entregaId));
  if(!r){ if(window.toast) toast('Recebimento não encontrado','error'); return; }
  const linhas=[
    ['Item', r.item],
    ['AF', r.af_numero],
    ['Processo/CPL', r.processo],
    ['Fornecedor', r.empresa],
    ['Qtde autorizada', r.qtde],
    ['Qtde recebida', r.qtde_recebida],
    ['Empenho', r.empenho],
    ['Nota fiscal', r.nota_fiscal],
    ['Possui patrimônio', r.possui_patrimonio===true?'Sim':(r.possui_patrimonio===false?'Não':'Não informado')],
    ['Patrimônio', r.patrimonio],
    ['Número de série', r.numero_serie],
    ['Recebido por', r.recebido_por],
    ['Data do recebimento', r.data_recebimentoISO?fmtDate(r.data_recebimentoISO):'']
  ].filter(([,v])=>v!=null&&String(v).trim()!=='' );
  const txt='Recebimento (somente leitura)\n\n'+linhas.map(([k,v])=>`${k}: ${v}`).join('\n')+
    '\n\nPara corrigir um recebimento concluído, use o fluxo de correção (restrito a administrador).';
  alert(txt);
}
// Renderiza N linhas de unidade (patrimônio + série) conforme a quantidade recebida agora.
function _recPossuiPatrimonio(){
  return document.querySelector('input[name="rec-possui-patrimonio"]:checked')?.value||'';
}
function _recDefinirPatrimonio(valor, bloqueado){
  document.querySelectorAll('input[name="rec-possui-patrimonio"]').forEach(el=>{
    el.checked=valor===(el.value==='sim');
    el.disabled=!!bloqueado;
  });
  window._recPatrimonioBloqueado=!!bloqueado;
  _recTogglePatrimonio();
}
function _recTogglePatrimonio(){
  const escolha=_recPossuiPatrimonio();
  const possui=escolha==='sim';
  const auto=document.getElementById('rec-patrimonio-auto');
  const bloco=document.getElementById('rec-patrimonio-unidades');
  if(auto) auto.style.display=possui?'block':'none';
  if(bloco) bloco.style.display=possui?'block':'none';
  const ajuda=document.getElementById('rec-patrimonio-ajuda');
  if(ajuda) ajuda.textContent=!escolha?'Selecione uma opção para continuar.':(possui?'Informe um patrimônio para cada unidade recebida.':'O item permanecerá consolidado, sem criar unidades físicas.');
  if(possui) _recRenderUnidades();
  else{
    const cont=document.getElementById('rec-unidades');
    if(cont) cont.innerHTML='';
  }
}
function _recRenderUnidades(){
  const cont=document.getElementById('rec-unidades'); if(!cont) return;
  if(_recPossuiPatrimonio()!=='sim'){ cont.innerHTML=''; return; }
  const n=Math.max(0,Math.floor(Number(document.getElementById('rec-qtde')?.value)||0));
  const off=Number(window._recUnidadeOffset)||0;
  // preserva o que já foi digitado
  const prev=[...cont.querySelectorAll('.rec-u-row')].map(r=>({p:r.querySelector('.rec-u-patr')?.value||'',s:r.querySelector('.rec-u-serie')?.value||''}));
  if(!n){ cont.innerHTML='<div style="font-size:11px;color:var(--text3)">Informe a quantidade recebida para listar as unidades.</div>'; return; }
  const inp='font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);box-sizing:border-box';
  let html='';
  for(let i=0;i<n;i++){
    const pv=_sanEsc(prev[i]?.p||''), sv=_sanEsc(prev[i]?.s||'');
    html+=`<div class="rec-u-row" style="display:grid;grid-template-columns:48px 1fr 1fr;gap:6px;align-items:center">
      <div style="font-size:11px;color:var(--text3);text-align:center">#${off+i+1}</div>
      <input type="text" class="rec-u-patr" value="${pv}" placeholder="patrimônio" style="${inp}">
      <input type="text" class="rec-u-serie" value="${sv}" placeholder="nº de série" style="${inp}">
    </div>`;
  }
  cont.innerHTML=html;
  _recAtualizaPatrimonioPreview();
}
// Atualiza os campos "Quantidade" e "Patrimônio final" do bloco de preenchimento automático.
function _recAtualizaPatrimonioPreview(){
  const qtdeField=document.getElementById('rec-pat-qtde');
  const finalField=document.getElementById('rec-pat-final');
  if(!qtdeField||!finalField) return;
  const n=document.querySelectorAll('#rec-unidades .rec-u-row').length;
  qtdeField.value=n||'';
  const inicialRaw=(document.getElementById('rec-pat-inicial')?.value||'').trim();
  const inicial=parseInt(inicialRaw,10);
  const valido=inicialRaw&&Number.isInteger(inicial)&&inicial>0&&String(inicial)===inicialRaw;
  finalField.value=(n>0&&valido)?(inicial+n-1):'';
}
// Gera sequência numérica simples de patrimônio (sem prefixo, sem zeros à esquerda) para as linhas de unidades recebidas.
async function _recGerarSequenciaPatrimonio(){
  const rows=[...document.querySelectorAll('#rec-unidades .rec-u-row')];
  const n=rows.length;
  if(!n){ if(window.toast) toast('Informe a quantidade recebida antes de gerar a sequência.','error'); return; }
  const inicialRaw=(document.getElementById('rec-pat-inicial')?.value||'').trim();
  const inicial=parseInt(inicialRaw,10);
  const valido=inicialRaw&&Number.isInteger(inicial)&&inicial>0&&String(inicial)===inicialRaw;
  if(!valido){ if(window.toast) toast('Informe um patrimônio inicial válido (número inteiro positivo, sem zeros à esquerda).','error'); return; }
  const final=inicial+n-1;
  const modo=document.querySelector('input[name="rec-pat-modo"]:checked')?.value||'vazios';
  const ok=await uiConfirm(`Serão preenchidos ${n} patrimônios, de ${inicial} até ${final}. Deseja continuar?`);
  if(!ok) return;
  const gerados=[];
  rows.forEach((row,i)=>{
    const patEl=row.querySelector('.rec-u-patr');
    if(!patEl) return;
    const valorAtual=patEl.value.trim();
    if(modo==='todos'||!valorAtual){
      patEl.value=String(inicial+i);
      gerados.push(patEl.value);
    }
  });
  const dup=await _recVerificarDuplicidadePatrimonio(gerados);
  if(dup.length&&window.toast) toast('Atenção: patrimônio(s) já cadastrado(s) em outro item: '+dup.join(', '),'error');
}
// Verifica se algum dos patrimônios informados já está cadastrado em outra unidade (Aquisição ou ATA).
async function _recVerificarDuplicidadePatrimonio(patrimonios){
  const list=[...new Set((patrimonios||[]).filter(Boolean).map(String))];
  if(!list.length) return [];
  const origem=document.getElementById('rec-origem')?.value||'';
  const entregaId=document.getElementById('rec-entrega-id')?.value||'';
  const execId=document.getElementById('rec-exec-id')?.value||'';
  const achados=new Set();
  try{
    const {data:d1}=await sb.from('itens_entregas_unidades').select('patrimonio,entrega_id').in('patrimonio',list);
    (d1||[]).forEach(r=>{ if(origem==='Aquisicao'&&String(r.entrega_id)===String(entregaId)) return; if(r.patrimonio) achados.add(String(r.patrimonio)); });
  }catch(_){}
  try{
    const {data:d2}=await sb.from('atas_execucao_unidades').select('patrimonio,exec_id').in('patrimonio',list);
    (d2||[]).forEach(r=>{ if(origem==='ATA'&&String(r.exec_id)===String(execId)) return; if(r.patrimonio) achados.add(String(r.patrimonio)); });
  }catch(_){}
  return [...achados];
}
// Valida ausência de duplicidade (interna à lista e contra o banco) antes de salvar o recebimento.
async function _recValidarPatrimoniosAntesSalvar(unidades, obrigatorios=false){
  if(obrigatorios){
    if(!unidades.length) return 'Nenhuma unidade física foi gerada para o recebimento.';
    const faltantes=unidades.reduce((acc,u,i)=>String(u.patrimonio||'').trim()?acc:acc.concat(i+1),[]);
    if(faltantes.length) return 'Informe o patrimônio de todas as unidades. Pendente(s): '+faltantes.join(', ');
  }
  const vals=(unidades||[]).map(u=>u.patrimonio).filter(Boolean).map(String);
  if(!vals.length) return null;
  const contagem={};
  vals.forEach(v=>{ contagem[v]=(contagem[v]||0)+1; });
  const internos=Object.keys(contagem).filter(k=>contagem[k]>1);
  if(internos.length) return 'Patrimônio(s) repetido(s) nesta lista de unidades: '+internos.join(', ');
  const dup=await _recVerificarDuplicidadePatrimonio(vals);
  if(dup.length) return 'Patrimônio(s) já cadastrado(s) em outro item: '+dup.join(', ');
  return null;
}
function _recPreencherUnidades(unidades){
  if(!unidades||!unidades.length) return;
  const rows=[...document.querySelectorAll('#rec-unidades .rec-u-row')];
  unidades.forEach((u,idx)=>{
    const row=rows[idx]; if(!row) return;
    const p=row.querySelector('.rec-u-patr');
    const s=row.querySelector('.rec-u-serie');
    if(p) p.value=u.patrimonio||'';
    if(s) s.value=u.numero_serie||'';
  });
}
async function abrirRecebimento(entregaId){
  if(bloquearSeVisualiz('itens')) return;
  const row=entregasRows.find(r=>String(r.entrega_id)===String(entregaId));
  if(!row||row.tipo!=='Aquisição'){ if(window.toast) toast('Recebimento disponivel apenas para aquisicoes','error'); return; }
  const saldo=Number(row.saldo_af)||0;
  document.getElementById('rec-origem').value='Aquisicao';
  document.getElementById('rec-exec-id').value='';
  document.getElementById('rec-entrega-id').value=row.entrega_id;
  document.getElementById('rec-item-id').value=row.item_id;
  document.getElementById('rec-info').innerHTML=`<b>${_sanEsc(row.item||'Item')}</b><br>AF ${_sanEsc(row.af_numero||'—')} · Processo ${_sanEsc(row.processo||'—')} · Fornecedor ${_sanEsc(row.empresa||'—')}`;
  document.getElementById('rec-qtde-autorizada').value=row.qtde||0;
  document.getElementById('rec-ja-recebida').value=row.qtde_recebida||0;
  document.getElementById('rec-saldo-af').value=saldo;
  document.getElementById('rec-qtde').value=saldo>0?saldo:'';
  document.getElementById('rec-tipo').value=saldo>0 && saldo<Number(row.qtde||0)?'parcial':'total';
  document.getElementById('rec-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('rec-recebido-por').value=row.recebido_por||'';
  document.getElementById('rec-marca-modelo').value=[row.marca,row.modelo].filter(Boolean).join(' ')||'—';
  ['rec-nf-numero','rec-nf-data','rec-nf-valor','rec-nf-obs'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  document.getElementById('rec-nf-data').value=document.getElementById('rec-data').value;
  _recSetMsg('');
  // offset: unidades já registradas nesta AF (numeração continua em recebimentos parciais)
  let off=0;
  try{ const {count}=await sb.from('itens_entregas_unidades').select('id',{count:'exact',head:true}).eq('entrega_id',row.entrega_id); off=Number(count)||0; }catch(_){}
  window._recUnidadeOffset=off;
  document.getElementById('rec-pat-inicial').value='';
  _recDefinirPatrimonio(row.possui_patrimonio, row.possui_patrimonio!=null&&(Number(row.qtde_recebida)||0)>0);
  try{ await _recCarregarDocs(row); await _recCarregarEmpenhoHerdado(row); }
  catch(e){ _recSetMsg('Erro ao carregar documentos: '+e.message,'err'); }
  document.getElementById('modal-recebimento').classList.add('active');
}
async function abrirRecebimentoAta(execId){
  if(bloquearSeVisualiz('itens')) return;
  const row=entregasRows.find(r=>String(r.exec_id)===String(execId)&&r.tipo==='ATA');
  if(!row){ if(window.toast) toast('Recebimento da ATA nao encontrado','error'); return; }
  if(!row.af_numero&&!row.af_dataISO){ if(window.toast) toast('Emita a AF antes de receber o item da ata.','error'); return; }
  let unidadesExistentes=[];
  try{
    const {data}=await sb.from('atas_execucao_unidades')
      .select('patrimonio,numero_serie,unidade_seq')
      .eq('exec_id',row.exec_id)
      .order('unidade_seq',{ascending:true});
    unidadesExistentes=data||[];
  }catch(_){}
  const qtde=Number(row.qtde)||0;
  const jaRecebida=row.recebido?qtde:0;
  const saldo=Math.max(0,qtde-jaRecebida);
  document.getElementById('rec-origem').value='ATA';
  document.getElementById('rec-entrega-id').value='';
  document.getElementById('rec-item-id').value='';
  document.getElementById('rec-exec-id').value=row.exec_id;
  document.getElementById('rec-info').innerHTML=`<b>${_sanEsc(row.item||'Item')}</b><br>AF ${_sanEsc(row.af_numero||'—')} · Processo ${_sanEsc(row.processo||'—')} · Fornecedor ${_sanEsc(row.empresa||'—')}`;
  document.getElementById('rec-qtde-autorizada').value=qtde||0;
  document.getElementById('rec-ja-recebida').value=jaRecebida||0;
  document.getElementById('rec-saldo-af').value=saldo;
  document.getElementById('rec-qtde').value=saldo>0?saldo:qtde||'';
  document.getElementById('rec-tipo').value='total';
  document.getElementById('rec-data').value=row.entregaISO||new Date().toISOString().slice(0,10);
  document.getElementById('rec-recebido-por').value=row.recebido_por||'';
  document.getElementById('rec-marca-modelo').value=[row.marca,row.modelo].filter(Boolean).join(' ')||'â€”';
  ['rec-nf-numero','rec-nf-data','rec-nf-valor','rec-nf-obs'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  document.getElementById('rec-nf-data').value=document.getElementById('rec-data').value;
  _recSetMsg('');
  window._recUnidadeOffset=0;
  document.getElementById('rec-pat-inicial').value='';
  _recDefinirPatrimonio(row.possui_patrimonio, row.possui_patrimonio!=null&&!!row.recebido);
  _recPreencherUnidades(unidadesExistentes);
  try{ await _recCarregarDocs(row); await _recCarregarEmpenhoHerdado(row); }
  catch(e){ _recSetMsg('Erro ao carregar documentos: '+e.message,'err'); }
  document.getElementById('modal-recebimento').classList.add('active');
}
async function _recObterOuCriarEmpenho(row){
  // Empenho é herdado (vinculado antes da AF). O recebimento nunca cria/altera empenho.
  const emp=window._recEmpenhoHerdado;
  if(emp&&emp.id) return emp;
  throw new Error('Item sem empenho vinculado. Vincule o empenho ao item (ou contrato) antes do recebimento — isso é feito na emissão da AF.');
}
async function _recObterOuCriarNF(row){
  const sel=document.getElementById('rec-nf-select').value;
  if(sel&&sel!=='__novo') return _recNFsRows.find(n=>String(n.id)===String(sel))||{id:sel,numero:''};
  const digitos=document.getElementById('rec-nf-numero').value.trim();
  if(!digitos) throw new Error('Informe o numero da nova NF ou selecione uma existente.');
  const numero='NF '+digitos;
  const norm=normalizarNumeroDocumento(numero);
  const dup=_recNFsRows.find(n=>normalizarNumeroDocumento(n.numero)===norm);
  if(dup){
    const usar=await uiConfirm(`Possivel NF duplicada encontrada: ${dup.numero}.\n\nUsar a nota existente?`);
    if(!usar) throw new Error('Cadastro de NF cancelado para evitar duplicidade.');
    return dup;
  }
  const dataEmissao=document.getElementById('rec-nf-data').value||document.getElementById('rec-data').value||null;
  const payload={
    numero, numero_normalizado:norm,
    fornecedor_id:row.fornecedor_id, contrato_id:row.contrato_id, processo_id:row.processo_id, emenda_id:row.emenda_id,
    data_emissao:dataEmissao, data_recebimento:document.getElementById('rec-data').value||null,
    valor_total:_recNum('rec-nf-valor'), observacoes:document.getElementById('rec-nf-obs').value.trim()||null,
    status:'recebida'
  };
  const {data,error}=await sb.from('notas_fiscais').insert(payload).select('*').single();
  if(error) throw error;
  return data;
}
async function _recGarantirEmpenhoItem(row, empenho, qtde){
  const payload={empenho_id:empenho.id,item_id:row.item_id,emenda_id:row.emenda_id,emenda_item_id:row.emenda_item_id,quantidade_vinculada:qtde,valor_vinculado:row.valor_item?Number((Number(row.valor_item)*qtde).toFixed(2)):null};
  const {data:exist,error:e1}=await sb.from('empenho_itens').select('id,quantidade_vinculada,valor_vinculado').eq('empenho_id',empenho.id).eq('item_id',row.item_id).maybeSingle();
  if(e1) throw e1;
  if(exist){
    const {error}=await sb.from('empenho_itens').update({quantidade_vinculada:(Number(exist.quantidade_vinculada)||0)+qtde,valor_vinculado:(Number(exist.valor_vinculado)||0)+(payload.valor_vinculado||0)}).eq('id',exist.id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('empenho_itens').insert(payload);
    if(error) throw error;
  }
}
async function _recGarantirNFItem(row, nf, empenho, qtde){
  const payload={nota_fiscal_id:nf.id,item_id:row.item_id,emenda_id:row.emenda_id,emenda_item_id:row.emenda_item_id,empenho_id:empenho.id,quantidade:qtde,valor_unitario:row.valor_item||null,valor_total:row.valor_item?Number((Number(row.valor_item)*qtde).toFixed(2)):null};
  let q=sb.from('nota_fiscal_itens').select('id,quantidade,valor_total').eq('nota_fiscal_id',nf.id).eq('item_id',row.item_id);
  q=empenho?.id?q.eq('empenho_id',empenho.id):q.is('empenho_id',null);
  const {data:exist,error:e1}=await q.maybeSingle();
  if(e1) throw e1;
  if(exist){
    const {error}=await sb.from('nota_fiscal_itens').update({quantidade:(Number(exist.quantidade)||0)+qtde,valor_total:(Number(exist.valor_total)||0)+(payload.valor_total||0)}).eq('id',exist.id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('nota_fiscal_itens').insert(payload);
    if(error) throw error;
  }
}
function _wbValorAtualPermite(atual, novo){
  if(!novo) return false;
  if(!atual) return true;
  return normalizarNumeroDocumento(atual)===normalizarNumeroDocumento(novo);
}
async function _recWriteBackEmenda(row, empenho, nf, patrimonio){
  if(!row.emenda_item_id) return;
  const {data:cur,error:e1}=await sb.from('emenda_itens').select('nota_fiscal,empenho,patrimonio').eq('id',row.emenda_item_id).maybeSingle();
  if(e1) throw e1;
  if(!cur) return;
  const patch={};
  if(_wbValorAtualPermite(cur.empenho,empenho?.numero)) patch.empenho=empenho.numero;
  else if(cur.empenho && empenho?.numero && normalizarNumeroDocumento(cur.empenho)!==normalizarNumeroDocumento(empenho.numero)) console.warn('Write-back ignorou empenho manual em emenda_itens',row.emenda_item_id);
  if(_wbValorAtualPermite(cur.nota_fiscal,nf?.numero)) patch.nota_fiscal=nf.numero;
  else if(cur.nota_fiscal && nf?.numero && normalizarNumeroDocumento(cur.nota_fiscal)!==normalizarNumeroDocumento(nf.numero)) console.warn('Write-back ignorou NF manual em emenda_itens',row.emenda_item_id);
  if(patrimonio && !cur.patrimonio) patch.patrimonio=patrimonio;
  if(Object.keys(patch).length){
    const {error}=await sb.from('emenda_itens').update(patch).eq('id',row.emenda_item_id);
    if(error) throw error;
  }
}
async function salvarRecebimentoAta(){
  const execId=document.getElementById('rec-exec-id').value;
  const row=entregasRows.find(r=>String(r.exec_id)===String(execId)&&r.tipo==='ATA');
  if(!row){ _recSetMsg('Registro da ATA nao encontrado.','err'); return; }
  const qtde=_recNum('rec-qtde');
  const totalAut=Number(row.qtde)||0;
  if(!qtde||qtde<=0){ _recSetMsg('Informe uma quantidade recebida maior que zero.','err'); return; }
  if(totalAut && qtde!==totalAut){
    _recSetMsg('Recebimento de ATA deve fechar a quantidade total autorizada nesta AF.','err');
    return;
  }
  const dataRec=document.getElementById('rec-data').value;
  if(!dataRec){ _recSetMsg('Informe a data do recebimento.','err'); return; }
  const escolhaPatrimonio=_recPossuiPatrimonio();
  if(!escolhaPatrimonio){ _recSetMsg('Informe se o item possui patrimônio.','err'); return; }
  const possuiPatrimonio=escolhaPatrimonio==='sim';
  const btn=document.getElementById('rec-salvar'); const label=btn.textContent;
  btn.disabled=true; btn.textContent='Salvando...'; _recSetMsg('Salvando...');
  try{
    const nf=await _recObterOuCriarNF(row);
    const emp=await _recCarregarEmpenhoHerdado(row);
    const empNumero=emp?.numero||row.empenho||null;
    if(!empNumero) throw new Error('Item sem empenho vinculado. Vincule o empenho antes do recebimento.');
    const unidades=possuiPatrimonio?[...document.querySelectorAll('#rec-unidades .rec-u-row')].map(r=>({
      patrimonio:(r.querySelector('.rec-u-patr')?.value||'').trim(),
      numero_serie:(r.querySelector('.rec-u-serie')?.value||'').trim()
    })):[];
    const erroPat=await _recValidarPatrimoniosAntesSalvar(unidades,possuiPatrimonio);
    if(erroPat) throw new Error(erroPat);
    const patch={dt_entrega:dataRec,nf:nf.numero||null,empenho:empNumero,possui_patrimonio:possuiPatrimonio};
    const {error}=await sb.from('atas_execucao').update(patch).eq('id',execId);
    if(error) throw error;
    const {error:delU}=await sb.from('atas_execucao_unidades').delete().eq('exec_id',execId);
    if(delU) throw delU;
    const unidadesPayload=unidades.map((u,i)=>({
      exec_id:execId,
      ata_item_id:row.ata_item_id||null,
      emenda_item_id:row.emenda_item_id||null,
      unidade_seq:i+1,
      patrimonio:u.patrimonio||null,
      numero_serie:u.numero_serie||null,
      nota_fiscal_id:nf.id||null,
      recebido_em:dataRec,
      recebido_por:document.getElementById('rec-recebido-por').value.trim()||null
    }));
    if(unidadesPayload.length){
      const {error:insU}=await sb.from('atas_execucao_unidades').insert(unidadesPayload);
      if(insU) throw insU;
    }
    const patrimonioResumo=unidades.map(_unidadeFisicaLabel).filter(Boolean).join('; ')||null;
    await _recWriteBackEmenda(row,{numero:empNumero},nf,null);
    row.recebido=true;
    row.entregaISO=dataRec;
    row.nota_fiscal=nf.numero||row.nota_fiscal||'';
    row.patrimonio=patrimonioResumo||row.patrimonio||'';
    row.empenho=empNumero;
    document.getElementById('modal-recebimento').classList.remove('active');
    if(window.toast) toast('Recebimento da ATA registrado','success');
    itensEntregasCarregado=false;
    confirmacoesCarregado=false;
    await loadItensEntregas();
    await loadConfirmacoes();
    await loadAtas();
    if(row.emenda_item_id) loadData();
  }catch(e){
    _recSetMsg('Erro: '+e.message,'err');
  }finally{
    btn.disabled=false; btn.textContent=label;
  }
}
async function salvarRecebimento(){
  if(bloquearSeVisualiz('itens')) return;
  if((document.getElementById('rec-origem')?.value||'')==='ATA') return salvarRecebimentoAta();
  const entregaId=document.getElementById('rec-entrega-id').value;
  const row=entregasRows.find(r=>String(r.entrega_id)===String(entregaId));
  if(!row){ _recSetMsg('Registro de AF nao encontrado.','err'); return; }
  const qtde=_recNum('rec-qtde');
  const saldo=Number(row.saldo_af)||0;
  if(!qtde||qtde<=0){ _recSetMsg('Informe uma quantidade recebida maior que zero.','err'); return; }
  if(qtde>saldo){
    _recSetMsg(`Quantidade recebida (${qtde}) excede o saldo da AF (${saldo}).`,'err');
    return;
  }
  const dataRec=document.getElementById('rec-data').value;
  if(!dataRec){ _recSetMsg('Informe a data do recebimento.','err'); return; }
  const escolhaPatrimonio=_recPossuiPatrimonio();
  if(!escolhaPatrimonio){ _recSetMsg('Informe se o item possui patrimônio.','err'); return; }
  const possuiPatrimonio=escolhaPatrimonio==='sim';
  const btn=document.getElementById('rec-salvar'); const label=btn.textContent;
  btn.disabled=true; btn.textContent='Salvando...'; _recSetMsg('Salvando...');
  try{
    const empenho=await _recObterOuCriarEmpenho(row);
    const nf=await _recObterOuCriarNF(row);
    await _recGarantirEmpenhoItem(row,empenho,qtde);
    await _recGarantirNFItem(row,nf,empenho,qtde);
    const totalRecebido=(Number(row.qtde_recebida)||0)+qtde;
    const totalAut=Number(row.qtde)||0;
    const tipo=totalRecebido>=totalAut?'total':document.getElementById('rec-tipo').value;
    const recPor=document.getElementById('rec-recebido-por').value.trim()||null;
    // coleta as unidades recebidas agora (patrimônio/série por unidade)
    const off=Number(window._recUnidadeOffset)||0;
    const unidades=possuiPatrimonio?[...document.querySelectorAll('#rec-unidades .rec-u-row')].map((r,i)=>({
      entrega_id:entregaId, item_id:row.item_id, unidade_seq:off+i+1,
      patrimonio:(r.querySelector('.rec-u-patr')?.value||'').trim()||null,
      numero_serie:(r.querySelector('.rec-u-serie')?.value||'').trim()||null,
      nota_fiscal_id:nf.id||null, recebido_em:dataRec, recebido_por:recPor
    })):[];
    const erroPat=await _recValidarPatrimoniosAntesSalvar(unidades,possuiPatrimonio);
    if(erroPat) throw new Error(erroPat);
    const patch={
      empenho_id:empenho.id, empenho:empenho.numero||null,
      nota_fiscal_id:nf.id, nota_fiscal:nf.numero||null, nf_data:nf.data_emissao||document.getElementById('rec-nf-data').value||null,
      qtde_recebida:totalRecebido, data_recebimento:dataRec,
      recebido_por:recPor,
      recebimento_tipo:tipo, possui_patrimonio:possuiPatrimonio, status:tipo==='total'?'recebido':'recebido_parcial'
    };
    const {error}=await sb.from('itens_entregas').update(patch).eq('id',entregaId);
    if(error) throw error;
    // grava as unidades (o trigger sincroniza patrimonio/numero_serie agregados em itens_entregas)
    if(unidades.length){ const {error:eu}=await sb.from('itens_entregas_unidades').insert(unidades); if(eu) throw eu; }
    const patrimonioWB=unidades.map(u=>u.patrimonio).filter(Boolean)[0]||null;
    await _recWriteBackEmenda(row,empenho,nf,patrimonioWB);
    document.getElementById('modal-recebimento').classList.remove('active');
    if(window.toast) toast('Recebimento registrado','success');
    itensEntregasCarregado=false;
    confirmacoesCarregado=false;
    await loadItensEntregas();
    await loadConfirmacoes();
    await loadItens();
    if(row.emenda_item_id) loadData();
    if(row.contrato_id) _ctRecarregarAposEntrega();
  }catch(e){
    _recSetMsg('Erro: '+e.message,'err');
  }finally{
    btn.disabled=false; btn.textContent=label;
  }
}
window.abrirRecebimento=abrirRecebimento;
window.abrirRecebimentoAta=abrirRecebimentoAta;
window.salvarRecebimento=salvarRecebimento;
window._recTogglePatrimonio=_recTogglePatrimonio;
window._recToggleNovoDoc=_recToggleNovoDoc;
window.normalizarNumeroDocumento=normalizarNumeroDocumento;

// Fase 7 — confirmação de entrega na unidade + termo
let confirmacaoRows=[], confirmacoesCarregado=false;
function _confStatus(row){ return row.data_entrega_unidade?'confirmado':'pendente'; }
function _confBadge(status){
  const ok=status==='confirmado';
  return `<span class="badge" style="background:${ok?'var(--green-bg)':'var(--amber-bg)'};color:${ok?'var(--green-text)':'var(--amber-text)'}">${ok?'Confirmado':'Pendente'}</span>`;
}
function _confSetMsg(txt,tipo){
  const msg=document.getElementById('cu-msg'); if(!msg) return;
  msg.textContent=txt||''; msg.className='fmsg '+(tipo||'');
}
async function loadConfirmacoes(){
  if(!userCanView('itens')&&!_isAdmin()) return;
  const wrap=document.getElementById('confirmacao-wrap'); if(!wrap) return;
  wrap.innerHTML='<div style="padding:1rem;color:var(--text3)"><span class="spinner"></span> Carregando confirmações...</div>';
  const rows=[];
  const {data:aq,error:e1}=await sb.from('itens_entregas')
    .select('*, empenhos(numero), notas_fiscais(numero), itens(id,descricao,qtde,processo_id,contrato_id,fornecedor_id,emenda_id,emenda_item_id,processos(identificador),contratos(cpl,numero_contrato),fornecedores(razao_social),unidades(nome))')
    .not('af_numero','is',null)
    .order('af_data',{ascending:false});
  if(e1){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro (aquisições): '+_sanEsc(e1.message)+'</div>'; return; }
  const confItemIds=[...new Set((aq||[]).map(r=>r.item_id).filter(Boolean))];
  const confContratoIds=[...new Set((aq||[]).map(r=>r.itens?.contrato_id).filter(Boolean))];
  const empPorItem={}, empPorContrato={};
  if(confItemIds.length){
    const {data:ei}=await sb.from('empenho_itens').select('item_id,empenhos(numero)').in('item_id',confItemIds);
    (ei||[]).forEach(x=>{ if(x.item_id){ (empPorItem[x.item_id]=empPorItem[x.item_id]||[]).push(x.empenhos?.numero||''); } });
  }
  if(confContratoIds.length){
    const {data:ec}=await sb.from('empenhos').select('numero,contrato_id').in('contrato_id',confContratoIds);
    (ec||[]).forEach(e=>{ if(e.contrato_id){ (empPorContrato[e.contrato_id]=empPorContrato[e.contrato_id]||[]).push(e.numero||''); } });
  }
  (aq||[]).forEach(r=>{
    if((r.status||'')==='cancelada') return;
    if(!r.af_numero && !r.af_data) return;
    // Só aparece em Confirmação após recebimento interno (qtde_recebida > 0 ou data_recebimento preenchida).
    if(!(Number(r.qtde_recebida)||0) && !r.data_recebimento) return;
    const it=r.itens||{};
    const empVinculado=(empPorItem[r.item_id]||empPorContrato[it.contrato_id]||[]).filter(Boolean).join(', ');
    const nfAq=r.notas_fiscais?.numero||r.nota_fiscal||'';
    if(!nfAq) return;
    rows.push({
      tipo:'Aquisição', id:r.id, item_id:r.item_id,
      processo:it.processos?.identificador||'', contrato:[it.contratos?.cpl,it.contratos?.numero_contrato].filter(Boolean).join(' · '),
      empresa:it.fornecedores?.razao_social||'', item:it.descricao||'', unidade:it.unidades?.nome||'',
      qtde:Number(r.qtde_recebida)||Number(r.qtde_autorizada)||0, patrimonio:r.patrimonio||'', empenho:r.empenhos?.numero||r.empenho||empVinculado||'',
      nota_fiscal:nfAq, af_numero:r.af_numero||'', af_data:_toISODate(r.af_data), data_recebimento:_toISODate(r.data_recebimento),
      data_entrega_unidade:_toISODate(r.data_entrega_unidade), termo_arquivo:r.termo_arquivo||'',
      termo_responsavel:r.termo_responsavel||'', termo_cargo:r.termo_cargo||'', confirmacao_obs:r.confirmacao_obs||'',
      emenda_item_id:it.emenda_item_id||null
    });
  });
  const {data:at,error:e2}=await sb.from('atas_execucao').select('*').order('created_at',{ascending:false});
  if(e2){ wrap.innerHTML='<div style="padding:1rem;color:var(--red)">Erro (atas): '+_sanEsc(e2.message)+'</div>'; return; }
  const ataEmendaInfo={};
  const ataEmendaIds=[...new Set((at||[]).map(r=>r.emenda_item_id).filter(Boolean))];
  if(ataEmendaIds.length){
    const {data:emInfo}=await sb.from('emenda_itens').select('id,item,unidade_beneficiada,unidade_entrega,empenho,nota_fiscal,patrimonio').in('id',ataEmendaIds);
    (emInfo||[]).forEach(e=>{ ataEmendaInfo[String(e.id)]=e; });
  }
  const ataItemInfo={};
  const ataItemIds=[...new Set((at||[]).map(r=>r.ata_item_id).filter(Boolean))];
  if(ataItemIds.length){
    const {data:aiInfo}=await sb.from('atas_itens').select('id,cpl,sim,item,empresa,contratos(cpl,numero_contrato,prestador,status)').in('id',ataItemIds);
    (aiInfo||[]).forEach(i=>{ ataItemInfo[String(i.id)]=i; });
  }
  (at||[]).forEach(r=>{
    const emInfo=ataEmendaInfo[String(r.emenda_item_id||'')]||{};
    const ai=ataItemInfo[String(r.ata_item_id||'')]||{};
    if(String(ai.contratos?.status||'').toUpperCase().startsWith('ENCERRAD')) return;
    const nfAta=r.nf||emInfo.nota_fiscal||'';
    const dataRec=_toISODate(r.dt_entrega);
    // ATA so aparece aqui apos recebimento administrativo com NF.
    if(!dataRec || !nfAta) return;
    rows.push({
      tipo:'ATA', id:r.id, processo:r.cpl||ai.cpl||ai.contratos?.cpl||'', contrato:r.sim||ai.sim||ai.contratos?.numero_contrato||'', empresa:ai.empresa||ai.contratos?.prestador||'',
      item:r.item||ai.item||emInfo.item||'', unidade:r.unidade||emInfo.unidade_entrega||emInfo.unidade_beneficiada||'', qtde:Number(r.qtde)||0, patrimonio:emInfo.patrimonio||r.patrimonio||'',
      empenho:r.empenho||emInfo.empenho||'', nota_fiscal:nfAta, data_recebimento:dataRec,
      data_entrega_unidade:_toISODate(r.data_entrega_unidade), termo_arquivo:r.termo_arquivo||'',
      termo_responsavel:r.termo_responsavel||'', termo_cargo:r.termo_cargo||'', confirmacao_obs:r.confirmacao_obs||'',
      emenda_item_id:r.emenda_item_id||null
    });
  });
  confirmacaoRows=rows;
  confirmacoesCarregado=true;
  renderConfirmacoes();
}
function renderConfirmacoes(){
  const wrap=document.getElementById('confirmacao-wrap'); if(!wrap) return;
  const q=(document.getElementById('conf-busca')?.value||'').toLowerCase();
  const tipo=document.getElementById('conf-f-tipo')?.value||'';
  const status=document.getElementById('conf-f-status')?.value||'pendente';
  const rows=confirmacaoRows.filter(r=>{
    if(tipo && r.tipo!==tipo) return false;
    if(status && status!=='todos' && _confStatus(r)!==status) return false;
    if(q){ const hay=[r.tipo,r.processo,r.contrato,r.empresa,r.item,r.unidade,r.patrimonio,r.empenho,r.nota_fiscal,r.termo_arquivo].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>_confStatus(a).localeCompare(_confStatus(b)) || String(a.unidade||'').localeCompare(String(b.unidade||''),'pt-BR'));
  const cEl=document.getElementById('conf-count'); if(cEl) cEl.textContent=`${rows.length} registro(s)`;
  if(!rows.length){ wrap.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:13px">Nenhuma entrega encontrada para os filtros atuais.</div>'; return; }
  wrap.innerHTML=`<table style="width:100%;font-size:12px;border-collapse:collapse;background:var(--surface)">
    <thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border)">
      <th style="padding:7px 8px">Tipo</th><th style="padding:7px 8px">Processo/CPL</th><th style="padding:7px 8px">Contrato/Ata</th><th style="padding:7px 8px">Item</th><th style="padding:7px 8px">Unidade</th><th style="padding:7px 8px;text-align:right">Qtde</th><th style="padding:7px 8px">Documentos</th><th style="padding:7px 8px">Recebimento</th><th style="padding:7px 8px">Entrega unidade</th><th style="padding:7px 8px">Responsável</th><th style="padding:7px 8px">Termo</th><th style="padding:7px 8px">Status</th><th style="padding:7px 8px">Ações</th>
    </tr></thead><tbody>${rows.map(r=>{
      const tipoCor=r.tipo==='ATA'?'#A371F7':'#378ADD';
      const termo=r.termo_arquivo?`<button onclick="abrirTermoEntrega('${encodeURIComponent(r.termo_arquivo)}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Abrir</button>`:'—';
      const pode=(r.tipo==='ATA'?podeEditar('atas'):podeEditar('itens'));
      const btn=pode?`<button onclick="abrirConfirmacaoUnidade('${r.tipo}','${r.id}')" style="font-size:11px;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--green);background:var(--green);color:#fff;cursor:pointer;white-space:nowrap">${r.data_entrega_unidade?'Editar':'Confirmar'}</button>`:'—';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px"><span class="badge" style="background:${tipoCor}22;color:${tipoCor};white-space:nowrap">${r.tipo}</span></td>
        <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r.processo||'—')}</td>
        <td style="padding:6px 8px;white-space:nowrap">${_sanEsc(r.contrato||'—')}</td>
        <td style="padding:6px 8px">${_sanEsc(r.item||'—')}</td>
        <td style="padding:6px 8px">${_sanEsc(r.unidade||'—')}</td>
        <td style="padding:6px 8px;text-align:right">${r.qtde||'—'}</td>
        <td style="padding:6px 8px;white-space:nowrap;color:var(--text3)">${r.af_numero?('AF: '+_sanEsc(r.af_numero)+(r.af_data?' · '+fmtDate(r.af_data):'')+'<br>'):''}Emp: ${_sanEsc(r.empenho||'—')}<br>NF: ${_sanEsc(r.nota_fiscal||'—')}${r.patrimonio?('<br>Pat: '+_sanEsc(r.patrimonio)):''}</td>
        <td style="padding:6px 8px;white-space:nowrap">${r.data_recebimento?fmtDate(r.data_recebimento):'—'}</td>
        <td style="padding:6px 8px;white-space:nowrap">${r.data_entrega_unidade?fmtDate(r.data_entrega_unidade):'—'}</td>
        <td style="padding:6px 8px">${_sanEsc(r.termo_responsavel||'—')}${r.termo_cargo?('<br><span style="color:var(--text3)">'+_sanEsc(r.termo_cargo)+'</span>'):''}</td>
        <td style="padding:6px 8px">${termo}</td>
        <td style="padding:6px 8px">${_confBadge(_confStatus(r))}</td>
        <td style="padding:6px 8px">${btn}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}
function abrirConfirmacaoUnidade(tipo,id){
  const row=confirmacaoRows.find(r=>r.tipo===tipo&&String(r.id)===String(id));
  if(!row) return;
  if(tipo==='ATA'&&bloquearSeVisualiz('atas')) return;
  if(tipo!=='ATA'&&bloquearSeVisualiz('itens')) return;
  document.getElementById('cu-tipo').value=tipo;
  document.getElementById('cu-id').value=id;
  document.getElementById('cu-info').innerHTML=`<b>${_sanEsc(row.item||'Item')}</b><br>${_sanEsc(tipo)} · ${_sanEsc(row.processo||'—')} · Unidade ${_sanEsc(row.unidade||'—')} · Qtde ${row.qtde||'—'}`;
  document.getElementById('cu-data').value=row.data_entrega_unidade||new Date().toISOString().slice(0,10);
  document.getElementById('cu-responsavel').value=row.termo_responsavel||'';
  document.getElementById('cu-cargo').value=row.termo_cargo||'';
  document.getElementById('cu-obs').value=row.confirmacao_obs||'';
  document.getElementById('cu-arquivo').value='';
  _confSetMsg(row.termo_arquivo?'Termo atual será mantido se nenhum novo arquivo for selecionado.':'');
  document.getElementById('modal-confirmacao-unidade').classList.add('active');
}
function _safeFileName(name){
  return String(name||'termo.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase();
}
function _fileToDataUrl(file){
  return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});
}
async function _imagemParaPdfBlob(file){
  await ensureLib('html2pdf');
  const dataUrl=await _fileToDataUrl(file);
  const div=document.createElement('div');
  div.style.cssText='width:190mm;min-height:260mm;padding:10mm;background:#fff;color:#111;font-family:Arial,sans-serif';
  div.innerHTML=`<h2 style="font-size:14pt;margin:0 0 8mm">Termo de entrega na unidade</h2><img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:0 auto">`;
  document.body.appendChild(div);
  try{
    return await html2pdf().set({margin:[10,10,10,10],html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(div).outputPdf('blob');
  }finally{
    div.remove();
  }
}
async function _prepararTermoUpload(file){
  if(!file) return null;
  const mime=String(file.type||'');
  if(mime==='application/pdf') return {blob:file, ext:'pdf', contentType:'application/pdf'};
  if(mime.startsWith('image/')){
    const blob=await _imagemParaPdfBlob(file);
    return {blob, ext:'pdf', contentType:'application/pdf'};
  }
  throw new Error('Envie um PDF ou imagem.');
}
async function _uploadTermoEntrega(row,file){
  const prep=await _prepararTermoUpload(file);
  if(!prep) return row.termo_arquivo||null;
  const prefix=row.tipo==='ATA'?'atas':'aquisicoes';
  const path=`${prefix}/${row.id}/${Date.now()}-${_safeFileName(file.name).replace(/\.[^.]+$/,'')}.${prep.ext}`;
  const {error}=await sb.storage.from('termos-entrega').upload(path,prep.blob,{contentType:prep.contentType,upsert:false});
  if(error) throw error;
  return path;
}
async function removerTermosEntrega(paths){
  const unicos=[...new Set((paths||[]).map(path=>String(path||'').trim()).filter(Boolean))];
  if(!unicos.length) return [];
  const {data,error}=await sb.storage.from('termos-entrega').remove(unicos);
  if(error) throw error;
  return data||[];
}
async function abrirTermoEntrega(encodedPath){
  const path=decodeURIComponent(encodedPath||'');
  if(!path) return;
  const {data,error}=await sb.storage.from('termos-entrega').createSignedUrl(path,3600);
  if(error||!data?.signedUrl){ alert('Não foi possível gerar o link do termo.'); return; }
  window.open(data.signedUrl,'_blank');
}
async function _confWriteBackEmenda(row,dataEntrega){
  if(!row.emenda_item_id||!dataEntrega) return;
  const {data:cur,error:e1}=await sb.from('emenda_itens').select('data_entrega').eq('id',row.emenda_item_id).maybeSingle();
  if(e1) throw e1;
  if(!cur) return;
  if(!cur.data_entrega || _toISODate(cur.data_entrega)===dataEntrega){
    const {error}=await sb.from('emenda_itens').update({data_entrega:dataEntrega}).eq('id',row.emenda_item_id);
    if(error) throw error;
  }else{
    console.warn('Write-back ignorou data_entrega manual em emenda_itens',row.emenda_item_id);
  }
}
async function salvarConfirmacaoUnidade(){
  const tipo=document.getElementById('cu-tipo').value;
  const id=document.getElementById('cu-id').value;
  const row=confirmacaoRows.find(r=>r.tipo===tipo&&String(r.id)===String(id));
  if(!row){ _confSetMsg('Registro não encontrado.','err'); return; }
  if(tipo==='ATA'&&bloquearSeVisualiz('atas')) return;
  if(tipo!=='ATA'&&bloquearSeVisualiz('itens')) return;
  const dataEntrega=document.getElementById('cu-data').value;
  const responsavel=document.getElementById('cu-responsavel').value.trim();
  if(!dataEntrega){ _confSetMsg('Informe a data real de entrega.','err'); return; }
  if(!responsavel){ _confSetMsg('Informe o responsável pelo recebimento na unidade.','err'); return; }
  const file=document.getElementById('cu-arquivo').files?.[0]||null;
  if(!file && !row.termo_arquivo){ _confSetMsg('Anexe o termo em PDF ou imagem.','err'); return; }
  const btn=document.getElementById('cu-salvar'); const label=btn.textContent;
  btn.disabled=true; btn.textContent='Salvando...'; _confSetMsg('Salvando...');
  let novoTermoPath=null;
  let registroAtualizado=false;
  try{
    const termoPath=await _uploadTermoEntrega(row,file);
    if(file) novoTermoPath=termoPath;
    const patch={
      data_entrega_unidade:dataEntrega,
      termo_arquivo:termoPath,
      termo_responsavel:responsavel,
      termo_cargo:document.getElementById('cu-cargo').value.trim()||null,
      confirmacao_obs:document.getElementById('cu-obs').value.trim()||null
    };
    const table=tipo==='ATA'?'atas_execucao':'itens_entregas';
    const {error}=await sb.from(table).update(patch).eq('id',id);
    if(error) throw error;
    registroAtualizado=true;
    if(file && row.termo_arquivo && row.termo_arquivo!==termoPath){
      try{ await removerTermosEntrega([row.termo_arquivo]); }
      catch(cleanupError){ console.warn('Termo anterior não removido do Storage',cleanupError); }
    }
    if(tipo!=='ATA') await _confWriteBackEmenda(row,dataEntrega);
    document.getElementById('modal-confirmacao-unidade').classList.remove('active');
    if(window.toast) toast('Entrega na unidade confirmada','success');
    confirmacoesCarregado=false;
    await loadConfirmacoes();
    inventarioCarregado=false;
    if(window._activeTab==='inventario-ac') loadInventario();
    itensEntregasCarregado=false;
    if(document.getElementById('itens-sub-entregas')?.style.display!=='none') await loadItensEntregas();
    if(tipo==='ATA'&&typeof loadAtas==='function') loadAtas();
    if(tipo!=='ATA'&&row.emenda_item_id) loadData();
  }catch(e){
    if(novoTermoPath&&!registroAtualizado){
      try{ await removerTermosEntrega([novoTermoPath]); }
      catch(rollbackError){ console.error('Falha ao desfazer upload sem vínculo',rollbackError); }
    }
    _confSetMsg('Erro: '+e.message,'err');
  }finally{
    btn.disabled=false; btn.textContent=label;
  }
}
window.loadConfirmacoes=loadConfirmacoes;
window.renderConfirmacoes=renderConfirmacoes;
window.abrirConfirmacaoUnidade=abrirConfirmacaoUnidade;
window.salvarConfirmacaoUnidade=salvarConfirmacaoUnidade;
window.abrirTermoEntrega=abrirTermoEntrega;
window.removerTermosEntrega=removerTermosEntrega;

async function gerarContratoDoProcesso(id){
  const p=_licitacoesCache.find(x=>String(x.id)===String(id)); if(!p) return;
  await abrirModalNovoContrato();
  _ncFixarProcessoContrato(p);
  if(window.toast) toast('Contrato será ligado ao processo '+(p.identificador||''),'info');
}
function _ncProcessoLabel(p){
  return [p?.identificador||('#'+(p?.id||'')), p?.objeto].filter(Boolean).join(' - ');
}
function _ncMostrarProcessoManual(){
  const sel=document.getElementById('nc-processo');
  const disp=document.getElementById('nc-processo-display');
  if(sel) sel.style.display='';
  if(disp){ disp.style.display='none'; disp.value=''; }
}
function _ncFixarProcessoContrato(proc){
  const p={...proc,natureza:proc?.natureza||proc?.tipo||'',objeto:proc?.objeto||''};
  window._ncProcessosCache=[p,...(window._ncProcessosCache||[]).filter(x=>String(x.id)!==String(p.id))];
  const sel=document.getElementById('nc-processo');
  if(sel){
    sel.innerHTML=`<option value="${p.id}">${_sanEsc(_ncProcessoLabel(p))}</option>`;
    sel.value=String(p.id);
    sel.style.display='none';
  }
  const disp=document.getElementById('nc-processo-display');
  if(disp){
    disp.value=_ncProcessoLabel(p);
    disp.style.display='';
  }
  ncProcessoChange();
}
// Popula o seletor de processos do modal de contrato: só os sem contrato OU marcados "gera mais" (Fase 3)
async function preencherSelectProcessos(currentId){
  const sel=document.getElementById('nc-processo'); if(!sel) return;
  const {data,error}=await sb.from('vw_processos_resumo')
    .select('id,identificador,objeto,natureza,secao,secao_id,n_contratos,gera_mais_contratos,tipo_servico,servico_mensal_itens,servico_mensal_meses,servico_mensal_valor_mensal,servico_mensal_valor_global,servico_demanda_meses')
    .order('identificador');
  if(error){ sel.innerHTML='<option value="">Erro ao carregar processos</option>'; return; }
  let lista=(data||[]).filter(p=>Number(p.n_contratos||0)===0 || p.gera_mais_contratos);
  if(currentId && !lista.some(p=>String(p.id)===String(currentId))){
    const extra=(data||[]).find(p=>String(p.id)===String(currentId));
    if(extra) lista=[extra,...lista];
  }
  window._ncProcessosCache=lista;
  sel.innerHTML='<option value="">Selecione o processo (licitação)...</option>'+
    lista.map(p=>`<option value="${p.id}">${_sanEsc(p.identificador||('#'+p.id))}${p.objeto?(' — '+_sanEsc(String(p.objeto).slice(0,70))):''}</option>`).join('');
}
// Ao escolher um processo: liga processo, preenche CPL/objeto e carrega itens (Fase 3)
function ncProcessoChange(){
  const sel=document.getElementById('nc-processo');
  const cplH=document.getElementById('nc-cpl');
  const wrapGM=document.getElementById('nc-gera-mais-wrap');
  const itensWrap=document.getElementById('nc-itens-wrap');
  const id=sel?sel.value:'';
  const gm=document.getElementById('nc-gera-mais');
  if(!id){
    window._gerarContratoProcesso=null;
    if(cplH) cplH.value='';
    if(gm) gm.checked=false;
    const secSel=document.getElementById('nc-secao');
    if(secSel) secSel.disabled=false;
    if(itensWrap) itensWrap.style.display='none';
    const lit=document.getElementById('nc-itens-lista'); if(lit) lit.innerHTML='';
    return;
  }
  const p=(window._ncProcessosCache||[]).find(x=>String(x.id)===String(id));
  if(!p) return;
  window._gerarContratoProcesso=p;
  // reset per-item empenho state on process change
  window._ncEmpItens={};window._ncEmpBuffer={};window._ncEmpFree=null;
  if(cplH) cplH.value=p.identificador||'';
  const objEl=document.getElementById('nc-objeto'); if(objEl) objEl.value=p.objeto||'';
  if(gm) gm.checked=!!p.gera_mais_contratos;
  // A seção já foi definida na licitação. Herdá-la evita uma segunda seleção no contrato.
  const secSel=document.getElementById('nc-secao');
  const secaoProc=p.secao||(_secoesOrganizacionais.find(s=>String(s.id)===String(p.secao_id||''))?.sigla)||'';
  if(secSel && secaoProc){
    secSel.value=secaoProc;
    secSel.disabled=true;
    const secNovo=document.getElementById('nc-secao-novo');
    if(secNovo){ secNovo.value=''; secNovo.style.display='none'; }
  }else if(secSel){
    secSel.disabled=false;
  }
  // Fase 10: tipo de instrumento herdado da natureza do processo
  const tipoHid=document.getElementById('nc-tipo');
  const natDisp=document.getElementById('nc-natureza-display');
  const tipoVal=(String(p.natureza||'').toUpperCase().includes('ATA'))?'ATA':'CONTRATO';
  if(tipoHid) tipoHid.value=tipoVal;
  if(natDisp){ natDisp.value=p.natureza||''; natDisp.placeholder=''; }
  ncTipoInstrumentoChange();
  _ncAplicarModo(p.natureza);
  _ncCarregarItensProcesso(p.id);
}
// Fase 10: adapta o formulário conforme a natureza do processo (ATA de RP × Aquisição × outros)
function _ncModo(natureza){ const n=String(natureza||'').toUpperCase(); if(n.includes('ATA')) return 'ata'; if(n.includes('AQUIS')) return 'aquisicao'; return 'outro'; }
function _ncServicoMensalFixo(proc){
  const tipo=String(proc?.tipo_servico||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return tipo==='servico mensal valor fixo';
}
function _ncServicoDemanda(proc){
  const tipo=String(proc?.tipo_servico||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return tipo==='servico por demanda/execucao';
}
function _ncShow(id,on){ const el=document.getElementById(id); if(el) el.style.display=on?'':'none'; }
function _ncAplicarModo(natureza){
  const modo=_ncModo(natureza);
  const ata=modo==='ata', aq=modo==='aquisicao';
  const servMensal=_ncServicoMensalFixo(window._gerarContratoProcesso);
  const servDemanda=_ncServicoDemanda(window._gerarContratoProcesso);
  // valor mensal e fonte: só contratos comuns (outro)
  _ncShow('nc-valor-mensal-wrap', modo==='outro'&&!servDemanda);
  _ncShow('nc-fonte-wrap', modo==='outro');
  // datas/vigência: ATA usa início (assinatura/vigência/vencimento automáticos); Aquisição não usa nenhuma
  _ncShow('nc-assinatura-wrap', modo==='outro');
  _ncShow('nc-inicio-wrap', ata||modo==='outro');
  _ncShow('nc-vigencia-wrap', ata||modo==='outro');
  _ncShow('nc-vencimento-wrap', ata||modo==='outro');
  // rastreia modo atual para uso no template de itens
  window._ncModoAtual=modo;
  // valor global é calculado (read-only) nas duas naturezas com itens
  const valInp=document.getElementById('nc-valor-inicial');
  const mensalInp=document.getElementById('nc-valor-mensal');
  if(valInp){ valInp.readOnly=(ata||aq||servDemanda); valInp.placeholder=(ata||aq||servDemanda)?'soma dos itens (automático)':'ex: 120000,00'; }
  // vigência/vencimento read-only na ATA (12 meses fixos)
  if(valInp&&servMensal){ valInp.readOnly=true; valInp.placeholder='calculado pelos itens marcados'; }
  if(mensalInp){
    mensalInp.readOnly=servMensal;
    mensalInp.placeholder=servMensal?'calculado pelos itens marcados':'ex: 10000,00';
  }
  ['nc-vigencia','nc-vencimento'].forEach(id=>{const el=document.getElementById(id); if(el) el.readOnly=(ata||servMensal||servDemanda);});
  // status
  const stSel=document.getElementById('nc-status'), stAuto=document.getElementById('nc-status-auto');
  if(stSel){
    if(aq){
      const v='Aguardando emissão da AF';
      if(![...stSel.options].some(o=>o.value===v)) stSel.add(new Option(v,v));
      stSel.value=v; stSel.disabled=true;
      if(stAuto){ stAuto.style.display='block'; stAuto.textContent='Definido automaticamente; muda ao emitir a AF.'; }
    }else if(ata){
      stSel.value='VIGENTE'; stSel.disabled=true;
      if(stAuto){ stAuto.style.display='block'; stAuto.textContent='ATA vigente pelo período de 12 meses a partir da data de início.'; }
    }else{
      stSel.disabled=false; if(stAuto) stAuto.style.display='none';
    }
  }
  if(servDemanda) _ncRecalcValorGlobal();
  if(ata||servMensal||servDemanda) _ncRecalcVigencia();
}
// Fase 10: ATA tem vigência fixa de 12 meses a partir da data de início
function _ncAddMonthsMinusOneDay(iso, meses){
  if(!iso||!meses) return '';
  const d=new Date(iso+'T00:00:00');
  if(Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth()+Number(meses));
  d.setDate(d.getDate()-1);
  return d.toLocaleDateString('pt-BR');
}
function _ncRecalcVigencia(){
  const proc=window._gerarContratoProcesso||{};
  const ata=_ncModo(proc.natureza)==='ata';
  const servMensal=_ncServicoMensalFixo(proc);
  const servDemanda=_ncServicoDemanda(proc);
  if(!ata&&!servMensal&&!servDemanda) return;
  const ini=document.getElementById('nc-inicio')?.value;
  const asn=document.getElementById('nc-assinatura'); if(asn) asn.value=ini||'';
  const meses=servMensal?Number(proc.servico_mensal_meses||0):(servDemanda?Number(proc.servico_demanda_meses||0):12);
  const vig=document.getElementById('nc-vigencia'); if(vig) vig.value=meses?`${meses} meses`:'';
  const venc=document.getElementById('nc-vencimento');
  if(venc) venc.value=(ini&&meses)?_ncAddMonthsMinusOneDay(ini,meses):'';
}
// Quantidade efetivamente contratada nesta linha (considera divisão de quantidade em nci-qtde)
function _ncQtdeEfetivaRow(r){
  const full=Number(r.dataset.qtde);
  const qcRaw=(r.querySelector('.nci-qtde')?.value||'').trim().replace(',','.');
  const qc=qcRaw?parseFloat(qcRaw):NaN;
  return (Number.isFinite(qc)&&qc>0)?qc:(Number.isFinite(full)?full:null);
}
// Atualiza o total exibido ao lado do valor contratado do item.
function _ncUpdateItemTotal(el){
  const r=el?.closest?.('.nc-item-row'); if(!r) return;
  const totEl=r.querySelector('.nci-total'); if(!totEl) return;
  const raw=(r.querySelector('.nci-valor')?.value||'').trim().replace(/\./g,'').replace(',','.');
  const unit=parseFloat(raw); const qtde=_ncQtdeEfetivaRow(r);
  totEl.textContent=(unit&&qtde)?('Total: '+fmtFull(unit*qtde)):'Total: —';
  _ncRecalcValorGlobal();
}
// Fase 10: Valor Global = soma dos valores dos itens marcados (qtde x valor unitário)
function _ncRecalcValorGlobal(){
  const modo=_ncModo(window._gerarContratoProcesso?.natureza);
  const servMensal=_ncServicoMensalFixo(window._gerarContratoProcesso);
  const servDemanda=_ncServicoDemanda(window._gerarContratoProcesso);
  if(modo!=='ata' && modo!=='aquisicao' && !servMensal && !servDemanda) return;
  const lista=document.getElementById('nc-itens-lista'); if(!lista) return;
  let tot=0;
  lista.querySelectorAll('.nc-item-row').forEach(r=>{
    const chk=r.querySelector('.nci-chk'); if(!chk||!chk.checked) return;
    const raw=(r.querySelector('.nci-valor')?.value||'').trim().replace(/\./g,'').replace(',','.');
    const unit=parseFloat(raw)||0; const qtde=_ncQtdeEfetivaRow(r)||0;
    tot+=unit*qtde;
  });
  const meses=Number(window._gerarContratoProcesso?.servico_mensal_meses||0);
  const valorGlobal=servMensal?tot*meses:tot;
  const el=document.getElementById('nc-valor-inicial'); if(el) el.value=valorGlobal?valorGlobal.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
  const mensalEl=document.getElementById('nc-valor-mensal');
  if(servMensal&&mensalEl) mensalEl.value=tot?tot.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
}
// Carrega os itens do processo no modal de novo contrato (Fase 3)
async function _ncCarregarItensProcesso(processoId){
  const wrap=document.getElementById('nc-itens-wrap');
  const lista=document.getElementById('nc-itens-lista');
  if(!wrap||!lista) return;
  wrap.style.display='block';
  lista.innerHTML='<div style="font-size:12px;color:var(--text3)"><span class="spinner"></span> Carregando itens...</div>';
  const {data,error}=await sb.from('itens')
    .select('id,descricao,qtde,valor_estimado,valor_contratado,fonte_tipo,fonte_descricao,emenda_id,emenda_item_id,grupo_item_id,unidade_destino_id,prazo_entrega_dias,processo_id,origem,marca,modelo,status,contrato_id,unidades(nome)')
    .eq('processo_id',processoId).order('created_at');
  if(error){ lista.innerHTML='<div style="font-size:12px;color:var(--red)">Erro ao carregar itens: '+_sanEsc(error.message)+'</div>'; return; }
  const itens=data||[];
  const procAtual=window._gerarContratoProcesso||{};
  const itensServico=(typeof _procServicoMensalItensFromValor==='function')?_procServicoMensalItensFromValor(procAtual.servico_mensal_itens):[];
  if(!itens.length&&itensServico.length){
    window._ncItensCache={};
    const inp='font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
    lista.innerHTML=itensServico.map((it,idx)=>{
      const qtd=Number(it.quantidade||0);
      const unit=Number(it.valor_unitario||0);
      const mensal=Number(it.valor_mensal||(qtd*unit)||0);
      const id='svc-'+idx;
      return `<div class="nc-item-row" data-id="${id}" data-service-json="1" data-service-index="${idx}" data-jacont="0" data-qtde="${qtd||''}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border)">
        <input type="checkbox" class="nci-chk" onchange="_ncItemChkChange(this)" style="margin-top:3px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${_sanEsc(it.descricao||'(sem descrição)')}</div>
          <div style="font-size:11px;color:var(--text3)">serviço mensal · qtde ${qtd||'—'} · un. ${unit?fmtFull(unit):'—'} · mensal ${mensal?fmtFull(mensal):'—'} · ${procAtual.servico_mensal_meses||'—'} meses</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <input type="text" class="nci-valor" value="${unit?String(unit).replace('.',','):''}" oninput="_ncUpdateItemTotal(this)" placeholder="vl. unit. contratado" title="Valor UNITÁRIO contratado por item" style="width:110px;${inp}">
          <span class="nci-total" style="font-size:10px;color:var(--text3)">Total: —</span>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('#nc-itens-lista .nci-valor').forEach(_ncUpdateItemTotal);
    return;
  }
  window._ncItensCache=Object.fromEntries(itens.map(it=>[String(it.id),it]));
  if(!itens.length){ lista.innerHTML='<div style="font-size:12px;color:var(--text3)">Este processo não possui itens cadastrados. O contrato será salvo sem vínculo de itens.</div>'; return; }
  lista.innerHTML=itens.map(it=>{
    const jaCont=!!it.contrato_id;
    const unid=it.unidades?.nome||'';
    const fonte=_itemFonteLabel(it.fonte_tipo)+(it.fonte_descricao?(' · '+_sanEsc(it.fonte_descricao)):'');
    const defVal=(it.valor_estimado!=null)?String(it.valor_estimado).replace('.',',') :'';
    const meta=[
      (it.qtde!=null?('qtde '+it.qtde):null),
      (it.valor_estimado!=null?('un. est. '+fmtFull(it.valor_estimado)):null),
      fonte,
      (unid?_sanEsc(unid):null),
      _sanEsc(it.status||'—')
    ].filter(Boolean).join(' · ');
    const inp='font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
    return `<div class="nc-item-row" data-id="${it.id}" data-jacont="${jaCont?1:0}" data-qtde="${it.qtde??''}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border)${jaCont?';opacity:.6':''}">
      <input type="checkbox" class="nci-chk" ${jaCont?'disabled title="Item já vinculado a um contrato"':''} onchange="_ncItemChkChange(this)" style="margin-top:3px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${_sanEsc(it.descricao||'(sem descrição)')}${jaCont?' <span style="color:var(--text3);font-weight:400">— já contratado</span>':''}</div>
        <div style="font-size:11px;color:var(--text3)">${meta}</div>
        ${jaCont?'':`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          <input type="number" class="nci-qtde" min="0" step="any" placeholder="qtde p/ este contrato" title="Dividir quantidade: informe a quantidade adjudicada a esta empresa (≤ total). Vazio = quantidade total; o saldo permanece na licitação." oninput="_ncUpdateItemTotal(this)" style="width:150px;${inp}">
          <input type="text" class="nci-marca" placeholder="marca" style="width:110px;${inp}">
          <input type="text" class="nci-modelo" placeholder="modelo" style="width:110px;${inp}">
        </div>`}
        ${(window._ncModoAtual||'')==='aquisicao'&&!jaCont?_ncEmpItemHtml(String(it.id)):''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <input type="text" class="nci-valor" value="${jaCont?'':_sanEsc(defVal)}" ${jaCont?'disabled':''} oninput="_ncUpdateItemTotal(this)" placeholder="vl. unit. contratado" title="Valor UNITÁRIO contratado por item (default = estimado)" style="width:110px;${inp}">
        ${jaCont?'':'<span class="nci-total" style="font-size:10px;color:var(--text3)">Total: —</span>'}
      </div>
    </div>`;
  }).join('');
  if(typeof _ncRecalcValorGlobal==='function') _ncRecalcValorGlobal();
  document.querySelectorAll('#nc-itens-lista .nci-valor').forEach(_ncUpdateItemTotal);
}
// Aplica contrato_id/fornecedor/valor/status aos itens marcados (Fase 3)
async function _ncVincularItens(contratoId, fornecedorId){
  const lista=document.getElementById('nc-itens-lista'); if(!lista) return;
  const rows=[...lista.querySelectorAll('.nc-item-row')];
  const cache=window._ncItensCache||{};
  window._ncVincularItensMap={};
  // Itens de serviço mensal ainda vivem só como JSON no processo até o 1º contrato.
  // Materializa TODOS aqui (marcados e não marcados) como linhas reais em `itens`,
  // para que os não selecionados sobrem com contrato_id=null e continuem disponíveis
  // para um próximo contrato, em vez de desaparecerem.
  for(const r of rows){
    if(r.dataset.serviceJson!=='1') continue;
    const chk=r.querySelector('.nci-chk');
    const marcado=!!(chk&&chk.checked);
    const id=r.dataset.id; if(!id) continue;
    const vt=r.querySelector('.nci-valor');
    const raw=(vt?.value||'').trim().replace(/\./g,'').replace(',','.');
    const valor=raw?(parseFloat(raw)||null):null;
    const procAtual=window._gerarContratoProcesso||{};
    const itensServico=(typeof _procServicoMensalItensFromValor==='function')?_procServicoMensalItensFromValor(procAtual.servico_mensal_itens):[];
    const svc=itensServico[Number(r.dataset.serviceIndex)]||{};
    const qtd=Number(svc.quantidade||r.dataset.qtde||0)||null;
    const unit=valor||(Number(svc.valor_unitario||0)||null);
    const insert={
      processo_id:procAtual.id||null,
      origem:'servico_mensal',
      descricao:svc.descricao||'(sem descrição)',
      qtde:qtd,
      valor_estimado:unit,
      contrato_id:marcado?contratoId:null,
      fornecedor_id:marcado?(fornecedorId||null):null,
      valor_contratado:marcado?unit:null,
      status:marcado?'contratado':'em licitação'
    };
    const {data:novo,error:eIns}=await sb.from('itens').insert(insert).select('id').single();
    if(eIns) throw eIns;
    if(marcado) window._ncVincularItensMap[String(id)]=String(novo.id);
  }
  for(const r of rows){
    if(r.dataset.serviceJson==='1') continue;
    const chk=r.querySelector('.nci-chk');
    if(!chk||!chk.checked||r.dataset.jacont==='1') continue;
    const id=r.dataset.id; if(!id) continue;
    const vt=r.querySelector('.nci-valor');
    const raw=(vt?.value||'').trim().replace(/\./g,'').replace(',','.');
    const valor=raw?(parseFloat(raw)||null):null;
    const marca=(r.querySelector('.nci-marca')?.value||'').trim()||null;
    const modelo=(r.querySelector('.nci-modelo')?.value||'').trim()||null;
    const full=Number(r.dataset.qtde);
    const qcRaw=(r.querySelector('.nci-qtde')?.value||'').trim().replace(',','.');
    let qc=qcRaw?parseFloat(qcRaw):NaN;
    const dividir=Number.isFinite(qc) && qc>0 && Number.isFinite(full) && qc<full;
    if(dividir){
      // Dividir quantidade: novo item contratado com qc; saldo (full-qc) permanece na licitação
      const base=cache[String(id)]||{};
      const clone={
        processo_id:base.processo_id, origem:base.origem||'aquisicao', fonte_tipo:base.fonte_tipo,
        fonte_descricao:base.fonte_descricao, emenda_id:base.emenda_id, emenda_item_id:base.emenda_item_id,
        grupo_item_id:base.grupo_item_id, unidade_destino_id:base.unidade_destino_id,
        prazo_entrega_dias:base.prazo_entrega_dias, descricao:base.descricao, valor_estimado:base.valor_estimado,
        qtde:qc, contrato_id:contratoId, fornecedor_id:fornecedorId||null, valor_contratado:valor,
        marca, modelo, status:'contratado', item_origem_id:id
      };
      const {data:cloneData,error:eIns}=await sb.from('itens').insert(clone).select('id').single();
      if(eIns) throw eIns;
      window._ncVincularItensMap[String(id)]=String(cloneData.id);
      const {error:eUpd}=await sb.from('itens').update({qtde:full-qc}).eq('id',id).is('contrato_id',null);
      if(eUpd) throw eUpd;
    }else{
      const upd={ contrato_id:contratoId, fornecedor_id:fornecedorId||null, valor_contratado:valor, marca, modelo, status:'contratado' };
      const {error}=await sb.from('itens').update(upd).eq('id',id).is('contrato_id',null);
      if(error) throw error;
      window._ncVincularItensMap[String(id)]=String(id);
    }
  }
}
// Fase 4: espelha itens (origem='ata') já vinculados ao contrato ATA para atas_itens,
// preenchendo itens.ata_item_id. Idempotente: não duplica itens já espelhados e
// reaproveita atas_itens órfãos de criação parcial. Retorna nº de itens espelhados.
async function _ncEspelharAta(contratoId){
  const {data:itens,error}=await sb.from('itens')
    .select('id,descricao,qtde,valor_contratado,valor_estimado,prazo_entrega_dias,marca,modelo,ata_item_id')
    .eq('contrato_id',contratoId).eq('origem','ata');
  if(error) throw error;
  const pendentes=(itens||[]).filter(it=>!it.ata_item_id);
  if(!pendentes.length) return 0;
  // Idempotência: atas_itens já existentes neste contrato e quais já estão referenciados
  const {data:existentes,error:eEx}=await sb.from('atas_itens')
    .select('id,item,qtde_contratada').eq('contrato_id',contratoId);
  if(eEx) throw eEx;
  const jaReferenciados=new Set((itens||[]).map(it=>it.ata_item_id).filter(Boolean).map(String));
  const reutilizaveis=(existentes||[]).filter(a=>!jaReferenciados.has(String(a.id)));
  let criados=0;
  for(const it of pendentes){
    const desc=(it.descricao||'').trim()||'(sem descrição)';
    const qtd=(it.qtde!=null?Number(it.qtde):0);
    // recuperação de criação parcial: reaproveita atas_itens órfão equivalente
    let alvoId=null;
    const idx=reutilizaveis.findIndex(a=>(a.item||'').trim()===desc && Number(a.qtde_contratada||0)===qtd);
    if(idx>=0){ alvoId=reutilizaveis[idx].id; reutilizaveis.splice(idx,1); }
    if(!alvoId){
      const dados={contrato_id:contratoId,item:desc,marca_modelo:[it.marca,it.modelo].filter(Boolean).join(' ').trim(),
        qtde_contratada:qtd,
        valor_unit:(it.valor_contratado!=null?Number(it.valor_contratado):(it.valor_estimado!=null?Number(it.valor_estimado):0)),
        prazo_entrega:(it.prazo_entrega_dias!=null?Number(it.prazo_entrega_dias):null)};
      const {data:novo,error:e2}=await sb.from('atas_itens').insert(dados).select('id').single();
      if(e2) throw e2;
      alvoId=novo?.id;
    }
    if(alvoId){
      const {error:e3}=await sb.from('itens')
        .update({ata_item_id:alvoId,status:'contratado'}).eq('id',it.id).is('ata_item_id',null);
      if(e3) throw e3;
      criados++;
    }
  }
  return criados;
}
