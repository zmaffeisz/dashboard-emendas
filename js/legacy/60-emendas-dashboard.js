async function loadData(){
  console.time('loadData:total');
  // O overlay de "Carregando..." que apaga a tela só faz sentido na primeira carga.
  // Em recargas (após salvar em Atas/Empenhos/Notas fiscais etc.) mantemos a tabela
  // visível e só sinalizamos a atualização no pill de conexão, para evitar o flicker.
  const _isFirstLoad = !window._dashboardFirstLoadDone;
  if(_isFirstLoad){
    document.getElementById("loading").style.display="block";
    document.getElementById("loading").innerHTML='<span class="spinner"></span>Carregando dados do Supabase...';
    document.getElementById("main").style.display="none";
  }
  document.getElementById("conn-pill").textContent="⏳ Conectando";
  document.getElementById("conn-pill").className="pill pill-loading";
  try{
    // ── Leitura via SUPABASE (emenda_itens + emendas) ──
    // Paginação: o Supabase limita a 1000 linhas por requisição.
    if(!window._catEmendaItem){
      const {data:_so}=await sb.from("status_opcoes").select("id,nome,ordem").eq("contexto","emenda_item").order("ordem");
      window._catEmendaItem=_so||[]; window._catById={}; (_so||[]).forEach(o=>{window._catById[o.id]=o.nome;});
    }
    console.time('loadData:emenda_itens');
    let raw=[], desde=0; const PAG=1000;
    while(true){
      if(_isFirstLoad) document.getElementById("loading").innerHTML='<span class="spinner"></span>Carregando itens das emendas...';
      const {data,error}=await sb
        .from("emenda_itens")
        .select("id,emenda_id,unidade_beneficiada,item,qtde,vl_unitario,vl_total,item_cadastrado,qtde_cadastrada,vl_unitario_cadastrado,vl_total_cadastrado,cpl,status,status_id,nota_fiscal,empenho,patrimonio,unidade_entrega,data_entrega,ordem_pagamento,data_atualizacao,emenda, emendas(tipo,emenda,parlamentar,sei_emenda,valor_cedido,unidade,ano,objeto)")
        .order("emenda",{ascending:true})
        .range(desde,desde+PAG-1);
      if(error) throw new Error(error.message);
      raw=raw.concat(data||[]);
      if(!data||data.length<PAG) break;
      desde+=PAG;
    }
    console.timeEnd('loadData:emenda_itens');
    const num=v=>v==null||v===""?0:Number(v);
    // ── Fonte única da verdade: deriva CPL/contrato/unidade/valor/status do fluxo real
    //    (itens → processos/contratos/itens_entregas) por emenda_item_id, sem gravar no banco.
    if(_isFirstLoad) document.getElementById("loading").innerHTML='<span class="spinner"></span>Consolidando AF, empenhos, notas e entregas...';
    console.time('loadData:fluxoEmendaItens');
    const _flow=await _carregarFluxoEmendaItens([...new Set(raw.map(i=>i.id).filter(Boolean))]);
    console.timeEnd('loadData:fluxoEmendaItens');
    if(_isFirstLoad) document.getElementById("loading").innerHTML='<span class="spinner"></span>Montando painel de emendas...';
    allRows=raw.flatMap(i=>{
      const e=i.emendas||{};
      const f=_flow[i.id]||null;
      // valores derivados do fluxo (fallback: só preenchem o que está vazio no cadastro manual)
      const cplStored=(i.cpl||"").toString().trim();
      const cplFlow=f?(f.cpl||""):"";
      const cplFinal=cplFlow||cplStored;
      const unidEntStored=(i.unidade_entrega||"").toString().trim();
      const unidEntFinal=(f?f.unidade:"")||unidEntStored||"";
      const vlTotalStored=num(i.vl_total);
      const vlUnitExec=num(i.vl_unitario)||(f&&f.valorUnit!=null?f.valorUnit:0);
      const qtdeExec=num(i.qtde);
      const vlTotalCalc=vlUnitExec>0&&qtdeExec>0?Number((vlUnitExec*qtdeExec).toFixed(2)):0;
      const vlTotalFinal=vlTotalStored||vlTotalCalc||(f?Number(f.valor.toFixed(2)):0);
      const statusStored=(i.status||"").toString().trim();
      const statusFlow=_flowStatusFromFlow(f);
      const statusFinal=statusFlow||statusStored;
      const empenhoFlow=f&&f.empenhos?Array.from(f.empenhos).filter(Boolean).join("; "):"";
      const nfFlow=f&&f.notas?Array.from(f.notas).filter(Boolean).join("; "):"";
      const patrimonioFlow=f&&f.patrimonios?Array.from(f.patrimonios).filter(Boolean).join("; "):"";
      const dataFluxo=f?(f.af.dataEntregaUnidade||f.af.dataRecebimento||f.af.afData||""):"";
      const dataAtualizacaoFluxo=f?(f.af.dataEntregaUnidade||f.af.dataRecebimento||f.af.afData||""):"";
      const base={
        id:i.id,                       // uuid do item (chave para updates)
        emenda_id:i.emenda_id,         // uuid da emenda (FK)
        tipo:(e.tipo||"").trim(),
        emenda:((e.emenda!=null?e.emenda:i.emenda)||"").toString().trim(),
        parlamentar:(e.parlamentar||"").trim(),
        sei_emenda:(e.sei_emenda||"").trim(),
        valor_cedido:num(e.valor_cedido),
        ano:(e.ano!=null?e.ano:"").toString().trim(),
        objeto:(e.objeto||"").trim(),
        unidade:((i.unidade_beneficiada||e.unidade)||"").toString().trim(),
        // ── executado ──
        item:(i.item||"").toString().trim(),
        qtde:(i.qtde!=null?i.qtde:"").toString().trim(),
        vl_unitario:vlUnitExec,
        vl_total:vlTotalFinal,
        valor_comprometido:f?Number((f.valorComprometido||0).toFixed(2)):0,
        valor_licitacao:f?Number((f.valorLicitacao||0).toFixed(2)):0,
        valor_contratado:f?Number((f.valorContratado||0).toFixed(2)):0,
        valor_licitacao_unit:f&&f.qtdeLicitacao?Number((f.valorLicitacao/f.qtdeLicitacao).toFixed(2)):0,
        valor_contratado_unit:f&&f.qtdeContratado?Number((f.valorContratado/f.qtdeContratado).toFixed(2)):0,
        // ── plano de trabalho aprovado (cadastrado/planejado) ──
        item_cadastrado:(i.item_cadastrado||"").toString().trim(),
        qtde_cadastrada:(i.qtde_cadastrada!=null?i.qtde_cadastrada:"").toString().trim(),
        vl_unitario_cadastrado:num(i.vl_unitario_cadastrado),
        vl_total_cadastrado:num(i.vl_total_cadastrado),
        cpl:cplFinal,
        contrato_sim:(f?f.sim:"")||"",
        fornecedor_fluxo:(f?f.fornecedor:"")||"",
        status_raw:statusFinal,
        status_id:(i.status_id!=null?i.status_id:null),
        _status_derivado:!!statusFlow,
        nota_fiscal:nfFlow||(i.nota_fiscal||"").toString().trim(),
        empenho:empenhoFlow||(i.empenho||"").toString().trim(),
        patrimonio:patrimonioFlow||(i.patrimonio||"").toString().trim(),
        unidade_entrega:unidEntFinal,
        data_entrega:dataFluxo||(i.data_entrega||"").toString().trim(),
        ordem_pagamento:(i.ordem_pagamento||"").toString().trim(),
        data_atualizacao:dataAtualizacaoFluxo||(i.data_atualizacao||"").toString().trim(),
      };
      return _expandirLinhaEmendaPorUnidades(base,(f&&f.unidades)||[]);
    }).map(r=>({...r,status_cat:(!r._status_derivado&&r.status_id!=null&&window._catById&&window._catById[r.status_id])?window._catById[r.status_id]:catStatus(r.status_raw)}));
    const [{data:eData},uData,{data:pData}]=await Promise.all([
      sb.from("emendas").select("id,emenda,tipo,parlamentar,ano,valor_cedido,unidade,unidade_id").order("emenda",{ascending:true}),
      _getUnidadesAtivasCache(),
      sb.from("processos").select("id,identificador").order("identificador")
    ]);
    cachedEmendas=eData||[];
    cachedUnidades=uData||[];
    cachedProcessos=pData||[];
    saldoEmendaCarregado=false;
    populateFilters();
    applyFilters();
    document.getElementById("conn-pill").textContent="✓ Conectado";
    document.getElementById("conn-pill").className="pill pill-ok";
    const lu=document.getElementById("last-update"); if(lu) lu.textContent="Atualizado em "+new Date().toLocaleString("pt-BR");
    document.getElementById("loading").style.display="none";
    document.getElementById("main").style.display="block";
    window._dashboardFirstLoadDone=true;
    setTimeout(_setTableOffset,50);
    console.timeEnd('loadData:total');
  }catch(e){
    console.timeEnd('loadData:total');
    document.getElementById("conn-pill").textContent="✗ Erro";
    document.getElementById("conn-pill").className="pill pill-err";
    if(_isFirstLoad){
      document.getElementById("loading").innerHTML=`<div style="color:var(--red)">⚠️ Erro: ${e.message}<br><small>Abra o Chrome com --disable-web-security</small><br><button onclick="loadData()" style="margin-top:12px;padding:6px 16px;border-radius:6px;border:1px solid #ddd;cursor:pointer">Tentar novamente</button></div>`;
    } else if(window.toast){
      toast('Erro ao atualizar dados: '+(e.message||e),'error');
    }
  }
}
// Cache em memória de unidades ativas: reaproveitado por loadData() e pelos selects
// de unidade em outros pontos da tela, evitando repetir a mesma consulta na sessão.
let _unidadesAtivasCache=null, _unidadesAtivasPromise=null;
function _getUnidadesAtivasCache(force){
  if(force) _unidadesAtivasCache=null;
  if(_unidadesAtivasCache) return Promise.resolve(_unidadesAtivasCache);
  if(_unidadesAtivasPromise) return _unidadesAtivasPromise;
  _unidadesAtivasPromise=sb.from("unidades").select("id,nome").eq("ativo",true).order("nome")
    .then(({data})=>{ _unidadesAtivasCache=data||[]; _unidadesAtivasPromise=null; return _unidadesAtivasCache; })
    .catch(e=>{ _unidadesAtivasPromise=null; throw e; });
  return _unidadesAtivasPromise;
}

// ═══ FILTROS ═══
function populateFilters(){
  // Filtros agora ficam nos cabeçalhos da tabela; valores únicos são lidos sob demanda de allRows.
  updateHeaderFilterIndicators();
}

// ═══ FILTROS DE CABEÇALHO (estilo Google Sheets) ═══
const HDR_FILTER_COLS = {
  tipo:{label:'Tipo', get:r=>r.tipo, disp:v=>v||'(vazio)'},
  emenda:{label:'Emenda', get:r=>r.emenda, disp:v=>v||'(vazio)'},
  ano:{label:'Ano', get:r=>r.ano, disp:v=>v||'(vazio)'},
  parlamentar:{label:'Parlamentar', get:r=>r.parlamentar, disp:v=>v||'(vazio)'},
  unidade:{label:'Unidade', get:r=>r.unidade, disp:v=>v||'(vazio)'},
  item:{label:'Item', get:r=>r.item, disp:v=>v||'(vazio)'},
  qtde:{label:'Qtde', get:r=>r.qtde, disp:v=>v||'(vazio)'},
  vl_unitario_cadastrado:{label:'Vl. unit. plan.', get:r=>r.vl_unitario_cadastrado, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  vl_total_cadastrado:{label:'Vl. total plan.', get:r=>r.vl_total_cadastrado, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  valor_licitacao_unit:{label:'Vl. unit. licit.', get:r=>r.valor_licitacao_unit, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  valor_licitacao:{label:'Vl. total licit.', get:r=>r.valor_licitacao, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  vl_unitario:{label:'Vl. unit. exec.', get:r=>r.vl_unitario, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  vl_total:{label:'Vl. total exec.', get:r=>r.vl_total, disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  cpl:{label:'CPL / Processo', get:r=>r.cpl, disp:v=>v||'(vazio)'},
  status_cat:{label:'Status', get:r=>r.status_cat, disp:v=>((STATUS_MAP[v]&&STATUS_MAP[v].label)||v||'(vazio)')},
  status_raw:{label:'Status completo', get:r=>r.status_raw, disp:v=>v||'(vazio)'},
  data_atualizacao:{label:'Atualização', get:r=>r.data_atualizacao, disp:v=>v||'(vazio)'},
  nota_fiscal:{label:'Nota fiscal', get:r=>r.nota_fiscal, disp:v=>v||'(vazio)'},
  empenho:{label:'Empenho', get:r=>r.empenho, disp:v=>v||'(vazio)'},
  patrimonio:{label:'Patrimônio', get:r=>r.patrimonio, disp:v=>v||'(vazio)'},
  unidade_entrega:{label:'Un. entrega', get:r=>r.unidade_entrega, disp:v=>v||'(vazio)'},
  data_entrega:{label:'Dt. entrega', get:r=>r.data_entrega, disp:v=>v||'(vazio)'},
  saldo_emenda:{label:'Saldo emenda', get:r=>_saldoEmendaValor(r.emenda_id), disp:v=>Number(v)||Number(v)===0?fmtFull(Number(v)):'(vazio)'},
};
let headerFilters = Object.fromEntries(Object.keys(HDR_FILTER_COLS).map(k=>[k,[]]));
let semCplFilter = false;
let _hdrFilterCol = null;
let _hdrFilterPending = [];

function _hdrUniqueValues(col){
  const cfg=HDR_FILTER_COLS[col];
  const vals=[...new Set(allRows.map(cfg.get).map(v=>v==null?'':String(v)))];
  return vals.sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}

function _ensureHdrDropdown(){
  let dd=document.getElementById('hdr-filter-dropdown');
  if(dd) return dd;
  dd=document.createElement('div');
  dd.id='hdr-filter-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="hdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">↑ Classificar A → Z</button>
      <button onclick="hdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">↓ Classificar Z → A</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="hdr-filter-search" placeholder="🔍 Buscar..." oninput="_hdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_hdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="hdr-filter-count">0</span></a> — <a href="#" onclick="_hdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="hdr-filter-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeHeaderFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmHeaderFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd);
  return dd;
}

function openHeaderFilter(e, col){
  e.stopPropagation();
  const dd=_ensureHdrDropdown();
  if(_hdrFilterCol===col && dd.style.display==='block'){ dd.style.display='none'; _hdrFilterCol=null; return; }
  _hdrFilterCol=col;
  const all=_hdrUniqueValues(col);
  const cur=headerFilters[col]||[];
  _hdrFilterPending = cur.length ? [...cur] : [...all];
  document.getElementById('hdr-filter-search').value='';
  _hdrRenderList();
  const btn=e.currentTarget;
  const rect=btn.getBoundingClientRect();
  dd.style.display='block';
  const ddW=dd.offsetWidth||240;
  let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px';
  dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('hdr-filter-search').focus(),50);
}

function _hdrRenderList(){
  const col=_hdrFilterCol; if(!col) return;
  const q=normalizar(document.getElementById('hdr-filter-search').value);
  const all=_hdrUniqueValues(col);
  const disp=HDR_FILTER_COLS[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('hdr-filter-count').textContent=all.length;
  const list=document.getElementById('hdr-filter-list');
  list.innerHTML=vis.map(v=>{
    const checked=_hdrFilterPending.includes(v)?'checked':'';
    const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><input type="checkbox" value="${safe}" ${checked} onchange="_hdrTogglePending(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('') || '<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}

function _hdrTogglePending(cb){
  const v=cb.value;
  if(cb.checked){ if(!_hdrFilterPending.includes(v)) _hdrFilterPending.push(v); }
  else { _hdrFilterPending=_hdrFilterPending.filter(x=>x!==v); }
}

function _hdrSelectAll(all){
  const col=_hdrFilterCol; if(!col) return;
  _hdrFilterPending = all ? _hdrUniqueValues(col) : [];
  _hdrRenderList();
}

function confirmHeaderFilter(){
  const col=_hdrFilterCol; if(!col) return;
  const all=_hdrUniqueValues(col);
  headerFilters[col] = (_hdrFilterPending.length===0 || _hdrFilterPending.length===all.length) ? [] : [..._hdrFilterPending];
  document.getElementById('hdr-filter-dropdown').style.display='none';
  _hdrFilterCol=null;
  updateHeaderFilterIndicators();
  applyFilters();
}

function closeHeaderFilter(){
  const dd=document.getElementById('hdr-filter-dropdown');
  if(dd) dd.style.display='none';
  _hdrFilterCol=null;
}

function hdrSort(asc){
  const col=_hdrFilterCol; if(!col) return;
  sortCol=col; sortAsc=asc;
  document.querySelectorAll('.sort-icon').forEach(el=>el.textContent='');
  const icon=document.getElementById('si-'+col);
  if(icon) icon.textContent=asc?' ↑':' ↓';
  closeHeaderFilter();
  renderTable();
}

function updateHeaderFilterIndicators(){
  Object.keys(HDR_FILTER_COLS).forEach(col=>{
    const ativo=(headerFilters[col]||[]).length>0;
    const btn=document.getElementById('hf-'+col);
    if(btn) btn.classList.toggle('active',ativo);
    document.querySelectorAll(`.hdr-filter-btn[data-col="${col}"]`).forEach(b=>b.classList.toggle('active',ativo));
  });
}

document.addEventListener('click',function(e){
  const dd=document.getElementById('hdr-filter-dropdown');
  if(dd && dd.style.display==='block'){
    if(!dd.contains(e.target) && !(e.target.closest && e.target.closest('.hdr-filter-btn'))){ dd.style.display='none'; _hdrFilterCol=null; }
  }
});

function buildEmendaList(vals){
  const list=document.getElementById("emenda-list");
  if(!list) return;
  list.innerHTML=vals.map(v=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">`+
    `<input type="checkbox" value="${v}" ${pendingEmendas.includes(v)?'checked':''} style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0" onchange="updatePendingEmendas()"> ${v}</label>`).join('');
}

function filterEmendaList(){
  const q=document.getElementById("emenda-search").value.toLowerCase().trim();
  const vals=q?allEmendaOptions.filter(v=>v.toLowerCase().includes(q)):allEmendaOptions;
  const list=document.getElementById("emenda-list");
  list.innerHTML=vals.map(v=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">`+
    `<input type="checkbox" value="${v}" ${pendingEmendas.includes(v)?'checked':''} style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0" onchange="updatePendingEmendas()"> ${v}</label>`).join('');
}

function updatePendingEmendas(){
  pendingEmendas=[...document.getElementById("emenda-list").querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
}

function toggleEmendaDropdown(e){
  e.stopPropagation();
  const dd=document.getElementById("emenda-dropdown");
  const btn=document.getElementById("emenda-trigger");
  if(dd.style.display==='none'||dd.style.display===''){
    pendingEmendas=[...selectedEmendas];
    document.getElementById("emenda-search").value='';
    buildEmendaList(allEmendaOptions);
    const rect=btn.getBoundingClientRect();
    dd.style.top=(rect.bottom+window.scrollY+4)+'px';
    dd.style.left=(rect.left+window.scrollX)+'px';
    dd.style.display='block';
    document.getElementById("emenda-search").focus();
  } else {
    dd.style.display='none';
  }
}

function confirmEmendaFilter(){
  selectedEmendas=[...pendingEmendas];
  updateEmendaTriggerLabel();
  document.getElementById("emenda-dropdown").style.display='none';
  applyFilters();
}

function cancelEmendaDropdown(){
  document.getElementById("emenda-dropdown").style.display='none';
}

function clearEmendaFilter(){
  selectedEmendas=[];
  pendingEmendas=[];
  updateEmendaTriggerLabel();
  applyFilters();
}

function updateEmendaTriggerLabel(){
  const lbl=document.getElementById("emenda-trigger-label");
  if(!lbl) return;
  if(selectedEmendas.length===0) lbl.textContent='Todas';
  else if(selectedEmendas.length===1) lbl.textContent=selectedEmendas[0];
  else lbl.textContent=selectedEmendas.length+' selecionadas';
}

function selectAllEmendas(all){
  const boxes=document.getElementById("emenda-list").querySelectorAll('input[type=checkbox]');
  boxes.forEach(c=>c.checked=all);
  if(all) pendingEmendas=[...boxes].map(c=>c.value);
  else pendingEmendas=[];
}

// fechar dropdown ao clicar fora
document.addEventListener('click',function(e){
  const dd=document.getElementById("emenda-dropdown");
  if(dd&&dd.style.display!=='none'){
    if(!dd.contains(e.target)&&e.target.id!=='emenda-trigger'&&!e.target.closest('#emenda-trigger'))
      dd.style.display='none';
  }
});

function clearF(id){
  const el=document.getElementById(id);if(el)el.value="";
  if(id.startsWith("fat-")) return filtrarAtas();
  if(id.startsWith("ct-")) return filtrarContratos();
  if(id.startsWith("sa-")) return filtrarSancoes();
  if(id.startsWith("fc-")) return filtrarChamados();
  if(id.startsWith("cn-")) return filtrarChamadosNovos();
  applyFilters();
}
const MUNICIPAL_ANTIGA_ANOS=[2022,2023,2024,2025];
function _currentYear(){ return new Date().getFullYear(); }
// Anos de emendas municipais "antigas" ficam ocultos por padrão; o corte é sempre
// o ano vigente, então ao virar o ano o ano anterior passa a entrar automaticamente
// nesta lista (já desmarcado), sem precisar mexer em código.
const _muniAntigaShown={em:new Set()};
function _municipalAnoAtivo(prefix,ano){
  if(prefix==='em') return _muniAntigaShown.em.has(Number(ano));
  return document.getElementById(`${prefix}-muni-${ano}`)?.dataset.active==='true';
}
function _ehMunicipalAntiga(r){
  return String(r?.tipo||'').toUpperCase()==='MUNICIPAL' && Number(r?.ano)>0 && Number(r?.ano)<_currentYear();
}
function _municipalAntigaVisivel(prefix,r){
  if(!_ehMunicipalAntiga(r)) return true;
  return _municipalAnoAtivo(prefix,Number(r.ano));
}
function _updateMunicipalAnoButtons(prefix){
  MUNICIPAL_ANTIGA_ANOS.forEach(ano=>{
    const btn=document.getElementById(`${prefix}-muni-${ano}`);
    if(!btn) return;
    const ativo=btn.dataset.active==='true';
    btn.setAttribute('aria-pressed',ativo?'true':'false');
    btn.style.background=ativo?'var(--blue)':'var(--surface)';
    btn.style.color=ativo?'#fff':'var(--text2)';
    btn.style.borderColor=ativo?'var(--blue)':'var(--border)';
    btn.style.fontWeight=ativo?'700':'500';
  });
}
function toggleMunicipalAno(prefix,ano,callback){
  const btn=document.getElementById(`${prefix}-muni-${ano}`);
  if(!btn) return;
  btn.dataset.active=btn.dataset.active==='true'?'false':'true';
  _updateMunicipalAnoButtons(prefix);
  if(typeof callback==='function') callback();
}
function resetMunicipalAnos(prefix){
  if(prefix==='em'){ _muniAntigaShown.em.clear(); _updateMuniAntigaButtonState('em'); return; }
  MUNICIPAL_ANTIGA_ANOS.forEach(ano=>{
    const btn=document.getElementById(`${prefix}-muni-${ano}`);
    if(btn) btn.dataset.active='false';
  });
  _updateMunicipalAnoButtons(prefix);
}

// ═══ FILTRO "MUNICIPAIS ANTIGAS" (botão único, estilo Sheets) ═══
let _muniAntigaPrefix=null;
let _muniAntigaPending=new Set();
function _updateMuniAntigaButtonState(prefix){
  const btn=document.getElementById(`${prefix}-muni-antiga-btn`);
  if(!btn) return;
  btn.classList.toggle('active',_muniAntigaShown[prefix].size>0);
}
function _ensureMuniAntigaDropdown(){
  let dd=document.getElementById('muni-antiga-dropdown');
  if(dd) return dd;
  dd=document.createElement('div');
  dd.id='muni-antiga-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:220px;padding:.625rem';
  dd.innerHTML=`
    <div style="font-size:11px;color:var(--text3);margin-bottom:.5rem;line-height:1.4">Marque os anos de emendas municipais antigas (anteriores a ${_currentYear()}) que deseja exibir:</div>
    <div id="muni-antiga-list" style="display:flex;flex-direction:column;gap:1px;margin-bottom:.5rem;max-height:220px;overflow-y:auto"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeMuniAntigaFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmMuniAntigaFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd);
  return dd;
}
function _muniAntigaAnosDisponiveis(prefix){
  const linhas=prefix==='se'?(saldoEmendasRows||[]):(allRows||[]);
  return [...new Set(linhas.filter(_ehMunicipalAntiga).map(r=>Number(r.ano)))].sort((a,b)=>b-a);
}
function _muniAntigaRenderList(){
  const anos=_muniAntigaAnosDisponiveis(_muniAntigaPrefix);
  const list=document.getElementById('muni-antiga-list');
  if(!anos.length){ list.innerHTML='<div style="padding:8px;font-size:12px;color:var(--text3);text-align:center">Nenhuma emenda municipal antiga encontrada</div>'; return; }
  list.innerHTML=anos.map(ano=>{
    const checked=_muniAntigaPending.has(ano)?'checked':'';
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><input type="checkbox" value="${ano}" ${checked} onchange="_muniAntigaTogglePending(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${ano}</label>`;
  }).join('');
}
function _muniAntigaTogglePending(cb){
  const ano=Number(cb.value);
  if(cb.checked) _muniAntigaPending.add(ano); else _muniAntigaPending.delete(ano);
}
function openMuniAntigaFilter(e,prefix){
  e.stopPropagation();
  const dd=_ensureMuniAntigaDropdown();
  if(_muniAntigaPrefix===prefix && dd.style.display==='block'){ dd.style.display='none'; _muniAntigaPrefix=null; return; }
  _muniAntigaPrefix=prefix;
  _muniAntigaPending=new Set(_muniAntigaShown[prefix]);
  _muniAntigaRenderList();
  const btn=e.currentTarget;
  const rect=btn.getBoundingClientRect();
  dd.style.display='block';
  const ddW=dd.offsetWidth||220;
  let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px';
  dd.style.left=Math.max(8,left)+'px';
}
function confirmMuniAntigaFilter(){
  const prefix=_muniAntigaPrefix; if(!prefix) return;
  _muniAntigaShown[prefix]=new Set(_muniAntigaPending);
  document.getElementById('muni-antiga-dropdown').style.display='none';
  _muniAntigaPrefix=null;
  _updateMuniAntigaButtonState(prefix);
  if(prefix==='em') applyFilters();
  else if(prefix==='se') renderSaldoEmendas();
}
function closeMuniAntigaFilter(){
  const dd=document.getElementById('muni-antiga-dropdown');
  if(dd) dd.style.display='none';
  _muniAntigaPrefix=null;
}
document.addEventListener('click',function(e){
  const dd=document.getElementById('muni-antiga-dropdown');
  if(dd && dd.style.display==='block'){
    if(!dd.contains(e.target) && !(e.target.closest && e.target.closest('#em-muni-antiga-btn,#se-muni-antiga-btn'))){ dd.style.display='none'; _muniAntigaPrefix=null; }
  }
});
function clearAllFilters(){
  ["f-cpl","f-empenho","f-patrimonio","f-nf","f-busca"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  resetMunicipalAnos('em');
  Object.keys(headerFilters).forEach(c=>headerFilters[c]=[]);
  sortCol=null;
  document.querySelectorAll(".sort-icon").forEach(el=>el.textContent="");
  updateHeaderFilterIndicators();
  applyFilters();
}

function applyFilters(){
  const get=id=>document.getElementById(id)?.value||"";
  const cpl=get("f-cpl").toLowerCase(),busca=get("f-busca").toLowerCase();
  const empenho=get("f-empenho").toLowerCase(),patrimonio=get("f-patrimonio").toLowerCase(),nf=get("f-nf").toLowerCase();
  _updateMuniAntigaButtonState('em');
  filtered=allRows.filter(r=>{
    if(!_municipalAntigaVisivel('em',r)) return false;
    for(const col in headerFilters){
      const sel=headerFilters[col];
      if(sel.length){
        const val=HDR_FILTER_COLS[col].get(r);
        if(!sel.includes(val==null?'':String(val))) return false;
      }
    }
    if(cpl&&!r.cpl.toLowerCase().includes(cpl)) return false;
    if(empenho&&!r.empenho.toLowerCase().includes(empenho)) return false;
    if(patrimonio&&!r.patrimonio.toLowerCase().includes(patrimonio)) return false;
    if(nf&&!r.nota_fiscal.toLowerCase().includes(nf)) return false;
    if(busca&&!matchBusca([r.item,r.status_raw,r.unidade,r.cpl,r.empenho,r.nota_fiscal,r.patrimonio,r.emenda,r.parlamentar,r.unidade_entrega,r.ordem_pagamento].filter(Boolean).join(' '),busca)) return false;
    if(semCplFilter&&r.cpl) return false;
    return true;
  });
  renderMetrics();renderStatusList();renderParlBars();renderTable();
  emRenderAtivo();
}

// ═══ MODOS DE VISUALIZAÇÃO DAS EMENDAS ═══
const EM_MODOS=[
  ['por-emenda','📂 Emendas'],
  ['planilha','📋 Planilha'],
  ['cards','🪪 Visão parlamentar'],
  ['status','🗂️ Por status'],
  ['parlamentar','👤 Por parlamentar']
];
function _emLoadConfig(){
  // "Por emenda" é sempre o modo principal ao carregar a página, independente
  // de preferência salva anteriormente no localStorage.
  try{ const c=JSON.parse(localStorage.getItem('em_config')||'null'); if(c&&Array.isArray(c.disponiveis)&&c.disponiveis.length) return {disponiveis:c.disponiveis, principal:'por-emenda'}; }catch(_){}
  return {disponiveis:EM_MODOS.map(m=>m[0]), principal:'por-emenda'};
}
let _emConfig=_emLoadConfig();
let _emModo=_emConfig.principal;
let _emExpand={};
function _emSalvarConfigLS(){ try{localStorage.setItem('em_config',JSON.stringify(_emConfig));}catch(_){} }
function renderEmModoBar(){
  const bar=document.getElementById('em-modo-bar'); if(!bar) return;
  const modosPermitidos=new Set(['planilha','por-emenda']);
  const disp=EM_MODOS.filter(([k])=>modosPermitidos.has(k));
  if(!disp.some(([k])=>k===_emModo)) _emModo=disp[0]?.[0]||'planilha';
  bar.innerHTML=''+
    disp.map(([k,l])=>`<button onclick="emSetModo('${k}')" style="font-size:12px;padding:6px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer;background:${_emModo===k?'var(--blue)':'var(--surface)'};color:${_emModo===k?'#fff':'var(--text2)'}">${l}${k===_emConfig.principal?' ★':''}</button>`).join('')+
    (_isAdmin()?`<button onclick="emAbrirConfig()" title="Configurar modos (admin)" style="font-size:12px;padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer;background:var(--surface);color:var(--text2);margin-left:6px">⚙️</button>`:'');
}
function emSetModo(m){ _emModo=m; emRenderAtivo(); }
function emRenderAtivo(){
  renderEmModoBar();
  const pl=document.getElementById('em-view-planilha');
  const dyn=document.getElementById('em-view-por-emenda');
  if(!pl||!dyn) return;
  if(_emModo==='planilha'){ dyn.style.display='none'; pl.style.display=''; return; }
  pl.style.display='none'; dyn.style.display='';
  if(_emModo==='por-emenda') renderEmPorEmenda();
  else if(_emModo==='cards') renderEmCards();
  else if(_emModo==='status') renderEmPorStatus();
  else if(_emModo==='parlamentar') renderEmPorParlamentar();
  else renderEmPorEmenda();
}
function emAbrirConfig(){
  if(!_isAdmin()) return;
  const ov=document.createElement('div');
  ov.className='em-cfg-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--surface);border-radius:12px;padding:20px;width:400px;max-width:94vw">
    <div style="font-size:15px;font-weight:700;margin-bottom:6px">⚙️ Modos de visualização das Emendas</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px">Marque quais modos ficam disponíveis e escolha o principal (★ = abre primeiro).</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">${EM_MODOS.map(([k,l])=>`
      <label style="display:flex;align-items:center;gap:10px;font-size:13px">
        <input type="checkbox" class="emcfg-disp" value="${k}" ${_emConfig.disponiveis.includes(k)?'checked':''} style="accent-color:var(--blue)">
        <span style="flex:1">${l}</span>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);cursor:pointer"><input type="radio" name="emcfg-princ" value="${k}" ${_emConfig.principal===k?'checked':''} style="accent-color:var(--amber)"> principal</label>
      </label>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="this.closest('.em-cfg-ov').remove()" style="font-size:12px;padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);cursor:pointer">Cancelar</button>
      <button onclick="emSalvarConfig(this)" style="font-size:12px;padding:8px 14px;border-radius:var(--radius-sm);border:none;background:var(--blue);color:#fff;cursor:pointer">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function emSalvarConfig(btn){
  const ov=btn.closest('.em-cfg-ov');
  const disp=[...ov.querySelectorAll('.emcfg-disp:checked')].map(c=>c.value);
  if(!disp.length){ alert('Selecione ao menos um modo.'); return; }
  let princ=ov.querySelector('input[name=emcfg-princ]:checked')?.value||disp[0];
  if(!disp.includes(princ)) princ=disp[0];
  _emConfig={disponiveis:disp, principal:princ}; _emSalvarConfigLS();
  _emModo=princ; ov.remove(); emRenderAtivo();
}
function _emGrupos(keyFn){ const g={}; (filtered||[]).forEach(r=>{ const k=keyFn(r)||'—'; (g[k]=g[k]||[]).push(r); }); return g; }
function _emProg(items){ const t=items.length, e=items.filter(i=>/ENTREGUE/i.test(i.status_cat||'')).length; return {t,e,pct:t?Math.round(e/t*100):0}; }
function emSetModoEmenda(emEnc){ const em=decodeURIComponent(emEnc); _emExpand={}; _emExpand[em]=true; _emModo='por-emenda'; emRenderAtivo(); }
function renderEmCards(){
  const box=document.getElementById('em-view-por-emenda'); if(!box) return;
  const g=_emGrupos(r=>r.emenda); const chaves=Object.keys(g).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(!chaves.length){ box.innerHTML='<div style="padding:1rem;color:var(--text3);text-align:center">Nenhuma emenda.</div>'; return; }
  box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">'+chaves.map(em=>{
    const items=g[em]; const p=_emProg(items); const r0=items[0]||{};
    const cor=p.pct>=100?'var(--green)':(p.pct>0?'var(--amber)':'var(--text3)');
    return `<div onclick="emSetModoEmenda('${encodeURIComponent(em)}')" title="Ver itens desta emenda" style="border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--surface);cursor:pointer">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">${_sanEsc(em)}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">${_sanEsc(r0.parlamentar||'—')}</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="position:relative;width:58px;height:58px;border-radius:50%;background:conic-gradient(${cor} ${p.pct*3.6}deg, var(--border) 0)">
          <div style="position:absolute;inset:6px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${cor}">${p.pct}%</div>
        </div>
        <div style="font-size:12px;color:var(--text2)"><b style="font-size:15px">${p.e}</b>/${p.t}<br><span style="color:var(--text3)">itens entregues</span></div>
      </div>
    </div>`;
  }).join('')+'</div>';
}
function renderEmPorStatus(){
  const box=document.getElementById('em-view-por-emenda'); if(!box) return;
  const g=_emGrupos(r=>r.status_cat||'Sem status');
  const ordem=['EM LICITAÇÃO','EM ANDAMENTO','AGUARDANDO RESERVA','EM CARONA','SEGOV','CONTROLE INTERNO','AF EMITIDA','ENTREGUE','TRANSFERIDO TI','FRACASSADO','CANCELADO','SUSPENSO'];
  const chaves=Object.keys(g).sort((a,b)=>{ const ia=ordem.indexOf(a),ib=ordem.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b); });
  if(!chaves.length){ box.innerHTML='<div style="padding:1rem;color:var(--text3);text-align:center">Nenhum item.</div>'; return; }
  box.innerHTML='<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px">'+chaves.map(st=>{
    const items=g[st];
    return `<div style="min-width:230px;flex:0 0 230px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:9px">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px">${_sanEsc(st)} <span style="color:var(--text3);font-weight:400">(${items.length})</span></div>
      ${items.slice(0,60).map(i=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:7px 9px;margin-bottom:6px;font-size:12px"><div style="font-weight:500">${_sanEsc(i.item||'—')}</div><div style="font-size:10px;color:var(--text3)">${_sanEsc(i.emenda||'')}${i.cpl?(' · '+_sanEsc(i.cpl)):''}</div></div>`).join('')}
      ${items.length>60?`<div style="font-size:11px;color:var(--text3);text-align:center">+${items.length-60} mais</div>`:''}
    </div>`;
  }).join('')+'</div>';
}
function renderEmPorParlamentar(){
  const box=document.getElementById('em-view-por-emenda'); if(!box) return;
  const g=_emGrupos(r=>r.parlamentar); const chaves=Object.keys(g).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(!chaves.length){ box.innerHTML='<div style="padding:1rem;color:var(--text3);text-align:center">Nenhum parlamentar.</div>'; return; }
  box.innerHTML=chaves.map(par=>{
    const items=g[par]; const p=_emProg(items); const emendas=new Set(items.map(i=>i.emenda)).size;
    return `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;padding:12px 14px;background:var(--surface);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px"><div style="font-weight:700;font-size:14px">${_sanEsc(par)}</div><div style="font-size:11px;color:var(--text3)">${emendas} emenda(s) · ${p.t} itens · ${p.e} entregues</div></div>
      <div style="width:180px"><div style="height:9px;background:var(--border);border-radius:6px;overflow:hidden"><div style="height:100%;width:${p.pct}%;background:var(--green)"></div></div><div style="font-size:11px;color:var(--text3);text-align:right;margin-top:3px">${p.pct}% entregue</div></div>
    </div>`;
  }).join('');
}
function _emStatusChip(i){
  const c=i.status_cat||'';
  const cor=/ENTREGUE/i.test(c)?'var(--green)':(/(FRACASS|CANCEL|SUSPEN)/i.test(c)?'var(--red)':'var(--text2)');
  return `<span style="font-size:11px;font-weight:600;color:${cor}">${_sanEsc(c||'—')}</span>`;
}
function emTogglePorEmenda(em){ _emExpand[em]=!_emExpand[em]; renderEmPorEmenda(); }
function renderEmPorEmenda(){
  const box=document.getElementById('em-view-por-emenda'); if(!box) return;
  const grupos={};
  (filtered||[]).forEach(r=>{ const k=r.emenda||'—'; (grupos[k]=grupos[k]||[]).push(r); });
  const chaves=Object.keys(grupos).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(!chaves.length){ box.innerHTML='<div style="padding:1rem;color:var(--text3);text-align:center">Nenhuma emenda encontrada.</div>'; return; }
  box.innerHTML=chaves.map(em=>{
    const items=grupos[em];
    const total=items.length;
    const entregues=items.filter(i=>/ENTREGUE/i.test(i.status_cat||'')).length;
    const pct=total?Math.round(entregues/total*100):0;
    const r0=items[0]||{};
    const aberto=!!_emExpand[em];
    const emEnc=encodeURIComponent(em);
    let h=`<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:.85rem;overflow:hidden;background:var(--surface)">
      <div onclick="emTogglePorEmenda(decodeURIComponent('${emEnc}'))" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;background:var(--surface2)">
        <span style="font-size:13px;color:var(--text3);transform:rotate(${aberto?90:0}deg);transition:.15s">▶</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${_sanEsc(r0.objeto||'')}">
            <span>${_sanEsc(r0.tipo||'—')}</span> -
            <b>${_sanEsc(em)}${r0.ano?`/${_sanEsc(r0.ano)}`:''}</b> -
            <span>${_sanEsc(r0.objeto||'—')}</span>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">${_sanEsc(r0.parlamentar||'—')} · ${fmtFull(r0.valor_cedido||0)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${total} ${total===1?'item':'itens'} · ${entregues} entregue${entregues!==1?'s':''}</div>
        </div>
        <div style="width:170px;flex-shrink:0">
          <div style="height:9px;background:var(--border);border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--green)"></div></div>
          <div style="font-size:11px;color:var(--text3);text-align:right;margin-top:3px">${pct}% entregue</div>
        </div>
      </div>`;
    if(aberto){
      h+=`<div style="overflow-x:auto"><table style="width:100%;min-width:1280px;border-collapse:collapse;font-size:12px"><thead><tr style="border-top:1px solid var(--border);background:var(--surface2);color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.035em"><th style="padding:7px 14px;text-align:left">Item</th><th style="padding:7px 8px;text-align:left">Unidade</th><th style="padding:7px 8px;text-align:right">Qtde</th><th style="padding:7px 8px;text-align:right">Valor planejado</th><th style="padding:7px 8px;text-align:right">Em licitação</th><th style="padding:7px 8px;text-align:right">Contratado / executado</th><th style="padding:7px 8px;text-align:left">Nota fiscal</th><th style="padding:7px 8px;text-align:left">Empenho</th><th style="padding:7px 8px;text-align:left">Patrimônio</th><th style="padding:7px 8px;text-align:left">Status</th><th style="padding:7px 8px;text-align:left">Processo</th><th style="padding:7px 14px;text-align:right">Ações</th></tr></thead><tbody>`;
      items.forEach(i=>{
        h+=`<tr style="border-top:1px solid var(--border)">
          <td style="padding:8px 14px">${_sanEsc(i.item||'—')}</td>
          <td style="padding:8px;color:var(--text2);white-space:nowrap">${_sanEsc(i.unidade||'â€”')}</td>
          <td style="padding:8px;color:var(--text3);text-align:right;white-space:nowrap">${i.qtde??'â€”'}</td>
          <td style="padding:8px;text-align:right;white-space:nowrap">${Number(i.vl_unitario_cadastrado)>0?fmtFull(i.vl_unitario_cadastrado):'—'}</td>
          <td style="padding:8px;text-align:right;white-space:nowrap;color:var(--blue)">${Number(i.valor_licitacao_unit)>0?fmtFull(i.valor_licitacao_unit):'—'}</td>
          <td style="padding:8px;text-align:right;white-space:nowrap;color:var(--green);font-weight:600">${Number(i.valor_contratado_unit)>0?fmtFull(i.valor_contratado_unit):'—'}</td>
          <td style="padding:8px;text-align:right;white-space:nowrap;color:var(--green);font-weight:600">${Number(i.vl_total)>0?fmtFull(i.vl_total):'—'}</td>
          <td style="padding:8px;color:var(--text2);white-space:nowrap">${_sanEsc(i.nota_fiscal||'â€”')}</td>
          <td style="padding:8px;color:var(--text2);white-space:nowrap">${_sanEsc(i.empenho||'â€”')}</td>
          <td style="padding:8px;color:var(--text2);white-space:nowrap">${_sanEsc(i.patrimonio||'â€”')}</td>
          <td style="padding:8px;white-space:nowrap">${_emStatusChip(i)}</td>
          <td style="padding:8px;color:var(--text3);font-size:11px;white-space:nowrap">${_sanEsc(i.cpl||'â€”')}</td>
          <td style="padding:8px 14px;text-align:right;white-space:nowrap"><button onclick="verTudoEmendaItem(decodeURIComponent('${encodeURIComponent(String(i.id))}'))" style="font-size:11px;padding:3px 9px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer">🔎 Ver tudo</button></td>
        </tr>`;
      });
      h+=`</tbody></table></div>`;
    }
    h=h.replace(/>Em [^<]*<\/th>/, '>Valor unit. licitação</th>').replace('>Valor planejado</th>','>Valor unit. planejado</th>').replace('>Contratado / executado</th>','>Valor unit. contratado</th>');
    h=h.replace('<th style="padding:7px 8px;text-align:left">Nota fiscal</th>','<th style="padding:7px 8px;text-align:right">Total executado</th><th style="padding:7px 8px;text-align:left">Nota fiscal</th>');
    h+=`</div>`;
    h=h.replace(/(?:â€”|—)/g,'-');
    return h;
  }).join('');
}

// ═══ RENDER ═══
function renderMetrics(){
  const rows=filtered;
  const emU=new Set(rows.map(r=>r.emenda));
  const valC=[...emU].reduce((a,em)=>{const r=rows.find(x=>x.emenda===em);return a+(r?r.valor_cedido:0);},0);
  const valE=rows.filter(r=>r.status_cat==="ENTREGUE").reduce((a,r)=>a+r.vl_total,0);
  const ent=rows.filter(r=>r.status_cat==="ENTREGUE").length;
  const pct=rows.length?Math.round(ent/rows.length*100):0;
  const pctF=valC?Math.round(valE/valC*100):0;
  document.getElementById("m-emendas").textContent=emU.size;
  document.getElementById("m-valor").textContent=fmtM(valC);
  document.getElementById("m-exec").textContent=fmtM(valE);
  document.getElementById("m-itens").textContent=rows.length.toLocaleString("pt-BR");
  document.getElementById("m-entregues").textContent=pct+"%";
  const semCpl=allRows.filter(r=>!r.cpl).length;
  document.getElementById("m-sem-cpl").textContent=semCpl;
  const card=document.getElementById("m-sem-cpl-card");
  card.style.outline=semCplFilter?"2px solid var(--amber)":"";
  card.style.borderLeftWidth=semCplFilter?"3px":"1px";
  document.getElementById("prog-pct").textContent=pctF+"%";
  document.getElementById("prog-fill").style.width=pctF+"%";
  document.getElementById("prog-exec").textContent=fmtFull(valE)+" executados";
  document.getElementById("prog-total").textContent=fmtFull(valC);
  document.getElementById("prog-rest").textContent=fmtFull(valC-valE)+" restantes";
}

function renderStatusList(){
  const counts={};filtered.forEach(r=>{counts[r.status_cat]=(counts[r.status_cat]||0)+1});
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById("status-list").innerHTML=sorted.map(([cat,cnt])=>{
    const i=STATUS_MAP[cat]||{color:"#888",label:cat};
    return`<div class="status-row" onclick="filterByStatus('${cat}')"><div class="sdot" style="background:${i.color}"></div><span class="sname">${i.label}</span><div class="sbar-wrap"><div class="sbar" style="width:${Math.round(cnt/max*100)}%;background:${i.color}44"></div></div><span class="scnt">${cnt}</span></div>`;
  }).join("");
}
function filterByStatus(cat){headerFilters.status_cat=[cat];updateHeaderFilterIndicators();applyFilters()}

function renderParlBars(){
  const counts={};filtered.forEach(r=>{if(!r.parlamentar)return;if(!counts[r.parlamentar])counts[r.parlamentar]=new Set();counts[r.parlamentar].add(r.emenda)});
  const sorted=Object.entries(counts).map(([p,s])=>[p,s.size]).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max=sorted[0]?.[1]||1;
  const colors=["#1D9E75","#378ADD","#7F77DD","#EF9F27","#D4537E","#5DCAA5","#639922","#888780"];
  document.getElementById("parl-bars").innerHTML=sorted.map(([p,cnt],i)=>`<div class="bar-row"><div class="bar-lbl" title="${p}">${p}</div><div class="bar-track" onclick="filterByParl('${p}')"><div class="bar-fill" style="width:${Math.round(cnt/max*100)}%;background:${colors[i%8]}"></div></div><div class="bar-val">${cnt} emenda${cnt>1?"s":""}</div></div>`).join("");
}
function filterByParl(p){headerFilters.parlamentar=[p];updateHeaderFilterIndicators();applyFilters()}

// ═══ SALDO DAS EMENDAS ═══
let saldoEmendaCarregado = false;
let saldoEmendasRows = [];

function _valorComprometidoItem(r){
  const fluxo=Number(r?.valor_comprometido)||0;
  if(fluxo>0) return fluxo;
  const executado=Number(r?.vl_total)||0;
  return executado>0?executado:(Number(r?.vl_total_cadastrado)||0);
}
function _saldoEmendaValor(emendaId){
  const itens=allRows.filter(r=>String(r.emenda_id)===String(emendaId));
  const cedido=Number(itens[0]?.valor_cedido)||0;
  return cedido-itens.reduce((total,r)=>total+_valorComprometidoItem(r),0);
}
function getSaldoEmenda(emendaId){
  const saldo=_saldoEmendaValor(emendaId);
  const cor=saldo>0?'var(--green)':saldo<0?'var(--red)':'var(--text2)';
  return `<span style="font-weight:600;color:${cor};white-space:nowrap">${fmtFull(saldo)}</span>`;
}
function _seDomId(emendaId){ return 'se-detail-'+String(emendaId).replace(/[^a-zA-Z0-9_-]/g,'-'); }
function _saldoStatusBadge(status){
  const s=String(status||'Não iniciada');
  const estilo=s==='Executada'
    ?'background:var(--green-bg);color:var(--green-text)'
    :s==='Em andamento'
      ?'background:var(--blue-bg);color:var(--blue-text)'
      :'background:var(--surface2);color:var(--text2);border:1px solid var(--border)';
  return `<span class="badge" style="${estilo}">${_sanEsc(s)}</span>`;
}
function _renderSaldoDetalhesLegacy(emendaId){
  const itens=allRows.filter(r=>String(r.emenda_id)===String(emendaId));
  if(!itens.length) return '<div style="padding:12px;color:var(--text3)">Nenhum item encontrado para esta emenda.</div>';
  return `<div style="padding:10px 14px;background:var(--surface2);overflow-x:auto"><table style="font-size:11px;background:var(--surface)">
    <thead><tr><th>Item planejado</th><th>Qtde plan.</th><th>Vl. plan.</th><th>Item executado</th><th>Qtde exec.</th><th>Vl. exec.</th><th>Comprometido</th><th>CPL</th><th>Status</th></tr></thead>
    <tbody>${itens.map(r=>`<tr>
      <td>${_sanEsc(r.item_cadastrado||'—')}</td><td style="text-align:right">${_sanEsc(r.qtde_cadastrada||'—')}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.vl_total_cadastrado)||0)}</td>
      <td>${_sanEsc(r.item||'—')}</td><td style="text-align:right">${_sanEsc(r.qtde||'—')}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.vl_total)||0)}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:600">${fmtFull(_valorComprometidoItem(r))}</td><td>${_sanEsc(r.cpl||'—')}</td><td>${statusBadge(r.status_cat)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
function _renderSaldoDetalhesLegacy2(emendaId){
  const itens=allRows.filter(r=>String(r.emenda_id)===String(emendaId));
  if(!itens.length) return '<div style="padding:12px;color:var(--text3)">Nenhum item encontrado para esta emenda.</div>';
  return `<div style="padding:10px 14px;background:var(--surface2);overflow-x:auto"><table style="min-width:1250px;font-size:11px;background:var(--surface)">
    <thead><tr><th>Item</th><th>Unidade</th><th style="text-align:right">Qtde</th><th style="text-align:right">Valor planejado</th><th style="text-align:right">Em licitação</th><th style="text-align:right">Contratado / executado</th><th>Nota fiscal</th><th>Empenho</th><th>Patrimônio</th><th>Status</th><th>Processo</th></tr></thead>
    <tbody>${itens.map(r=>`<tr>
      <td>${_sanEsc(r.item||r.item_cadastrado||'—')}</td><td>${_sanEsc(r.unidade||'—')}</td><td style="text-align:right">${_sanEsc(r.qtde||r.qtde_cadastrada||'—')}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.vl_total_cadastrado)||0)}</td>
      <td style="text-align:right;white-space:nowrap;color:var(--blue)">${fmtFull(Number(r.valor_licitacao)||0)}</td><td style="text-align:right;white-space:nowrap;color:var(--green);font-weight:600">${fmtFull(Number(r.valor_contratado)||0)}</td><td>${_sanEsc(r.nota_fiscal||'—')}</td><td>${_sanEsc(r.empenho||'—')}</td><td>${_sanEsc(r.patrimonio||'—')}</td><td>${statusBadge(r.status_cat)}</td><td>${_sanEsc(r.cpl||'—')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
function _renderSaldoDetalhes(emendaId){
  const itens=allRows.filter(r=>String(r.emenda_id)===String(emendaId));
  if(!itens.length) return '<div style="padding:12px;color:var(--text3)">Nenhum item encontrado para esta emenda.</div>';
  const money=(v)=>Number(v)>0?fmtFull(v):'—';
  return `<div style="padding:10px 14px;background:var(--surface2);overflow-x:auto"><table style="min-width:1400px;font-size:11px;background:var(--surface)">
    <thead><tr><th>Item</th><th>Unidade</th><th style="text-align:right">Qtde</th><th style="text-align:right">Valor unit. planejado</th><th style="text-align:right">Valor unit. licitação</th><th style="text-align:right">Valor unit. contratado</th><th style="text-align:right">Total executado</th><th>Nota fiscal</th><th>Empenho</th><th>Patrimônio</th><th>Status</th><th>Processo</th></tr></thead>
    <tbody>${itens.map(r=>`<tr><td>${_sanEsc(r.item||r.item_cadastrado||'—')}</td><td>${_sanEsc(r.unidade||'—')}</td><td style="text-align:right">${_sanEsc(r.qtde||r.qtde_cadastrada||'—')}</td><td style="text-align:right;white-space:nowrap">${money(r.vl_unitario_cadastrado)}</td><td style="text-align:right;white-space:nowrap;color:var(--blue)">${money(r.valor_licitacao_unit)}</td><td style="text-align:right;white-space:nowrap;color:var(--green);font-weight:600">${money(r.valor_contratado_unit)}</td><td style="text-align:right;white-space:nowrap;color:var(--green);font-weight:600">${money(r.vl_total)}</td><td>${_sanEsc(r.nota_fiscal||'—')}</td><td>${_sanEsc(r.empenho||'—')}</td><td>${_sanEsc(r.patrimonio||'—')}</td><td>${statusBadge(r.status_cat)}</td><td>${_sanEsc(r.cpl||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}
function toggleSaldoEmenda(emendaId,button){
  const detalhe=document.getElementById(_seDomId(emendaId));
  if(!detalhe) return;
  const abrir=detalhe.style.display==='none';
  detalhe.style.display=abrir?'table-row':'none';
  if(button) button.textContent=abrir?'▼':'▶';
  setTimeout(_setTableOffset,50);
}
const SALDO_FILTER_COLS={
  numero_emenda:{label:'Nº Emenda',get:r=>r.numero_emenda},tipo:{label:'Tipo',get:r=>r.tipo},
  parlamentar:{label:'Parlamentar',get:r=>r.parlamentar},unidade:{label:'Unidade',get:r=>r.unidade},
  valor_cedido:{label:'Valor cedido',get:r=>r.valor_cedido,numeric:true},total_planejado:{label:'Total planejado',get:r=>r.total_planejado,numeric:true},total_estimado_licitacao:{label:'Estimado licitação',get:r=>r.total_estimado_licitacao,numeric:true},
  total_executado:{label:'Total executado',get:r=>r.total_executado,numeric:true},total_comprometido:{label:'Comprometido',get:r=>r.total_comprometido,numeric:true},
  saldo_remanescente:{label:'Saldo disponível',get:r=>r.saldo_remanescente,numeric:true},_percentual:{label:'% exec.',get:r=>r._percentual,numeric:true},
  status_execucao:{label:'Status',get:r=>r.status_execucao},qtd_itens:{label:'Itens',get:r=>r.qtd_itens,numeric:true}
};
let saldoHeaderFilters={};
let saldoSortCol=null, saldoSortAsc=true, _saldoFilterCol=null, _saldoFilterPending=[];

function _saldoComPercentual(r){
  return {...r,_percentual:Number(r.valor_cedido)>0?Math.round((Number(r.total_executado)||0)/Number(r.valor_cedido)*100):0};
}
function _saldoFilterValue(col,r){
  const valor=SALDO_FILTER_COLS[col].get(r);
  return valor==null?'':String(valor);
}
function _saldoFilterDisplay(col,valor){
  if(valor==='') return '(vazio)';
  if(SALDO_FILTER_COLS[col].numeric){
    if(col==='_percentual') return `${valor}%`;
    if(col==='qtd_itens') return Number(valor).toLocaleString('pt-BR');
    return fmtFull(Number(valor)||0);
  }
  return valor;
}
function _saldoUniqueValues(col){
  const vals=[...new Set(saldoEmendasRows.map(_saldoComPercentual).map(r=>_saldoFilterValue(col,r)))];
  return vals.sort((a,b)=>SALDO_FILTER_COLS[col].numeric?(Number(a)||0)-(Number(b)||0):a.localeCompare(b,'pt-BR',{numeric:true}));
}
function _ensureSaldoFilterDropdown(){
  let dd=document.getElementById('se-filter-dropdown');
  if(dd) return dd;
  dd=document.createElement('div'); dd.id='se-filter-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:260px;padding:.625rem';
  dd.innerHTML=`<div id="se-filter-title" style="font-size:12px;font-weight:600;margin-bottom:.5rem"></div>
    <input type="text" id="se-filter-search" placeholder="Buscar valores..." oninput="_renderSaldoFilterList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem"><button onclick="_selecionarTudoSaldo(true)" style="border:none;background:var(--surface);color:var(--text);cursor:pointer">Selecionar tudo</button> · <button onclick="_selecionarTudoSaldo(false)" style="border:none;background:var(--surface);color:var(--text);cursor:pointer">Limpar</button></div>
    <div id="se-filter-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end"><button onclick="closeSaldoHeaderFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);cursor:pointer">Cancelar</button><button onclick="confirmSaldoHeaderFilter()" style="font-size:12px;padding:5px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);cursor:pointer;font-weight:600">OK</button></div>`;
  document.body.appendChild(dd); return dd;
}
function openSaldoHeaderFilter(event,col){
  const dd=_ensureSaldoFilterDropdown();
  _saldoFilterCol=col;
  const todos=_saldoUniqueValues(col), atual=saldoHeaderFilters[col];
  _saldoFilterPending=Array.isArray(atual)?[...atual]:[...todos];
  document.getElementById('se-filter-title').textContent='Filtrar: '+SALDO_FILTER_COLS[col].label;
  document.getElementById('se-filter-search').value=''; _renderSaldoFilterList();
  const rect=event.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const largura=dd.offsetWidth||260;
  dd.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-largura-8))+'px';
  dd.style.top=Math.min(rect.bottom+4,window.innerHeight-dd.offsetHeight-8)+'px';
}
function _renderSaldoFilterList(){
  if(!_saldoFilterCol) return;
  const busca=normalizar(document.getElementById('se-filter-search').value);
  const vis=_saldoUniqueValues(_saldoFilterCol).filter(v=>!busca||normalizar(_saldoFilterDisplay(_saldoFilterCol,v)).includes(busca));
  document.getElementById('se-filter-list').innerHTML=vis.map(v=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px"><input type="checkbox" data-value="${encodeURIComponent(v)}" ${_saldoFilterPending.includes(v)?'checked':''} onchange="_toggleSaldoFilterValue(this)" style="accent-color:var(--blue)">${_sanEsc(_saldoFilterDisplay(_saldoFilterCol,v))}</label>`).join('')||'<div style="padding:10px;color:var(--text3);font-size:12px">Nenhum valor</div>';
}
function _toggleSaldoFilterValue(input){
  const valor=decodeURIComponent(input.dataset.value);
  if(input.checked){if(!_saldoFilterPending.includes(valor))_saldoFilterPending.push(valor)}else _saldoFilterPending=_saldoFilterPending.filter(v=>v!==valor);
}
function _selecionarTudoSaldo(selecionar){ _saldoFilterPending=selecionar?_saldoUniqueValues(_saldoFilterCol):[];_renderSaldoFilterList(); }
function closeSaldoHeaderFilter(){const dd=document.getElementById('se-filter-dropdown');if(dd)dd.style.display='none';}
document.addEventListener('click',e=>{
  const dd=document.getElementById('se-filter-dropdown');
  if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!e.target.closest('[id^="se-hf-"]')) closeSaldoHeaderFilter();
});
function confirmSaldoHeaderFilter(){
  const todos=_saldoUniqueValues(_saldoFilterCol);
  if(_saldoFilterPending.length===todos.length) delete saldoHeaderFilters[_saldoFilterCol];
  else saldoHeaderFilters[_saldoFilterCol]=[..._saldoFilterPending];
  closeSaldoHeaderFilter(); renderSaldoEmendas();
}
function sortSaldoEmendas(col){
  if(saldoSortCol===col) saldoSortAsc=!saldoSortAsc; else{saldoSortCol=col;saldoSortAsc=true;}
  renderSaldoEmendas();
}
function limparFiltrosSaldo(){
  document.getElementById('se-busca').value=''; saldoHeaderFilters={}; saldoSortCol=null; saldoSortAsc=true; resetMunicipalAnos('se'); closeSaldoHeaderFilter(); renderSaldoEmendas();
}
function _saldoRowsVisiveis(){
  const busca=normalizar(document.getElementById('se-busca')?.value||'');
  _updateMunicipalAnoButtons('se');
  const rows=saldoEmendasRows.map(_saldoComPercentual).filter(r=>{
    // municipais históricas ficam ocultas por padrão e aparecem só pelo botão do respectivo ano
    if(!_municipalAntigaVisivel('se',r)) return false;
    if(busca&&!normalizar([r.numero_emenda,r.tipo,r.parlamentar,r.unidade,r.status_execucao,r.valor_cedido,r.total_planejado,r.total_estimado_licitacao,r.total_executado,r.total_comprometido,r.saldo_remanescente,r.qtd_itens].join(' ')).includes(busca)) return false;
    return Object.entries(saldoHeaderFilters).every(([col,selecionados])=>selecionados.includes(_saldoFilterValue(col,r)));
  });
  if(saldoSortCol){
    const cfg=SALDO_FILTER_COLS[saldoSortCol];
    rows.sort((a,b)=>{
      const va=cfg.get(a),vb=cfg.get(b);
      const cmp=cfg.numeric?(Number(va)||0)-(Number(vb)||0):String(va||'').localeCompare(String(vb||''),'pt-BR',{numeric:true});
      return saldoSortAsc?cmp:-cmp;
    });
  }
  return rows;
}
function renderSaldoEmendas(){
  const rows=_saldoRowsVisiveis();
  const soma=campo=>rows.reduce((total,r)=>total+(Number(r[campo])||0),0);
  const totalCedido=soma('valor_cedido'), totalComprometido=soma('total_comprometido'), totalSaldo=soma('saldo_remanescente');
  document.getElementById('se-kpi-total').textContent=rows.length.toLocaleString('pt-BR');
  document.getElementById('se-kpi-cedido').textContent=fmtFull(totalCedido);
  document.getElementById('se-kpi-comprometido').textContent=fmtFull(totalComprometido);
  const saldoEl=document.getElementById('se-kpi-saldo');
  saldoEl.textContent=fmtFull(totalSaldo); saldoEl.style.color=totalSaldo>=0?'var(--green)':'var(--red)';
  document.getElementById('se-count').textContent=`${rows.length.toLocaleString('pt-BR')} de ${saldoEmendasRows.length.toLocaleString('pt-BR')} emendas`;
  document.querySelectorAll('[id^="se-si-"]').forEach(el=>el.textContent='');
  if(saldoSortCol){const icon=document.getElementById('se-si-'+saldoSortCol);if(icon)icon.textContent=saldoSortAsc?' ↑':' ↓';}
  Object.keys(SALDO_FILTER_COLS).forEach(col=>{const btn=document.getElementById('se-hf-'+col);if(btn)btn.classList.toggle('active',Object.prototype.hasOwnProperty.call(saldoHeaderFilters,col));});
  document.getElementById('se-body').innerHTML=rows.map(r=>{
    const id=String(r.id||'');
    const pct=r._percentual;
    const saldo=Number(r.saldo_remanescente)||0;
    const saldoCor=saldo>0?'var(--green)':saldo<0?'var(--red)':'var(--text2)';
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${_sanEsc(r.numero_emenda||'—')}</td><td>${tipoBadge(r.tipo)}</td><td>${_sanEsc(r.parlamentar||'—')}</td><td>${_sanEsc(r.unidade||'—')}</td>
      <td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.valor_cedido)||0)}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.total_planejado)||0)}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.total_estimado_licitacao)||0)}</td>
      <td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.total_executado)||0)}</td><td style="text-align:right;white-space:nowrap">${fmtFull(Number(r.total_comprometido)||0)}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:600;color:${saldoCor}">${fmtFull(saldo)}</td><td style="text-align:right">${pct}%</td><td>${_saldoStatusBadge(r.status_execucao)}</td>
      <td style="text-align:right">${Number(r.qtd_itens)||0}</td><td><button onclick="toggleSaldoEmenda(decodeURIComponent('${encodeURIComponent(id)}'),this)" aria-label="Expandir itens" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer">▶</button></td>
    </tr><tr id="${_seDomId(id)}" style="display:none"><td colspan="14" style="padding:0">${_renderSaldoDetalhes(id).replace(/(?:â€”|—)/g,'-')}</td></tr>`;
  }).join('');
}
async function loadSaldoEmendas(){
  if(!podeEditar('dashboard')) return;
  const loading=document.getElementById('se-loading'), main=document.getElementById('se-main');
  loading.style.display='block'; main.style.display='none';
  loading.innerHTML='<span class="spinner"></span>Carregando saldo das emendas...';
  const {data,error}=await sb.from('vw_emendas_saldo').select('*').order('numero_emenda');
  if(error){loading.innerHTML=`<div style="color:var(--red)">Erro ao carregar saldos: ${_sanEsc(error.message)}</div>`;return;}
  saldoEmendasRows=data||[];
  renderSaldoEmendas();
  saldoEmendaCarregado=true;
  loading.style.display='none'; main.style.display='block';
  setTimeout(_setTableOffset,50);
}

// ═══ EDIÇÃO DE ITEM EXECUTADO ═══
let _editItemId = null;
function _numeroEditarItem(id){
  const valor=document.getElementById(id).value.trim().replace(',','.');
  return valor===''?null:Number(valor);
}
function recalcularEditarItem(){
  const qtde=_numeroEditarItem('ei-qtde'), unit=_numeroEditarItem('ei-vl-unit');
  document.getElementById('ei-vl-total').value=qtde==null||unit==null?'':(qtde*unit).toFixed(2);
}
function abrirEditarItem(id){
  if(!podeEditar('dashboard')) return;
  const r=allRows.find(item=>String(item.id)===String(id));
  if(!r) return;
  _editItemId=r.id;
  document.getElementById('ei-planejado').innerHTML=`<strong>Item planejado:</strong> ${_sanEsc(r.item_cadastrado||'—')}<br><strong>Qtde planejada:</strong> ${_sanEsc(r.qtde_cadastrada||'—')} &nbsp;·&nbsp; <strong>Vl. unit. planejado:</strong> ${fmtFull(Number(r.vl_unitario_cadastrado)||0)} &nbsp;·&nbsp; <strong>Vl. total planejado:</strong> ${fmtFull(Number(r.vl_total_cadastrado)||0)}`;
  const valores={'ei-item':r.item,'ei-qtde':r.qtde,'ei-vl-unit':r.vl_unitario,'ei-cpl':r.cpl,'ei-status':r.status_raw,'ei-nf':r.nota_fiscal,'ei-empenho':r.empenho,'ei-patrimonio':r.patrimonio,'ei-unidade':r.unidade,'ei-unidade-entrega':r.unidade_entrega,'ei-data-entrega':r.data_entrega};
  Object.entries(valores).forEach(([campo,valor])=>document.getElementById(campo).value=valor??'');
  (function(){
    const sel=document.getElementById('ei-status-id'); if(!sel) return;
    const opts=window._catEmendaItem||[];
    sel.innerHTML='<option value="">— selecione —</option>'+opts.map(o=>`<option value="${o.id}">${_sanEsc(o.nome)}</option>`).join('');
    sel.value=r.status_id!=null?String(r.status_id):'';
  })();
  recalcularEditarItem();
  document.getElementById('msg-ei').className='fmsg';
  document.getElementById('modal-editar-item').classList.add('active');
}
function fecharEditarItem(){
  document.getElementById('modal-editar-item').classList.remove('active');
  _editItemId=null;
}
async function salvarEditarItem(){
  if(!_editItemId||!podeEditar('dashboard')) return;
  const item=document.getElementById('ei-item').value.trim();
  const qtde=_numeroEditarItem('ei-qtde'), vlUnit=_numeroEditarItem('ei-vl-unit');
  if(!item){showMsg('ei','Informe o item executado.','err');return;}
  if(qtde==null||!Number.isFinite(qtde)||qtde<0){showMsg('ei','Informe uma quantidade válida.','err');return;}
  if(vlUnit==null||!Number.isFinite(vlUnit)||vlUnit<0){showMsg('ei','Informe um valor unitário válido.','err');return;}
  const payload={
    item,qtde,vl_unitario:vlUnit,vl_total:Number((qtde*vlUnit).toFixed(2)),
    cpl:document.getElementById('ei-cpl').value.trim(),status:document.getElementById('ei-status').value.trim(),
    status_id:(function(v){return v?Number(v):null;})(document.getElementById('ei-status-id').value),
    nota_fiscal:document.getElementById('ei-nf').value.trim(),empenho:document.getElementById('ei-empenho').value.trim(),
    patrimonio:document.getElementById('ei-patrimonio').value.trim(),unidade_beneficiada:document.getElementById('ei-unidade').value.trim(),unidade_entrega:document.getElementById('ei-unidade-entrega').value.trim(),
    data_entrega:document.getElementById('ei-data-entrega').value||null
  };
  const btn=document.getElementById('ei-salvar'); btn.disabled=true; btn.textContent='Salvando...';
  const {error}=await sb.from('emenda_itens').update(payload).eq('id',_editItemId);
  if(error){showMsg('ei','Erro: '+error.message,'err');btn.disabled=false;btn.textContent='Salvar';return;}
  const unidadeResp=await sb.rpc('editar_emenda_item_unidade_cascade',{p_emenda_item_id:_editItemId,p_unidade:payload.unidade_beneficiada||null,p_unidade_entrega:payload.unidade_entrega||null});
  if(unidadeResp.error){showMsg('ei','Item salvo, mas erro ao atualizar vínculos de unidade: '+unidadeResp.error.message,'err');btn.disabled=false;btn.textContent='Salvar';return;}
  const r=allRows.find(item=>String(item.id)===String(_editItemId));
  if(r) Object.assign(r,{item:payload.item,qtde:String(payload.qtde),vl_unitario:payload.vl_unitario,vl_total:payload.vl_total,cpl:payload.cpl,status_raw:payload.status,status_id:payload.status_id,status_cat:(payload.status_id!=null&&window._catById&&window._catById[payload.status_id])?window._catById[payload.status_id]:catStatus(payload.status),nota_fiscal:payload.nota_fiscal,empenho:payload.empenho,patrimonio:payload.patrimonio,unidade:_preferUnidadeExec(payload.unidade_beneficiada,payload.unidade_entrega,payload.unidade_beneficiada),unidade_entrega:payload.unidade_entrega,data_entrega:payload.data_entrega||''});
  saldoEmendaCarregado=false;
  applyFilters();
  renderTable();
  showMsg('ei','✓ Item atualizado.','ok');
  btn.disabled=false;btn.textContent='Salvar';
  setTimeout(fecharEditarItem,700);
}

function _emendaDeleteResumo(counts){
  const c=counts||{};
  const labels=[
    ['itens','item(ns) de processo/contrato'],
    ['itens_entregas','AF(s)/entrega(s)'],
    ['itens_entregas_unidades','unidade(s) física(s) de recebimento'],
    ['atas_execucao','execução(ões) de ATA'],
    ['empenho_itens','vínculo(s) de empenho'],
    ['nota_fiscal_itens','rateio(s) de NF'],
    ['sancao_itens','item(ns) em solicitação de sanção'],
    ['inventario_desvinculado','registro(s) de inventário que serão desvinculados'],
    ['notas_fiscais_possivelmente_orfas','NF(s) que podem ser excluídas se ficarem sem vínculo'],
    ['empenhos_possivelmente_orfaos','empenho(s) que podem ser excluídos se ficarem sem vínculo'],
    ['processos_possivelmente_orfaos','processo(s) que podem ser excluídos se ficarem sem vínculo']
  ];
  const linhas=labels.map(([k,label])=>[Number(c[k])||0,label]).filter(([n])=>n>0).map(([n,label])=>`• ${n} ${label}`);
  return linhas.length?linhas.join('\n'):'• Somente a linha da emenda';
}

async function excluirEmendaItem(id){
  if(!podeEditar('dashboard')){ alert('Sem permissão para excluir itens de emendas.'); return; }
  const r=allRows.find(item=>String(item.id)===String(id));
  if(!r){ alert('Item de emenda não encontrado na tela. Recarregue a página.'); return; }
  let prev;
  try{
    const {data,error}=await sb.rpc('excluir_emenda_item_cascade',{p_emenda_item_id:id,p_dry_run:true});
    if(error) throw error;
    prev=data||{};
  }catch(e){
    alert('Não foi possível preparar a exclusão: '+(e.message||e));
    return;
  }
  if(prev.blocked){
    alert('Exclusão bloqueada.\n\nEste item já possui recebimento, entrega ou unidade física registrada. Para proteger o histórico real, ele não será apagado por este fluxo.');
    return;
  }
  const resumo=_emendaDeleteResumo(prev.counts);
  const msg=`Excluir este item da emenda?\n\n${r.emenda||'Emenda'} · ${r.item||'item'}\n\nEsta ação remove a linha e tudo que foi criado a partir dela porque o item não será executado:\n${resumo}\n\nDocumentos compartilhados com outros itens serão preservados.`;
  const ok=window.uiConfirm ? await uiConfirm(msg) : confirm(msg);
  if(!ok) return;
  try{
    const {data,error}=await sb.rpc('excluir_emenda_item_cascade',{p_emenda_item_id:id,p_dry_run:false});
    if(error) throw error;
    allRows=allRows.filter(item=>String(item.id)!==String(id));
    filtered=filtered.filter(item=>String(item.id)!==String(id));
    sancaoSelecionados.delete(String(id));
    saldoEmendaCarregado=false;
    renderTable();
    if(window.toast) toast('Item excluído e vínculos limpos.','success');
    else alert('Item excluído e vínculos limpos.');
    return data;
  }catch(e){
    alert('Erro ao excluir: '+(e.message||e));
  }
}

function sortTable(col){
  if(sortCol===col){sortAsc=!sortAsc}else{sortCol=col;sortAsc=true}
  // Atualizar ícones
  document.querySelectorAll(".sort-icon").forEach(el=>el.textContent="");
  const icon=document.getElementById("si-"+col);
  if(icon) icon.textContent=sortAsc?" ↑":" ↓";
  renderTable();
}

function renderTable(){
  let rows=[...filtered];
  if(sortCol){
    rows.sort((a,b)=>{
      let va=sortCol==="saldo_emenda"?_saldoEmendaValor(a.emenda_id):a[sortCol],vb=sortCol==="saldo_emenda"?_saldoEmendaValor(b.emenda_id):b[sortCol];
      // Numérico
      if(sortCol==="vl_total"||sortCol==="vl_unitario"||sortCol==="valor_cedido"||sortCol==="vl_unitario_cadastrado"||sortCol==="vl_total_cadastrado"||sortCol==="valor_licitacao_unit"||sortCol==="valor_licitacao"||sortCol==="saldo_emenda"||sortCol==="ano"){
        va=parseFloat(va)||0;vb=parseFloat(vb)||0;
      } else if(sortCol==="qtde"){
        va=parseFloat(va)||0;vb=parseFloat(vb)||0;
      } else {
        va=String(va||"").toLowerCase();vb=String(vb||"").toLowerCase();
      }
      if(va<vb) return sortAsc?-1:1;
      if(va>vb) return sortAsc?1:-1;
      return 0;
    });
  }
  rows=rows.slice(0,500);
  const podeVerSaldo=podeEditar('dashboard');
  const thSaldo=document.getElementById('th-saldo-emenda');
  if(thSaldo) thSaldo.style.display=podeVerSaldo?'':'none';
  document.getElementById("table-count").textContent=`${filtered.length.toLocaleString("pt-BR")} itens${filtered.length>500?" (mostrando 500)":""}`;
  document.getElementById("table-body").innerHTML=rows.map(r=>{
    const actionId=String(r._base_id||r.id);
    const podeEditarLinha=!r._unidadeFisica;
    return `<tr>
    <td style="white-space:nowrap"><button onclick="verTudoEmendaItem(decodeURIComponent('${encodeURIComponent(actionId)}'))" title="Ver tudo sobre este item" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 9px;cursor:pointer;white-space:nowrap">🔎 Ver tudo</button>${_isAdmin()&&podeEditarLinha?`<button onclick="abrirEditarItem(decodeURIComponent('${encodeURIComponent(actionId)}'))" style="background:var(--surface);color:var(--text2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 9px;cursor:pointer;white-space:nowrap;margin-left:4px">✏️ Editar</button>`:''}${podeEditar('dashboard')&&podeEditarLinha?`<button onclick="excluirEmendaItem(decodeURIComponent('${encodeURIComponent(actionId)}'))" title="Excluir item não executado e limpar vínculos" style="background:var(--surface);color:var(--red);border:1px solid var(--red-bg);border-radius:var(--radius-sm);padding:4px 9px;cursor:pointer;white-space:nowrap;margin-left:4px">🗑️ Excluir</button>`:''}</td>
    <td>${tipoBadge(r.tipo)}</td>
    <td style="font-size:11px;color:var(--text3)">${r.emenda||"—"}</td>
    <td style="white-space:nowrap;font-size:12px">${r.parlamentar||"—"}</td>
    <td style="white-space:nowrap;font-size:12px">${r.unidade||"—"}</td>
    <td class="td-trunc" title="${r.item}">${r.item||"—"}</td>
    <td style="text-align:right">${r.qtde||"—"}</td>
    <td style="text-align:right;white-space:nowrap">${r.vl_unitario_cadastrado?fmtFull(r.vl_unitario_cadastrado):"—"}</td>
    <td style="text-align:right;white-space:nowrap">${r.vl_total_cadastrado?fmtFull(r.vl_total_cadastrado):"—"}</td>
    <td style="text-align:right;white-space:nowrap">${r.vl_unitario?fmtFull(r.vl_unitario):"—"}</td>
    <td style="text-align:right;white-space:nowrap">${r.vl_total?fmtFull(r.vl_total):"—"}</td>
    <td style="font-size:11px;color:var(--text3);white-space:nowrap">${r.cpl||"—"}${r.contrato_sim?('<br><span style="color:var(--text3)">SIM '+_sanEsc(r.contrato_sim)+'</span>'):''}</td>
    <td>${statusBadge(r.status_cat)}</td>
    <td style="font-size:11px;max-width:240px;white-space:pre-wrap;word-break:break-word">${r.status_raw||"—"}</td>
    <td style="font-size:11px;white-space:nowrap;color:var(--text3)">${r.data_atualizacao||"—"}</td>
    <td style="font-size:11px">${r.nota_fiscal||"—"}</td>
    <td style="font-size:11px">${r.empenho||"—"}</td>
    <td style="font-size:11px">${r.patrimonio||"—"}</td>
    <td style="font-size:11px;white-space:nowrap">${r.unidade_entrega||"—"}</td>
    <td style="font-size:11px;white-space:nowrap">${r.data_entrega||"—"}</td>
    ${podeVerSaldo?`<td>${getSaldoEmenda(r.emenda_id)}</td>`:''}
  </tr>`;}).join("");
  document.querySelectorAll("#table-body tr").forEach((tr,idx)=>{
    const r=rows[idx];
    const licCell=(value)=>{const td=document.createElement('td');td.style.cssText='text-align:right;white-space:nowrap';td.textContent=Number(value)>0?fmtFull(value):'-';return td;};
    const ref=tr.cells[9];
    tr.insertBefore(licCell(r?.valor_licitacao_unit),ref);
    tr.insertBefore(licCell(r?.valor_licitacao),ref);
    const td=document.createElement("td");
    td.style.fontSize="11px";
    td.style.color="var(--text3)";
    td.style.whiteSpace="nowrap";
    td.textContent=rows[idx]?.ano||"—";
    tr.insertBefore(td,tr.children[3]||null);
  });
}

// ═══ SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO — ITENS DE EMENDAS ═══
let sancaoSelecionados = new Set();
let sancaoCplTravado = "";
let sancaoContrato = null;

function _sanEsc(v){
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function _sancaoItemElegivel(r){
  const s=normalizar(r?.status_raw||"");
  return !!r?.cpl && (s.includes("atras")||s.includes("penden")||s.includes("aguardando entrega"));
}
function _sancaoCheckboxDisabled(r){
  if(!podeEditar('dashboard')||!_sancaoItemElegivel(r)) return true;
  return !!sancaoCplTravado && r.cpl!==sancaoCplTravado && !sancaoSelecionados.has(String(r.id));
}
function _sancaoCheckboxTitulo(r){
  if(!podeEditar('dashboard')) return "Sem permissão para gerar solicitações";
  if(!r?.cpl) return "Item sem CPL vinculado";
  if(!_sancaoItemElegivel(r)) return "Disponível apenas para itens pendentes, atrasados ou aguardando entrega";
  if(sancaoCplTravado&&r.cpl!==sancaoCplTravado) return `Seleção limitada ao CPL ${sancaoCplTravado}`;
  return "Selecionar item para a solicitação de sanção";
}
function _itensSancaoSelecionados(){
  return allRows.filter(r=>sancaoSelecionados.has(String(r.id)));
}
async function _resolverContratoSancao(cpl,contratoId=null){
  if(!cpl&&!contratoId) return null;
  let query=sb.from("contratos").select("id,cpl,objeto,prestador,cnpj,numero_contrato,fornecedor_id").limit(1);
  query=contratoId?query.eq("id",contratoId):query.eq("cpl",cpl);
  const {data,error}=await query;
  if(error){ console.error("Contrato da sanção:",error.message); return null; }
  return data?.[0]||null;
}
async function alternarItemSancao(id,cb){
  const r=allRows.find(x=>String(x.id)===String(id));
  if(!r) return;
  if(cb.checked){
    if(_sancaoCheckboxDisabled(r)){ cb.checked=false; alert(_sancaoCheckboxTitulo(r)); return; }
    if(!sancaoCplTravado) sancaoCplTravado=r.cpl;
    sancaoSelecionados.add(String(r.id));
    if(!sancaoContrato||sancaoContrato.cpl!==sancaoCplTravado){
      const cplBuscado=sancaoCplTravado;
      sancaoContrato=await _resolverContratoSancao(cplBuscado);
      if(sancaoCplTravado!==cplBuscado) sancaoContrato=null;
    }
  }else{
    sancaoSelecionados.delete(String(r.id));
    if(!sancaoSelecionados.size){ sancaoCplTravado=""; sancaoContrato=null; }
  }
  atualizarSelecaoSancao();
  renderTable();
}
function atualizarSelecaoSancao(){
  const n=sancaoSelecionados.size;
  const resumo=document.getElementById("sancao-selecao-resumo");
  const btn=document.getElementById("btn-gerar-sancao");
  if(!resumo||!btn) return;
  if(!n){ resumo.style.display="none"; btn.style.display="none"; resumo.textContent=""; return; }
  const empresa=sancaoContrato?.prestador||"empresa não localizada";
  resumo.textContent=`${n} item(ns) · ${sancaoCplTravado} · ${empresa}`;
  resumo.style.display="inline";
  btn.style.display=podeEditar('dashboard')?"inline-flex":"none";
}
function _parseDataSancao(raw){
  if(!raw) return null;
  const s=String(raw).trim(); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(+m[3],+m[2]-1,+m[1]);
  return null;
}
function _diasAtrasoAutomatico(itens){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const dias=itens.map(i=>_parseDataSancao(i.data_entrega)).filter(Boolean)
    .map(d=>Math.max(0,Math.floor((hoje-d)/86400000)));
  return dias.length?Math.max(...dias):null;
}
async function abrirModalSolicitacaoSancao(){
  if(!sancaoSelecionados.size||bloquearSeVisualiz('dashboard')) return;
  _sancaoAquisicaoRow=null; _ceAdvAtivo=false;
  if(!sancaoContrato) sancaoContrato=await _resolverContratoSancao(sancaoCplTravado);
  const itens=_itensSancaoSelecionados();
  const c=sancaoContrato||{};
  document.getElementById("sancao-contrato-info").innerHTML=`
    <strong>Processo/CPL:</strong> ${_sanEsc(sancaoCplTravado||"—")} &nbsp;·&nbsp; <strong>Contrato:</strong> ${_sanEsc(c.numero_contrato||"—")}<br>
    <strong>Empresa:</strong> ${_sanEsc(c.prestador||"Não localizada no cadastro de contratos")} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||"—")}<br>
    <strong>Objeto:</strong> ${_sanEsc(c.objeto||"—")}`;
  document.querySelectorAll('input[name="sancao-tipo"]').forEach(el=>el.checked=false);
  document.querySelector('input[name="sancao-motivo"][value="Atraso na entrega"]').checked=true;
  ["sancao-motivo-livre","sancao-clausula","sancao-artigo","sancao-percentual"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("sancao-dias").value=_diasAtrasoAutomatico(itens)??"";
  document.getElementById("sancao-itens-modal").innerHTML=itens.map(i=>`<div style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px"><strong>${_sanEsc(i.item||i.item_cadastrado||"Item")}</strong><br><span style="color:var(--text3)">Qtde: ${_sanEsc(i.qtde||i.qtde_cadastrada||"—")} · Unitário: ${i.vl_unitario?fmtFull(i.vl_unitario):"—"} · Total: ${i.vl_total?fmtFull(i.vl_total):"—"} · Empenho: ${_sanEsc(i.empenho||"—")}</span></div>`).join("");
  document.getElementById("sancao-doc-msg").className="fmsg";
  document.getElementById("sancao-doc-msg").textContent="";
  atualizarCamposSancao();
  document.getElementById("modal-solicitar-sancao").classList.add("active");
}
function atualizarCamposSancao(){
  const tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||"";
  const motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||"";
  document.getElementById("sancao-percentual-wrap").style.display=tipo==="Multa"?"block":"none";
  document.getElementById("sancao-motivo-livre").style.display=motivo==="Outro motivo"?"block":"none";
}
async function gerarSolicitacaoSancao(){
  if(bloquearSeVisualiz('dashboard')) return;
  const itens=_itensSancaoSelecionados();
  const tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||"";
  const motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||"";
  const motivoLivre=document.getElementById("sancao-motivo-livre").value.trim();
  const clausula=document.getElementById("sancao-clausula").value.trim();
  const artigo=document.getElementById("sancao-artigo").value.trim();
  const percentualRaw=document.getElementById("sancao-percentual").value;
  const diasRaw=document.getElementById("sancao-dias").value;
  const c=sancaoContrato;
  const msg=document.getElementById("sancao-doc-msg");
  if(!itens.length){msg.textContent="Selecione ao menos um item.";msg.className="fmsg err";return;}
  if(!tipo||!motivo){msg.textContent="Escolha o tipo e o motivo da sanção.";msg.className="fmsg err";return;}
  if(motivo==="Outro motivo"&&!motivoLivre){msg.textContent="Descreva o outro motivo.";msg.className="fmsg err";return;}
  if(!c?.prestador){msg.textContent="Empresa não localizada. Confira se o CPL está cadastrado em Contratos.";msg.className="fmsg err";return;}
  const janela=window.open("","_blank");
  if(!janela){msg.textContent="O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.";msg.className="fmsg err";return;}
  janela.document.write('<!doctype html><meta charset="utf-8"><title>Gerando documento...</title><p style="font-family:Arial;padding:24px">Registrando solicitação...</p>');
  const btn=document.getElementById("btn-confirmar-sancao"); btn.disabled=true; btn.textContent="Registrando...";
  const snapshot={artigo_adicional:artigo||null,itens:itens.map(i=>({id:i.id,item:i.item||i.item_cadastrado,qtde:i.qtde||i.qtde_cadastrada,vl_unitario:i.vl_unitario,vl_total:i.vl_total,cpl:i.cpl,status:i.status_raw,empenho:i.empenho,data_entrega:i.data_entrega}))};
  const registro={
    cpl_contrato:sancaoCplTravado, contrato_id:c.id, empresa:c.prestador, tipo_sancao:tipo,
    motivo, motivo_livre:motivo==="Outro motivo"?motivoLivre:null,
    clausula_contratual:clausula||null,
    percentual_multa:tipo==="Multa"&&percentualRaw!==""?Number(percentualRaw):null,
    dias_atraso:diasRaw!==""?Number(diasRaw):null,
    itens_ids:JSON.stringify(itens.map(i=>i.id)), itens_json:JSON.stringify(snapshot),
    solicitado_por:currentProfile?.nome||currentProfile?.email||"Usuário do sistema",
    gerado_em:new Date().toISOString().slice(0,10)
  };
  const {data:_san,error}=await sb.from("sancoes_solicitadas").insert(registro).select().single();
  btn.disabled=false; btn.textContent="Gerar documento";
  if(error){janela.close();msg.textContent="Erro ao registrar: "+error.message;msg.className="fmsg err";return;}
  if(_san) await sb.from("sancao_itens").insert(snapshot.itens.map(it=>({sancao_id:_san.id,emenda_item_id:it.id,ref_origem:it.id,descricao:it.item,cpl:it.cpl,qtde:it.qtde,vl_unitario:it.vl_unitario,vl_total:it.vl_total,empenho:it.empenho,dt_entrega:it.data_entrega})));
  const incisos={"Advertência":"I","Multa":"II","Impedimento de licitar e contratar":"III","Declaração de inidoneidade":"IV"};
  const total=itens.reduce((s,i)=>s+(Number(i.vl_total)||0),0);
  const hoje=new Date().toLocaleDateString("pt-BR");
  const fundamento=motivo==="Atraso na entrega"
    ? "ao ensejar o retardamento da entrega do objeto contratual sem motivo justificado"
    : _sanEsc(motivoLivre);
  const linhas=itens.map((i,idx)=>`<tr><td>${idx+1}</td><td><strong>${_sanEsc(i.cpl)}</strong><br>${_sanEsc(c.prestador)}</td><td>${_sanEsc(i.item||i.item_cadastrado||"—")}</td><td>${_sanEsc(i.qtde||i.qtde_cadastrada||"—")}</td><td>${i.vl_unitario?fmtFull(i.vl_unitario):"—"}</td><td>${i.vl_total?fmtFull(i.vl_total):"—"}</td><td>${_sanEsc(i.empenho||"—")}</td><td>${_sanEsc(i.status_raw||"—")}</td><td>${registro.dias_atraso??"—"}</td></tr>`).join("");
  janela.document.open();
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Sanção - ${_sanEsc(sancaoCplTravado)}</title><link rel="stylesheet" href="css/print-sancao.css"></head><body>
    <header><strong>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO ADMINISTRATIVA</h1><p>Gerado em ${hoje}</p></header>
    <div class="ident"><div>Processo/CPL: <strong>${_sanEsc(sancaoCplTravado)}</strong></div><div>Contrato nº: <strong>${_sanEsc(c.numero_contrato||"—")}</strong></div><div>Empresa contratada: <strong>${_sanEsc(c.prestador)}</strong></div><div>CNPJ: ${_sanEsc(c.cnpj||"—")}</div><div>Objeto: ${_sanEsc(c.objeto||"—")}</div></div>
    <h2>Fundamentação legal</h2><p class="corpo">A contratada incorreu na infração prevista no art. 155, inciso VII, da Lei nº 14.133/2021, ${fundamento}, sujeitando-se às sanções previstas no art. 156, inciso ${incisos[tipo]} da mesma Lei. ${clausula?`Ademais, a conduta viola a ${_sanEsc(clausula)} do instrumento contratual.`:""} ${artigo?_sanEsc(artigo)+".":""}</p>
    <h2>Itens relacionados</h2><table><thead><tr><th>#</th><th>Processo / Empresa</th><th>Item</th><th>Qtde</th><th>Valor unit.</th><th>Valor total</th><th>Empenho</th><th>Status</th><th>Dias atraso</th></tr></thead><tbody>${linhas}</tbody></table><div class="total">TOTAL: ${fmtFull(total)}</div>
    <h2>Solicitação</h2><p class="corpo">Diante do exposto, esta Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde solicita à Secretaria de Administração a instauração de processo administrativo sancionador e aplicação de <strong>${_sanEsc(tipo.toUpperCase())}</strong> à empresa <strong>${_sanEsc(c.prestador)}</strong>, inscrita no CNPJ ${_sanEsc(c.cnpj||"—")}, referente ao(s) item(ns) discriminado(s) acima, garantidos o contraditório e a ampla defesa, nos termos do art. 157 da Lei nº 14.133/2021.</p>
    ${tipo==="Multa"&&percentualRaw!==""?`<p class="corpo">A multa sugerida é de <strong>${_sanEsc(percentualRaw)}% ao dia de atraso</strong> sobre o valor do(s) item(ns) em atraso, conforme previsto no instrumento contratual.</p>`:""}
    <div class="assinatura"><strong>${_sanEsc(registro.solicitado_por)}</strong><br>Secretaria da Saúde - Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);
  janela.document.close();
  document.getElementById("modal-solicitar-sancao").classList.remove("active");
  sancaoSelecionados.clear(); sancaoCplTravado=""; sancaoContrato=null; atualizarSelecaoSancao(); renderTable();
}

// ═══ CONSULTA RÁPIDA ═══
function setSearchType(type,btn){
  searchType=type;
  document.querySelectorAll(".search-type-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
}

async function exportarConsulta(){
  if(!lastSearchResults.length){alert("Nenhum resultado para exportar.");return}
  await ensureLib('xlsx');
  const colunas=["TIPO","EMENDA","PARLAMENTAR","UNIDADE BENEFICIADA","ITEM","QTDE","VALOR TOTAL","CPL / PROCESSO","STATUS","NOTA FISCAL","Nº EMPENHO","Nº PATRIMÔNIO","UNIDADE ENTREGA","DATA ENTREGA","ORDEM PAGAMENTO"];
  const dados=lastSearchResults.map(r=>[r.tipo,r.emenda,r.parlamentar,r.unidade,r.item,r.qtde,r.vl_total,r.cpl,r.status_raw,r.nota_fiscal,r.empenho,r.patrimonio,r.unidade_entrega,r.data_entrega,r.ordem_pagamento]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  ws['!cols']=colunas.map((_,i)=>({wch:Math.max(12,...dados.map(row=>String(row[i]||"").length))+2}));
  const wb={SheetNames:["Consulta"],Sheets:{Consulta:ws}};
  const data=new Date().toLocaleDateString("pt-BR").replace(/\//g,"-");
  XLSX.writeFile(wb,"consulta_rapida_"+data+".xlsx");
}

function doSearch(){
  const q=document.getElementById("q-busca").value.trim().toLowerCase();
  if(!q){document.getElementById("q-results").innerHTML='<div style="color:var(--text3);font-size:13px">Digite algo para buscar.</div>';return}
  const results=allRows.filter(r=>{
    if(searchType==="patrimonio") return matchBusca(r.patrimonio,q);
    if(searchType==="empenho") return matchBusca(r.empenho,q);
    if(searchType==="nota_fiscal") return matchBusca(r.nota_fiscal,q);
    if(searchType==="item") return matchBusca(r.item,q);
    if(searchType==="emenda") return matchBusca(r.emenda,q);
    if(searchType==="unidade") return matchBusca(r.unidade+' '+r.unidade_entrega,q);
    // todos os campos
    return matchBusca([r.patrimonio,r.empenho,r.nota_fiscal,r.item,r.emenda,r.unidade,r.cpl,r.parlamentar,r.status_raw,r.unidade_entrega].join(' '),q);
  });
  lastSearchResults = results;
  document.getElementById("btn-export-consulta").style.display=results.length?"inline-block":"none";
  if(!results.length){
    document.getElementById("q-results").innerHTML='<div style="color:var(--text3);font-size:13px;padding:1rem 0">Nenhum resultado encontrado.</div>';
    return;
  }
  document.getElementById("q-results").innerHTML=results.slice(0,20).map((r,i)=>`
    <div class="ficha" style="display:block;margin-bottom:1rem">
      <div class="ficha-title">${i+1}. ${r.item||"(sem item)"} ${statusBadge(r.status_cat)}</div>
      <div class="ficha-grid">
        ${ficha("Emenda",r.emenda)}${ficha("Tipo",r.tipo)}${ficha("Parlamentar",r.parlamentar)}
        ${ficha("Unidade beneficiada",r.unidade)}${ficha("CPL / Processo",r.cpl)}
        ${ficha("Quantidade",r.qtde)}${ficha("Vl. unit. exec.",r.vl_unitario?fmtFull(r.vl_unitario):"")}${ficha("Vl. total exec.",r.vl_total?fmtFull(r.vl_total):"")}
        ${ficha("Nota fiscal",r.nota_fiscal)}${ficha("Nº empenho",r.empenho)}
        ${ficha("Nº patrimônio",r.patrimonio)}${ficha("Unidade de entrega",r.unidade_entrega)}
        ${ficha("Data de entrega",r.data_entrega)}${ficha("Ordem de pagamento",r.ordem_pagamento)}
        ${ficha("Status",r.status_raw)}
      </div>
    </div>`).join("")+(results.length>20?`<div style="font-size:12px;color:var(--text3);padding:.5rem 0">${results.length} resultados — mostrando os 20 primeiros.</div>`:"");
}

function ficha(label,value){
  const v=value||"";
  const cls=v?"ficha-field-value":"ficha-field-value empty";
  return'<div class="ficha-field"><div class="ficha-field-label">'+label+'</div><div class="'+cls+'">'+(v||"—")+'</div></div>';
}

// ═══ SELECTS EDIÇÃO ═══
function popularSelectsEdicao(){
  const emendas=[...new Set(allRows.map(r=>r.emenda).filter(Boolean))].sort();
  const cpls=[...new Set(allRows.map(r=>r.cpl).filter(Boolean))].sort();
  const tipos=[...new Set(allRows.map(r=>r.tipo).filter(Boolean))].sort();
  // ni-emenda — usa cachedEmendas para incluir emendas sem itens
  const todasEmendas=cachedEmendas.length
    ? [...new Set(cachedEmendas.map(e=>String(e.emenda)).filter(Boolean))].sort()
    : emendas;
  const ni=document.getElementById("ni-emenda");
  if(ni){const s=[...ni.selectedOptions].map(o=>o.value);ni.innerHTML=todasEmendas.map(e=>`<option value="${e}"${s.includes(e)?" selected":""}>${e}</option>`).join("");enhanceMultiSelect(ni,{placeholder:'Pesquisar emenda...'});}
  // as-cpl
  const asc=document.getElementById("as-cpl");
  if(asc){const c=asc.value;asc.innerHTML='<option value="">Todos os CPLs</option>'+cpls.map(x=>`<option value="${x}"${x===c?" selected":""}>${x}</option>`).join("")}
  // as-emenda (multiple)
  const ase=document.getElementById("as-emenda");
  if(ase){const s=[...ase.selectedOptions].map(o=>o.value);ase.innerHTML=emendas.map(e=>`<option value="${e}"${s.includes(e)?" selected":""}>${e}</option>`).join("")}
  // as-tipo (multiple)
  const ast=document.getElementById("as-tipo");
  if(ast){const s=[...ast.selectedOptions].map(o=>o.value);ast.innerHTML=tipos.map(t=>`<option value="${t}"${s.includes(t)?" selected":""}>${t}</option>`).join("")}
}

function toggleSemCpl(){semCplFilter=!semCplFilter;applyFilters();}
function clearFAs(id){const el=document.getElementById(id);if(el)el.value="";popularItens()}
function clearFAsMulti(id){const el=document.getElementById(id);if(el)[...el.options].forEach(o=>o.selected=false);popularItens()}

// ═══ FILTROS DO MODAL (estilo Google Sheets) ═══
let modalFilters={cpl:[],emenda:[],tipo:[]};
const MF_COLS={
  cpl:{label:'CPL / Processo', allLabel:'Todos os CPLs', get:r=>r.cpl, disp:v=>v||'(sem CPL)'},
  emenda:{label:'Emenda', allLabel:'Todas as emendas', get:r=>r.emenda, disp:v=>v||'(vazio)'},
  tipo:{label:'Tipo', allLabel:'Todos os tipos', get:r=>r.tipo, disp:v=>v||'(vazio)'},
};
let _mfCol=null,_mfPending=[];

function _mfUnique(col){
  const cfg=MF_COLS[col];
  const vals=[...new Set(allRows.map(cfg.get).map(v=>v==null?'':String(v)))];
  return vals.sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}
function _ensureMfDropdown(){
  let dd=document.getElementById('modal-filter-dropdown');
  if(dd) return dd;
  dd=document.createElement('div');
  dd.id='modal-filter-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:10001;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.25);min-width:240px;padding:.625rem';
  dd.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_mfSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_mfSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="mf-search" placeholder="🔍 Buscar..." oninput="_mfRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_mfSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="mf-count">0</span></a> — <a href="#" onclick="_mfSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="mf-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeModalFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmModalFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd);
  return dd;
}
function openModalFilter(e,col){
  e.stopPropagation();
  const dd=_ensureMfDropdown();
  if(_mfCol===col && dd.style.display==='block'){ dd.style.display='none'; _mfCol=null; return; }
  _mfCol=col;
  const all=_mfUnique(col);
  const cur=modalFilters[col]||[];
  _mfPending=[...cur];
  document.getElementById('mf-search').value='';
  _mfRenderList();
  const rect=e.currentTarget.getBoundingClientRect();
  dd.style.display='block';
  const ddW=dd.offsetWidth||240;
  let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px';
  dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('mf-search').focus(),50);
}
function _mfRenderList(){
  const col=_mfCol; if(!col) return;
  const q=normalizar(document.getElementById('mf-search').value);
  const all=_mfUnique(col); const disp=MF_COLS[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('mf-count').textContent=all.length;
  document.getElementById('mf-list').innerHTML=vis.map(v=>{
    const checked=_mfPending.includes(v)?'checked':'';
    const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px"><input type="checkbox" value="${safe}" ${checked} onchange="_mfToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _mfToggle(cb){
  if(cb.checked){ if(!_mfPending.includes(cb.value)) _mfPending.push(cb.value); }
  else { _mfPending=_mfPending.filter(x=>x!==cb.value); }
}
function _mfSelectAll(all){ const col=_mfCol; if(!col) return; _mfPending=all?_mfUnique(col):[]; _mfRenderList(); }
function _mfSort(asc){
  const col=_mfCol; if(!col) return;
  const list=document.getElementById('mf-list');
  const labels=[...list.querySelectorAll('label')];
  labels.sort((a,b)=>asc?a.textContent.localeCompare(b.textContent,'pt-BR',{numeric:true}):b.textContent.localeCompare(a.textContent,'pt-BR',{numeric:true}));
  labels.forEach(l=>list.appendChild(l));
}
function confirmModalFilter(){
  const col=_mfCol; if(!col) return;
  const all=_mfUnique(col);
  modalFilters[col]=(_mfPending.length===0||_mfPending.length===all.length)?[]:[..._mfPending];
  document.getElementById('modal-filter-dropdown').style.display='none';
  _mfCol=null;
  _mfUpdateBtn(col);
  popularItens();
}
function closeModalFilter(){ const dd=document.getElementById('modal-filter-dropdown'); if(dd) dd.style.display='none'; _mfCol=null; }
function _mfUpdateBtn(col){
  const btn=document.getElementById('mf-btn-'+col); if(!btn) return;
  const sel=modalFilters[col]||[];
  btn.classList.toggle('active',sel.length>0);
  const txt=sel.length===0?MF_COLS[col].allLabel:(sel.length+' selecionado'+(sel.length>1?'s':''));
  btn.innerHTML=txt+' <span style="float:right">▾</span>';
}
function resetModalFilters(){
  modalFilters={cpl:[],emenda:[],tipo:[]};
  ['cpl','emenda','tipo'].forEach(_mfUpdateBtn);
}
document.addEventListener('click',function(e){
  const dd=document.getElementById('modal-filter-dropdown');
  if(dd && dd.style.display==='block'){
    if(!dd.contains(e.target) && !(e.target.closest && e.target.closest('.modal-filter-btn'))){ dd.style.display='none'; _mfCol=null; }
  }
});

function popularItens(){
  const fCpl=modalFilters.cpl, fEm=modalFilters.emenda, fTipo=modalFilters.tipo;
  const busca=document.getElementById("as-busca-item").value.toLowerCase();
  let itens=allRows.filter(r=>{
    if(fCpl.length&&!fCpl.includes(r.cpl)) return false;
    if(fEm.length&&!fEm.includes(r.emenda)) return false;
    if(fTipo.length&&!fTipo.includes(r.tipo)) return false;
    if(busca&&!matchBusca((r.item||"")+' '+(r.item_cadastrado||"")+' '+r.status_raw+' '+r.unidade+' '+r.cpl,busca)) return false;
    return true;
  });
  document.getElementById("as-count").textContent=`${itens.length} item(ns)`;
  if(!itens.length){document.getElementById("as-itens-lista").innerHTML='<div style="font-size:12px;color:var(--text3);padding:.875rem">Nenhum item encontrado.</div>';return}
  document.getElementById("as-itens-lista").innerHTML=itens.map((r,i)=>{
    const nome=(r.item||r.item_cadastrado||"—");
    const esc=v=>String(v||"").replace(/"/g,'&quot;');
    return `
    <div class="check-item-row">
      <input type="checkbox" id="ci-${i}" data-id="${r.id}" checked>
      <div class="item-info">
        <div class="item-name">${nome}</div>
        <div class="item-meta">${r.emenda} · ${r.unidade||"—"} · ${statusBadge(r.status_cat)}</div>
        <div class="item-fields">
          <div class="item-field"><div class="item-field-label">CPL / Processo</div><select id="cpl-${i}" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);width:100%"><option value="">— Nenhum —</option>${cachedProcessos.map(p=>`<option value="${_sanEsc(p.identificador)}"${r.cpl===p.identificador?' selected':''}>${_sanEsc(p.identificador)}</option>`).join('')}</select></div>
          <div class="item-field"><div class="item-field-label">Nota fiscal</div><input type="text" id="nf-${i}" placeholder="ex: NF 84253" value="${esc(r.nota_fiscal)}"></div>
          <div class="item-field"><div class="item-field-label">Nº empenho</div><input type="text" id="emp-${i}" placeholder="ex: 23230/2025" value="${esc(r.empenho)}"></div>
          <div class="item-field"><div class="item-field-label">Nº patrimônio</div><input type="text" id="pat-${i}" placeholder="ex: 12345" value="${esc(r.patrimonio)}"></div>
        </div>
      </div>
    </div>`;}).join("");
}

function selectAll(v){document.querySelectorAll('#as-itens-lista input[type=checkbox]').forEach(c=>c.checked=v)}

// ═══ NOVO ITEM ═══
// Unidades cadastradas para uma emenda (uma linha de emenda por unidade). Fallback: todas as unidades.
function _unidadesDaEmenda(em){
  const us=[...new Set(cachedEmendas.filter(e=>String(e.emenda)===String(em)).map(e=>e.unidade).filter(Boolean))];
  return us.length?us:cachedUnidades.map(u=>u.nome);
}
function autoPreencherEmenda(){
  const selecionadas=[...document.getElementById("ni-emenda").selectedOptions].map(o=>o.value);
  const div=document.getElementById("ni-emendas-detalhe");
  if(!selecionadas.length){
    div.innerHTML='<div style="font-size:12px;color:var(--text3)">Selecione as emendas acima para escolher a(s) unidade(s) e quantidade de cada uma.</div>';
    return;
  }
  // Preservar marcações/quantidades já digitadas por (emenda|unidade)
  const prevMap={};
  div.querySelectorAll(".ni-u-row").forEach(r=>{ prevMap[r.dataset.key]={chk:r.querySelector(".ni-u-chk")?.checked,qtde:r.querySelector(".ni-u-qtde")?.value||""}; });
  const inp='font-size:13px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)';
  div.innerHTML=selecionadas.map(em=>{
    const r=allRows.find(x=>x.emenda===em);
    const ce=cachedEmendas.find(x=>String(x.emenda)===em);
    const parl=r?r.parlamentar:(ce?ce.parlamentar||"":"");
    const tipo=r?r.tipo:(ce?ce.tipo||"":"");
    const unidades=_unidadesDaEmenda(em);
    const linhasU=unidades.map(u=>{
      const key=em+"|"+u; const p=prevMap[key]||{};
      return `<div class="ni-u-row" data-key="${_sanEsc(key)}" data-unidade="${_sanEsc(u)}" style="display:grid;grid-template-columns:auto 1fr 90px 120px;gap:10px;align-items:center;padding:3px 0">
        <input type="checkbox" class="ni-u-chk" ${p.chk?'checked':''} onchange="recalcTotais()">
        <span style="font-size:13px">${_sanEsc(u)}</span>
        <input type="number" class="ni-u-qtde" placeholder="qtde" value="${p.qtde||''}" ${p.chk?'':'disabled'} oninput="recalcTotais()" style="width:80px;${inp}">
        <span class="ni-u-total" style="font-size:13px;font-weight:500;color:var(--text2)">—</span>
      </div>`;
    }).join("");
    return `<div data-emenda="${_sanEsc(em)}" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem 1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <div><span style="font-size:13px;font-weight:600">Emenda ${_sanEsc(em)}</span> <span style="font-size:11px;color:var(--text3)">${_sanEsc(parl||'')}</span></div>
        <span style="font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500;background:${tipo==='FEDERAL'?'#E6F1FB':tipo==='ESTADUAL'?'#E1F5EE':'#EEEDFE'};color:${tipo==='FEDERAL'?'#0C447C':tipo==='ESTADUAL'?'#085041':'#26215C'}">${tipo||'—'}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Marque a(s) unidade(s) que receberão este item (limitadas às unidades da emenda) — uma linha por unidade:</div>
      ${linhasU}
    </div>`;
  }).join("");
  recalcTotais();
}

function recalcTotais(){
  const vlU=parseFloat(document.getElementById("ni-vl-unit").value)||0;
  document.querySelectorAll("#ni-emendas-detalhe .ni-u-row").forEach(row=>{
    const chk=row.querySelector(".ni-u-chk")?.checked;
    const qInp=row.querySelector(".ni-u-qtde"); if(qInp) qInp.disabled=!chk;
    const qtde=parseFloat(qInp?.value)||0;
    const total=row.querySelector(".ni-u-total");
    if(total) total.textContent=(chk&&vlU&&qtde)?("R$ "+(vlU*qtde).toLocaleString("pt-BR",{minimumFractionDigits:2})):"—";
  });
}
function calcTotal(){
  const q=parseFloat(document.getElementById("ni-qtde").value)||0;
  const u=parseFloat(document.getElementById("ni-vl-unit").value)||0;
  if(q&&u) document.getElementById("ni-vl-total").value=(q*u).toFixed(2);
}

function showMsg(p,txt,tipo){const el=document.getElementById(p+"-msg");if(!el)return;el.textContent=txt;el.className="fmsg "+tipo;if(tipo==="ok")setTimeout(()=>el.className="fmsg",6000)}
function limparForm(p){document.querySelectorAll(`[id^="${p}-"]`).forEach(el=>{if(el.tagName==="SELECT")el.selectedIndex=0;else el.value=""});showMsg(p,"","ok")}
function limparStatus(){
  ["as-status","as-busca-item"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  resetModalFilters();
  popularItens();
  showMsg("as","","ok");
}

async function preencherSelectParlamentares(){
  const sel=document.getElementById("ne-parlamentar-sel"); if(!sel) return;
  const {data}=await sb.from('parlamentares').select('nome').eq('ativo',true).order('nome');
  sel.innerHTML='<option value="">Selecione...</option>'
    + (data||[]).map(p=>`<option value="${_sanEsc(p.nome)}">${_sanEsc(p.nome)}</option>`).join('');
}
async function obterOuCriarParlamentar(nome){
  if(!nome) return;
  await sb.from('parlamentares').upsert({nome},{onConflict:'nome',ignoreDuplicates:true});
}

async function preencherSelectUnidades(selId, comNovo){
  const sel=document.getElementById(selId); if(!sel) return;
  const data=await _getUnidadesAtivasCache();
  const placeholder=sel.multiple?'':'<option value="">Selecione...</option>';
  sel.innerHTML=placeholder
    + (data||[]).map(u=>`<option value="${u.id}">${_sanEsc(u.nome)}</option>`).join('')
    + (comNovo?'<option value="__nova__">➕ Cadastrar nova unidade</option>':'');
}
// Dica de rateio do valor cedido quando há várias unidades na nova emenda
function _neRateioHint(){
  const sel=document.getElementById('ne-unidade-sel'); const hint=document.getElementById('ne-unidade-rateio');
  if(!sel||!hint) return;
  const n=[...sel.selectedOptions].length;
  const valor=parseFloat(document.getElementById('ne-valor')?.value)||0;
  if(n>1){
    hint.style.display='';
    hint.textContent=valor?`Será criada 1 emenda por unidade (${n}). Valor cedido dividido igualmente: ${fmtFull(valor/n)} por unidade.`:`Será criada 1 emenda por unidade (${n}). O valor cedido será dividido igualmente entre elas.`;
  }else{ hint.style.display='none'; hint.textContent=''; }
}
async function obterOuCriarUnidade(nome){
  if(!nome) return null;
  const {data:ex}=await sb.from('unidades').select('id').ilike('nome',nome).limit(1);
  if(ex&&ex.length) return ex[0].id;
  const {data:novo,error}=await sb.from('unidades').insert({nome}).select('id').single();
  if(error) throw error;
  _neUnidadesCache=null; _getUnidadesAtivasCache(true); // nova unidade: invalida caches em memória
  return novo.id;
}

// ═══ NOVA EMENDA COM ITENS INLINE ═══
// O modal cria UMA emenda (valor_cedido = valor global) e seus emenda_itens inline.
// Cada item tem valor unitário e uma ou mais unidades com quantidade; o valor por
// unidade = unitário × qtde (não há divisão igual do valor global).
let _neUnidadesCache=null;
async function _neEnsureUnidades(){
  if(_neUnidadesCache) return _neUnidadesCache;
  _neUnidadesCache=await _getUnidadesAtivasCache();
  return _neUnidadesCache;
}
function _neUnidadeOptions(){
  return '<option value="">Unidade...</option>'+(_neUnidadesCache||[]).map(u=>`<option value="${u.id}">${_sanEsc(u.nome)}</option>`).join('');
}
function _neStatusOptions(){
  return '<option value="">Status inicial...</option>'+(_statusLicCache||[]).map(n=>`<option value="${_sanEsc(n)}">${_sanEsc(n)}</option>`).join('');
}
async function neInitItens(){
  const box=document.getElementById('ne-itens'); if(box) box.innerHTML='';
  const r=document.getElementById('ne-resumo'); if(r) r.innerHTML='';
  await Promise.all([_neEnsureUnidades(), popularStatusLicitacao()]);
  aplicarSecaoFormulario('ne-secao');
  neAddItem();
}
function neAddItem(){
  const box=document.getElementById('ne-itens'); if(!box) return;
  const div=document.createElement('div');
  div.className='ne-item';
  div.style.cssText='border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:var(--surface2)';
  div.innerHTML=`
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:2;min-width:180px"><div class="form-label">Item / Descrição *</div><input type="text" class="ne-it-desc" placeholder="ex: AR CONDICIONADO 12000 BTU"></div>
      <div style="flex:1;min-width:120px"><div class="form-label">Valor unitário (R$) *</div><input type="number" class="ne-it-vlunit" placeholder="ex: 2400" oninput="neRecalc()"></div>
      <div style="flex:1.4;min-width:160px"><div class="form-label">Status inicial</div><select class="ne-it-status">${_neStatusOptions()}</select></div>
      <button type="button" onclick="neRemoveItem(this)" title="Remover item" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--red);cursor:pointer;padding:6px 9px;height:34px">🗑</button>
    </div>
    <div style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:11px;color:var(--text3)">Unidades que recebem este item (uma linha por unidade):</span>
        <button type="button" class="btn-secondary" onclick="neAddUnidade(this)" style="white-space:nowrap">+ unidade</button>
      </div>
      <div class="ne-it-unidades"></div>
    </div>`;
  box.appendChild(div);
  _neAddUnidadeRow(div);
  neRecalc();
}
function neRemoveItem(btn){ const it=btn.closest('.ne-item'); if(it) it.remove(); neRecalc(); }
function neAddUnidade(btn){ const it=btn.closest('.ne-item'); if(it) _neAddUnidadeRow(it); }
function _neAddUnidadeRow(itemDiv){
  const wrap=itemDiv.querySelector('.ne-it-unidades'); if(!wrap) return;
  const row=document.createElement('div');
  row.className='ne-u-row';
  row.innerHTML=`
    <select class="ne-u-sel" onchange="neRecalc()">${_neUnidadeOptions()}</select>
    <input type="number" class="ne-u-qtde" placeholder="qtde" oninput="neRecalc()">
    <span class="ne-u-total">—</span>
    <button type="button" class="ne-u-remove" onclick="neRemoveUnidade(this)" title="Remover unidade" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--red);cursor:pointer">✕</button>`;
  wrap.appendChild(row);
  neRecalc();
}
function neRemoveUnidade(btn){ const r=btn.closest('.ne-u-row'); if(r) r.remove(); neRecalc(); }
function neRecalc(){
  const global=parseFloat(document.getElementById('ne-valor')?.value)||0;
  let comprometido=0; const porUnidade={};
  document.querySelectorAll('#ne-itens .ne-item').forEach(it=>{
    const vlU=parseFloat(it.querySelector('.ne-it-vlunit')?.value)||0;
    it.querySelectorAll('.ne-u-row').forEach(row=>{
      const qtde=parseFloat(row.querySelector('.ne-u-qtde')?.value)||0;
      const nome=row.querySelector('.ne-u-sel')?.selectedOptions?.[0]?.textContent||'';
      const tot=vlU*qtde;
      const totEl=row.querySelector('.ne-u-total');
      if(totEl) totEl.textContent=(vlU&&qtde)?('R$ '+tot.toLocaleString('pt-BR',{minimumFractionDigits:2})):'—';
      if(qtde&&vlU){ comprometido+=tot; if(nome) porUnidade[nome]=(porUnidade[nome]||0)+tot; }
    });
  });
  const resumo=document.getElementById('ne-resumo'); if(!resumo) return;
  const linhas=Object.entries(porUnidade).map(([u,v])=>`<div style="display:flex;justify-content:space-between"><span>${_sanEsc(u)}</span><span>${fmtFull(v)}</span></div>`).join('');
  const saldo=global-comprometido;
  const saldoCor=saldo<0?'var(--red)':'var(--text2)';
  resumo.innerHTML=`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px">
      <div style="font-weight:700;margin-bottom:4px">Resumo por unidade</div>
      ${linhas||'<div style="color:var(--text3)">Adicione itens e unidades…</div>'}
      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between"><span>Total comprometido</span><span><b>${fmtFull(comprometido)}</b></span></div>
      <div style="display:flex;justify-content:space-between;color:${saldoCor}"><span>Saldo (global − comprometido)</span><span><b>${fmtFull(saldo)}</b></span></div>
    </div>`;
}

async function salvarNovaEmenda(){
  const secaoId=Number(document.getElementById('ne-secao')?.value||0);
  const tipo=document.getElementById("ne-tipo").value;
  const emenda=document.getElementById("ne-emenda").value.trim();
  const valor=document.getElementById("ne-valor").value;
  const anoStr=document.getElementById("ne-ano").value.trim();
  const objeto=document.getElementById("ne-objeto").value.trim();
  const parlamentarNome=(document.getElementById("ne-parlamentar-sel")?.value)||null;
  if(!secaoId||!tipo||!emenda||!valor||!anoStr||!objeto||!parlamentarNome){showMsg("ne","Preencha os campos obrigatórios (*): seção, tipo, nº da emenda, ano, parlamentar, valor cedido global e objeto geral da emenda.","err");return}
  // coleta e valida itens inline
  const itens=[];
  for(const it of document.querySelectorAll('#ne-itens .ne-item')){
    const desc=it.querySelector('.ne-it-desc')?.value.trim();
    const vlU=parseFloat(it.querySelector('.ne-it-vlunit')?.value)||0;
    const status=it.querySelector('.ne-it-status')?.value||null;
    const unidades=[...it.querySelectorAll('.ne-u-row')].map(r=>{
      const sel=r.querySelector('.ne-u-sel');
      return {id:Number(sel?.value)||null, nome:sel?.selectedOptions?.[0]?.textContent?.trim()||'', qtde:parseFloat(r.querySelector('.ne-u-qtde')?.value)||0};
    }).filter(u=>u.id&&u.qtde>0);
    if(!desc){ showMsg("ne","Há um item sem descrição. Preencha ou remova.","err"); return; }
    if(!vlU){ showMsg("ne",`Informe o valor unitário do item "${desc}".`,"err"); return; }
    if(!unidades.length){ showMsg("ne",`Adicione ao menos uma unidade com quantidade ao item "${desc}".`,"err"); return; }
    itens.push({desc, vlU, status, unidades});
  }
  if(!itens.length){ showMsg("ne","Adicione ao menos um item à emenda.","err"); return; }
  const valorGlobal=parseFloat(valor);
  const comprometido=itens.reduce((a,it)=>a+it.unidades.reduce((s,u)=>s+it.vlU*u.qtde,0),0);
  if(comprometido>valorGlobal){
    if(!confirm(`⚠️ O total comprometido (${fmtFull(comprometido)}) ultrapassa o valor cedido global (${fmtFull(valorGlobal)}).\nO saldo ficará negativo (${fmtFull(valorGlobal-comprometido)}).\n\nSalvar mesmo assim?`)) return;
  }
  const btn=document.querySelector("#panel-nova-emenda .btn-primary");
  const label=btn.textContent; btn.disabled=true; btn.textContent="Salvando...";
  try{
    if(parlamentarNome) await obterOuCriarParlamentar(parlamentarNome);
    const nomesUnid=[...new Set(itens.flatMap(it=>it.unidades.map(u=>u.nome)))];
    const idsUnid=[...new Set(itens.flatMap(it=>it.unidades.map(u=>u.id)))];
    const {data:em,error:e1}=await sb.from("emendas").insert({
      secao_id:secaoId, tipo, emenda, parlamentar:parlamentarNome,
      sei_emenda:document.getElementById("ne-sei").value.trim()||null,
      objeto,
      valor_cedido:valorGlobal,
      ano:parseInt(anoStr),
      unidade: nomesUnid.length===1?nomesUnid[0]:('Várias ('+nomesUnid.length+')'),
      unidade_id: idsUnid.length===1?idsUnid[0]:null
    }).select("id").single();
    if(e1) throw e1;
    const registros=[];
    itens.forEach(it=>it.unidades.forEach(u=>registros.push({
      emenda_id:em.id, emenda,
      unidade_beneficiada:u.nome, unidade_beneficiada_id:u.id,
      item_cadastrado:it.desc, item:it.desc,
      qtde_cadastrada:u.qtde, qtde:u.qtde,
      vl_unitario_cadastrado:it.vlU, vl_total_cadastrado:it.vlU*u.qtde,
      status:it.status||null
    })));
    const {error:e2}=await sb.from("emenda_itens").insert(registros);
    if(e2) throw e2;
    showMsg("ne",`✓ Emenda criada com ${registros.length} item(ns)/unidade! Atualizando...`,"ok");
    setTimeout(()=>loadData(),1200);
  }catch(err){
    showMsg("ne","✗ Erro: "+(err.message||err),"err");
  }finally{
    btn.disabled=false; btn.textContent=label;
  }
}

async function salvarNovoItem(){
  const item=document.getElementById("ni-item").value.trim();
  const vlPlan=parseFloat(document.getElementById("ni-vl-unit").value)||0;
  const vlExecRaw=document.getElementById("ni-vl-unit-exec").value;
  const vlExec=vlExecRaw===""?null:(parseFloat(vlExecRaw)||0);
  const cpl=document.getElementById("ni-cpl").value.trim();
  const status=document.getElementById("ni-status").value;
  const rows=[...document.querySelectorAll("#ni-emendas-detalhe .ni-u-row")].filter(r=>r.querySelector(".ni-u-chk")?.checked);
  if(!rows.length||!item){showMsg("ni","Selecione ao menos uma unidade e preencha o item (*)","err");return}
  const invalidas=rows.filter(row=>!row.querySelector(".ni-u-qtde")?.value);
  if(invalidas.length){showMsg("ni","Preencha a quantidade para todas as unidades marcadas","err");return}
  const btn=document.querySelector("#panel-novo-item .btn-primary");
  const label=btn.textContent;btn.disabled=true;btn.textContent="Salvando...";

  const registros=rows.map(row=>{
    const emenda=row.closest("[data-emenda]").dataset.emenda;
    const unidade=row.dataset.unidade;
    const qtde=parseFloat(row.querySelector(".ni-u-qtde").value)||0;
    const r=allRows.find(x=>x.emenda===emenda);
    // prioriza a linha de emenda correspondente à unidade (1 emenda por unidade); fallback p/ qualquer
    const ce=cachedEmendas.find(x=>String(x.emenda)===emenda && x.unidade===unidade) || cachedEmendas.find(x=>String(x.emenda)===emenda);
    return {
      emenda_id: ce?ce.id:(r?r.emenda_id:null),
      emenda,
      unidade_beneficiada: unidade,
      // plano de trabalho aprovado (sempre salvo)
      item_cadastrado: item,
      qtde_cadastrada: qtde,
      vl_unitario_cadastrado: vlPlan||null,
      vl_total_cadastrado: vlPlan?vlPlan*qtde:null,
      // execução (só preenche valor se informado; nome e qtde já aparecem na tabela)
      item: item,
      qtde: qtde,
      vl_unitario: vlExec,
      vl_total: (vlExec!=null)?vlExec*qtde:null,
      cpl: cpl||null,
      status: status||null
    };
  });
  const semEmenda=registros.filter(x=>!x.emenda_id);
  if(semEmenda.length){showMsg("ni","✗ Não encontrei o id de uma das emendas. Recarregue a página.","err");btn.disabled=false;btn.textContent=label;return}

  // Verificação de saldo
  const avisosSaldo=[];
  for(const reg of registros){
    const ce=cachedEmendas.find(x=>x.id===reg.emenda_id);
    const valorCedido=Number(ce?.valor_cedido)||Number(allRows.find(r=>String(r.emenda_id)===String(reg.emenda_id))?.valor_cedido)||0;
    const jaComprometido=allRows.filter(r=>String(r.emenda_id)===String(reg.emenda_id)).reduce((a,r)=>a+_valorComprometidoItem(r),0);
    const novoTotal=reg.vl_total_cadastrado||0;
    const saldoApos=valorCedido-jaComprometido-novoTotal;
    if(saldoApos<0){
      avisosSaldo.push(`• Emenda ${reg.emenda}: saldo disponível ${fmtFull(valorCedido-jaComprometido)}, item cadastrado ${fmtFull(novoTotal)} → saldo ficará ${fmtFull(saldoApos)} (negativo)`);
    }
  }
  if(avisosSaldo.length){
    const confirmar=confirm(`⚠️ ATENÇÃO — Saldo insuficiente!\n\n${avisosSaldo.join('\n')}\n\nO valor do item ultrapassa o saldo disponível da emenda. Isso pode indicar um erro de digitação ou que a emenda precisará de reforço.\n\nDeseja salvar mesmo assim?`);
    if(!confirmar){btn.disabled=false;btn.textContent=label;return}
  }

  const {error}=await sb.from("emenda_itens").insert(registros);
  btn.disabled=false;btn.textContent=label;
  if(error){showMsg("ni","✗ Erro: "+error.message,"err");return}
  showMsg("ni","✓ "+registros.length+" item(ns) salvo(s)! Atualizando...","ok");
  setTimeout(()=>loadData(),1200);
}

async function salvarStatus(){
  const status=document.getElementById("as-status").value.trim();
  const checks=[...document.querySelectorAll('#as-itens-lista input[type=checkbox]:checked')];
  if(!checks.length){showMsg("as","Selecione ao menos um item","err");return}
  const btn=document.querySelector("#panel-atualizar-status .btn-primary");
  const label=btn.textContent;btn.disabled=true;
  const hoje=new Date().toLocaleDateString("pt-BR");
  let done=0,erros=0;
  for(const c of checks){
    const idx=c.id.replace("ci-","");
    const id=c.dataset.id;
    const cpl=(document.getElementById("cpl-"+idx)||{value:""}).value.trim();
    const nf=(document.getElementById("nf-"+idx)||{value:""}).value.trim();
    const emp=(document.getElementById("emp-"+idx)||{value:""}).value.trim();
    const pat=(document.getElementById("pat-"+idx)||{value:""}).value.trim();
    const patch={cpl:cpl||null,nota_fiscal:nf||null,empenho:emp||null,patrimonio:pat||null,data_atualizacao:hoje};
    if(status){ patch.status=status; const _o=(window._catEmendaItem||[]).find(o=>o.nome===catStatus(status)); patch.status_id=_o?_o.id:null; }
    const {error}=await sb.from("emenda_itens").update(patch).eq("id",id);
    if(error){erros++;console.error("Erro item",id,error.message);}else{done++;}
    btn.textContent=`Salvando ${done+erros}/${checks.length}...`;
  }
  btn.disabled=false;btn.textContent=label;
  if(erros){showMsg("as",`⚠️ ${done} salvo(s), ${erros} com erro. Veja o console.`,"err");}
  else{showMsg("as",`✓ ${done} item(ns) atualizado(s)! Recarregando...`,"ok");}
  setTimeout(()=>loadData(),1200);
}
