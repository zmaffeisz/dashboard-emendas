// ═══ FISCALIZAÇÃO DE CONTRATOS ═══
let fiscalizacaoRows = [];
let fiscalizacaoFiltrados = [];
let fiscalizacaoCarregado = false;
let _fiscAtual = null; // protocolo da OS em edição

const SITUACAO_FISC = {
  nao_fiscalizado: {label:'Não fiscalizado', color:'var(--red)', bg:'var(--red-bg)'},
  pendente:        {label:'Pendente',         color:'var(--amber)', bg:'var(--amber-bg)'},
  conforme:        {label:'Conforme',         color:'var(--green)', bg:'var(--green-bg)'},
  conforme_ressalva:{label:'C/ ressalva',     color:'var(--amber)', bg:'var(--amber-bg)'},
  parcial:         {label:'Parcial',          color:'#E67E22',  bg:'#FDF0E6'},
  nao_conforme:    {label:'Não conforme',     color:'var(--red)', bg:'var(--red-bg)'},
};
function badgeSituacaoFisc(s){
  const cfg=SITUACAO_FISC[s||'nao_fiscalizado']||SITUACAO_FISC.nao_fiscalizado;
  return `<span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`;
}

async function loadFiscalizacao(){
  document.getElementById("fisc-loading").style.display="block";
  document.getElementById("fisc-main").style.display="none";
  const {data:controle,error}=await sb.from("chamados_controle")
    .select("*")
    .not("cpl_contrato","is",null);
  if(error){document.getElementById("fisc-loading").innerHTML=`<div style="color:var(--red)">Erro: ${error.message}</div>`;return;}
  // Pega protocolos pra buscar dados do chamado original
  const protocolos=(controle||[]).map(c=>c.protocolo).filter(Boolean);
  let chamados=[];
  if(protocolos.length){
    const {data:ch}=await sb.from("chamados").select("protocolo,carimbo,unidade,equipamento,patrimonio,fabricante,descricao,grau_urgencia,servico").in("protocolo",protocolos);
    chamados=ch||[];
  }
  const chamadoMap={};
  chamados.forEach(c=>chamadoMap[c.protocolo]=c);
  fiscalizacaoRows=(controle||[]).map(c=>({
    ...c,
    _chamado: chamadoMap[c.protocolo]||{},
    situacao_os: c.situacao_os||'nao_fiscalizado',
  })).sort((a,b)=>{
    // não fiscalizados primeiro
    const ord={nao_fiscalizado:0,pendente:1,parcial:2,conforme_ressalva:3,nao_conforme:4,conforme:5};
    return (ord[a.situacao_os]??0)-(ord[b.situacao_os]??0);
  });
  fiscalizacaoCarregado=true;
  _popularFiltrosFisc();
  filtrarFiscalizacao();
  atualizarBadgeFisc();
  document.getElementById("fisc-loading").style.display="none";
  document.getElementById("fisc-main").style.display="block";
  setTimeout(_setTableOffset,50);
}

// ── Filtros estilo Google Sheets para a tabela de fiscalização ──
const FISC_FILTER_COLS = {
  protocolo:   {get:r=>r.protocolo||'',              disp:v=>v||'(vazio)'},
  data:        {get:r=>r._chamado?.carimbo||r._chamado?.data_solicitacao||'', disp:v=>v||'(vazio)'},
  unidade:     {get:r=>r._chamado?.unidade||'',      disp:v=>v||'(vazio)'},
  equipamento: {get:r=>r._chamado?.equipamento||'',  disp:v=>v||'(vazio)'},
  patrimonio:  {get:r=>r._chamado?.patrimonio||'',   disp:v=>v||'(vazio)'},
  cpl:         {get:r=>r.cpl_contrato||'',           disp:v=>v||'(sem CPL)'},
  os:          {get:r=>r.os||'',                     disp:v=>v||'(vazio)'},
  servico:     {get:r=>r.servico_realizado||r.feito||'', disp:v=>v||'(vazio)'},
  situacao:    {get:r=>r.situacao_os||'nao_fiscalizado', disp:v=>(SITUACAO_FISC[v]?.label||v||'(vazio)')},
  competencia: {get:r=>r.competencia||'',            disp:v=>v||'(vazio)'},
  nf:          {get:r=>r.nf_referencia||'',          disp:v=>v||'(vazio)'},
  sla:         {get:r=>{const ch=r._chamado||{};const d=_diasEntreDatas(ch.carimbo||ch.data_solicitacao||null,r.data_atendimento_os||null);return d===null?'':d;}, disp:v=>v!==''?`${v}d`:'(vazio)'},
  fiscalizado_por:{get:r=>r.fiscalizado_por||'',     disp:v=>v||'(vazio)'},
  fiscalizado_em:{get:r=>r.fiscalizado_em||'',       disp:v=>v||'(vazio)'},
};
let fiscHeaderFilters = Object.fromEntries(Object.keys(FISC_FILTER_COLS).map(k=>[k,[]]));
let _fiscHdrCol = null, _fiscHdrPending = [];

function _fiscUnique(col){
  const cfg=FISC_FILTER_COLS[col];
  const vals=[...new Set(fiscalizacaoRows.map(cfg.get).map(v=>v==null?'':String(v)))];
  return vals.sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}
function _ensureFiscDropdown(){
  let dd=document.getElementById('fisc-hdr-dropdown');
  if(dd) return dd;
  dd=document.createElement('div');
  dd.id='fisc-hdr-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_fiscHdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_fiscHdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="fisc-hdr-search" placeholder="🔍 Buscar..." oninput="_fiscHdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_fiscHdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="fisc-hdr-count">0</span></a> — <a href="#" onclick="_fiscHdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="fisc-hdr-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeFiscFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmFiscFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd);
  return dd;
}
function openFiscFilter(e,col){
  e.stopPropagation();
  const dd=_ensureFiscDropdown();
  if(_fiscHdrCol===col && dd.style.display==='block'){dd.style.display='none';_fiscHdrCol=null;return;}
  _fiscHdrCol=col;
  const all=_fiscUnique(col); const cur=fiscHeaderFilters[col]||[];
  _fiscHdrPending=cur.length?[...cur]:[...all];
  document.getElementById('fisc-hdr-search').value='';
  _fiscHdrRenderList();
  const rect=e.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const ddW=dd.offsetWidth||240; let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px'; dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('fisc-hdr-search').focus(),50);
}
function _fiscHdrRenderList(){
  const col=_fiscHdrCol; if(!col) return;
  const q=normalizar(document.getElementById('fisc-hdr-search').value);
  const all=_fiscUnique(col); const disp=FISC_FILTER_COLS[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('fisc-hdr-count').textContent=all.length;
  document.getElementById('fisc-hdr-list').innerHTML=vis.map(v=>{
    const checked=_fiscHdrPending.includes(v)?'checked':'';
    const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px"><input type="checkbox" value="${safe}" ${checked} onchange="_fiscHdrToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _fiscHdrToggle(cb){ if(cb.checked){if(!_fiscHdrPending.includes(cb.value))_fiscHdrPending.push(cb.value);}else{_fiscHdrPending=_fiscHdrPending.filter(x=>x!==cb.value);} }
function _fiscHdrSelectAll(all){ const col=_fiscHdrCol;if(!col)return; _fiscHdrPending=all?_fiscUnique(col):[]; _fiscHdrRenderList(); }
function _fiscHdrSort(asc){
  const col=_fiscHdrCol;
  if(!col) return;
  fiscSortCol=col;
  fiscSortAsc=asc;
  closeFiscFilter();
  _renderFiscalizacao();
}
function confirmFiscFilter(){
  const col=_fiscHdrCol; if(!col) return;
  const all=_fiscUnique(col);
  fiscHeaderFilters[col]=(_fiscHdrPending.length===0||_fiscHdrPending.length===all.length)?[]:[..._fiscHdrPending];
  document.getElementById('fisc-hdr-dropdown').style.display='none'; _fiscHdrCol=null;
  _fiscUpdateHdrBtns(); filtrarFiscalizacao();
}
function closeFiscFilter(){ const dd=document.getElementById('fisc-hdr-dropdown');if(dd)dd.style.display='none';_fiscHdrCol=null; }
function _fiscUpdateHdrBtns(){
  Object.keys(FISC_FILTER_COLS).forEach(col=>{
    const btn=document.getElementById('hff-'+col); if(!btn) return;
    btn.classList.toggle('active',(fiscHeaderFilters[col]||[]).length>0);
  });
}
document.addEventListener('click',function(e){
  const dd=document.getElementById('fisc-hdr-dropdown');
  if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!(e.target.closest&&e.target.closest('.hdr-filter-btn'))){dd.style.display='none';_fiscHdrCol=null;}
});

function _popularFiltrosFisc(){ _fiscUpdateHdrBtns(); }

let fiscSortCol = "data";
let fiscSortAsc = false;
const FISC_SORT_COLS = ["protocolo","data","unidade","equipamento","patrimonio","cpl","os","servico","situacao","competencia","nf","sla","fiscalizado_por","fiscalizado_em"];

function _fiscDataMs(raw){
  if(!raw) return null;
  const s=String(raw).trim(); let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m) return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();
  const d=new Date(s); return Number.isNaN(d.getTime())?null:d.getTime();
}
function _fiscSortValue(r,col){
  const ch=r._chamado||{};
  if(col==="data") return _fiscDataMs(ch.carimbo||ch.data_solicitacao);
  if(col==="fiscalizado_em") return _fiscDataMs(r.fiscalizado_em);
  if(col==="sla") return _diasEntreDatas(ch.carimbo||ch.data_solicitacao||null,r.data_atendimento_os||null);
  if(col==="competencia"){
    const m=String(r.competencia||"").match(/(\d{1,2})\D+(\d{4})/);
    return m?(+m[2]*12+(+m[1]-1)):null;
  }
  const vals={protocolo:r.protocolo,unidade:ch.unidade,equipamento:ch.equipamento,patrimonio:ch.patrimonio,cpl:r.cpl_contrato,os:r.os,servico:r.servico_realizado||r.feito,situacao:SITUACAO_FISC[r.situacao_os]?.label||r.situacao_os,nf:r.nf_referencia,fiscalizado_por:r.fiscalizado_por};
  return vals[col]??"";
}
function ordenarFiscalizacao(col){
  if(fiscSortCol===col) fiscSortAsc=!fiscSortAsc;
  else{ fiscSortCol=col; fiscSortAsc=true; }
  _renderFiscalizacao();
}
function _ordenarRowsFiscalizacao(rows){
  return [...rows].sort((a,b)=>{
    const va=_fiscSortValue(a,fiscSortCol), vb=_fiscSortValue(b,fiscSortCol);
    const vazioA=va===null||va===undefined||va==="", vazioB=vb===null||vb===undefined||vb==="";
    if(vazioA!==vazioB) return vazioA?1:-1;
    let cmp=0;
    if(typeof va==="number"&&typeof vb==="number") cmp=va-vb;
    else cmp=String(va).localeCompare(String(vb),"pt-BR",{numeric:true,sensitivity:"base"});
    if(cmp===0) cmp=String(a.protocolo||"").localeCompare(String(b.protocolo||""),"pt-BR",{numeric:true});
    return fiscSortAsc?cmp:-cmp;
  });
}
function _atualizarIconesSortFisc(){
  FISC_SORT_COLS.forEach(col=>{
    const el=document.getElementById("sort-fisc-"+col);
    if(el) el.textContent=fiscSortCol===col?(fiscSortAsc?"▲":"▼"):"";
  });
}

function filtrarFiscalizacao(){
  const busca=(document.getElementById("fisc-busca")?.value||"").toLowerCase();
  fiscalizacaoFiltrados=fiscalizacaoRows.filter(r=>{
    for(const [col,sel] of Object.entries(fiscHeaderFilters)){
      if(!sel.length) continue;
      const val=String(FISC_FILTER_COLS[col].get(r)??'');
      if(!sel.includes(val)) return false;
    }
    if(busca){
      const hay=[r.protocolo,r._chamado?.equipamento,r._chamado?.unidade,r._chamado?.patrimonio,r.os,r.cpl_contrato,r.servico_realizado,r.feito].filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(busca)) return false;
    }
    return true;
  });
  _renderFiscalizacao();
}

function _renderFiscalizacao(){
  const rows=_ordenarRowsFiscalizacao(fiscalizacaoFiltrados);
  _atualizarIconesSortFisc();
  const nao=rows.filter(r=>!r.situacao_os||r.situacao_os==='nao_fiscalizado').length;
  const pend=rows.filter(r=>r.situacao_os==='pendente').length;
  const conf=rows.filter(r=>r.situacao_os==='conforme').length;
  document.getElementById("fm-total").textContent=rows.length;
  document.getElementById("fm-nao").textContent=nao;
  document.getElementById("fm-pend").textContent=pend;
  document.getElementById("fm-conf").textContent=conf;
  document.getElementById("fisc-count").textContent=`${rows.length} OS`;
  document.getElementById("fisc-body").innerHTML=rows.map(r=>{
    const ch=r._chamado||{};
    const data=ch.carimbo||"—";
    return `<tr>
      <td style="text-align:center"><input type="checkbox" class="fisc-check" data-protocolo="${r.protocolo}" style="accent-color:var(--blue);cursor:pointer"></td>
      <td style="white-space:nowrap">
        ${podeEditar('fiscalizacao')?`<button onclick="abrirModalFiscOS('${r.protocolo}')" class="btn-secondary btn-compact" style="margin-right:4px" title="Fiscalizar OS">🔍 Fiscalizar</button>`:""}
        <button onclick="abrirHistoricoOS('${r.protocolo}')" class="btn-ghost btn-compact" title="Ver histórico">📋 Histórico</button>
      </td>
      <td style="font-size:11px;white-space:nowrap">${r.protocolo||"—"}</td>
      <td style="font-size:11px;white-space:nowrap">${data}</td>
      <td style="font-size:12px">${ch.unidade||"—"}</td>
      <td style="font-size:11px">${ch.equipamento||"—"}</td>
      <td style="font-size:11px">${ch.patrimonio||"—"}</td>
      <td style="font-size:11px;white-space:nowrap"><strong>${r.cpl_contrato||"—"}</strong></td>
      <td style="font-size:11px">${r.os||"—"}</td>
      <td style="font-size:11px;max-width:180px;white-space:normal;word-break:break-word" title="${r.servico_realizado||r.feito||''}">${r.servico_realizado||r.feito||"—"}</td>
      <td>${badgeSituacaoFisc(r.situacao_os)}</td>
      <td style="font-size:11px">${r.competencia||"—"}</td>
      <td style="font-size:11px">${r.nf_referencia||"—"}</td>
      <td style="font-size:11px;text-align:center">${_calcSLA(r)}</td>
      <td style="font-size:11px">${r.fiscalizado_por||"—"}</td>
      <td style="font-size:11px">${r.fiscalizado_em||"—"}</td>
      <td>${podeEditar('fiscalizacao')?`<button onclick="abrirModalEditarNF('${r.protocolo}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer" title="Editar NF e Competência">✏️ NF/Comp.</button>`:"—"}</td>
    </tr>`;
  }).join("");
}

function clearAllFiscalizacao(){
  const el=document.getElementById("fisc-busca"); if(el) el.value="";
  Object.keys(fiscHeaderFilters).forEach(k=>fiscHeaderFilters[k]=[]);
  _fiscUpdateHdrBtns(); filtrarFiscalizacao();
}

function selecionarTodasFisc(v){
  document.querySelectorAll(".fisc-check").forEach(c=>c.checked=v);
  const all=document.getElementById("fisc-check-all"); if(all) all.checked=v;
}

function atualizarBadgeFisc(){
  const naoFisc=fiscalizacaoRows.filter(r=>!r.situacao_os||r.situacao_os==='nao_fiscalizado').length;
  const badge=document.getElementById("badge-fiscalizacao");
  if(badge){ if(naoFisc>0){badge.textContent=naoFisc;badge.style.display="inline";}else badge.style.display="none"; }
}

function abrirModalFiscOS(protocolo){
  const r=fiscalizacaoRows.find(x=>x.protocolo===protocolo); if(!r) return;
  _fiscAtual=protocolo;
  const ch=r._chamado||{};
  document.getElementById("mfo-info").innerHTML=`<strong>${protocolo}</strong> · ${ch.equipamento||"—"} · ${ch.unidade||"—"} · <strong>${r.cpl_contrato||""}</strong>`;
  document.getElementById("mfo-situacao").value=r.situacao_os==="nao_fiscalizado"?"":r.situacao_os||"";
  // Pré-preenche data com 01 do mês anterior se o campo estiver vazio
  const _dataExist=r.data_atendimento_os||"";
  if(_dataExist){
    document.getElementById("mfo-data-atendimento").value=_dataExist;
  } else {
    const _hoje=new Date();
    const _mesAnt=new Date(_hoje.getFullYear(),_hoje.getMonth()-1,1);
    document.getElementById("mfo-data-atendimento").value=
      `${_mesAnt.getFullYear()}-${String(_mesAnt.getMonth()+1).padStart(2,'0')}-01`;
  }
  document.getElementById("mfo-servico").value=r.servico_realizado||r.feito||"";
  document.getElementById("mfo-ocorrencias").value=r.ocorrencias||"";
  document.getElementById("mfo-msg").className="fmsg";
  // Mostra SLA preview se já tem data
  _atualizarSLAPreview(r._chamado?.carimbo||r._chamado?.data_solicitacao||null, r.data_atendimento_os||null);
  document.getElementById("mfo-data-atendimento").onchange = function(){
    _atualizarSLAPreview(r._chamado?.carimbo||r._chamado?.data_solicitacao||null, this.value||null);
  };
  document.getElementById("modal-fisc-os").classList.add("active");
}

function _atualizarSLAPreview(dataAbertura, dataAtendimento){
  const wrap=document.getElementById("mfo-sla-wrap");
  const info=document.getElementById("mfo-sla-info");
  if(!wrap||!info) return;
  if(!dataAtendimento||!dataAbertura){wrap.style.display="none";return;}
  const dias=_diasEntreDatas(dataAbertura, dataAtendimento);
  if(dias===null){wrap.style.display="none";return;}
  const cor=dias<=1?"var(--green)":dias<=3?"var(--amber)":"var(--red)";
  info.innerHTML=`<span style="font-weight:600;color:${cor}">${dias} dia${dias!==1?'s':''}</span> entre abertura e atendimento`;
  wrap.style.display="block";
}

function _diasEntreDatas(d1raw, d2raw){
  // Aceita dd/mm/aaaa, yyyy-mm-dd ou ISO
  const parse=s=>{
    if(!s) return null;
    s=String(s).trim();
    let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m) return new Date(+m[3],+m[2]-1,+m[1]);
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return new Date(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s); return isNaN(d)?null:d;
  };
  const a=parse(d1raw), b=parse(d2raw);
  if(!a||!b) return null;
  return Math.round((b-a)/(1000*60*60*24));
}

function _calcSLA(r){
  const ch=r._chamado||{};
  const abertura=ch.carimbo||ch.data_solicitacao||null;
  const atend=r.data_atendimento_os||null;
  const dias=_diasEntreDatas(abertura, atend);
  if(dias===null) return "—";
  const cor=dias<=1?"var(--green)":dias<=3?"var(--amber)":"var(--red)";
  return `<span style="font-weight:600;color:${cor}">${dias}d</span>`;
}

async function salvarFiscalizacaoOS(){
  if(!_fiscAtual) return;
  const situacao=document.getElementById("mfo-situacao").value;
  if(!situacao){showMsg("mfo","Selecione a situação da OS.","err");return;}
  const btn=document.querySelector("#modal-fisc-os .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const hoje=new Date().toISOString().split("T")[0];
  const fiscNome=currentProfile?.nome||currentProfile?.email||"";
  const dataAtend=document.getElementById("mfo-data-atendimento").value||null;
  const patch={
    situacao_os: situacao,
    data_atendimento_os: dataAtend,
    servico_realizado: document.getElementById("mfo-servico").value||null,
    ocorrencias: document.getElementById("mfo-ocorrencias").value||null,
    fiscalizado_por: fiscNome||null,
    fiscalizado_em: hoje,
  };
  const rAtual=fiscalizacaoRows.find(x=>x.protocolo===_fiscAtual);
  const {error}=await sb.rpc("registrar_fiscalizacao_os",{
    p_protocolo:_fiscAtual,
    p_situacao:situacao,
    p_data_atendimento_os:dataAtend,
    p_servico_realizado:patch.servico_realizado,
    p_ocorrencias:patch.ocorrencias,
    p_fiscalizado_por:fiscNome||null,
  });
  btn.disabled=false;btn.textContent="Salvar fiscalização";
  if(error){showMsg("mfo","Erro: "+error.message,"err");return;}
  if(rAtual) Object.assign(rAtual,patch);
  filtrarFiscalizacao(); atualizarBadgeFisc();
  showMsg("mfo","✓ Fiscalização salva!","ok");
  setTimeout(()=>document.getElementById("modal-fisc-os").classList.remove("active"),1000);
}

// ── Modal editar NF + Competência ──
let _editNFAtual = null;
function abrirModalEditarNF(protocolo){
  const r=fiscalizacaoRows.find(x=>x.protocolo===protocolo); if(!r) return;
  _editNFAtual=protocolo;
  document.getElementById("enf-info").textContent=`${protocolo} · ${r.cpl_contrato||"—"}`;
  document.getElementById("enf-competencia").value=r.competencia||"";
  document.getElementById("enf-nf").value=r.nf_referencia||"";
  document.getElementById("enf-msg").className="fmsg";
  document.getElementById("modal-editar-nf").classList.add("active");
}
async function salvarEditarNF(){
  if(!_editNFAtual) return;
  const btn=document.querySelector("#modal-editar-nf .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const comp=document.getElementById("enf-competencia").value.trim();
  const nf=document.getElementById("enf-nf").value.trim();
  const {error}=await sb.from("chamados_controle").update({competencia:comp||null,nf_referencia:nf||null}).eq("protocolo",_editNFAtual);
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("enf","Erro: "+error.message,"err");return;}
  const r=fiscalizacaoRows.find(x=>x.protocolo===_editNFAtual);
  if(r){r.competencia=comp;r.nf_referencia=nf;}
  filtrarFiscalizacao();
  showMsg("enf","✓ Salvo!","ok");
  setTimeout(()=>document.getElementById("modal-editar-nf").classList.remove("active"),900);
}

// ── Modal histórico ──
async function abrirHistoricoOS(protocolo){
  const r=fiscalizacaoRows.find(x=>x.protocolo===protocolo);
  const ch=r?._chamado||{};
  document.getElementById("hist-info").innerHTML=`<strong>${protocolo}</strong> · ${ch.equipamento||"—"} · ${ch.unidade||"—"}`;
  document.getElementById("hist-body").innerHTML='<div style="font-size:12px;color:var(--text3);padding:12px">Carregando...</div>';
  document.getElementById("modal-historico-os").classList.add("active");
  const {data,error}=await sb.from("fiscalizacao_historico")
    .select("*").eq("protocolo",protocolo).order("created_at",{ascending:true});
  if(error||!data?.length){
    document.getElementById("hist-body").innerHTML='<div style="font-size:12px;color:var(--text3);padding:12px">Nenhum histórico registrado ainda.</div>';
    return;
  }
  document.getElementById("hist-body").innerHTML=data.map(h=>{
    const anterior=h.situacao_anterior||"nao_fiscalizado";
    const nova=h.situacao_nova||h.status;
    const autor=h.alterado_por||h.usuario;
    const sitAnt=SITUACAO_FISC[anterior]?.label||anterior||"Não fiscalizado";
    const sitNov=SITUACAO_FISC[nova]?.label||nova||"—";
    const corNov=SITUACAO_FISC[nova]?.color||"var(--text)";
    return `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start">
      <div style="flex-shrink:0;font-size:11px;color:var(--text3);white-space:nowrap;min-width:80px">${h.data_alteracao||h.created_at?.slice(0,10)||"—"}</div>
      <div style="flex:1">
        <div style="font-size:13px"><span style="color:var(--text3)">${sitAnt}</span> → <span style="font-weight:600;color:${corNov}">${sitNov}</span></div>
        ${autor?`<div style="font-size:11px;color:var(--text3);margin-top:2px">por ${autor}</div>`:''}
        ${h.observacao?`<div style="font-size:12px;color:var(--text2);margin-top:4px;background:var(--surface2);padding:4px 8px;border-radius:4px">${h.observacao}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function gerarTermoAteste(){
  const checks=[...document.querySelectorAll(".fisc-check:checked")];
  if(!checks.length){alert("Selecione ao menos uma OS para gerar o termo.");return;}
  const n=checks.length;
  document.getElementById("mta-info").textContent=`${n} OS selecionada${n>1?'s':''} — informe a competência e a nota fiscal que serão aplicadas a todas.`;
  document.getElementById("mta-competencia").value="";
  document.getElementById("mta-nf").value="";
  document.getElementById("mta-msg").className="fmsg";
  document.getElementById("modal-termo-ateste").classList.add("active");
}

async function confirmarGerarTermo(){
  const competencia=document.getElementById("mta-competencia").value.trim();
  const nf=document.getElementById("mta-nf").value.trim();
  if(!competencia||!nf){showMsg("mta","Preencha a competência e o número da nota fiscal.","err");return;}
  const btn=document.querySelector("#modal-termo-ateste .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const checks=[...document.querySelectorAll(".fisc-check:checked")];
  const protocolos=checks.map(c=>c.dataset.protocolo);
  const {error}=await sb.from("chamados_controle").update({competencia,nf_referencia:nf}).in("protocolo",protocolos);
  if(error){showMsg("mta","Erro ao salvar: "+error.message,"err");btn.disabled=false;btn.textContent="Gerar PDF";return;}
  fiscalizacaoRows.filter(r=>protocolos.includes(r.protocolo)).forEach(r=>{r.competencia=competencia;r.nf_referencia=nf;});
  filtrarFiscalizacao();
  document.getElementById("modal-termo-ateste").classList.remove("active");
  btn.disabled=false;btn.textContent="Gerar PDF";
  const selecionadas=fiscalizacaoRows.filter(r=>protocolos.includes(r.protocolo));
  const hoje=new Date().toLocaleDateString("pt-BR");
  const fiscal=currentProfile?.nome||currentProfile?.email||"fiscal responsável";
  const cpls=[...new Set(selecionadas.map(r=>r.cpl_contrato).filter(Boolean))];
  // Pega nome da empresa dos contratos
  const empresas=[...new Set(selecionadas.map(r=>{
    const ct=(_contratosParaModal||[]).find(c=>c.cpl===r.cpl_contrato);
    return ct?.prestador||r.empresa||null;
  }).filter(Boolean))];
  const tabelaRows=selecionadas.map((r,i)=>{
    const ch=r._chamado||{};
    const sit=SITUACAO_FISC[r.situacao_os]?.label||r.situacao_os||"—";
    return `<tr style="border-bottom:1px solid #e0e0e0">
      <td style="padding:5px 8px;font-size:12px">${i+1}</td>
      <td style="padding:5px 8px;font-size:12px">${r.protocolo||"—"}</td>
      <td style="padding:5px 8px;font-size:12px">${r.os||"—"}</td>
      <td style="padding:5px 8px;font-size:12px">${ch.unidade||"—"}</td>
      <td style="padding:5px 8px;font-size:12px">${ch.equipamento||"—"}</td>
      <td style="padding:5px 8px;font-size:12px">${r.servico_realizado||r.feito||"—"}</td>
      <td style="padding:5px 8px;font-size:12px;font-weight:600">${sit}</td>
      <td style="padding:5px 8px;font-size:12px">${r.ocorrencias||"—"}</td>
    </tr>`;
  }).join("");
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Termo de Ateste</title>
  <link rel="stylesheet" href="css/print-termo-ateste.css"></head><body>
  <div class="header">
    <h2>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</h2>
    <h3>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</h3>
    <h2 style="margin-top:8px">TERMO DE ATESTE — RECEBIMENTO DEFINITIVO DE SERVIÇOS</h2>
  </div>
  <div class="info-grid">
    <div class="info-item"><span class="info-label">Contrato(s) CPL:</span><strong>${cpls.join(", ")||"—"}</strong></div>
    <div class="info-item"><span class="info-label">Empresa contratada:</span><strong>${empresas.join(", ")||"—"}</strong></div>
    <div class="info-item"><span class="info-label">Competência:</span><strong>${competencia}</strong></div>
    <div class="info-item"><span class="info-label">Nota Fiscal:</span><strong>${nf}</strong></div>
    <div class="info-item"><span class="info-label">Data do ateste:</span><strong>${hoje}</strong></div>
    <div class="info-item"><span class="info-label">Fiscal responsável:</span>${fiscal}</div>
    <div class="info-item"><span class="info-label">Total de OS fiscalizadas:</span>${selecionadas.length}</div>
  </div>
  <table><thead><tr>
    <th style="width:30px">#</th>
    <th>Protocolo</th><th>Nº OS</th><th>Unidade</th><th>Equipamento</th>
    <th>Serviço realizado</th><th>Situação</th><th>Ocorrências</th>
  </tr></thead><tbody>${tabelaRows}</tbody></table>
  <div class="ateste-box">
    <p>A fiscalização técnica das ordens de serviço listadas acima foi realizada na data de <strong>${hoje}</strong>,
    em conformidade com o disposto no art. 117 da Lei nº 14.133/2021, atestando-se o recebimento definitivo
    dos serviços prestados${empresas.length?` pela empresa <strong>${empresas.join(", ")}</strong>`:''}${cpls.length?`, referentes ao(s) contrato(s) ${cpls.join(", ")}`:''},
    competência <strong>${competencia}</strong>, conforme Nota Fiscal <strong>${nf}</strong>,
    conforme registros individuais constantes neste documento.</p>
  </div>
  <div class="assinatura">
    <div class="linha-assinatura"></div>
    <div><strong>${fiscal}</strong></div>
    <div style="font-size:11px;color:#555">Fiscal de Contrato — SMS Sorocaba</div>
    <div style="font-size:11px;color:#555;margin-top:2px">${hoje}</div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  <\/body><\/html>`;
  const _contratoIds=[...new Set(cpls.map(cpl=>((_contratosParaModal||[]).find(c=>c.cpl===cpl)||{}).id).filter(Boolean))];
  const {data:_termo}=await sb.from("termos_ateste").insert({cpl_contrato:cpls.join(",")||null,contrato_id:_contratoIds.length===1?_contratoIds[0]:null,competencia,nf_referencia:nf,fiscalizado_por:fiscal,gerado_em:new Date().toISOString().split("T")[0]}).select().single();
  if(_termo){
    if(_contratoIds.length) await sb.from("termo_contratos").insert(_contratoIds.map(cid=>({termo_id:_termo.id,contrato_id:cid})));
    const _chIds=[...new Set(selecionadas.map(r=>r.chamado_id).filter(Boolean))];
    if(_chIds.length) await sb.from("termo_chamados").insert(_chIds.map(chid=>({termo_id:_termo.id,chamado_id:chid})));
  }
  const w=window.open("","_blank"); w.document.write(html); w.document.close();
}

function _fiscSelecionadasParaMedicao(){
  const checks=[...document.querySelectorAll(".fisc-check:checked")];
  const protocolos=checks.map(c=>c.dataset.protocolo);
  return fiscalizacaoRows.filter(r=>protocolos.includes(r.protocolo));
}

function _fiscContratoDaOs(r){
  const id=r?.contrato_id;
  if(id) return (_contratosParaModal||[]).find(c=>String(c.id)===String(id))||null;
  const cpl=r?.cpl_contrato;
  return (_contratosParaModal||[]).find(c=>String(c.cpl||'')===String(cpl||''))||null;
}

function gerarTermoAteste(){ gerarMedicaoFiscalizacao(); }

async function gerarMedicaoFiscalizacao(){
  if(typeof _ensureContratosModal==='function') await _ensureContratosModal();
  const selecionadas=_fiscSelecionadasParaMedicao();
  if(!selecionadas.length){alert("Selecione ao menos uma OS para gerar a medicao.");return;}
  if(selecionadas.some(r=>!['conforme','conforme_ressalva','parcial'].includes(String(r.situacao_os||'')))){
    alert("Gere medicao apenas para OS ja fiscalizadas como conforme, conforme com ressalva ou parcial.");
    return;
  }
  const contratos=[...new Set(selecionadas.map(r=>String(r.contrato_id||_fiscContratoDaOs(r)?.id||r.cpl_contrato||'')).filter(Boolean))];
  if(contratos.length!==1){
    alert("Selecione OS de apenas um contrato por vez para gerar uma medicao e vincular uma NF.");
    return;
  }
  const contrato=_fiscContratoDaOs(selecionadas[0]);
  if(_ctEhTrimestral(contrato)){
    alert("Neste contrato, os chamados corretivos são ilimitados e não geram cobrança individual. Registre a medição trimestral no contrato após a preventiva/calibração e vincule ali o relatório de serviço e a NF.");
    return;
  }
  const n=selecionadas.length;
  const contratoTxt=contrato?`${contrato.numero_contrato||contrato.cpl||contrato.id} - ${contrato.prestador||''}`:(selecionadas[0].cpl_contrato||'contrato selecionado');
  document.getElementById("mta-info").textContent=`${n} OS selecionada${n>1?'s':''} para ${contratoTxt}. A medicao sera criada no contrato e a NF ficara vinculada a ela.`;
  document.getElementById("mta-competencia").value="";
  document.getElementById("mta-nf").value="";
  const nfData=document.getElementById("mta-nf-data"); if(nfData) nfData.value=_ctTodayISO();
  const valor=document.getElementById("mta-valor"); if(valor) valor.value=contrato?.valor_mensal!=null?String(_ctNum(contrato.valor_mensal)):"";
  document.getElementById("mta-msg").className="fmsg";
  document.getElementById("modal-termo-ateste").classList.add("active");
}

async function confirmarGerarTermo(){ return confirmarGerarMedicaoFiscalizacao(); }

function _fiscHtmlTermoAteste({selecionadas,contrato,competencia,nf,valor,fiscal,hoje}){
  const cpl=contrato?.cpl||selecionadas[0]?.cpl_contrato||"";
  const empresa=contrato?.prestador||selecionadas[0]?.empresa||"";
  const tabelaRows=selecionadas.map((r,i)=>{
    const ch=r._chamado||{};
    const sit=SITUACAO_FISC[r.situacao_os]?.label||r.situacao_os||"-";
    return `<tr style="border-bottom:1px solid #e0e0e0">
      <td style="padding:5px 8px;font-size:12px">${i+1}</td>
      <td style="padding:5px 8px;font-size:12px">${r.protocolo||"-"}</td>
      <td style="padding:5px 8px;font-size:12px">${r.os||"-"}</td>
      <td style="padding:5px 8px;font-size:12px">${ch.unidade||"-"}</td>
      <td style="padding:5px 8px;font-size:12px">${ch.equipamento||"-"}</td>
      <td style="padding:5px 8px;font-size:12px">${r.servico_realizado||r.feito||"-"}</td>
      <td style="padding:5px 8px;font-size:12px;font-weight:600">${sit}</td>
      <td style="padding:5px 8px;font-size:12px">${r.ocorrencias||"-"}</td>
    </tr>`;
  }).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Termo de Ateste</title>
  <link rel="stylesheet" href="css/print-termo-ateste.css"></head><body>
  <div class="header">
    <h2>SECRETARIA MUNICIPAL DA SAUDE - SOROCABA</h2>
    <h3>Secao de Aquisicao e Manutencao de Equipamentos e Mobiliarios da Saude - SUEQ</h3>
    <h2 style="margin-top:8px">TERMO DE ATESTE - RECEBIMENTO DEFINITIVO DE SERVICOS</h2>
  </div>
  <div class="info-grid">
    <div class="info-item"><span class="info-label">Contrato / CPL:</span><strong>${cpl||"-"}</strong></div>
    <div class="info-item"><span class="info-label">Empresa contratada:</span><strong>${empresa||"-"}</strong></div>
    <div class="info-item"><span class="info-label">Competencia:</span><strong>${competencia}</strong></div>
    <div class="info-item"><span class="info-label">Nota Fiscal:</span><strong>${nf}</strong></div>
    <div class="info-item"><span class="info-label">Valor atestado:</span><strong>${_ctMoney(valor)}</strong></div>
    <div class="info-item"><span class="info-label">Data do ateste:</span><strong>${hoje}</strong></div>
    <div class="info-item"><span class="info-label">Fiscal responsavel:</span>${fiscal}</div>
    <div class="info-item"><span class="info-label">Total de OS fiscalizadas:</span>${selecionadas.length}</div>
  </div>
  <table><thead><tr>
    <th style="width:30px">#</th>
    <th>Protocolo</th><th>No OS</th><th>Unidade</th><th>Equipamento</th>
    <th>Servico realizado</th><th>Situacao</th><th>Ocorrencias</th>
  </tr></thead><tbody>${tabelaRows}</tbody></table>
  <div class="ateste-box">
    <p>A fiscalizacao tecnica das ordens de servico listadas acima foi realizada na data de <strong>${hoje}</strong>,
    em conformidade com o disposto no art. 117 da Lei no 14.133/2021, atestando-se o recebimento definitivo
    dos servicos prestados${empresa?` pela empresa <strong>${empresa}</strong>`:''}${cpl?`, referentes ao contrato ${cpl}`:''},
    competencia <strong>${competencia}</strong>, conforme Nota Fiscal <strong>${nf}</strong>,
    no valor atestado de <strong>${_ctMoney(valor)}</strong>.</p>
  </div>
  <div class="assinatura">
    <div class="linha-assinatura"></div>
    <div><strong>${fiscal}</strong></div>
    <div style="font-size:11px;color:#555">Fiscal de Contrato - SMS Sorocaba</div>
    <div style="font-size:11px;color:#555;margin-top:2px">${hoje}</div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  <\/body><\/html>`;
}

async function confirmarGerarMedicaoFiscalizacao(){
  const competencia=document.getElementById("mta-competencia").value.trim();
  const nf=document.getElementById("mta-nf").value.trim();
  const nfData=document.getElementById("mta-nf-data")?.value||null;
  const valor=_ctNum(document.getElementById("mta-valor")?.value);
  if(!competencia||!nf||!valor){showMsg("mta","Preencha a competencia, a NF e o valor da medicao.","err");return;}
  const btn=document.querySelector("#modal-termo-ateste .btn-primary");
  btn.disabled=true;btn.textContent="Gerando...";
  const selecionadas=_fiscSelecionadasParaMedicao();
  const protocolos=selecionadas.map(r=>r.protocolo).filter(Boolean);
  const contrato=_fiscContratoDaOs(selecionadas[0]);
  if(!contrato?.id){
    showMsg("mta","Nao foi possivel identificar o contrato dessas OS.","err");
    btn.disabled=false;btn.textContent="Gerar medicao";
    return;
  }
  const contratoKeys=[...new Set(selecionadas.map(r=>String(r.contrato_id||_fiscContratoDaOs(r)?.id||r.cpl_contrato||'')).filter(Boolean))];
  if(contratoKeys.length!==1){
    showMsg("mta","Selecione OS de apenas um contrato por vez.","err");
    btn.disabled=false;btn.textContent="Gerar medicao";
    return;
  }
  const fiscal=currentProfile?.nome||currentProfile?.email||"fiscal responsavel";
  const medPayload={
    contrato_id:contrato.id,
    competencia,
    tipo_medicao:'demanda',
    data_medicao:_ctTodayISO(),
    fiscal_responsavel:fiscal,
    status:'aprovada_pelo_fiscal',
    valor_bruto:valor,
    valor_glosa:0,
    valor_liquido:valor,
    observacoes:`Medicao gerada pela Fiscalizacao a partir de ${selecionadas.length} OS: ${protocolos.join(', ')}`,
    validado_por:fiscal,
    validado_em:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const {data:med,error:medErr}=await sb.from("contratos_medicoes").insert(medPayload).select("*").single();
  if(medErr){showMsg("mta","Erro ao criar medicao: "+medErr.message,"err");btn.disabled=false;btn.textContent="Gerar medicao";return;}
  const numeroNorm=_ctNormalizedDoc(nf);
  const nfPayload={
    numero:nf,
    numero_normalizado:numeroNorm||null,
    fornecedor_id:contrato.fornecedor_id||null,
    contrato_id:contrato.id,
    processo_id:contrato.processo_id||null,
    medicao_id:med.id,
    competencia,
    data_emissao:nfData,
    data_recebimento:_ctTodayISO(),
    valor_total:valor,
    valor_bruto:valor,
    valor_liquido:valor,
    valor_glosa:0,
    valor_aprovado:valor,
    status:'aprovada',
    origem_sistema:'fiscalizacao',
    origem_codigo:med.id,
    observacoes:`NF vinculada automaticamente pela Fiscalizacao. Protocolos: ${protocolos.join(', ')}`,
    validado_por:fiscal,
    validado_em:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const {data:nfRow,error:nfErr}=await sb.from("notas_fiscais").insert(nfPayload).select("*").single();
  if(nfErr){showMsg("mta","Medicao criada, mas erro ao vincular NF: "+nfErr.message,"err");btn.disabled=false;btn.textContent="Gerar medicao";return;}
  const {data:termo,error:termoErr}=await sb.from("termos_ateste").insert({
    cpl_contrato:contrato.cpl||selecionadas[0].cpl_contrato||null,
    contrato_id:contrato.id,
    medicao_id:med.id,
    nota_fiscal_id:nfRow.id,
    competencia,
    nf_referencia:nf,
    fiscalizado_por:fiscal,
    gerado_em:_ctTodayISO(),
    protocolos,
    valor_atestado:valor
  }).select("*").single();
  if(termoErr){showMsg("mta","Medicao e NF criadas, mas erro ao registrar termo: "+termoErr.message,"err");btn.disabled=false;btn.textContent="Gerar medicao";return;}
  await sb.from("termo_contratos").insert([{termo_id:termo.id,contrato_id:contrato.id}]);
  const chIds=[...new Set(selecionadas.map(r=>r.chamado_id).filter(Boolean))];
  if(chIds.length) await sb.from("termo_chamados").insert(chIds.map(chid=>({termo_id:termo.id,chamado_id:chid})));
  await sb.from("chamados_controle").update({competencia,nf_referencia:nf,medicao_id:med.id,nota_fiscal_id:nfRow.id,termo_ateste_id:termo.id}).in("protocolo",protocolos);
  await sb.from("contratos_historico").insert({
    contrato_id:contrato.id,
    cpl:contrato.cpl||null,
    tipo:'Medicao gerada pela Fiscalizacao',
    data_evento:_ctTodayISO(),
    valor_novo:String(valor),
    obs:`Medicao ${competencia} criada com ${selecionadas.length} OS fiscalizada(s), NF ${nf}, valor ${_ctMoney(valor)}.`,
    usuario:fiscal,
    related_entity_type:'measurement',
    related_entity_id:med.id
  });
  fiscalizacaoRows.filter(r=>protocolos.includes(r.protocolo)).forEach(r=>{
    r.competencia=competencia;r.nf_referencia=nf;r.medicao_id=med.id;r.nota_fiscal_id=nfRow.id;r.termo_ateste_id=termo.id;
  });
  filtrarFiscalizacao();
  document.getElementById("modal-termo-ateste").classList.remove("active");
  btn.disabled=false;btn.textContent="Gerar medicao";
  contratosCarregado=false;
  if(window.toast) toast("Medicao, NF e termo registrados no contrato.","success");
}

async function baixarTermoAtesteMedicao(medicaoId){
  const med=(_ctMedicoesAtual||[]).find(m=>String(m.id)===String(medicaoId));
  if(!med){alert("Medicao nao encontrada.");return;}
  const termo=(_ctTermosAtual||[]).find(t=>String(t.medicao_id||'')===String(medicaoId));
  const nf=(_ctNotasAtual||[]).find(n=>String(n.medicao_id||'')===String(medicaoId));
  let protocolos=Array.isArray(termo?.protocolos)?termo.protocolos:[];
  if(!protocolos.length&&termo?.protocolos&&typeof termo.protocolos==='string'){
    try{protocolos=JSON.parse(termo.protocolos)||[];}catch(_e){protocolos=[];}
  }
  let selecionadas=(fiscalizacaoRows||[]).filter(r=>protocolos.includes(r.protocolo));
  if(!selecionadas.length&&protocolos.length){
    const {data:controle}=await sb.from("chamados_controle").select("*").in("protocolo",protocolos);
    selecionadas=(controle||[]).map(r=>({...r,_chamado:{}}));
  }
  if(!selecionadas.length){
    selecionadas=[{
      protocolo:protocolos.join(", ")||"medicao-"+medicaoId,
      os:"",
      cpl_contrato:_ctAtual?.cpl||termo?.cpl_contrato||"",
      empresa:_ctAtual?.prestador||"",
      situacao_os:"conforme",
      servico_realizado:med.data_execucao_preventiva
        ?`Manutenção preventiva/calibração executada em ${fmtDate(med.data_execucao_preventiva)}. Relatório: ${med.relatorio_servico_referencia||'referência não informada'}.`
        :(med.observacoes||"Servicos medidos")
    }];
  }
  const html=_fiscHtmlTermoAteste({
    selecionadas,
    contrato:_ctAtual,
    competencia:med.competencia||termo?.competencia||"",
    nf:nf?.numero||termo?.nf_referencia||"",
    valor:_ctNum(termo?.valor_atestado??med.valor_liquido??nf?.valor_aprovado??nf?.valor_total),
    fiscal:med.fiscal_responsavel||termo?.fiscalizado_por||currentProfile?.nome||currentProfile?.email||"fiscal responsavel",
    hoje:fmtDate(termo?.gerado_em||med.data_medicao||_ctTodayISO())||new Date().toLocaleDateString("pt-BR")
  });
  const w=window.open("","_blank");
  if(!w){alert("Nao foi possivel abrir o termo. Verifique o bloqueador de pop-up.");return;}
  w.document.write(html);
  w.document.close();
}

// ═══ SANÇÕES ADMINISTRATIVAS ═══
let sancoesRows = [];
let sancoesFiltradas = [];
let sancoesCarregado = false;
let _sancaoAtual = null;

function badgeSancao(status){
  const cfg={
    "Em análise":{bg:"var(--amber-bg)",color:"var(--amber-text)"},
    "Notificada":{bg:"var(--blue-bg)",color:"var(--blue-text)"},
    "Em defesa":{bg:"var(--purple-bg)",color:"var(--purple-text)"},
    "Aplicada":{bg:"var(--red-bg)",color:"var(--red-text)"},
    "Encerrada":{bg:"var(--green-bg)",color:"var(--green-text)"},
    "Cancelada":{bg:"var(--surface2)",color:"var(--text3)"},
  };
  const c=cfg[status]||{bg:"var(--surface2)",color:"var(--text3)"};
  return `<span class="badge" style="background:${c.bg};color:${c.color}">${status||"—"}</span>`;
}

async function loadSancoes(){
  document.getElementById("sancoes-loading").style.display="block";
  document.getElementById("sancoes-main").style.display="none";
  const {data,error}=await sb.from("sancoes_administrativas").select("*").order("created_at",{ascending:false});
  if(error){
    document.getElementById("sancoes-loading").innerHTML=`<div style="color:var(--red);max-width:720px;margin:0 auto;text-align:left;line-height:1.5">Não foi possível carregar sanções administrativas.<br><strong>Detalhe:</strong> ${error.message}<br><br>Crie no Supabase a tabela <code>sancoes_administrativas</code> com as colunas: <code>id</code>, <code>processo</code>, <code>empresa</code>, <code>contrato</code>, <code>tipo</code>, <code>status</code>, <code>valor_multa</code>, <code>data_ocorrencia</code>, <code>prazo_defesa</code>, <code>observacoes</code>, <code>created_at</code>.</div>`;
    return;
  }
  sancoesRows=data||[];
  sancoesCarregado=true;
  filtrarSancoes();
  document.getElementById("sancoes-loading").style.display="none";
  document.getElementById("sancoes-main").style.display="block";
}

function clearAllSancoes(){
  ["sa-busca","sa-status","sa-tipo"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  filtrarSancoes();
}

function filtrarSancoes(){
  const busca=normalizar(document.getElementById("sa-busca")?.value||"");
  const status=document.getElementById("sa-status")?.value||"";
  const tipo=document.getElementById("sa-tipo")?.value||"";
  sancoesFiltradas=sancoesRows.filter(r=>{
    if(status){ if(r.status!==status) return false; }
    else if(["Encerrada","Cancelada"].includes(r.status)) return false;
    if(tipo&&r.tipo!==tipo) return false;
    if(busca&&!normalizar([r.processo,r.empresa,r.contrato,r.tipo,r.status,r.observacoes].filter(Boolean).join(" ")).includes(busca)) return false;
    return true;
  });
  document.getElementById("sa-m-total").textContent=sancoesFiltradas.length;
  document.getElementById("sa-m-abertas").textContent=sancoesFiltradas.filter(r=>!["Aplicada","Encerrada","Cancelada"].includes(r.status)).length;
  document.getElementById("sa-m-aplicadas").textContent=sancoesFiltradas.filter(r=>r.status==="Aplicada").length;
  document.getElementById("sa-m-encerradas").textContent=sancoesFiltradas.filter(r=>r.status==="Encerrada").length;
  document.getElementById("sa-count").textContent=`${sancoesFiltradas.length} registro(s)`;
  renderSancoes();
}

function renderSancoes(){
  const tbody=document.getElementById("sa-body");
  if(!tbody) return;
  if(!sancoesFiltradas.length){tbody.innerHTML=`<tr><td colspan="10"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhuma sanção encontrada</div></td></tr>`;return;}
  tbody.innerHTML=sancoesFiltradas.map(r=>`<tr>
    <td style="white-space:nowrap">${podeEditar('sancoes')?`<button onclick="abrirModalSancao('${r.id}')" class="btn-secondary btn-compact" title="Editar">✏️ Editar</button>`:"—"}</td>
    <td style="font-size:11px;white-space:nowrap">${r.processo||"—"}</td>
    <td class="td-trunc" style="max-width:220px" title="${r.empresa||''}">${r.empresa||"—"}</td>
    <td style="font-size:11px;white-space:nowrap">${r.contrato||"—"}</td>
    <td>${r.tipo||"—"}</td>
    <td>${badgeSancao(r.status)}</td>
    <td style="text-align:right">${r.valor_multa?fmtFull(Number(r.valor_multa)):"—"}</td>
    <td style="font-size:11px;white-space:nowrap">${fmtDate(r.data_ocorrencia)||"—"}</td>
    <td style="font-size:11px;white-space:nowrap;color:${corVencimento(r.prazo_defesa)}">${fmtDate(r.prazo_defesa)||"—"}</td>
    <td class="td-trunc" style="max-width:260px" title="${r.observacoes||''}">${r.observacoes||"—"}</td>
  </tr>`).join("");
}

function abrirModalSancao(id=null){
  if(!podeEditar('sancoes')){alert("Sem permissão para editar sanções.");return;}
  _sancaoAtual=id;
  const r=id?sancoesRows.find(x=>String(x.id)===String(id)):null;
  document.getElementById("sa-processo").value=r?.processo||"";
  document.getElementById("sa-contrato").value=r?.contrato||"";
  document.getElementById("sa-empresa").value=r?.empresa||"";
  document.getElementById("sa-modal-tipo").value=r?.tipo||"Advertência";
  document.getElementById("sa-modal-status").value=r?.status||"Em análise";
  document.getElementById("sa-valor").value=r?.valor_multa??"";
  document.getElementById("sa-data").value=r?.data_ocorrencia||"";
  document.getElementById("sa-prazo").value=r?.prazo_defesa||"";
  document.getElementById("sa-obs").value=r?.observacoes||"";
  document.getElementById("sa-msg").className="fmsg";
  document.getElementById("modal-sancao").classList.add("active");
}

async function salvarSancao(){
  if(bloquearSeVisualiz('sancoes')) return;
  const empresa=document.getElementById("sa-empresa").value.trim();
  const tipo=document.getElementById("sa-modal-tipo").value;
  const status=document.getElementById("sa-modal-status").value;
  if(!empresa||!tipo||!status){showMsg("sa","Preencha empresa, tipo e status.","err");return;}
  const btn=document.querySelector("#modal-sancao .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={
    processo:document.getElementById("sa-processo").value.trim()||null,
    contrato:document.getElementById("sa-contrato").value.trim()||null,
    empresa,tipo,status,
    valor_multa:document.getElementById("sa-valor").value?Number(document.getElementById("sa-valor").value):null,
    data_ocorrencia:document.getElementById("sa-data").value||null,
    prazo_defesa:document.getElementById("sa-prazo").value||null,
    observacoes:document.getElementById("sa-obs").value.trim()||null,
  };
  const res=_sancaoAtual
    ? await sb.from("sancoes_administrativas").update(dados).eq("id",_sancaoAtual).select().single()
    : await sb.from("sancoes_administrativas").insert(dados).select().single();
  btn.disabled=false;btn.textContent="Salvar";
  if(res.error){showMsg("sa","Erro: "+res.error.message,"err");return;}
  showMsg("sa","✓ Salvo!","ok");
  if(_sancaoAtual) sancoesRows=sancoesRows.map(r=>String(r.id)===String(_sancaoAtual)?res.data:r);
  else sancoesRows=[res.data,...sancoesRows];
  filtrarSancoes();
  setTimeout(()=>document.getElementById("modal-sancao").classList.remove("active"),900);
}

// ═══ CONTRATOS (SUPABASE) ═══
// ── Filtros estilo Google Sheets para Contratos ──
const CONTRATO_FILTER_COLS = {
  tipo_instrumento:{get:r=>r.tipo_instrumento||'CONTRATO',disp:v=>v||'CONTRATO'},
  numero_contrato:{get:r=>r.numero_contrato||'',disp:v=>v||'(vazio)'},
  cpl:{get:r=>r.cpl||'',disp:v=>v||'(vazio)'},
  modelo_contrato:{get:r=>_ctModeloKey(r),disp:v=>_ctModeloLabelFromKey(v)},
  origem_contratacao:{get:r=>_ctOrigemKey(r),disp:v=>_ctHumanize(v||'nao_informada')},
  prestador:{get:r=>r.prestador||'',disp:v=>v||'(vazio)'},
  objeto:{get:r=>r.objeto||'',disp:v=>v||'(vazio)'},
  vigencia_atual:{get:r=>r.vigencia_atual||'',disp:v=>v||'(vazio)'},
  vencimento:{get:r=>r.vencimento||'',disp:v=>v||'(vazio)'},
  dias:{get:r=>{const d=diasContratoVencer(r.vencimento);return d==null?'':String(d);},disp:v=>v===''?'(vazio)':Number(v)<0?`Vencido (${Math.abs(Number(v))}d)`:`${v} dias`},
  status:{get:r=>r.status||'',disp:v=>v||'(vazio)'},
  secao:{get:r=>r.secao||'',disp:v=>v||'(vazio)'},
  fiscalizacao:{get:r=>r.fiscalizacao||'',disp:v=>v||'(vazio)'},
  valor_mensal:{get:r=>r.valor_mensal??'',disp:v=>v===''?'(vazio)':fmtFull(Number(v)||0)},
  valor_total:{get:r=>(r.valor_atual??r.valor_total??r.valor_inicial)??'',disp:v=>v===''?'(vazio)':fmtFull(Number(v)||0)},
  atualizado_em:{get:r=>r.atualizado_em||r.data_atualizacao||'',disp:v=>v||'(vazio)'},
};
let contratoHeaderFilters=Object.fromEntries(Object.keys(CONTRATO_FILTER_COLS).map(k=>[k,[]]));
let _ctHdrCol=null,_ctHdrPending=[];
function _ctUnique(col){
  const cfg=CONTRATO_FILTER_COLS[col];
  return [...new Set(contratosRows.map(cfg.get).map(v=>v==null?'':String(v)))]
    .sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}
function _ensureCtDropdown(){
  let dd=document.getElementById('ct-hdr-dropdown'); if(dd) return dd;
  dd=document.createElement('div'); dd.id='ct-hdr-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`<div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_ctHdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_ctHdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div><hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="ct-hdr-search" placeholder="🔍 Buscar..." oninput="_ctHdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_ctHdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="ct-hdr-count">0</span></a> — <a href="#" onclick="_ctHdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="ct-hdr-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeContratoFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmContratoFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd); return dd;
}
function openContratoFilter(e,col){
  e.stopPropagation(); const dd=_ensureCtDropdown();
  if(_ctHdrCol===col&&dd.style.display==='block'){dd.style.display='none';_ctHdrCol=null;return;}
  _ctHdrCol=col; const all=_ctUnique(col); const cur=contratoHeaderFilters[col]||[];
  _ctHdrPending=cur.length?[...cur]:[...all];
  document.getElementById('ct-hdr-search').value=''; _ctHdrRenderList();
  const rect=e.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const ddW=dd.offsetWidth||240; let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px'; dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('ct-hdr-search').focus(),50);
}
function _ctHdrRenderList(){
  const col=_ctHdrCol; if(!col) return;
  const q=normalizar(document.getElementById('ct-hdr-search').value);
  const all=_ctUnique(col); const disp=CONTRATO_FILTER_COLS[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('ct-hdr-count').textContent=all.length;
  document.getElementById('ct-hdr-list').innerHTML=vis.map(v=>{
    const checked=_ctHdrPending.includes(v)?'checked':''; const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px"><input type="checkbox" value="${safe}" ${checked} onchange="_ctHdrToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _ctHdrToggle(cb){if(cb.checked){if(!_ctHdrPending.includes(cb.value))_ctHdrPending.push(cb.value);}else{_ctHdrPending=_ctHdrPending.filter(x=>x!==cb.value);}}
function _ctHdrSelectAll(all){const col=_ctHdrCol;if(!col)return;_ctHdrPending=all?_ctUnique(col):[];_ctHdrRenderList();}
function _ctHdrSort(asc){
  const col=_ctHdrCol;
  if(!col) return;
  ctSortCol=col;
  ctSortAsc=asc;
  closeContratoFilter();
  renderTabelaContratos();
}
function confirmContratoFilter(){const col=_ctHdrCol;if(!col)return;const all=_ctUnique(col);contratoHeaderFilters[col]=(_ctHdrPending.length===0||_ctHdrPending.length===all.length)?[]:[..._ctHdrPending];document.getElementById('ct-hdr-dropdown').style.display='none';_ctHdrCol=null;_ctUpdateHdrBtns();filtrarContratos();}
function closeContratoFilter(){const dd=document.getElementById('ct-hdr-dropdown');if(dd)dd.style.display='none';_ctHdrCol=null;}
function _ctUpdateHdrBtns(){Object.keys(CONTRATO_FILTER_COLS).forEach(col=>{const btn=document.getElementById('hfc-'+col);if(btn)btn.classList.toggle('active',(contratoHeaderFilters[col]||[]).length>0);});}
document.addEventListener('click',function(e){const dd=document.getElementById('ct-hdr-dropdown');if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!(e.target.closest&&e.target.closest('.hdr-filter-btn'))){dd.style.display='none';_ctHdrCol=null;}});

let contratosRows = [];
let contratosFiltrados = [];
let contratosCarregado = false;
let _ctAtual = null;
let ctSortCol = null;
let ctSortAsc = true;
let contratosSelecionados = new Set();
let ctExpandido = {};
let ctItensPorContrato = {};
let _ctMedicoesAtual = [];
let _ctNotasAtual = [];
let _ctTermosAtual = [];
let _ctDocumentosAtual = [];
let _ctHistoricoAtual = [];
let _ctItensAtual = [];
let _ctFiscaisAtual = [];
const CT_TABLE_COLSPAN = 22;

function _ctModule(){ return window.ContratosModule||{}; }
function _ctNum(v){
  const mod=_ctModule();
  if(typeof mod.toContractNumber==='function') return mod.toContractNumber(v);
  if(v==null||v==='') return 0;
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  const n=Number(String(v).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
  return Number.isFinite(n)?n:0;
}
function _ctMoney(v){
  if(v==null||v==='') return '—';
  return fmtFull(_ctNum(v));
}
function _ctHumanize(v){
  return String(v||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
}
function _ctModeloKey(r){
  if(String(r?.periodicidade_pagamento||'').toUpperCase()==='TRIMESTRAL') return 'servico_continuo_trimestral_fixo';
  return r.modelo_contrato||r.contractModel||r.modelo||'nao_classificado';
}
function _ctModeloLabelFromKey(key){
  if(!key||key==='nao_classificado') return 'Não classificado';
  const found=(_ctModule().CONTRACT_MODELS||[]).find(m=>m.key===key);
  return found?.label||_ctHumanize(key);
}
function _ctModeloLabel(r){ return _ctModeloLabelFromKey(_ctModeloKey(r)); }
function _ctOrigemKey(r){ return r.origem_contratacao||r.procurementOrigin||r.origem||'nao_informada'; }
function _ctFormaKey(r){
  if(String(r?.periodicidade_pagamento||'').toUpperCase()==='TRIMESTRAL') return 'trimestral_fixo';
  if(String(r?.periodicidade_pagamento||'').toUpperCase()==='MENSAL') return 'mensal_fixo';
  return r.forma_execucao_pagamento||r.executionPaymentModel||r.forma_pagamento||'nao_informada';
}
function _ctPeriodicidade(r=_ctAtual){
  const explicita=String(r?.periodicidade_pagamento||'').toUpperCase();
  if(explicita==='TRIMESTRAL'||explicita==='MENSAL') return explicita;
  if((_ctItensAtual||[]).some(i=>i.origem==='servico_trimestral')) return 'TRIMESTRAL';
  if((_ctItensAtual||[]).some(i=>i.origem==='servico_mensal')) return 'MENSAL';
  return null;
}
function _ctEhTrimestral(r=_ctAtual){ return _ctPeriodicidade(r)==='TRIMESTRAL'; }
function _ctValorPeriodico(r=_ctAtual){ return _ctNum(r?.valor_periodico_num??r?.valor_mensal_num??r?.valor_mensal); }
function _ctValorInicial(r){ return _ctNum(r.valor_inicial_num??r.valor_inicial); }
function _ctValorAtual(r){ return _ctNum(r.valor_atual_num??r.valor_atual??r.valor_total??r.valor_inicial); }
function _ctValorReajustado(r){
  const mod=_ctModule();
  if(typeof mod.createContractRecord==='function'&&typeof mod.calculateInitialAdjustedValue==='function'){
    return mod.calculateInitialAdjustedValue(mod.createContractRecord(r),[],r._contractEvents||[]);
  }
  return _ctValorInicial(r);
}
function _ctAditivoUsado(r){
  const mod=_ctModule();
  if(!r._contractEvents?.length||typeof mod.createContractRecord!=='function'||typeof mod.calculateContractFinancialSummary!=='function') return null;
  const financial=mod.calculateContractFinancialSummary(mod.createContractRecord(r),[],r._contractEvents,[],[]);
  return financial.additiveContractPercent??financial.additiveLimitUsedPercent;
}
function _ctPendenciasResumo(r,mostrarSemAlerta=true){
  const tags=[];
  const dias=diasContratoVencer(r.vencimento);
  if(dias!==null&&dias<0) tags.push(['Vencido','var(--red-bg)','var(--red-text)']);
  else if(dias!==null&&dias<=90) tags.push(['Vence em 90d','var(--amber-bg)','var(--amber-text)']);
  if(!r.fiscalizacao) tags.push(['Sem fiscal','var(--red-bg)','var(--red-text)']);
  if(_ctModeloKey(r)==='nao_classificado') tags.push(['Sem modelo','var(--surface2)','var(--text3)']);
  if(r._medicoesPendentes) tags.push([`${r._medicoesPendentes} med. pend.`,'var(--amber-bg)','var(--amber-text)']);
  if(r._nfsPendentes) tags.push([`${r._nfsPendentes} NF pend.`,'var(--amber-bg)','var(--amber-text)']);
  if(r._eventosRascunho) tags.push([`${r._eventosRascunho} evento(s) rasc.`,'var(--surface2)','var(--text3)']);
  const aditivo=_ctAditivoUsado(r);
  if(aditivo!==null&&aditivo>=80) tags.push(['Aditivo >80%','var(--red-bg)','var(--red-text)']);
  return tags.length?tags.map(([t,bg,c])=>`<span class="badge" style="background:${bg};color:${c};margin-right:3px">${t}</span>`).join(''):(mostrarSemAlerta?'<span style="color:var(--text3)">Sem alerta</span>':'');
}
function abrirContratoGerencial(id){
  window._contratoGerencialId=id;
  if(location.hash!==`#/contratos/${id}`) location.hash=`#/contratos/${id}`;
  else abrirDetalheContrato(id);
}

const CT_MEDICAO_STATUS_LABELS={
  rascunho:'Rascunho',
  registrada:'Registrada',
  aprovada_pelo_fiscal:'Aprovada pelo fiscal',
  aprovada_com_glosa:'Aprovada com glosa',
  recusada:'Recusada',
  cancelada:'Cancelada'
};
const CT_NF_STATUS_LABELS={
  pendente:'Pendente',
  em_conferencia:'Em conferência',
  aprovada:'Aprovada',
  aprovada_com_glosa:'Aprovada com glosa',
  recusada:'Recusada',
  encaminhada_para_pagamento:'Encaminhada para pagamento',
  cancelada:'Cancelada'
};
function _ctStatusBadge(status,map){
  const key=String(status||'').toLowerCase();
  const label=map[key]||_ctHumanize(key||'sem_status');
  const ok=['aprovada','aprovada_pelo_fiscal','aprovada_com_glosa','encaminhada_para_pagamento'].includes(key);
  const bad=['recusada','cancelada'].includes(key);
  const bg=bad?'var(--red-bg)':ok?'var(--green-bg)':key==='rascunho'?'var(--surface2)':'var(--amber-bg)';
  const color=bad?'var(--red-text)':ok?'var(--green-text)':key==='rascunho'?'var(--text3)':'var(--amber-text)';
  return `<span class="badge" style="background:${bg};color:${color}">${label}</span>`;
}
function _ctStatusSelectHtml(status,map,entity,id){
  const current=String(status||'').toLowerCase();
  const options=Object.entries(map).map(([key,label])=>`<option value="${key}"${key===current?' selected':''}>${_sanEsc(label)}</option>`).join('');
  const handler=entity==='medicao'?'alterarStatusMedicaoContrato':'alterarStatusNotaFiscalContrato';
  return `<select aria-label="Alterar status" data-entity-id="${_sanEsc(String(id))}" onchange="${handler}(this.dataset.entityId,this.value)" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;font-size:11px;padding:4px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);cursor:pointer">${options}</select>`;
}
function _ctTodayISO(){return new Date().toISOString().slice(0,10);}
function _ctMonthISO(){return new Date().toISOString().slice(0,7);}
function _ctNormalizedDoc(v){
  if(typeof normalizarNumeroDocumento==='function') return normalizarNumeroDocumento(v);
  return String(v||'').replace(/\D/g,'');
}
function _ctDocTypeLabel(v){
  const labels={
    contrato_assinado:'Contrato assinado',
    termo_aditivo:'Termo aditivo',
    prorrogacao:'Prorrogação',
    reajuste:'Reajuste',
    supressao:'Supressão',
    apostilamento:'Apostilamento',
    alteracao_fiscal:'Alteração de fiscal',
    nota_fiscal:'Nota fiscal',
    relatorio_medicao:'Relatório de medição',
    parecer:'Parecer',
    certidao:'Certidão',
    publicacao:'Publicação',
    outro:'Outro'
  };
  return labels[v]||_ctHumanize(v||'outro');
}
function _ctRelatedTypeLabel(v){
  return {
    contract:'Contrato',
    contractEvent:'Evento contratual',
    measurement:'Medição',
    invoice:'Nota fiscal',
    history:'Histórico',
    other:'Outro'
  }[v]||_ctHumanize(v||'contrato');
}
function _ctHistDateValue(h){
  return h.data_evento||h.created_at||h.date||'';
}
function _ctItemTipo(i){
  if(i?.origem==='servico_trimestral'||_ctEhTrimestral()) return 'trimestral';
  const obs=String(i?.observacoes||i?.obs||'');
  const m=obs.match(/\[tipo_execucao:([^\]]+)\]/i);
  if(m) return m[1];
  const forma=_ctFormaKey(_ctAtual||{});
  if(forma.includes('mensal')||forma.includes('competencia')||forma.includes('continuo')) return 'mensal';
  if(forma.includes('demanda')) return 'demanda';
  if(forma.includes('ordem_servico')) return 'os';
  if(forma.includes('entrega')) return 'entrega';
  return 'demanda';
}
function _ctItemTipoLabel(v){
  return {mensal:'Mensal',trimestral:'Trimestral fixo',demanda:'Por demanda',entrega:'Por entrega',os:'Por OS',posto_equipe:'Posto/equipe',equipamento:'Equipamento',escopo:'Escopo'}[v]||_ctHumanize(v||'demanda');
}
function _ctObsSemTipo(obs=''){
  return String(obs||'').replace(/\s*\[tipo_execucao:[^\]]+\]\s*/i,'').trim();
}
function _ctObsComTipo(obs,tipo){
  const base=_ctObsSemTipo(obs);
  return `${base}${base?' ':''}[tipo_execucao:${tipo||'demanda'}]`;
}
function _ctEventStatus(h){
  const raw=String(h?.status_evento||h?.event_status||h?.status||'').toLowerCase();
  if(['rascunho','formalizado','cancelado'].includes(raw)) return raw;
  return 'formalizado';
}
function _ctEventType(h){
  const t=normalizar(h?.tipo||h?.action_type||'');
  if(t.includes('reajuste')) return 'reajuste';
  if(t.includes('aditivo')) return 'aditivo';
  if(t.includes('supress')) return 'supressao';
  if(t.includes('prorrog')||t.includes('renov')) return 'prorrogacao';
  return 'outro';
}
function _ctHistoricoToEvents(hist=[]){
  return (hist||[]).map(h=>{
    const eventType=_ctEventType(h);
    return {
      id:h.id,
      eventType,
      tipo:eventType,
      status:_ctEventStatus(h),
      percentage:h.percentual,
      impactValue:h.valor_impacto??h.impact_value??(eventType==='reajuste'?null:h.valor_novo),
      adjustedValueAfter:h.valor_reajustado??h.adjusted_value_after??(eventType==='reajuste'?h.valor_novo:null),
      affectsValue:eventType!=='reajuste',
      affectsInitialAdjustedValue:eventType==='reajuste',
      relatedEntityType:h.related_entity_type,
      relatedEntityId:h.related_entity_id,
      effectiveDate:h.data_evento,
      createdAt:h.created_at,
      notes:h.obs
    };
  }).filter(e=>['reajuste','aditivo','supressao','prorrogacao'].includes(e.eventType));
}
function _ctIsSchemaCacheError(error){
  const msg=String(error?.message||error?.details||'').toLowerCase();
  return msg.includes('schema cache')||msg.includes('column')||msg.includes('could not find');
}
async function ctRegistrarHistoricoContrato(entry={}){
  if(!_ctAtual&&!entry.contrato_id) return {error:new Error('Contrato não definido')};
  const payload={
    contrato_id:entry.contrato_id??_ctAtual.id,
    cpl:entry.cpl??_ctAtual?.cpl??null,
    tipo:entry.tipo??entry.action_type??entry.actionType??'Evento',
    action_type:entry.action_type??entry.actionType??entry.tipo??'evento',
    titulo:entry.titulo??entry.title??entry.tipo??'Evento registrado',
    data_evento:entry.data_evento??entry.date??_ctTodayISO(),
    percentual:entry.percentual??null,
    valor_novo:entry.valor_novo??null,
    valor_mensal_novo:entry.valor_mensal_novo??null,
    vigencia_nova_inicio:entry.vigencia_nova_inicio??null,
    vigencia_nova_fim:entry.vigencia_nova_fim??null,
    obs:entry.obs??entry.description??'',
    fiscalizacao_nova:entry.fiscalizacao_nova??null,
    related_entity_type:entry.related_entity_type??entry.relatedEntityType??null,
    related_entity_id:entry.related_entity_id??entry.relatedEntityId??null,
    documento_id:entry.documento_id??entry.documentId??null,
    status_evento:entry.status_evento??entry.eventStatus??entry.status??null,
    valor_impacto:entry.valor_impacto??entry.impactValue??null,
    valor_reajustado:entry.valor_reajustado??entry.adjustedValueAfter??null,
    periodicidade_calculo:entry.periodicidade_calculo??entry.paymentFrequency??null,
    periodos_considerados:entry.periodos_considerados??entry.periodsConsidered??null,
    quantidade_alterada:entry.quantidade_alterada??entry.quantityChange??null,
    valor_unitario_periodo:entry.valor_unitario_periodo??entry.periodicUnitValue??null,
    usuario:entry.usuario??currentProfile?.nome??currentProfile?.email??null
  };
  const tipoHistorico=normalizar(`${payload.tipo||''} ${payload.action_type||''}`);
  if(!payload.valor_reajustado&&tipoHistorico.includes('reajuste')&&window._cieBaseReajustadaParaSalvar){
    payload.valor_reajustado=window._cieBaseReajustadaParaSalvar;
  }
  const res=await sb.from('contratos_historico').insert(payload);
  if(!res.error||!_ctIsSchemaCacheError(res.error)) return res;
  return sb.from('contratos_historico').insert({
    contrato_id:payload.contrato_id,
    cpl:payload.cpl,
    tipo:payload.tipo,
    data_evento:payload.data_evento,
    percentual:payload.percentual,
    valor_novo:payload.valor_novo,
    valor_mensal_novo:payload.valor_mensal_novo,
    vigencia_nova_inicio:payload.vigencia_nova_inicio,
    vigencia_nova_fim:payload.vigencia_nova_fim,
    obs:payload.obs,
    fiscalizacao_nova:payload.fiscalizacao_nova,
    usuario:payload.usuario
  });
}

function _ctEventoQuantidade(h,tipo=_ctEventType(h)){
  if(h?.quantidade_alterada!=null) return Math.abs(_ctNum(h.quantidade_alterada));
  const obs=String(h?.obs||h?.notes||'');
  const padrao=tipo==='supressao'?/Qtde suprimida:\s*([\d.,]+)/i:/Qtde acrescida:\s*([\d.,]+)/i;
  const m=obs.match(padrao);
  return m?_ctNum(m[1]):0;
}
function _ctEventoMeses(h){
  if(h?.periodos_considerados!=null) return Math.max(_ctNum(h.periodos_considerados),1);
  const m=String(h?.obs||h?.notes||'').match(/(?:Meses|Trimestres|Per[ií]odos) considerados:\s*([\d.,]+)/i);
  return m?Math.max(_ctNum(m[1]),1):1;
}
function _ctEventoValorUnitario(h){
  if(h?.valor_unitario_periodo!=null) return _ctNum(h.valor_unitario_periodo);
  const m=String(h?.obs||h?.notes||'').match(/Valor unit[aá]rio usado:\s*(?:R\$\s*)?([\d.,]+)/i);
  return m?_ctNum(m[1]):0;
}
function _ctEventoItemId(h){
  return h?.related_entity_id??h?.relatedEntityId??null;
}
function _ctQuantidadeDeltaEvento(h){
  const tipo=_ctEventType(h);
  if(!['aditivo','supressao'].includes(tipo)) return 0;
  const qtde=_ctEventoQuantidade(h,tipo);
  if(!qtde) return 0;
  return tipo==='supressao'?-qtde:qtde;
}
function _ctQuantidadeInicialItem(item,historico=[]){
  const atual=Number(item?.qtde)||0;
  const itemId=String(item?.id);
  const deltaFormalizado=(historico||[]).reduce((total,h)=>{
    if(String(_ctEventoItemId(h))!==itemId||_ctEventStatus(h)!=='formalizado') return total;
    return total+_ctQuantidadeDeltaEvento(h);
  },0);
  return atual-deltaFormalizado;
}
function _ctEventoObsAtualizada(h,tipo,qtde,impacto,obsUsuario){
  let obs=String(h?.obs||'');
  const qtdeTexto=tipo==='supressao'?`Qtde suprimida: ${qtde}`:`Qtde acrescida: ${qtde}`;
  const impactoTexto=tipo==='supressao'?`Impacto redutor ${_ctMoney(impacto)}`:`Impacto ${_ctMoney(impacto)}`;
  if(/Qtde (acrescida|suprimida):\s*[\d.,]+/i.test(obs)) obs=obs.replace(/Qtde (acrescida|suprimida):\s*[\d.,]+/i,qtdeTexto);
  else obs=`${obs}${obs?'. ':''}${qtdeTexto}`;
  if(/Impacto(?: redutor)?\s+R\$\s*[\d.,]+/i.test(obs)) obs=obs.replace(/Impacto(?: redutor)?\s+R\$\s*[\d.,]+/i,impactoTexto);
  else obs=`${obs}${obs?'. ':''}${impactoTexto}`;
  obs=obs.replace(/Status:\s*[^.]+/i,'Status: formalizado');
  if(obsUsuario) obs=`${obs}. ${obsUsuario}`;
  return obs;
}
async function _ctAjustarQuantidadeItemPorEvento(h,tipo,deltaQtde){
  if(!deltaQtde||!h?.related_entity_id) return;
  const itemId=h.related_entity_id;
  const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(itemId));
  const qtdeAtual=item?Number(item.qtde||0):null;
  let base=qtdeAtual;
  if(base===null){
    const {data,error}=await sb.from('itens').select('qtde').eq('id',itemId).single();
    if(error) throw error;
    base=Number(data?.qtde||0);
  }
  const sinal=tipo==='supressao'?-1:1;
  const novaQtde=Math.max(base+(sinal*deltaQtde),0);
  const {error}=await sb.from('itens').update({qtde:novaQtde}).eq('id',itemId);
  if(error) throw error;
}
async function _ctRecalcularValorAtualContrato(contratoId){
  const [ctRes,histRes]=await Promise.all([
    sb.from('contratos').select('*').eq('id',contratoId).single(),
    sb.from('contratos_historico').select('*').eq('contrato_id',contratoId)
  ]);
  if(ctRes.error) throw ctRes.error;
  if(histRes.error) throw histRes.error;
  const eventos=_ctHistoricoToEvents(histRes.data||[]);
  const mod=_ctModule();
  let valorAtual;
  if(typeof mod.createContractRecord==='function'&&typeof mod.calculateCurrentContractValue==='function'){
    valorAtual=mod.calculateCurrentContractValue(mod.createContractRecord(ctRes.data),[],eventos);
  }else{
    const base=_ctValorInicial(ctRes.data);
    const add=eventos.filter(e=>e.eventType==='aditivo'&&e.status==='formalizado').reduce((s,e)=>s+_ctNum(e.impactValue),0);
    const sup=eventos.filter(e=>e.eventType==='supressao'&&e.status==='formalizado').reduce((s,e)=>s+Math.abs(_ctNum(e.impactValue)),0);
    valorAtual=Math.max(base+add-sup,0);
  }
  const {error}=await sb.from('contratos').update({valor_atual:valorAtual,valor_atual_num:valorAtual}).eq('id',contratoId);
  if(error) throw error;
  return valorAtual;
}
async function editarEventoContrato(eventId){
  if(bloquearSeVisualiz('contratos')) return;
  const h=(_ctHistoricoAtual||[]).find(x=>String(x.id)===String(eventId));
  const tipo=_ctEventType(h);
  if(!h||!['aditivo','supressao'].includes(tipo)){alert('Evento não encontrado para edição.');return;}
  const dataAtual=String(h.data_evento||(h.created_at||'').substring(0,10)||_ctTodayISO()).substring(0,10);
  const novaData=prompt('Data do evento (AAAA-MM-DD):',dataAtual);
  if(novaData===null) return;
  const qtdeAtual=_ctEventoQuantidade(h,tipo);
  const unit=_ctEventoValorUnitario(h);
  const meses=_ctEventoMeses(h);
  let novoImpacto=_ctNum(h.valor_impacto??h.valor_novo);
  let deltaQtde=0;
  let novaQtde=qtdeAtual;
  let novaObs=String(h.obs||'');
  if(qtdeAtual&&unit&&h.related_entity_id){
    const qtdeTxt=prompt(tipo==='supressao'?'Quantidade suprimida:':'Quantidade acrescida:',String(qtdeAtual));
    if(qtdeTxt===null) return;
    novaQtde=_ctNum(qtdeTxt);
    if(novaQtde<0){alert('A quantidade não pode ser negativa.');return;}
    deltaQtde=novaQtde-qtdeAtual;
    novoImpacto=novaQtde*unit*meses;
    const obsExtra=prompt('Observação adicional (opcional):','')||'';
    novaObs=_ctEventoObsAtualizada(h,tipo,novaQtde,novoImpacto,obsExtra.trim());
  }else{
    const valorTxt=prompt('Valor de impacto do evento:',String(novoImpacto||''));
    if(valorTxt===null) return;
    novoImpacto=_ctNum(valorTxt);
    if(novoImpacto<0){alert('O valor não pode ser negativo.');return;}
    const obsTxt=prompt('Observação:',String(h.obs||''));
    if(obsTxt===null) return;
    novaObs=obsTxt;
  }
  try{
    await _ctAjustarQuantidadeItemPorEvento(h,tipo,deltaQtde);
    const payload={data_evento:novaData||_ctTodayISO(),valor_impacto:novoImpacto,obs:novaObs,status_evento:'formalizado',usuario:currentProfile?.nome??currentProfile?.email??null};
    let res=await sb.from('contratos_historico').update(payload).eq('id',eventId).eq('contrato_id',_ctAtual.id);
    if(res.error&&_ctIsSchemaCacheError(res.error)){
      res=await sb.from('contratos_historico').update({data_evento:payload.data_evento,valor_impacto:payload.valor_impacto,obs:payload.obs}).eq('id',eventId).eq('contrato_id',_ctAtual.id);
    }
    if(res.error) throw res.error;
    await _ctRecalcularValorAtualContrato(_ctAtual.id);
    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(_ctAtual.id))||_ctAtual;
    await abrirDetalheContrato(_ctAtual.id);
    ctOpenContratoTab(tipo==='supressao'?'supressoes':'aditivos');
  }catch(e){
    alert('Erro ao editar evento: '+(e.message||e));
  }
}
async function aplicarEventoContrato(eventId){
  if(bloquearSeVisualiz('contratos')) return;
  const h=(_ctHistoricoAtual||[]).find(x=>String(x.id)===String(eventId));
  const tipo=_ctEventType(h);
  if(!h||!['aditivo','supressao'].includes(tipo)){alert('Evento não encontrado para aplicação.');return;}
  if(_ctEventStatus(h)==='formalizado') return;
  if(!await uiConfirm(`Aplicar este ${tipo==='supressao'?'supressão':'aditivo'} agora? A quantidade do item e o valor atual do contrato serão atualizados.`)) return;
  try{
    const qtde=_ctEventoQuantidade(h,tipo);
    await _ctAjustarQuantidadeItemPorEvento(h,tipo,qtde);
    const obs=String(h.obs||'').replace(/Status:\s*[^.]+/i,'Status: formalizado');
    let res=await sb.from('contratos_historico').update({status_evento:'formalizado',obs,usuario:currentProfile?.nome??currentProfile?.email??null}).eq('id',eventId).eq('contrato_id',_ctAtual.id);
    if(res.error&&_ctIsSchemaCacheError(res.error)){
      res=await sb.from('contratos_historico').update({obs}).eq('id',eventId).eq('contrato_id',_ctAtual.id);
    }
    if(res.error) throw res.error;
    await _ctRecalcularValorAtualContrato(_ctAtual.id);
    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(_ctAtual.id))||_ctAtual;
    await abrirDetalheContrato(_ctAtual.id);
    ctOpenContratoTab(tipo==='supressao'?'supressoes':'aditivos');
  }catch(e){
    alert('Erro ao aplicar evento: '+(e.message||e));
  }
}
async function excluirEventoContrato(eventId){
  if(bloquearSeVisualiz('contratos')) return;
  const h=(_ctHistoricoAtual||[]).find(x=>String(x.id)===String(eventId));
  const tipo=_ctEventType(h);
  if(!h||!['aditivo','supressao'].includes(tipo)){alert('Evento não encontrado para exclusão.');return;}
  if(!await uiConfirm(`Excluir este ${tipo==='supressao'?'supressão':'aditivo'}?`)) return;
  try{
    const qtde=_ctEventoQuantidade(h,tipo);
    await _ctAjustarQuantidadeItemPorEvento(h,tipo,-qtde);
    const {error}=await sb.from('contratos_historico').delete().eq('id',eventId).eq('contrato_id',_ctAtual.id);
    if(error) throw error;
    await _ctRecalcularValorAtualContrato(_ctAtual.id);
    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(_ctAtual.id))||_ctAtual;
    await abrirDetalheContrato(_ctAtual.id);
    ctOpenContratoTab(tipo==='supressao'?'supressoes':'aditivos');
  }catch(e){
    alert('Erro ao excluir evento: '+(e.message||e));
  }
}

async function loadContratos(){
  document.getElementById("contratos-loading").style.display="block";
  document.getElementById("contratos-main").style.display="none";
  const [ctRes,forRes,medRes,nfRes,histRes]=await Promise.all([
    sb.from("contratos").select("*"),
    sb.from("fornecedores").select("id,razao_social,cnpj_normalizado"),
    sb.from("contratos_medicoes").select("contrato_id,status"),
    sb.from("notas_fiscais").select("contrato_id,status"),
    sb.from("contratos_historico").select("*")
  ]);
  if(ctRes.error||forRes.error){document.getElementById("contratos-loading").innerHTML=`<div style="color:var(--red)">Erro ao carregar contratos: ${(ctRes.error||forRes.error).message}</div>`;return;}
  const secaoPredialIds=(ctRes.data||[]).filter(c=>/^SUEQ\s*-\s*PREDIAL$/i.test(String(c.secao||'').trim())).map(c=>c.id);
  if(secaoPredialIds.length){
    const {error:normalizacaoErro}=await sb.from("contratos").update({secao:"SMCP"}).in("id",secaoPredialIds);
    if(normalizacaoErro) console.warn("Não foi possível persistir a normalização SUEQ - PREDIAL → SMCP:",normalizacaoErro);
  }
  const fornecedores=new Map((forRes.data||[]).map(f=>[String(f.id),f]));
  const countBy=(rows=[],pred=()=>true)=>rows.reduce((m,r)=>{if(pred(r)){const k=String(r.contrato_id);m[k]=(m[k]||0)+1;}return m;},{});
  const medPend=countBy(medRes.error?[]:(medRes.data||[]),r=>['rascunho','registrada'].includes(String(r.status||'').toLowerCase()));
  const nfPend=countBy(nfRes.error?[]:(nfRes.data||[]),r=>['pendente','em_conferencia'].includes(String(r.status||'').toLowerCase()));
  const eventosRasc=countBy(histRes.error?[]:(histRes.data||[]),r=>String(r.status_evento||'').toLowerCase()==='rascunho');
  const eventosPorContrato=(histRes.error?[]:(histRes.data||[])).reduce((m,h)=>{const k=String(h.contrato_id);(m[k]||(m[k]=[])).push(h);return m;},{});
  contratosRows=(ctRes.data||[]).map(c=>{
    const f=fornecedores.get(String(c.fornecedor_id));
    const secao=/^SUEQ\s*-\s*PREDIAL$/i.test(String(c.secao||'').trim())?"SMCP":c.secao;
    return {...c,secao,tipo_instrumento:c.tipo_instrumento||"CONTRATO",prestador:f?.razao_social||c.prestador||"",cnpj_fornecedor:f?.cnpj_normalizado||c.cnpj||"",_contractEvents:_ctHistoricoToEvents(eventosPorContrato[String(c.id)]||[]),_medicoesPendentes:medPend[String(c.id)]||0,_nfsPendentes:nfPend[String(c.id)]||0,_eventosRascunho:eventosRasc[String(c.id)]||0};
  }).sort((a,b)=>{
    const ord={VIGENTE:0,SUSPENSO:1,CONCLUIDO:2,ENCERRADO:3};
    const oa=ord[a.status]??3, ob=ord[b.status]??3;
    if(oa!==ob) return oa-ob;
    const da=parseDataBR(a.vencimento)||new Date(0);
    const db=parseDataBR(b.vencimento)||new Date(0);
    return da-db;
  });
  contratosCarregado=true;
  ctItensPorContrato={}; // força reconsulta dos itens expandidos, dados podem ter mudado
  popularFiltrosContratos();
  filtrarContratos();
  document.getElementById("contratos-loading").style.display="none";
  document.getElementById("contratos-main").style.display="block";
}

function popularFiltrosContratos(){ _ctUpdateHdrBtns(); }

// ── Fornecedores: seletor no cadastro de contrato ──
let _fornecedoresCache=null;
async function carregarFornecedores(force){
  if(_fornecedoresCache && !force) return _fornecedoresCache;
  const {data}=await sb.from("fornecedores").select("id,cnpj_normalizado,razao_social").order("razao_social");
  _fornecedoresCache=data||[];
  return _fornecedoresCache;
}
function formatCNPJ(d){
  d=(d||"").replace(/\D/g,"");
  if(d.length===14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");
  if(d.length===11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4");
  return d;
}
// --- Combobox de fornecedor genérico (nc = novo contrato, ec = editar contrato) ---
async function _fornComboCarregar(pfx){
  const options=document.getElementById(pfx+"-fornecedor-options");
  if(options) options.innerHTML='<div class="company-combobox-empty">Carregando empresas...</div>';
  const lista=await carregarFornecedores();
  const sel=document.getElementById(pfx+"-fornecedor");
  if(sel) sel.innerHTML='<option value="">Selecione a empresa...</option>'+lista.map(f=>`<option value="${f.id}" data-cnpj="${_sanEsc(f.cnpj_normalizado||'')}">${_sanEsc(f.razao_social||'(sem nome)')}</option>`).join('');
  _fornComboFiltrar(pfx);
}
function _fornComboFiltrar(pfx){
  const termo=normalizar(document.getElementById(pfx+"-fornecedor-busca")?.value||"");
  const lista=(_fornecedoresCache||[]).filter(f=>!termo||normalizar(`${f.razao_social||''} ${f.cnpj_normalizado||''} ${formatCNPJ(f.cnpj_normalizado||'')}`).includes(termo));
  const atual=document.getElementById(pfx+"-fornecedor")?.value||"";
  const options=document.getElementById(pfx+"-fornecedor-options");
  if(!options) return;
  options.innerHTML=lista.length?lista.map(f=>`<button type="button" class="company-combobox-option${String(f.id)===atual?' selected':''}" role="option" aria-selected="${String(f.id)===atual}" data-fornecedor-id="${_sanEsc(String(f.id))}" onclick="_fornComboSelecionar('${pfx}',this.dataset.fornecedorId)"><span class="company-combobox-option-name">${_sanEsc(f.razao_social||'(sem nome)')}</span><span class="company-combobox-option-cnpj">${_sanEsc(formatCNPJ(f.cnpj_normalizado||'')||'CNPJ não informado')}</span></button>`).join('')
    :'<div class="company-combobox-empty">Nenhuma empresa encontrada</div>';
}
function _fornComboFechar(pfx){
  const combo=document.getElementById(pfx+"-fornecedor-combobox");
  if(combo) combo.classList.remove("open");
  const trigger=document.getElementById(pfx+"-fornecedor-trigger");
  if(trigger) trigger.setAttribute("aria-expanded","false");
}
function _fornComboAbrirFechar(pfx,event){
  event?.stopPropagation();
  const combo=document.getElementById(pfx+"-fornecedor-combobox");
  if(!combo) return;
  const abrir=!combo.classList.contains("open");
  _fornComboFechar(pfx);
  if(abrir){
    combo.classList.add("open");
    document.getElementById(pfx+"-fornecedor-trigger").setAttribute("aria-expanded","true");
    const busca=document.getElementById(pfx+"-fornecedor-busca");
    busca.value=""; _fornComboFiltrar(pfx);
    setTimeout(()=>busca.focus(),0);
  }
}
function _fornComboSelecionar(pfx,id){
  const sel=document.getElementById(pfx+"-fornecedor");
  const fornecedor=(_fornecedoresCache||[]).find(f=>String(f.id)===String(id));
  if(!sel||!fornecedor) return;
  sel.value=String(fornecedor.id);
  const label=document.getElementById(pfx+"-fornecedor-label");
  label.textContent=fornecedor.razao_social||'(sem nome)';
  label.classList.remove("company-combobox-placeholder");
  if(pfx==='nc') ncFornecedorChange(); else ecFornecedorChange();
  _fornComboFechar(pfx);
  document.getElementById(pfx+"-fornecedor-trigger").focus();
}
// Wrappers NC (preservam assinaturas existentes chamadas no HTML)
async function preencherSelectFornecedores(){ await _fornComboCarregar('nc'); }
function filtrarFornecedoresContrato(){ _fornComboFiltrar('nc'); }
function abrirFecharFornecedorCombo(event){ _fornComboAbrirFechar('nc',event); }
function fecharFornecedorCombo(){ _fornComboFechar('nc'); }
function selecionarFornecedorContrato(id){ _fornComboSelecionar('nc',id); }
function teclaFornecedorCombo(event){ if(["Enter"," ","ArrowDown"].includes(event.key)){event.preventDefault();abrirFecharFornecedorCombo(event);} }
function teclaBuscaFornecedor(event){ if(event.key==="Escape"){event.preventDefault();fecharFornecedorCombo();document.getElementById("nc-fornecedor-trigger").focus();return;} if(event.key==="ArrowDown"){const p=document.querySelector("#nc-fornecedor-options .company-combobox-option");if(p){event.preventDefault();p.focus();}} }
function selecionarNovaEmpresaContrato(){ const sel=document.getElementById("nc-fornecedor");if(!sel)return;if(![...sel.options].some(o=>o.value==="__nova__"))sel.add(new Option("Cadastrar nova empresa","__nova__"));sel.value="__nova__";const label=document.getElementById("nc-fornecedor-label");label.textContent="Nova empresa";label.classList.remove("company-combobox-placeholder");fecharFornecedorCombo();ncFornecedorChange(); }
// Wrappers EC (editar contrato)
async function preencherSelectFornecedoresEc(){ await _fornComboCarregar('ec'); }
function filtrarFornecedoresContratoEc(){ _fornComboFiltrar('ec'); }
function abrirFecharFornecedorComboEc(event){ _fornComboAbrirFechar('ec',event); }
function fecharFornecedorComboEc(){ _fornComboFechar('ec'); }
function teclaFornecedorComboEc(event){ if(["Enter"," ","ArrowDown"].includes(event.key)){event.preventDefault();abrirFecharFornecedorComboEc(event);} }
function teclaBuscaFornecedorEc(event){ if(event.key==="Escape"){event.preventDefault();fecharFornecedorComboEc();document.getElementById("ec-fornecedor-trigger").focus();return;} if(event.key==="ArrowDown"){const p=document.querySelector("#ec-fornecedor-options .company-combobox-option");if(p){event.preventDefault();p.focus();}} }
function selecionarNovaEmpresaContratoEc(){ const sel=document.getElementById("ec-fornecedor");if(!sel)return;if(![...sel.options].some(o=>o.value==="__nova__"))sel.add(new Option("Cadastrar nova empresa","__nova__"));sel.value="__nova__";const label=document.getElementById("ec-fornecedor-label");label.textContent="Nova empresa";label.classList.remove("company-combobox-placeholder");fecharFornecedorComboEc();ecFornecedorChange(); }
document.addEventListener("click",event=>{
  if(!event.target.closest?.("#nc-fornecedor-combobox")) fecharFornecedorCombo();
  if(!event.target.closest?.("#ec-fornecedor-combobox")) fecharFornecedorComboEc();
});
function ncFornecedorChange(){
  const sel=document.getElementById("nc-fornecedor");
  const inpNome=document.getElementById("nc-prestador");
  const inpCnpj=document.getElementById("nc-cnpj");
  if(sel.value==="__nova__"){
    inpNome.style.display=""; inpNome.value=""; inpNome.focus();
    inpCnpj.readOnly=false; inpCnpj.value="";
  } else if(sel.value){
    inpNome.style.display="none";
    inpNome.value=sel.options[sel.selectedIndex].text;
    inpCnpj.value=formatCNPJ(sel.options[sel.selectedIndex].getAttribute("data-cnpj")||"");
    inpCnpj.readOnly=true;
  } else {
    inpNome.style.display="none"; inpNome.value="";
    inpCnpj.readOnly=false; inpCnpj.value="";
  }
}
function ecFornecedorChange(){
  const sel=document.getElementById("ec-fornecedor");
  const inpNome=document.getElementById("ec-prestador");
  const inpCnpj=document.getElementById("ec-cnpj");
  if(sel.value==="__nova__"){
    inpNome.style.display=""; inpNome.value=""; inpNome.focus();
    if(inpCnpj){inpCnpj.readOnly=false; inpCnpj.value="";}
  } else if(sel.value){
    inpNome.style.display="none";
    if(inpCnpj){inpCnpj.value=formatCNPJ(sel.options[sel.selectedIndex].getAttribute("data-cnpj")||"");inpCnpj.readOnly=true;}
  } else {
    inpNome.style.display="none"; inpNome.value="";
    if(inpCnpj){inpCnpj.readOnly=false; inpCnpj.value="";}
  }
}
async function preencherSelectSecoes(selId, comNovo, valorAtual){
  const sel=document.getElementById(selId); if(!sel) return;
  const {data}=await sb.from('secoes').select('sigla,nome').eq('ativo',true).order('sigla');
  const lista=data||[];
  let opts='<option value="">Selecione a seção...</option>'
    + lista.map(s=>`<option value="${_sanEsc(s.sigla)}">${_sanEsc(s.sigla)}${s.nome?(' — '+_sanEsc(s.nome)):''}</option>`).join('');
  if(valorAtual && !lista.some(s=>s.sigla===valorAtual)) opts+=`<option value="${_sanEsc(valorAtual)}">${_sanEsc(valorAtual)}</option>`;
  if(comNovo) opts+='<option value="__nova__">➕ Cadastrar nova seção</option>';
  sel.innerHTML=opts;
  const inp=document.getElementById('nc-secao-novo'); if(inp && selId==='nc-secao'){ inp.style.display='none'; inp.value=''; }
}
function ncSecaoChange(){
  const sel=document.getElementById("nc-secao"), inp=document.getElementById("nc-secao-novo");
  if(!inp) return;
  if(sel.value==='__nova__'){ inp.style.display=''; inp.value=''; inp.focus(); }
  else { inp.style.display='none'; inp.value=''; }
}
async function obterOuCriarSecao(sigla){ if(!sigla) return; await sb.from('secoes').upsert({sigla},{onConflict:'sigla',ignoreDuplicates:true}); }
function selNovoToggle(selId){
  const sel=document.getElementById(selId), inp=document.getElementById(selId+'-novo');
  if(!inp) return;
  const novo = sel.value==='__novo__';
  inp.style.display=novo?'':'none'; inp.value=''; if(novo) inp.focus();
}
function selValorTexto(selId){
  const sel=document.getElementById(selId); if(!sel) return '';
  if(sel.value==='__novo__'){ const inp=document.getElementById(selId+'-novo'); return inp?inp.value.trim():''; }
  return sel.value||'';
}
async function preencherSelectPessoas(selId, comNovo, valorAtual){
  const sel=document.getElementById(selId); if(!sel) return;
  const {data}=await sb.from('pessoas').select('nome').eq('ativo',true).order('nome');
  const lista=data||[];
  let opts='<option value="">Selecione...</option>'+lista.map(p=>`<option value="${_sanEsc(p.nome)}">${_sanEsc(p.nome)}</option>`).join('');
  if(valorAtual && !lista.some(p=>p.nome===valorAtual)) opts+=`<option value="${_sanEsc(valorAtual)}">${_sanEsc(valorAtual)}</option>`;
  if(comNovo) opts+='<option value="__novo__">➕ Cadastrar nova pessoa</option>';
  sel.innerHTML=opts;
  const inp=document.getElementById(selId+'-novo'); if(inp){ inp.style.display='none'; inp.value=''; }
}
async function obterOuCriarPessoa(nome){
  if(!nome) return;
  const {data:ex}=await sb.from('pessoas').select('id').ilike('nome',nome).limit(1);
  if(ex&&ex.length) return;
  await sb.from('pessoas').insert({nome});
}
// ══ Select pesquisável (multi) estilo Select2 — componente vanilla reutilizável ══
// Envolve um <select multiple> existente, mantendo-o oculto e sincronizado.
// Quem já lê selectedOptions / dispara change continua funcionando sem alteração.
function enhanceMultiSelect(sel, opts){
  if(!sel) return null;
  opts=opts||{};
  if(sel._ss){ sel._ss.render(); return sel._ss; }
  sel.style.display='none';
  const ph=opts.placeholder||'Pesquisar...';
  const box=document.createElement('div'); box.className='ss-box';
  const control=document.createElement('div'); control.className='ss-control';
  const input=document.createElement('input'); input.type='text'; input.className='ss-input'; input.placeholder=ph;
  const dropdown=document.createElement('div'); dropdown.className='ss-dropdown'; dropdown.style.display='none';
  control.appendChild(input); box.appendChild(control); box.appendChild(dropdown);
  sel.parentNode.insertBefore(box, sel.nextSibling);
  let activeIdx=-1;
  const allOpts=()=>[...sel.options];
  const selOpts=()=>allOpts().filter(o=>o.selected);
  function setSel(value,on){ const o=allOpts().find(o=>o.value===value); if(!o)return; o.selected=on; sel.dispatchEvent(new Event('change',{bubbles:true})); render(); }
  function renderChips(){
    [...control.querySelectorAll('.ss-chip')].forEach(c=>c.remove());
    const sels=selOpts();
    sels.forEach(o=>{
      const chip=document.createElement('span'); chip.className='ss-chip';
      const t=document.createElement('span'); t.textContent=o.textContent; chip.appendChild(t);
      const b=document.createElement('button'); b.type='button'; b.textContent='×';
      b.onclick=e=>{ e.stopPropagation(); setSel(o.value,false); input.focus(); };
      chip.appendChild(b); control.insertBefore(chip,input);
    });
    input.placeholder=sels.length?'':ph;
  }
  function renderDropdown(){
    const q=input.value.trim().toLowerCase();
    const list=allOpts().filter(o=>o.value!=='' && o.textContent.toLowerCase().includes(q));
    if(!list.length){ dropdown.innerHTML='<div class="ss-empty">Nenhum resultado</div>'; return; }
    dropdown.innerHTML='';
    list.forEach((o,i)=>{
      const d=document.createElement('div');
      d.className='ss-opt'+(o.selected?' ss-sel':'')+(i===activeIdx?' ss-active':'');
      d.textContent=o.textContent;
      d.onmousedown=e=>{ e.preventDefault(); setSel(o.value,!o.selected); input.value=''; activeIdx=-1; renderDropdown(); };
      dropdown.appendChild(d);
    });
  }
  function open(){ dropdown.style.display='block'; control.classList.add('ss-open'); renderDropdown(); }
  function close(){ dropdown.style.display='none'; control.classList.remove('ss-open'); activeIdx=-1; }
  function render(){ renderChips(); if(dropdown.style.display==='block') renderDropdown(); }
  control.addEventListener('click',()=>{ input.focus(); open(); });
  input.addEventListener('input',open);
  input.addEventListener('keydown',e=>{
    const ds=[...dropdown.querySelectorAll('.ss-opt')];
    if(e.key==='ArrowDown'){ e.preventDefault(); if(dropdown.style.display!=='block')open(); activeIdx=Math.min(activeIdx+1,ds.length-1); renderDropdown(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); activeIdx=Math.max(activeIdx-1,0); renderDropdown(); }
    else if(e.key==='Enter'){ if(activeIdx>=0&&ds[activeIdx]){ e.preventDefault(); ds[activeIdx].dispatchEvent(new MouseEvent('mousedown')); } }
    else if(e.key==='Backspace'&&input.value===''){ const s=selOpts(); if(s.length) setSel(s[s.length-1].value,false); }
    else if(e.key==='Escape'){ close(); }
  });
  document.addEventListener('mousedown',e=>{ if(!box.contains(e.target)) close(); });
  const mo=new MutationObserver(()=>render()); mo.observe(sel,{childList:true});
  sel._ss={render,open,close};
  render();
  return sel._ss;
}
// ══ Select pesquisável (single) — enriquece <select> simples com busca interna ══
function enhanceSelect(sel, opts){
  if(!sel || sel.multiple) return null;
  opts=opts||{};
  if(sel._ss){ sel._ss.render(); return sel._ss; }
  const phSel=opts.emptyText||'Selecione...';
  const phSearch=opts.placeholder||'🔍 Pesquisar...';
  sel.style.display='none';
  const box=document.createElement('div'); box.className='ss-box ss-single';
  const control=document.createElement('div'); control.className='ss-control';
  const value=document.createElement('span'); value.className='ss-value';
  const input=document.createElement('input'); input.type='text'; input.className='ss-input'; input.placeholder=phSearch; input.style.display='none';
  const caret=document.createElement('span'); caret.className='ss-caret'; caret.textContent='▾';
  const dropdown=document.createElement('div'); dropdown.className='ss-dropdown'; dropdown.style.display='none';
  control.appendChild(value); control.appendChild(input); control.appendChild(caret);
  box.appendChild(control); box.appendChild(dropdown);
  sel.parentNode.insertBefore(box, sel.nextSibling);
  let activeIdx=-1;
  const allOpts=()=>[...sel.options];
  function current(){ return sel.options[sel.selectedIndex]||null; }
  function renderValue(){
    const c=current(); const has=c && c.value!=='';
    value.textContent=has?c.textContent:phSel;
    value.classList.toggle('ss-ph',!has);
  }
  function pick(o){
    sel.selectedIndex=[...sel.options].indexOf(o);
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    renderValue(); close();
  }
  function renderDropdown(){
    const q=input.value.trim().toLowerCase();
    const list=allOpts().filter(o=>o.textContent.toLowerCase().includes(q));
    if(!list.length){ dropdown.innerHTML='<div class="ss-empty">Nenhum resultado</div>'; return; }
    dropdown.innerHTML='';
    list.forEach((o,i)=>{
      const d=document.createElement('div');
      d.className='ss-opt'+(o.selected?' ss-sel':'')+(i===activeIdx?' ss-active':'');
      d.textContent=o.textContent||(o.value===''?phSel:'');
      d.onmousedown=e=>{ e.preventDefault(); pick(o); };
      dropdown.appendChild(d);
    });
  }
  // posiciona o dropdown com position:fixed relativo ao controle, escapando de
  // qualquer ancestral com overflow:hidden (ex.: o bloco de licitação) que antes cortava a lista.
  function positionDropdown(){
    const r=control.getBoundingClientRect();
    dropdown.style.position='fixed';
    dropdown.style.left=r.left+'px';
    dropdown.style.right='auto';
    dropdown.style.width=r.width+'px';
    const espacoAbaixo=window.innerHeight-r.bottom;
    if(espacoAbaixo<240 && r.top>espacoAbaixo){
      dropdown.style.top='auto'; dropdown.style.bottom=(window.innerHeight-r.top+2)+'px';
    }else{
      dropdown.style.bottom='auto'; dropdown.style.top=(r.bottom+2)+'px';
    }
  }
  function open(){
    dropdown.style.display='block'; control.classList.add('ss-open');
    value.style.display='none'; input.style.display=''; input.value=''; activeIdx=-1;
    renderDropdown(); positionDropdown(); input.focus();
    window.addEventListener('scroll',positionDropdown,true);
    window.addEventListener('resize',positionDropdown);
  }
  function close(){
    dropdown.style.display='none'; control.classList.remove('ss-open');
    input.style.display='none'; value.style.display=''; activeIdx=-1;
    window.removeEventListener('scroll',positionDropdown,true);
    window.removeEventListener('resize',positionDropdown);
  }
  function render(){ renderValue(); if(dropdown.style.display==='block') renderDropdown(); }
  control.addEventListener('click',()=>{ if(dropdown.style.display==='block') close(); else open(); });
  input.addEventListener('input',()=>{ activeIdx=-1; renderDropdown(); });
  input.addEventListener('keydown',e=>{
    const ds=[...dropdown.querySelectorAll('.ss-opt')];
    if(e.key==='ArrowDown'){ e.preventDefault(); activeIdx=Math.min(activeIdx+1,ds.length-1); renderDropdown(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); activeIdx=Math.max(activeIdx-1,0); renderDropdown(); }
    else if(e.key==='Enter'){ e.preventDefault(); if(activeIdx>=0&&ds[activeIdx]) ds[activeIdx].dispatchEvent(new MouseEvent('mousedown')); }
    else if(e.key==='Escape'){ close(); }
  });
  document.addEventListener('mousedown',e=>{ if(!box.contains(e.target)) close(); });
  const mo=new MutationObserver(()=>render()); mo.observe(sel,{childList:true});
  // reflete sel.value=... atribuído programaticamente
  try{
    const desc=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
    Object.defineProperty(sel,'value',{configurable:true,get(){return desc.get.call(sel);},set(v){desc.set.call(sel,v); renderValue();}});
  }catch(_){}
  sel._ss={render,open,close};
  renderValue();
  return sel._ss;
}
// Requisito global: todo <select> simples com mais de 10 opções ganha campo de busca interno.
// Opt-out por elemento: data-search="off".
function autoEnhanceSelects(root){
  (root||document).querySelectorAll('select:not([multiple])').forEach(sel=>{
    if(sel._ss || sel.dataset.search==='off') return;
    if(sel.options.length>10) enhanceSelect(sel);
  });
}
(function _initSelectSearchObserver(){
  let queued=false;
  const run=()=>{ queued=false; autoEnhanceSelects(document); _scanResizableTables(); };
  const schedule=()=>{ if(!queued){ queued=true; setTimeout(run,120); } };
  const obs=new MutationObserver(muts=>{
    for(const m of muts){
      const t=m.target;
      if((t && (t.tagName==='SELECT'||t.tagName==='OPTGROUP')) || (m.addedNodes&&m.addedNodes.length)){ schedule(); break; }
    }
  });
  const start=()=>{ try{ obs.observe(document.body,{childList:true,subtree:true}); autoEnhanceSelects(document); _scanResizableTables(); }catch(_){} };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
// Colunas redimensionáveis (arrastar borda do cabeçalho, como no Google Sheets).
// Aplicado automaticamente a toda tabela dentro de .table-wrap/#pl-table-wrap (ver _scanResizableTables).
function makeColumnsResizable(table){
  if(typeof table==='string') table=document.getElementById(table);
  if(!table||table._resizableInit) return false;
  if(table.offsetWidth===0) return false; // painel ainda oculto: tentar novamente depois
  const ths=[...table.querySelectorAll('thead th')];
  if(!ths.length) return false;
  // captura as larguras já calculadas pelo layout automático (com base no conteúdo real)
  // ANTES de travar a tabela em table-layout:fixed, para não alterar a aparência atual.
  const widths=ths.map(th=>parseFloat(th.style.width)||th.offsetWidth);
  table._resizableInit=true;
  table.classList.add('resizable-table');
  let total=0;
  ths.forEach((th,i)=>{
    th.classList.add('resizable-th');
    const w=widths[i];
    th.style.width=w+'px';
    total+=w;
    const resizer=document.createElement('span');
    resizer.className='col-resizer';
    th.appendChild(resizer);
    let startX=0,startWidth=0;
    const onMove=e=>{
      const dx=e.clientX-startX;
      const newWidth=Math.max(40,startWidth+dx);
      total+=newWidth-parseFloat(th.style.width);
      th.style.width=newWidth+'px';
      table.style.width=total+'px';
    };
    const onUp=()=>{
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      resizer.classList.remove('col-resizing');
    };
    resizer.addEventListener('mousedown',e=>{
      e.preventDefault(); e.stopPropagation();
      startX=e.clientX; startWidth=th.offsetWidth;
      resizer.classList.add('col-resizing');
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
    resizer.addEventListener('click',e=>e.stopPropagation());
  });
  table.style.width=total+'px';
  return true;
}
// Varre todas as tabelas de dados do site e ativa o redimensionamento assim que
// cada uma estiver visível e com linhas reais (não placeholder de "carregando").
function _scanResizableTables(){
  document.querySelectorAll('.table-wrap table, #pl-table-wrap table').forEach(table=>{
    if(table._resizableInit) return;
    const thead=table.querySelector('thead');
    const tbody=table.querySelector('tbody');
    const firstRow=tbody&&tbody.querySelector('tr');
    if(!thead||!firstRow) return;
    const ths=thead.querySelectorAll('th');
    const tds=firstRow.querySelectorAll('td');
    if(!ths.length||tds.length<ths.length) return; // linha placeholder (colspan) — aguardar dados reais
    makeColumnsResizable(table);
  });
}
(function _initResizableTables(){
  const start=()=>{ _scanResizableTables(); setTimeout(_scanResizableTables,400); setTimeout(_scanResizableTables,1200); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
// Fase 10: múltiplos fiscais + empenhos no Gerar Contrato
async function _ncPreencherFiscalMulti(){
  const sel=document.getElementById('nc-fiscalizacao'); if(!sel) return;
  const {data}=await sb.from('pessoas').select('nome').eq('ativo',true).order('nome');
  sel.innerHTML=(data||[]).map(p=>`<option value="${_sanEsc(p.nome)}">${_sanEsc(p.nome)}</option>`).join('');
  enhanceMultiSelect(sel,{placeholder:'Pesquisar fiscal...'});
  const novo=document.getElementById('nc-fiscalizacao-novo'); if(novo) novo.value='';
}
function _ncColetarFiscais(){
  const sel=document.getElementById('nc-fiscalizacao');
  const nomes=sel?[...sel.selectedOptions].map(o=>o.value):[];
  const novoTxt=(document.getElementById('nc-fiscalizacao-novo')?.value||'').trim();
  if(novoTxt) novoTxt.split(',').map(s=>s.trim()).filter(Boolean).forEach(n=>{ if(!nomes.includes(n)) nomes.push(n); });
  return nomes;
}
// ── Empenhos por item (AQUISIÇÃO) ─────────────────────────────────────────────
function _ncEmpItemHtml(sid){
  const inp='font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
  return `<div class="nci-emp-section" id="nci-emp-sec-${sid}" style="display:none;margin-top:6px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--surface2)">
    <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">Empenhos <span style="font-weight:400;color:var(--red)">*obrigatório</span></div>
    <div id="nci-emp-lista-${sid}" style="margin-bottom:4px"><span style="font-size:11px;color:var(--text3)">Nenhum empenho vinculado</span></div>
    <button type="button" onclick="_ncAbrirPickerEmp('${sid}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--blue);background:transparent;color:var(--blue);cursor:pointer">+ Vincular empenho</button>
    <div id="nci-emp-picker-${sid}" style="display:none;margin-top:6px;padding:8px;border:1px solid var(--blue);border-radius:4px;background:var(--surface)">
      <select id="nci-emp-sel-${sid}" onchange="_ncEmpSelChange('${sid}')" style="width:100%;margin-bottom:6px;${inp}"><option value="">Selecione...</option></select>
      <div id="nci-emp-form-novo-${sid}" style="display:none;margin-bottom:6px;padding:6px;border:1px dashed var(--border);border-radius:4px">
        <div style="font-size:11px;font-weight:600;margin-bottom:4px">Novo empenho</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <input type="text" id="nci-emp-nro-${sid}" placeholder="Número *" style="flex:1;min-width:100px;${inp}">
          <input type="number" id="nci-emp-ano-${sid}" placeholder="Ano" style="width:65px;${inp}">
          <input type="number" id="nci-emp-vlnovo-${sid}" placeholder="Valor R$ *" step="any" style="width:110px;${inp}">
          <input type="text" id="nci-emp-desp-${sid}" placeholder="Nº Despesa" style="width:100px;${inp}">
          <input type="date" id="nci-emp-dat-${sid}" style="width:130px;${inp}">
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
          <select id="nci-emp-fonte-${sid}" title="Fonte" style="width:140px;${inp}"></select>
          <input type="text" id="nci-emp-fontedesc-${sid}" placeholder="Detalhe da fonte" style="flex:1;min-width:120px;${inp}">
          <select id="nci-emp-emenda-${sid}" title="Emenda (opcional)" style="flex:1;min-width:160px;${inp}"></select>
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
        <input type="number" id="nci-emp-qtde-${sid}" placeholder="Qtde deste item" step="any" style="flex:1;min-width:90px;${inp}">
        <input type="number" id="nci-emp-vlitem-${sid}" placeholder="Valor deste item R$" step="any" style="flex:1;min-width:110px;${inp}">
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button type="button" onclick="_ncVinculEmp('${sid}')" style="font-size:11px;padding:4px 12px;border-radius:4px;border:none;background:var(--blue);color:#fff;cursor:pointer">Vincular</button>
        <button type="button" onclick="_ncFecharPickerEmp('${sid}')" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Cancelar</button>
        <span id="nci-emp-msg-${sid}" style="font-size:11px;color:var(--red)"></span>
      </div>
    </div>
  </div>`;
}

function _ncItemChkChange(chk){
  _ncRecalcValorGlobal();
  if((window._ncModoAtual||'')!=='aquisicao') return;
  const row=chk.closest('.nc-item-row');
  const id=row?.dataset?.id; if(!id) return;
  const sec=document.getElementById('nci-emp-sec-'+id);
  if(sec) sec.style.display=chk.checked?'':'none';
}

async function _ncAbrirPickerEmp(sid){
  const picker=document.getElementById('nci-emp-picker-'+sid); if(!picker) return;
  picker.style.display='';
  if(!window._ncEmpFree){
    const {data}=await sb.from('empenhos').select('id,numero,ano,valor_empenhado').is('contrato_id',null).order('created_at',{ascending:false}).limit(300);
    window._ncEmpFree=data||[];
  }
  const sel=document.getElementById('nci-emp-sel-'+sid); if(!sel) return;
  const buf=Object.entries(window._ncEmpBuffer||{});
  sel.innerHTML='<option value="">Selecione o empenho...</option>'+
    '<option value="__novo__">✦ Criar novo empenho...</option>'+
    buf.map(([tid,e])=>`<option value="__tmp__${tid}">🆕 ${_sanEsc(e.numero||'')}${e.ano?'/'+e.ano:''} · R$ ${fmtFull(e.valor_empenhado||0)}</option>`).join('')+
    (window._ncEmpFree||[]).map(e=>`<option value="${e.id}">${_sanEsc(e.numero||'')}${e.ano?'/'+e.ano:''} · R$ ${fmtFull(e.valor_empenhado||0)}</option>`).join('');
  const qtdeEl=document.getElementById('nci-emp-qtde-'+sid); if(qtdeEl) qtdeEl.value='';
  const vlEl=document.getElementById('nci-emp-vlitem-'+sid); if(vlEl) vlEl.value='';
  const msgEl=document.getElementById('nci-emp-msg-'+sid); if(msgEl) msgEl.textContent='';
  const formNovo=document.getElementById('nci-emp-form-novo-'+sid); if(formNovo) formNovo.style.display='none';
  // Fonte + Emenda no "novo empenho" — espelha o modal da subaba Empenhos
  const fonteEl=document.getElementById('nci-emp-fonte-'+sid);
  if(fonteEl && !fonteEl.options.length){ fonteEl.innerHTML='<option value="">Fonte —</option>'+(typeof PROC_FONTES!=='undefined'?PROC_FONTES:[]).map(([v,l])=>`<option value="${v}">${_sanEsc(l)}</option>`).join(''); }
  const emEl=document.getElementById('nci-emp-emenda-'+sid);
  if(emEl){
    if(!window._ncEmpEmendas){ const {data}=await sb.from('emendas').select('id,emenda,ano,parlamentar').order('ano',{ascending:false}); window._ncEmpEmendas=data||[]; }
    if(!emEl.options.length) emEl.innerHTML='<option value="">— sem emenda —</option>'+(window._ncEmpEmendas||[]).map(e=>`<option value="${e.id}">${_sanEsc(e.emenda||'?')}${e.ano?('/'+e.ano):''}${e.parlamentar?(' · '+_sanEsc(e.parlamentar)):''}</option>`).join('');
  }
}

function _ncEmpSelChange(sid){
  const sel=document.getElementById('nci-emp-sel-'+sid); if(!sel) return;
  const form=document.getElementById('nci-emp-form-novo-'+sid);
  if(form) form.style.display=(sel.value==='__novo__')?'':'none';
  if(sel.value==='__novo__'){
    const anoEl=document.getElementById('nci-emp-ano-'+sid); if(anoEl&&!anoEl.value) anoEl.value=new Date().getFullYear();
  }
}

function _ncFecharPickerEmp(sid){
  const picker=document.getElementById('nci-emp-picker-'+sid); if(picker) picker.style.display='none';
}

async function _ncVinculEmp(sid){
  const msgEl=document.getElementById('nci-emp-msg-'+sid); if(msgEl) msgEl.textContent='';
  const sel=document.getElementById('nci-emp-sel-'+sid); if(!sel) return;
  const val=sel.value;
  if(!val){ if(msgEl) msgEl.textContent='Selecione o empenho.'; return; }
  const qtdeRaw=(document.getElementById('nci-emp-qtde-'+sid)?.value||'').replace(',','.');
  const vlRaw=(document.getElementById('nci-emp-vlitem-'+sid)?.value||'').replace(',','.');
  const qtdeVinc=qtdeRaw?parseFloat(qtdeRaw):null;
  const valVinc=vlRaw?parseFloat(vlRaw):null;
  // validate against item totals
  const row=document.querySelector(`.nc-item-row[data-id="${sid}"]`);
  const qtdeTotal=row?_ncQtdeEfetivaRow(row):null;
  const nciValEl=row?row.querySelector('.nci-valor'):null;
  const valUnit=nciValEl?parseFloat((nciValEl.value||'').replace(/\./g,'').replace(',','.'))||null:null;
  const valContrTotal=(valUnit!=null&&qtdeTotal!=null)?valUnit*qtdeTotal:null;
  const existing=window._ncEmpItens?.[sid]||[];
  const sumQtde=existing.reduce((a,x)=>a+(x.qtde_vinculada||0),0);
  const sumVal=existing.reduce((a,x)=>a+(x.val_vinculado||0),0);
  if(qtdeTotal!=null&&qtdeVinc!=null&&(sumQtde+qtdeVinc)>qtdeTotal+0.0001){
    if(msgEl) msgEl.textContent=`Qtde total vinculada (${sumQtde+qtdeVinc}) excede a qtde do item (${qtdeTotal}).`; return;
  }
  if(valContrTotal!=null&&valVinc!=null&&(sumVal+valVinc)>valContrTotal+0.01){
    if(msgEl) msgEl.textContent=`Valor total vinculado excede o valor total contratado do item (R$ ${fmtFull(valContrTotal)}).`; return;
  }
  let link;
  if(val==='__novo__'){
    const numero=(document.getElementById('nci-emp-nro-'+sid)?.value||'').trim();
    const valor=parseFloat((document.getElementById('nci-emp-vlnovo-'+sid)?.value||'').replace(',','.'));
    if(!numero){ if(msgEl) msgEl.textContent='Informe o número do empenho.'; return; }
    if(!valor||isNaN(valor)){ if(msgEl) msgEl.textContent='Informe o valor.'; return; }
    const tmpId='tmp_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const emp={
      numero, numero_normalizado:(typeof normalizarNumeroDocumento==='function'?normalizarNumeroDocumento(numero):numero),
      ano:parseInt(document.getElementById('nci-emp-ano-'+sid)?.value)||null,
      valor_empenhado:valor, saldo_empenho:valor,
      numero_despesa:(document.getElementById('nci-emp-desp-'+sid)?.value||'').trim()||null,
      fonte_tipo:(document.getElementById('nci-emp-fonte-'+sid)?.value||null),
      fonte_descricao:(document.getElementById('nci-emp-fontedesc-'+sid)?.value||'').trim()||null,
      emenda_id:(document.getElementById('nci-emp-emenda-'+sid)?.value||null),
      data_emissao:(document.getElementById('nci-emp-dat-'+sid)?.value||null),
      updated_at:new Date().toISOString()
    };
    window._ncEmpBuffer=window._ncEmpBuffer||{};
    window._ncEmpBuffer[tmpId]=emp;
    link={tmpId,isNew:true,numero,ano:emp.ano,qtde_vinculada:qtdeVinc,val_vinculado:valVinc};
  } else if(val.startsWith('__tmp__')){
    const tmpId=val.slice(7);
    const emp=(window._ncEmpBuffer||{})[tmpId]; if(!emp){ if(msgEl) msgEl.textContent='Empenho não encontrado.'; return; }
    link={tmpId,isNew:true,numero:emp.numero,ano:emp.ano,qtde_vinculada:qtdeVinc,val_vinculado:valVinc};
  } else {
    const empData=(window._ncEmpFree||[]).find(e=>String(e.id)===String(val));
    link={empId:val,isNew:false,numero:empData?.numero||val,ano:empData?.ano,qtde_vinculada:qtdeVinc,val_vinculado:valVinc};
  }
  window._ncEmpItens=window._ncEmpItens||{};
  if(!window._ncEmpItens[sid]) window._ncEmpItens[sid]=[];
  window._ncEmpItens[sid].push(link);
  _ncRenderEmpLista(sid);
  _ncFecharPickerEmp(sid);
}

function _ncRenderEmpLista(sid){
  const lista=document.getElementById('nci-emp-lista-'+sid); if(!lista) return;
  const links=(window._ncEmpItens||{})[sid]||[];
  if(!links.length){ lista.innerHTML='<span style="font-size:11px;color:var(--text3)">Nenhum empenho vinculado</span>'; return; }
  lista.innerHTML=links.map((lk,idx)=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:2px;flex-wrap:wrap">
    <span style="font-weight:600">${_sanEsc(lk.numero||'')}${lk.ano?'/'+lk.ano:''}${lk.isNew?' <span style="color:var(--blue);font-size:10px">(novo)</span>':''}</span>
    ${lk.qtde_vinculada!=null?`<span style="color:var(--text2)">qtde: ${lk.qtde_vinculada}</span>`:''}
    ${lk.val_vinculado!=null?`<span style="color:var(--text2)">R$ ${fmtFull(lk.val_vinculado)}</span>`:''}
    <button type="button" onclick="_ncRemoverEmpItem('${sid}',${idx})" style="font-size:10px;padding:1px 5px;border-radius:3px;border:1px solid var(--red);background:transparent;color:var(--red);cursor:pointer">✕</button>
  </div>`).join('');
}

function _ncRemoverEmpItem(sid,idx){
  if(!window._ncEmpItens?.[sid]) return;
  window._ncEmpItens[sid].splice(idx,1);
  _ncRenderEmpLista(sid);
}

async function _ncSalvarEmpItens(contratoId){
  const idMap=window._ncVincularItensMap||{};
  const buf=window._ncEmpBuffer||{};
  const empItensMap=window._ncEmpItens||{};
  const tmpToReal={};
  for(const [tmpId,emp] of Object.entries(buf)){
    const reg={...emp,contrato_id:contratoId};
    const {data,error}=await sb.from('empenhos').insert(reg).select('id').single();
    if(error) throw error;
    tmpToReal[tmpId]=String(data.id);
  }
  const existingIds=[];
  for(const links of Object.values(empItensMap)){
    for(const lk of links){
      if(!lk.isNew&&lk.empId&&!existingIds.includes(String(lk.empId))) existingIds.push(String(lk.empId));
    }
  }
  if(existingIds.length) await sb.from('empenhos').update({contrato_id:contratoId}).in('id',existingIds);
  const toInsert=[];
  for(const [origId,links] of Object.entries(empItensMap)){
    const contractItemId=idMap[String(origId)]||String(origId);
    for(const lk of links){
      const empId=lk.isNew?tmpToReal[lk.tmpId]:String(lk.empId||'');
      if(!empId) continue;
      toInsert.push({empenho_id:empId,item_id:contractItemId,quantidade_vinculada:lk.qtde_vinculada||null,valor_vinculado:lk.val_vinculado||null});
    }
  }
  if(toInsert.length){ const {error}=await sb.from('empenho_itens').insert(toInsert); if(error) throw error; }
}
// ── fim empenhos por item ──────────────────────────────────────────────────────

async function obterOuCriarFornecedor(nome, cnpjRaw){
  const norm=(cnpjRaw||"").replace(/\D/g,"");
  if(norm){
    const {data:ex}=await sb.from("fornecedores").select("id").eq("cnpj_normalizado",norm).limit(1);
    if(ex&&ex.length) return ex[0].id;
  }
  const {data:novo,error}=await sb.from("fornecedores").insert({cnpj_normalizado:norm||null,razao_social:nome||null}).select("id").single();
  if(error) throw error;
  _fornecedoresCache=null;
  return novo.id;
}

async function abrirModalNovoContrato(){
  if(!podeEditar('contratos')){alert("Sem permissão para cadastrar contratos.");return;}
  window._gerarContratoProcesso=null;
  ["nc-cpl","nc-numero","nc-prestador","nc-objeto","nc-cnpj","nc-email","nc-secao","nc-vigencia","nc-vencimento","nc-valor-inicial","nc-valor-mensal","nc-fonte","nc-fiscalizacao","nc-contato","nc-obs","nc-inicio","nc-assinatura"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  _ncMostrarProcessoManual();
  await preencherSelectProcessos();
  const _np=document.getElementById("nc-processo"); if(_np) _np.value="";
  ncProcessoChange();
  document.getElementById("nc-status").value="VIGENTE";
  document.getElementById("nc-tipo").value="CONTRATO";
  const _nd=document.getElementById("nc-natureza-display"); if(_nd){_nd.value="";_nd.placeholder="Selecione o processo para preencher automaticamente";}
  ncTipoInstrumentoChange();
  document.getElementById("nc-prestador").style.display="none";
  document.getElementById("nc-fornecedor-busca").value="";
  document.getElementById("nc-fornecedor").value="";
  const _ncl=document.getElementById("nc-fornecedor-label");
  _ncl.textContent="Selecione ou pesquise a empresa...";
  _ncl.classList.add("company-combobox-placeholder");
  fecharFornecedorCombo();
  const _ncc=document.getElementById("nc-cnpj"); if(_ncc) _ncc.readOnly=false;
  preencherSelectFornecedores();
  await preencherSelectSecoes('nc-secao', _isAdmin());
  aplicarSecaoTextoFormulario('nc-secao');
  await _ncPreencherFiscalMulti();
  window._ncEmpItens={};window._ncEmpBuffer={};window._ncEmpFree=null;window._ncModoAtual='';window._ncVincularItensMap={};
  const _fn=document.getElementById("nc-fiscalizacao-novo"); if(_fn) _fn.value="";
  _ncAplicarModo('');
  document.getElementById("nc-msg").className="fmsg";
  const _wItens=document.getElementById("nc-itens-wrap");
  if(_wItens) _wItens.style.display="none";
  const _lItens=document.getElementById("nc-itens-lista"); if(_lItens) _lItens.innerHTML="";
  document.getElementById("modal-novo-contrato").classList.add("active");
}

function ncTipoInstrumentoChange(){
  const ata=document.getElementById("nc-tipo")?.value==="ATA";
  const wrap=document.getElementById("nc-valor-mensal-wrap");
  if(wrap) wrap.style.display=ata?"none":"";
  if(ata) document.getElementById("nc-valor-mensal").value="";
}

function ecTipoInstrumentoChange(){
  const ata=document.getElementById("ec-tipo")?.value==="ATA";
  const wrap=document.getElementById("ec-valor-mensal-wrap");
  if(wrap) wrap.style.display=ata?"none":"";
  if(ata) document.getElementById("ec-valor-mensal").value="";
}

async function salvarNovoContrato(){
  const tipoInstrumento=document.getElementById("nc-tipo").value||"CONTRATO";
  const cpl=document.getElementById("nc-cpl").value.trim();
  const sel=document.getElementById("nc-fornecedor");
  const novaEmpresa=sel.value==="__nova__";
  const prestador=novaEmpresa?document.getElementById("nc-prestador").value.trim():(sel.value?sel.options[sel.selectedIndex].text:"");
  const objeto=document.getElementById("nc-objeto").value.trim();
  const fiscais=_ncColetarFiscais();
  const fiscalizacao=fiscais.join(', ');
  const email=document.getElementById("nc-email").value.trim();
  const modoNC=_ncModo(window._gerarContratoProcesso?.natureza);
  const servDemandaNC=typeof _ncServicoDemanda==='function' && _ncServicoDemanda(window._gerarContratoProcesso);
  const servTrimestralNC=typeof _ncServicoTrimestralFixo==='function' && _ncServicoTrimestralFixo(window._gerarContratoProcesso);
  const servMensalNC=typeof _ncServicoMensalFixo==='function' && _ncServicoMensalFixo(window._gerarContratoProcesso);
  const numeroContrato=document.getElementById("nc-numero").value.trim();
  const inicioContrato=document.getElementById("nc-inicio").value||null;
  const secSelEarly=document.getElementById("nc-secao");
  const secaoEarly=secSelEarly?.value==='__nova__'
    ?document.getElementById("nc-secao-novo").value.trim()
    :(secSelEarly?.value||'');
  if(!window._gerarContratoProcesso){showMsg("nc","Selecione o processo (licitação) (*).","err");return;}
  if(!cpl){showMsg("nc","Selecione o processo (*)","err");return;}
  if(!numeroContrato){showMsg("nc","Informe o número do contrato/SIM (*).","err");return;}
  if(servTrimestralNC&&!inicioContrato){showMsg("nc","Informe a data de início do contrato trimestral (*). Ela ancora os ciclos de preventiva/calibração e pagamento.","err");return;}
  if(tipoInstrumento==="ATA"){
    if(/[A-Za-zÀ-ÖØ-öø-ÿ]|\s/.test(numeroContrato)){showMsg("nc","Número da ATA/contrato não pode conter letras nem espaços.","err");return;}
    if(!inicioContrato){showMsg("nc","Informe a data de início da ATA/contrato (*).","err");return;}
    if(!secaoEarly){showMsg("nc","Informe a seção da ATA/contrato (*).","err");return;}
  }
  if(!sel.value){showMsg("nc","Selecione a empresa (ou cadastre uma nova).","err");return;}
  if(novaEmpresa&&!prestador){showMsg("nc","Informe a razão social da nova empresa.","err");return;}
  if(!email){showMsg("nc","Informe o e-mail da empresa (*).","err");return;}
  if(!fiscais.length){showMsg("nc","Selecione ao menos um fiscal (*).","err");return;}
  {
    const _listaChk=document.getElementById('nc-itens-lista');
    const _temItemMarcado=_listaChk?[..._listaChk.querySelectorAll('.nci-chk')].some(c=>c.checked):false;
    if(!_temItemMarcado){showMsg("nc","Adicione item do processo: marque ao menos um item para vincular ao contrato (*).","err");return;}
  }
  if(modoNC==='aquisicao'){
    const _lista=document.getElementById('nc-itens-lista');
    const _rows=_lista?[...(_lista.querySelectorAll('.nc-item-row'))]:[];
    const _semEmp=_rows.filter(r=>{
      const chk=r.querySelector('.nci-chk');
      if(!chk||!chk.checked||r.dataset.jacont==='1') return false;
      const rid=r.dataset.id;
      return !rid||!((window._ncEmpItens||{})[rid]||[]).length;
    });
    if(_semEmp.length){
      const _nomes=_semEmp.map(r=>{const d=r.querySelector('div[style*="font-weight:600"]');return d?d.textContent.trim():r.dataset.id;}).slice(0,3);
      if(!await uiConfirm(`${_semEmp.length} item(ns) marcado(s) sem empenho vinculado:\n• ${_nomes.join('\n• ')}\n\nVocê poderá vincular depois na aba Empenhos. Continuar mesmo assim?`)) return;
    }
  }
  const btn=document.querySelector("#modal-novo-contrato .btn-primary");
  const label=btn.textContent;btn.disabled=true;btn.textContent="Salvando...";
  const _mn=id=>{const v=document.getElementById(id).value.trim();return v||null;};
  const hoje=new Date().toLocaleDateString("pt-BR");
  let fornecedor_id=null;
  try{
    fornecedor_id=novaEmpresa?await obterOuCriarFornecedor(prestador,document.getElementById("nc-cnpj").value):(Number(sel.value)||null);
  }catch(e){btn.disabled=false;btn.textContent=label;showMsg("nc","Erro ao salvar empresa: "+(e.message||e),"err");return;}
  const _secSel=document.getElementById("nc-secao");
  const secaoNova=_secSel && _secSel.value==='__nova__';
  const secaoVal=(secaoNova?document.getElementById("nc-secao-novo").value.trim():(_secSel?_secSel.value:''))||null;
  if(secaoNova && secaoVal){ try{ await obterOuCriarSecao(secaoVal); }catch(_){} }
  for(const nome of fiscais){ try{ await obterOuCriarPessoa(nome); }catch(_){} }
  const valorInicialRaw=document.getElementById("nc-valor-inicial").value.trim();
  const valorInicialNum=valorInicialRaw?parseFloat(valorInicialRaw.replace(/\./g,'').replace(',','.')):null;
  const valorPeriodoRaw=document.getElementById("nc-valor-mensal").value.trim();
  const valorPeriodoNum=valorPeriodoRaw?parseFloat(valorPeriodoRaw.replace(/\./g,'').replace(',','.')):null;
  const dados={
    cpl, prestador, objeto, fornecedor_id,tipo_instrumento:tipoInstrumento,
    numero_contrato:numeroContrato||null,
    cnpj:_mn("nc-cnpj"),
    email_empresa:_mn("nc-email"),
    secao:secaoVal,
    secao_id:_secoesOrganizacionais.find(s=>s.sigla===secaoVal)?.id||null,
    status:document.getElementById("nc-status").value,
    data_inicio:inicioContrato,
    data_assinatura:document.getElementById("nc-assinatura").value||null,
    vigencia_atual:_mn("nc-vigencia"),
    vencimento:_mn("nc-vencimento"),
    valor_inicial:_mn("nc-valor-inicial"),
    valor_inicial_num:valorInicialNum,
    valor_atual:valorInicialNum,
    valor_atual_num:valorInicialNum,
    valor_total_num:valorInicialNum,
    valor_mensal:(tipoInstrumento==="ATA"||servDemandaNC||servTrimestralNC)?null:valorPeriodoNum,
    valor_mensal_num:servMensalNC?valorPeriodoNum:null,
    periodicidade_pagamento:servTrimestralNC?'TRIMESTRAL':(servMensalNC?'MENSAL':null),
    valor_periodico_num:(servTrimestralNC||servMensalNC)?valorPeriodoNum:null,
    modelo_execucao:servTrimestralNC?'continuo_trimestral_preventiva_corretiva':(servMensalNC?'continuo_mensal_fixo':null),
    fonte:_mn("nc-fonte"),
    fiscalizacao,
    contato:_mn("nc-contato"),
    obs:_mn("nc-obs"),
    data_atualizacao:hoje,
  };
  dados.processo_id = window._gerarContratoProcesso ? window._gerarContratoProcesso.id : null;
  const {data:novoContrato,error}=await sb.from("contratos").insert(dados).select("id").single();
  if(error){btn.disabled=false;btn.textContent=label;showMsg("nc","Erro: "+error.message,"err");return;}
  // Fase 3: vincular itens selecionados do processo ao contrato + marcar se o processo gera mais contratos
  let _ataEspelhados=0;
  if(window._gerarContratoProcesso && novoContrato?.id){
    const _gm=document.getElementById("nc-gera-mais")?.checked||false;
    try{ await sb.from("processos").update({gera_mais_contratos:_gm}).eq("id",window._gerarContratoProcesso.id); }catch(_){}
    try{ await _ncVincularItens(novoContrato.id, fornecedor_id); }
    catch(e){ showMsg("nc","Contrato salvo, mas falha ao vincular itens: "+(e.message||e),"err"); }
    // Fase 4: se for ATA, espelhar os itens selecionados para atas_itens (fonte de verdade da execução continua na aba ATAs)
    if(tipoInstrumento==="ATA"){
      try{ _ataEspelhados=await _ncEspelharAta(novoContrato.id); }
      catch(e){ showMsg("nc","Contrato ATA salvo, mas falha ao espelhar itens para a ATA: "+(e.message||e),"err"); }
    }
  }
  // Fase 10: registra os fiscais e vincula empenhos selecionados
  if(novoContrato?.id && fiscais.length){
    const ini=document.getElementById("nc-inicio").value||new Date().toISOString().slice(0,10);
    try{ await sb.from("contratos_fiscalizadores").insert(fiscais.map(nome=>({contrato_id:novoContrato.id,cpl,nome,data_inicio:ini}))); }catch(_){}
  }
  if(modoNC==='aquisicao' && novoContrato?.id){
    try{ await _ncSalvarEmpItens(novoContrato.id); }catch(e){ showMsg("nc","Contrato salvo, mas falha ao vincular empenhos: "+(e.message||e),"err"); }
  }
  btn.disabled=false;btn.textContent=label;
  showMsg("nc",tipoInstrumento==="ATA"?(_ataEspelhados>0?`✓ ATA cadastrada! ${_ataEspelhados} item(ns) espelhado(s) automaticamente para a ATA.`:"✓ ATA cadastrada! Agora inclua os itens."):"✓ Contrato cadastrado!","ok");
  contratosCarregado=false;
  atasContratos=[];
  itensCarregado=false;
  if(typeof loadLicitacoes==='function'){ try{ await loadLicitacoes(); }catch(_){} } // atualiza n_contratos / lista de "Gerar contrato"
  await loadContratos();
  if(tipoInstrumento==="ATA"&&novoContrato?.id){
    document.getElementById("modal-novo-contrato").classList.remove("active");
    if(_ataEspelhados>0){
      // Itens já espelhados automaticamente; sincroniza a aba ATAs e a aba Itens
      atasContratos=[]; itensAtasCarregado=false;
      if(typeof loadAtas==='function'){ try{ await loadAtas(); }catch(_){} }
    }else{
      await abrirModalNovaAta(novoContrato.id);
    }
  }else{
    setTimeout(()=>document.getElementById("modal-novo-contrato").classList.remove("active"),900);
  }
}

const CT_METRICS_LS_KEY='ct.metricsOpen';
function applyContratosMetricsState(open){
  const wrap=document.getElementById('ct-metrics-wrap');
  const btn=document.getElementById('ct-metrics-toggle');
  const label=document.getElementById('ct-metrics-toggle-label');
  const icon=document.getElementById('ct-metrics-toggle-icon');
  if(!wrap||!btn) return;
  wrap.hidden=!open;
  btn.setAttribute('aria-expanded',open?'true':'false');
  if(label) label.textContent=open?'Ocultar dashboard':'Ver dashboard';
  if(icon) icon.style.transform=open?'rotate(180deg)':'rotate(0deg)';
}
function toggleContratosMetrics(){
  const open=document.getElementById('ct-metrics-wrap')?.hidden!==false;
  applyContratosMetricsState(open);
  try{ localStorage.setItem(CT_METRICS_LS_KEY, open?'1':'0'); }catch{}
}
document.addEventListener('DOMContentLoaded',()=>{
  let open=false;
  try{ open=localStorage.getItem(CT_METRICS_LS_KEY)==='1'; }catch{}
  applyContratosMetricsState(open);
});

function clearAllContratos(){
  const el=document.getElementById("ct-busca");if(el)el.value="";
  const alerta=document.getElementById("ct-alerta");if(alerta)alerta.value="";
  Object.keys(contratoHeaderFilters).forEach(k=>contratoHeaderFilters[k]=[]);
  _ctUpdateHdrBtns();
  filtrarContratos();
}

function filtrarContratos(){
  const busca=(document.getElementById("ct-busca")?.value||"").toLowerCase();
  const alerta=document.getElementById("ct-alerta")?.value||"";
  const hoje=new Date();
  const d90=new Date(hoje);d90.setDate(d90.getDate()+90);

  contratosFiltrados=contratosRows.filter(r=>{
    // ATAs (Registro de Preços) são exibidas exclusivamente em "Atas Rp Vigentes";
    // aqui em Contratos em Execução mostramos somente instrumentos do tipo CONTRATO.
    if(r.tipo_instrumento==="ATA") return false;
    for(const [col,sel] of Object.entries(contratoHeaderFilters)){
      if(!sel.length) continue;
      const val=String(CONTRATO_FILTER_COLS[col].get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // Se não há filtro de status ativo, esconde ENCERRADO e CONCLUIDO por padrão
    if(!contratoHeaderFilters.status.length && !["encerrados","concluidos"].includes(alerta) && (r.status==="ENCERRADO"||r.status==="CONCLUIDO")) return false;
    if(alerta){
      const dias=diasContratoVencer(r.vencimento);
      if(alerta==="encerrados" && r.status!=="ENCERRADO") return false;
      if(alerta==="concluidos" && r.status!=="CONCLUIDO") return false;
      if(alerta==="vencendo90" && !(r.status==="VIGENTE"&&dias!==null&&dias>=0&&dias<=90)) return false;
      if(alerta==="vencidos" && !(dias!==null&&dias<0)) return false;
      if(alerta==="semFiscal" && r.fiscalizacao) return false;
      if(alerta==="semClassificacao" && _ctModeloKey(r)!=="nao_classificado") return false;
      if(alerta==="medicaoPendente" && !(r._medicoesPendentes>0)) return false;
      if(alerta==="nfPendente" && !(r._nfsPendentes>0)) return false;
      if(alerta==="eventoRascunho" && !(r._eventosRascunho>0)) return false;
      if(alerta==="limiteAditivo80" && !((_ctAditivoUsado(r)||0)>=80)) return false;
    }
    if(busca&&![r.numero_contrato,r.cpl,r.prestador,r.objeto,r.secao,r.fiscalizacao,_ctModeloLabel(r),_ctHumanize(_ctOrigemKey(r)),_ctHumanize(_ctFormaKey(r))].filter(Boolean).join(" ").toLowerCase().includes(busca)) return false;
    return true;
  });

  const total=contratosFiltrados.length;
  const vigentes=contratosFiltrados.filter(r=>r.status==="VIGENTE").length;
  const encerrados=contratosFiltrados.filter(r=>r.status==="ENCERRADO").length;
  const semFiscal=contratosFiltrados.filter(r=>!r.fiscalizacao).length;
  const medPendente=contratosFiltrados.filter(r=>r._medicoesPendentes>0).length;
  const nfPendente=contratosFiltrados.filter(r=>r._nfsPendentes>0).length;
  const eventoRascunho=contratosFiltrados.filter(r=>r._eventosRascunho>0).length;
  const valorAtual=contratosFiltrados.reduce((s,r)=>s+_ctValorAtual(r),0);
  const vencendo=contratosFiltrados.filter(r=>{
    if(r.status!=="VIGENTE"||!r.vencimento) return false;
    const v=parseDataBR(r.vencimento);
    return v&&v>=hoje&&v<=d90;
  }).length;

  document.getElementById("ct-m-total").textContent=total;
  document.getElementById("ct-m-vigentes").textContent=vigentes;
  document.getElementById("ct-m-vencendo").textContent=vencendo;
  document.getElementById("ct-m-encerrados").textContent=encerrados;
  const semFiscalEl=document.getElementById("ct-m-sem-fiscal");if(semFiscalEl)semFiscalEl.textContent=semFiscal;
  const medPendenteEl=document.getElementById("ct-m-med-pendente");if(medPendenteEl)medPendenteEl.textContent=medPendente;
  const nfPendenteEl=document.getElementById("ct-m-nf-pendente");if(nfPendenteEl)nfPendenteEl.textContent=nfPendente;
  const eventoRascunhoEl=document.getElementById("ct-m-evento-rascunho");if(eventoRascunhoEl)eventoRascunhoEl.textContent=eventoRascunho;
  const valorAtualEl=document.getElementById("ct-m-valor-atual");if(valorAtualEl)valorAtualEl.textContent=fmtFull(valorAtual);
  document.getElementById("ct-count").textContent=`${total} contrato(s)`;
  renderTabelaContratos();
}

function badgeStatusContrato(status,vencido){
  if(status==="VIGENTE"&&vencido){
    return `<span class="badge badge-danger" title="Vigência venceu mas o contrato ainda não foi encerrado — provavelmente em renovação">AGUARDANDO RENOVAÇÃO</span>`;
  }
  const cfg={VIGENTE:{bg:"var(--green-bg)",color:"var(--green-text)"},ENCERRADO:{bg:"var(--surface2)",color:"var(--text3)"},SUSPENSO:{bg:"var(--amber-bg)",color:"var(--amber-text)"},CONCLUIDO:{bg:"var(--blue-bg)",color:"var(--blue-text)"}};
  const c=cfg[status]||{bg:"var(--surface2)",color:"var(--text3)"};
  return `<span class="badge" style="background:${c.bg};color:${c.color}">${status||"—"}</span>`;
}

function corVencimento(dataFim){
  if(!dataFim) return "var(--text3)";
  const v=parseDataBR(dataFim);
  if(!v) return "var(--text3)";
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const d90=new Date(hoje);d90.setDate(d90.getDate()+90);
  if(v<hoje) return "var(--red)";
  if(v<=d90) return "var(--amber)";
  return "var(--green)";
}

function fmtDate(d){
  if(!d) return "—";
  const p=d.split("-");
  if(p.length===3) return `${p[2]}/${p[1]}/${p[0]}`;
  return d;
}

function sortContratos(col){
  if(ctSortCol===col) ctSortAsc=!ctSortAsc;
  else{ctSortCol=col;ctSortAsc=true;}
  renderTabelaContratos();
}

function ctGetSortVal(r,col){
  if(col==="vencimento"||col==="dias"){
    const d=parseDataBR(r.vencimento);
    return d?d.getTime():(ctSortAsc?Infinity:-Infinity);
  }
  if(col==="numero_contrato") return (r.numero_contrato||'').toString().toLowerCase();
  if(col==="modelo_contrato") return _ctModeloLabel(r).toLowerCase();
  if(col==="origem_contratacao") return _ctHumanize(_ctOrigemKey(r)).toLowerCase();
  if(col==="valor_mensal") return r.valor_mensal??-Infinity;
  if(col==="valor_inicial") return _ctValorInicial(r);
  if(col==="valor_reajustado") return _ctValorReajustado(r);
  if(col==="valor_total") return _ctValorAtual(r);
  if(col==="aditivo_usado") return _ctAditivoUsado(r)??-Infinity;
  if(col==="atualizado_em") return (r.atualizado_em||r.data_atualizacao||'').toString().toLowerCase();
  return ((r[col])||"").toString().toLowerCase();
}

function diasContratoVencer(vencimento){
  if(!vencimento) return null;
  const v=parseDataBR(vencimento);
  if(!v) return null;
  const hoje=new Date();hoje.setHours(0,0,0,0);
  return Math.round((v-hoje)/(1000*60*60*24));
}

function renderTabelaContratos(){
  const tbody=document.getElementById("ct-tbody");
  if(!tbody) return;
  const table=document.getElementById("ct-table");
  if(table){
    table.style.display="table";
    table.style.width="100%";
    table.style.minWidth="0";
    table.style.tableLayout="fixed";
    const head=table.querySelector("thead");
    if(head) head.style.display="none";
  }

  // Atualizar ícones de ordenação
  ["numero_contrato","cpl","modelo_contrato","origem_contratacao","prestador","objeto","vigencia_atual","vencimento","dias","status","secao","fiscalizacao","valor_inicial","valor_reajustado","valor_total","aditivo_usado","atualizado_em"].forEach(col=>{
    const el=document.getElementById("sort-ct-"+col);
    if(el) el.textContent=ctSortCol===col?(ctSortAsc?" ▲":" ▼"):"";
  });

  const podeManter=podeEditar('contratos');
  const selectAll=document.getElementById('ct-select-all');
  if(selectAll){selectAll.disabled=!podeManter;selectAll.checked=false;}
  atualizarBotaoManterStatus();
  if(!contratosFiltrados.length){tbody.innerHTML=`<tr><td colspan="${CT_TABLE_COLSPAN}"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum contrato encontrado</div></td></tr>`;return;}

  let rows=[...contratosFiltrados];
  if(ctSortCol){
    rows.sort((a,b)=>{
      const va=ctGetSortVal(a,ctSortCol),vb=ctGetSortVal(b,ctSortCol);
      if(va<vb) return ctSortAsc?-1:1;
      if(va>vb) return ctSortAsc?1:-1;
      return 0;
    });
  }
  if(selectAll) selectAll.checked=rows.length>0&&rows.every(r=>contratosSelecionados.has(String(r.id)));

  tbody.innerHTML=`<tr style="display:block;width:100%"><td colspan="${CT_TABLE_COLSPAN}" style="display:block;width:100%;padding:0;background:transparent;border:0;box-sizing:border-box">
    <div id="ct-cards-list" style="display:flex;flex-direction:column;gap:12px;width:100%;box-sizing:border-box">
      ${rows.map(_ctContratoCardHtml).join("")}
    </div>
  </td></tr>`;
  requestAnimationFrame(_ctSyncIdentityWidth);
  return;

  tbody.innerHTML=rows.map(r=>{
    const cor=corVencimento(r.vencimento);
    const fisc=r.fiscalizacao||"—";
    const dias=diasContratoVencer(r.vencimento);
    let diasHtml="—";
    if(dias!==null){
      if(dias<0) diasHtml=`<span style="color:var(--red);font-weight:600">VENCIDO</span>`;
      else if(dias<=90) diasHtml=`<span style="color:var(--amber);font-weight:600">${dias}d</span>`;
      else diasHtml=`<span style="color:var(--green)">${dias}d</span>`;
    }
    const valorInicial=_ctValorInicial(r);
    const valorReajustado=_ctValorReajustado(r);
    const valorAtual=_ctValorAtual(r);
    const aditivoUsado=_ctAditivoUsado(r);
    const aditivoHtml=aditivoUsado==null?'<span style="color:var(--text3)" title="Aguardando eventos estruturados">—</span>':`<span style="color:${aditivoUsado>=20?'var(--red)':aditivoUsado>=15?'var(--amber)':'var(--text2)'};font-weight:${aditivoUsado>=20?'700':'500'}" title="Percentual de aditivo sobre o valor inicial reajustado">${aditivoUsado}%</span>`;
    const btnEncerrarCt=r.status!=="ENCERRADO"&&podeEditar('contratos')
      ?`<button onclick="abrirEncerrarCt('${r.id}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--red-bg);background:var(--red-bg);color:var(--red-text);cursor:pointer;white-space:nowrap" title="Encerrar contrato">⛔ Encerrar</button>`
      :"";
    const temVinculacao=!!(r.email_empresa||r.prefixo_chamado);
    const btnEmailCt=podeEditar('contratos')
      ?`<button onclick="abrirEmailContrato('${r.id}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid ${temVinculacao?'var(--blue-bg)':'var(--amber-bg)'};background:${temVinculacao?'var(--blue-bg)':'var(--amber-bg)'};color:${temVinculacao?'var(--blue-text)':'var(--amber-text)'};cursor:pointer;white-space:nowrap" title="Configurar e-mail e prefixo de chamado">🔗 Vinculações</button>`
      :"";
    const expandido=!!ctExpandido[r.id];
    return `<tr>
      <td style="text-align:center;cursor:pointer;color:var(--text3);user-select:none" onclick="ctToggleExpand('${r.id}')" title="Ver itens do contrato">${expandido?'▼':'▶'}</td>
      <td style="text-align:center"><input type="checkbox" class="ct-row-check" ${contratosSelecionados.has(String(r.id))?'checked':''} ${podeManter?'':'disabled'} onchange="selecionarContrato('${r.id}',this.checked)" style="accent-color:var(--blue)"></td>
      <td style="min-width:220px"><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><button onclick="abrirContratoGerencial('${r.id}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--blue-bg);background:var(--blue-bg);color:var(--blue-text);cursor:pointer;white-space:nowrap" title="Abrir a gestão individual do contrato">Gerenciar contrato</button>${btnEmailCt}${btnEncerrarCt}</div></td>
      <td class="td-trunc" style="min-width:120px;max-width:140px;white-space:nowrap">${r.numero_contrato||"—"}</td>
      <td class="td-trunc" style="max-width:120px">${r.cpl||"—"}</td>
      <td class="td-wrap" style="max-width:180px">${_sanEsc(_ctModeloLabel(r))}<br><span style="font-size:11px;color:var(--text3)">${_sanEsc(_ctHumanize(_ctFormaKey(r)))}</span></td>
      <td>${_sanEsc(_ctHumanize(_ctOrigemKey(r)))}</td>
      <td class="td-trunc">${r.prestador||"—"}</td>
      <td class="td-wrap" style="max-width:280px">${r.objeto||"—"}</td>
      <td style="white-space:nowrap">${r.vigencia_atual||"—"}</td>
      <td style="white-space:nowrap;color:${cor};font-weight:500">${r.vencimento||"—"}</td>
      <td style="text-align:center">${diasHtml}</td>
      <td>${badgeStatusContrato(r.status,dias!==null&&dias<0)}</td>
      <td>${r.secao||"—"}</td>
      <td class="td-trunc" style="max-width:180px" title="${fisc}">${fisc}</td>
      <td style="text-align:right;white-space:nowrap">${valorInicial?_ctMoney(valorInicial):"—"}</td>
      <td style="text-align:right;white-space:nowrap">${valorReajustado?_ctMoney(valorReajustado):"—"}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:600">${valorAtual?_ctMoney(valorAtual):"—"}</td>
      <td style="text-align:right;white-space:nowrap">${aditivoHtml}</td>
      <td style="white-space:nowrap">${_ctPendenciasResumo(r)}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--text3)">${r.atualizado_em||r.data_atualizacao||"—"}</td>
      <td>${_isAdmin()?`<button onclick="abrirEditarContrato('${r.id}')" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;white-space:nowrap">✏️ Editar</button>`:'—'}</td>
    </tr>${expandido?_ctLinhaItensHtml(r.id):''}`;
  }).join("");
}

function _ctSyncIdentityWidth(){
  const list=document.getElementById('ct-cards-list');
  if(!list) return;
  const ids=list.querySelectorAll('.ct-contract-identity');
  if(!ids.length) return;
  ids.forEach(el=>{el.style.width='auto';el.style.minWidth='';});
  let max=0;
  ids.forEach(el=>{const w=el.getBoundingClientRect().width;if(w>max) max=w;});
  const px=Math.ceil(max)+'px';
  ids.forEach(el=>{el.style.width=px;});
}
window.addEventListener('resize',()=>{
  if(document.getElementById('ct-cards-list')) requestAnimationFrame(_ctSyncIdentityWidth);
});

// Linhas expansíveis: clicar no ▶ mostra os itens do contrato inline (mesmo padrão de Licitações/cpToggle)
function _ctContratoCardHtml(r){
  const id=String(r.id).replace(/'/g,"\\'");
  const expandido=!!ctExpandido[r.id];
  const cor=corVencimento(r.vencimento);
  const dias=diasContratoVencer(r.vencimento);
  const valorInicial=_ctValorInicial(r);
  const valorReajustado=_ctValorReajustado(r);
  const valorAtual=_ctValorAtual(r);
  const aditivoUsado=_ctAditivoUsado(r);
  const temStatus=!!r.vencimento;
  const temVinculacao=!!(r.email_empresa||r.prefixo_chamado);
  const podeManter=podeEditar('contratos');
  const btnEncerrarCt=r.status!=="ENCERRADO"&&podeManter
    ?`<button onclick="event.stopPropagation();abrirEncerrarCt('${id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--red-bg);background:var(--red-bg);color:var(--red-text);cursor:pointer;white-space:nowrap">Encerrar</button>`
    :"";
  const btnEmailCt=podeManter
    ?`<button onclick="event.stopPropagation();abrirEmailContrato('${id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid ${temVinculacao?'var(--blue-bg)':'var(--amber-bg)'};background:${temVinculacao?'var(--blue-bg)':'var(--amber-bg)'};color:${temVinculacao?'var(--blue-text)':'var(--amber-text)'};cursor:pointer;white-space:nowrap">Vinculacoes</button>`
    :"";
  const btnEditar=_isAdmin()
    ?`<button onclick="event.stopPropagation();abrirEditarContrato('${id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;white-space:nowrap">Editar</button>`
    :"";
  const seletor=podeManter
    ?`<label onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);white-space:nowrap"><input type="checkbox" class="ct-row-check" ${contratosSelecionados.has(String(r.id))?'checked':''} onchange="selecionarContrato('${id}',this.checked)" style="accent-color:var(--blue)">Selecionar</label>`
    :"";
  const meta=[
    ['Prestador',r.prestador||'-'],
    ['Fiscal responsável',r.fiscalizacao||'-'],
    ['Modelo',_ctModeloLabel(r)||'-'],
    ['Vigência',r.vigencia_atual||'-'],
    ['Valor atual',valorAtual?_ctMoney(valorAtual):'-'],
    ['Aditivo',aditivoUsado==null?'-':`${aditivoUsado}%`]
  ].map(([label,value])=>`<div class="ct-contract-meta"><span>${label}</span><strong title="${_sanEsc(String(value))}">${_sanEsc(String(value))}</strong></div>`).join('');
  const pendenciasHtml=_ctPendenciasResumo(r,false);
  return `<article class="ct-contract-card${expandido?' is-expanded':''}" onclick="if(event.target.closest('button,input,select,a,label'))return;ctToggleExpand('${id}')">
    <div class="ct-contract-summary${temStatus?' has-status':''}">
      <div class="ct-contract-identity">
        <span class="ct-contract-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg></span>
        <div class="ct-contract-identity-info">
          <span class="ct-contract-kicker">Processo</span>
          <strong>${_sanEsc(r.cpl||'Não informado')}</strong>
          <span class="ct-contract-number">Contrato ${_sanEsc(r.numero_contrato||'não informado')}</span>
        </div>
      </div>
      <div class="ct-contract-object">
        <span class="ct-contract-kicker">Objeto</span>
        <strong title="${_sanEsc(r.objeto||'Sem objeto informado')}">${_sanEsc(r.objeto||'Sem objeto informado')}</strong>
      </div>
      <div class="ct-contract-status">
        ${badgeStatusContrato(r.status,dias!==null&&dias<0)}
        <span style="color:${cor}">${_sanEsc(r.vencimento||'Sem vencimento')}</span>
        <small style="color:${cor}">${dias===null?'Sem vencimento informado':dias<0?'Vencido':dias===0?'Vence hoje':`${dias} dias restantes`}</small>
        ${pendenciasHtml?`<div class="ct-contract-alerts">${pendenciasHtml}</div>`:''}
      </div>
    </div>
    ${expandido?`<div class="ct-contract-details">
      <div class="ct-contract-meta-grid">${meta}</div>
      <div class="ct-contract-actions">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${seletor}<button onclick="event.stopPropagation();abrirContratoGerencial('${id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--blue-bg);background:var(--blue-bg);color:var(--blue-text);cursor:pointer;white-space:nowrap">Gerenciar contrato</button>${btnEmailCt}${btnEncerrarCt}${btnEditar}</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--text2)">
          <span>Inicial: <b>${valorInicial?_ctMoney(valorInicial):'-'}</b></span>
          <span>Reajustado: <b>${valorReajustado?_ctMoney(valorReajustado):'-'}</b></span>
          <span>${_ctPendenciasResumo(r)}</span>
        </div>
      </div>
      ${_ctCardItensHtml(r.id)}
    </div>`:''}
  </article>`;
}

function _ctCardItensHtml(contratoId){
  const itens=ctItensPorContrato[contratoId];
  if(itens===undefined) return `<div style="font-size:12px;color:var(--text3);padding:8px 0"><span class="spinner"></span> Carregando itens...</div>`;
  if(!itens.length) return `<div style="font-size:12px;color:var(--text3);padding:8px 0">Nenhum item vinculado a este contrato nesta matriz.</div>`;
  const contrato=contratosRows.find(r=>String(r.id)===String(contratoId));
  const eventos=contrato?._contractEvents||[];
  const mensal=itens.every(i=>i.origem==='servico_mensal'||i.origem==='servico_trimestral');
  const trimestral=itens.every(i=>i.origem==='servico_trimestral');
  const porDemanda=itens.every(i=>i.origem==='servico_demanda');
  const linhas=itens.map(i=>{
    const valorUnit=_ctNum(i.valor_contratado??i.valor_estimado);
    const qtde=Number(i.qtde)||0;
    const qtdeInicial=_ctQuantidadeInicialItem(i,eventos);
    if(mensal){
      const valorMensal=valorUnit*qtde;
      return `<tr><td style="padding:7px 10px">${_sanEsc(i.descricao||'-')}</td><td style="padding:7px 10px;text-align:right">${qtdeInicial}</td><td style="padding:7px 10px;text-align:right;font-weight:700">${qtde}</td><td style="padding:7px 10px;text-align:right">${valorUnit?_ctMoney(valorUnit):'-'}</td><td style="padding:7px 10px;text-align:right">${valorMensal?_ctMoney(valorMensal):'-'}</td></tr>`;
    }
    const entregas=(i.itens_entregas||[]).filter(e=>(e.status||'')!=='cancelada');
    // Serviço por demanda não possui recebimento físico: o executado vem da medição aprovada.
    const executado=porDemanda?(Number(i._qtdeMedida)||0):entregas.reduce((s,e)=>s+(Number(e.qtde_recebida)||0),0);
    const saldo=qtde-executado;
    const valorTotal=valorUnit*qtde;
    const valorSaldo=Math.max(saldo,0)*valorUnit;
    return `<tr><td style="padding:7px 10px">${_sanEsc(i.descricao||'-')}</td><td style="padding:7px 10px">${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' ')||'-')}</td><td style="padding:7px 10px;text-align:right">${qtdeInicial}</td><td style="padding:7px 10px;text-align:right;font-weight:700">${qtde}</td><td style="padding:7px 10px;text-align:right">${executado}</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:${saldo<=0?'var(--green)':'var(--amber)'}">${saldo}</td><td style="padding:7px 10px;text-align:right">${valorUnit?_ctMoney(valorUnit):'-'}</td><td style="padding:7px 10px;text-align:right">${valorTotal?_ctMoney(valorTotal):'-'}</td><td style="padding:7px 10px;text-align:right;font-weight:700;color:${saldo<=0?'var(--green)':'var(--text)'}">${_ctMoney(valorSaldo)}</td></tr>`;
  }).join('');
  const header=mensal
    ?`<th style="padding:7px 10px">Item</th><th style="padding:7px 10px;text-align:right">Qtde inicial</th><th style="padding:7px 10px;text-align:right">Qtde atual</th><th style="padding:7px 10px;text-align:right">Valor unit.</th><th style="padding:7px 10px;text-align:right">Valor ${trimestral?'trimestral':'mensal'}</th>`
    :`<th style="padding:7px 10px">Item</th><th style="padding:7px 10px">Marca/Modelo</th><th style="padding:7px 10px;text-align:right">Qtde inicial</th><th style="padding:7px 10px;text-align:right">Qtde atual</th><th style="padding:7px 10px;text-align:right">${porDemanda?'Executado':'Recebido'}</th><th style="padding:7px 10px;text-align:right">Saldo</th><th style="padding:7px 10px;text-align:right">Valor unit.</th><th style="padding:7px 10px;text-align:right">Valor total</th><th style="padding:7px 10px;text-align:right">Valor do saldo</th>`;
  return `<div class="ct-contract-items-table${mensal?' is-monthly':''}">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${mensal?'620px':'860px'}">
      <thead><tr style="background:var(--blue-bg);color:var(--blue-text);text-align:left">${header}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>`;
}

function _ctLinhaItensHtml(contratoId){
  const itens=ctItensPorContrato[contratoId];
  if(itens===undefined){
    return `<tr><td colspan="${CT_TABLE_COLSPAN}" style="padding:10px 16px;color:var(--text3);background:var(--surface2)"><span class="spinner"></span> Carregando itens...</td></tr>`;
  }
  if(!itens.length){
    return `<tr><td colspan="${CT_TABLE_COLSPAN}" style="padding:10px 16px;color:var(--text3);background:var(--surface2)">Nenhum item vinculado a este contrato nesta matriz.</td></tr>`;
  }
  // Serviço mensal fixo (ex.: manutenção de equipamentos) não tem recebimento/saldo/AF
  // por item — é quantidade coberta pelo contrato, cobrada mês a mês.
  const contrato=contratosRows.find(r=>String(r.id)===String(contratoId));
  const eventos=contrato?._contractEvents||[];
  if(itens.every(i=>i.origem==='servico_mensal'||i.origem==='servico_trimestral')) return _ctLinhaItensServicoMensalHtml(itens,eventos,itens.every(i=>i.origem==='servico_trimestral'));
  const linhas=itens.map(i=>{
    const entregas=(i.itens_entregas||[]).filter(e=>(e.status||'')!=='cancelada');
    const recebido=entregas.reduce((s,e)=>s+(Number(e.qtde_recebida)||0),0);
    const qtde=Number(i.qtde)||0;
    const qtdeInicial=_ctQuantidadeInicialItem(i,eventos);
    const saldo=qtde-recebido;
    const valorUnit=_ctNum(i.valor_contratado??i.valor_estimado);
    const valorTotal=valorUnit*qtde;
    const temAF=entregas.some(e=>e.af_numero);
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 10px 6px 40px">${_sanEsc(i.descricao||'—')}</td>
      <td style="padding:6px 10px">${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' ')||'—')}</td>
      <td style="padding:6px 10px;text-align:right">${qtdeInicial}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700">${qtde}</td>
      <td style="padding:6px 10px;text-align:right">${recebido}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:600;color:${saldo<=0?'var(--green)':'var(--amber)'}">${saldo}</td>
      <td style="padding:6px 10px;text-align:right">${valorUnit?_ctMoney(valorUnit):'—'}</td>
      <td style="padding:6px 10px;text-align:right">${valorTotal?_ctMoney(valorTotal):'—'}</td>
      <td style="padding:6px 10px">${temAF?'✅ emitida':'<span style="color:var(--amber-text)">⚠ sem AF</span>'}</td>
    </tr>`;
  }).join('');
  return `<tr><td colspan="${CT_TABLE_COLSPAN}" style="padding:0;background:var(--surface2)">
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <thead><tr style="color:var(--text2);text-align:left">
        <th style="padding:6px 10px 6px 40px">Item</th><th style="padding:6px 10px">Marca/Modelo</th>
        <th style="padding:6px 10px;text-align:right">Qtde inicial</th><th style="padding:6px 10px;text-align:right">Qtde atual</th><th style="padding:6px 10px;text-align:right">Recebido</th>
        <th style="padding:6px 10px;text-align:right">Saldo</th><th style="padding:6px 10px;text-align:right">Valor unit.</th>
        <th style="padding:6px 10px;text-align:right">Valor total</th><th style="padding:6px 10px">AF</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </td></tr>`;
}
// Itens de serviço mensal fixo: sem marca/modelo, recebido, saldo ou AF — só qtde contratada e valor mensal.
function _ctLinhaItensServicoMensalHtml(itens,eventos=[],trimestral=false){
  const linhas=itens.map(i=>{
    const qtde=Number(i.qtde)||0;
    const qtdeInicial=_ctQuantidadeInicialItem(i,eventos);
    const valorUnit=_ctNum(i.valor_contratado??i.valor_estimado);
    const valorMensal=valorUnit*qtde;
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 10px 6px 40px">${_sanEsc(i.descricao||'—')}</td>
      <td style="padding:6px 10px;text-align:right">${qtdeInicial}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700">${qtde}</td>
      <td style="padding:6px 10px;text-align:right">${valorUnit?_ctMoney(valorUnit):'—'}</td>
      <td style="padding:6px 10px;text-align:right">${valorMensal?_ctMoney(valorMensal):'—'}</td>
    </tr>`;
  }).join('');
  return `<tr><td colspan="${CT_TABLE_COLSPAN}" style="padding:0;background:var(--surface2)">
    <table style="width:auto;min-width:0;font-size:12px;border-collapse:collapse">
      <thead><tr style="color:var(--text2);text-align:left">
        <th style="padding:6px 16px 6px 40px">Item</th>
        <th style="padding:6px 16px;text-align:right">Qtde inicial</th>
        <th style="padding:6px 16px;text-align:right">Qtde atual</th>
        <th style="padding:6px 16px;text-align:right">Valor unit.</th>
        <th style="padding:6px 16px;text-align:right">Valor ${trimestral?'trimestral':'mensal'}</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </td></tr>`;
}
async function ctToggleExpand(id){
  ctExpandido[id]=!ctExpandido[id];
  if(ctExpandido[id] && !ctItensPorContrato[id]){
    renderTabelaContratos();
    const [itensRes,medicoesRes]=await Promise.all([
      sb.from('itens').select('id,descricao,qtde,marca,modelo,origem,valor_contratado,valor_estimado,itens_entregas(id,af_numero,qtde_recebida,status)').eq('contrato_id',id).in('origem',['aquisicao','servico_mensal','servico_trimestral','servico_demanda']).order('created_at'),
      sb.from('contratos_medicoes').select('status,contratos_medicao_itens(item_id,quantidade_executada,quantidade_aceita)').eq('contrato_id',id)
    ]);
    const statusQueExecuta=new Set(['aprovada','aprovada_pelo_fiscal','aprovada_com_glosa','validada','encaminhada']);
    const medidoPorItem=new Map();
    (medicoesRes.error?[]:(medicoesRes.data||[])).filter(m=>statusQueExecuta.has(String(m.status||'').toLowerCase())).forEach(m=>{
      (m.contratos_medicao_itens||[]).forEach(mi=>{
        const itemId=String(mi.item_id||'');
        if(itemId) medidoPorItem.set(itemId,(medidoPorItem.get(itemId)||0)+_ctNum(mi.quantidade_aceita??mi.quantidade_executada));
      });
    });
    ctItensPorContrato[id]=itensRes.error?[]:(itensRes.data||[]).map(item=>({...item,_qtdeMedida:medidoPorItem.get(String(item.id))||0}));
  }
  renderTabelaContratos();
}

function atualizarBotaoManterStatus(){
  const btn=document.getElementById('ct-manter-status');
  if(!btn) return;
  const permitido=podeEditar('contratos');
  btn.style.display=permitido?'':'none';
  btn.disabled=!permitido||contratosSelecionados.size===0;
  btn.textContent=contratosSelecionados.size?`Manter Status (${contratosSelecionados.size})`:'Manter Status';
}
function selecionarContrato(id,selecionado){
  if(!podeEditar('contratos')) return;
  if(selecionado) contratosSelecionados.add(String(id)); else contratosSelecionados.delete(String(id));
  const visiveis=contratosFiltrados.map(r=>String(r.id));
  const todos=document.getElementById('ct-select-all');
  if(todos) todos.checked=visiveis.length>0&&visiveis.every(id=>contratosSelecionados.has(id));
  atualizarBotaoManterStatus();
}
function selecionarTodosContratos(checkbox){
  if(!podeEditar('contratos')){checkbox.checked=false;return;}
  contratosFiltrados.forEach(r=>checkbox.checked?contratosSelecionados.add(String(r.id)):contratosSelecionados.delete(String(r.id)));
  renderTabelaContratos();
}
async function manterStatusContratos(){
  if(!podeEditar('contratos')||!contratosSelecionados.size) return;
  const ids=[...contratosSelecionados];
  if(!await uiConfirm(`Atualizar data de ${ids.length} contratos selecionados?`)) return;
  const btn=document.getElementById('ct-manter-status');btn.disabled=true;btn.textContent='Atualizando...';
  const hoje=new Date().toLocaleDateString('pt-BR');
  const {error}=await sb.from('contratos').update({data_atualizacao:hoje}).in('id',ids);
  if(error){alert('Erro ao atualizar contratos: '+error.message);atualizarBotaoManterStatus();return;}
  contratosSelecionados.clear();
  contratosCarregado=false;
  await loadContratos();
  atualizarBotaoManterStatus();
}

let _ctEdicaoId=null;
const CT_EDIT_FIELDS={
  'ec-tipo':'tipo_instrumento','ec-cpl':'cpl','ec-numero':'numero_contrato','ec-objeto':'objeto','ec-email':'email_empresa','ec-prefixo':'prefixo_chamado','ec-secao':'secao','ec-status':'status','ec-inicio':'data_inicio','ec-assinatura':'data_assinatura','ec-vigencia':'vigencia_atual','ec-vencimento':'vencimento','ec-valor-inicial':'valor_inicial','ec-valor-atual':'valor_atual','ec-valor-mensal':'valor_mensal','ec-fonte':'fonte','ec-fiscalizacao':'fiscalizacao','ec-contato':'contato','ec-obs':'obs'
};
function abrirEditarContrato(id){
  if(!_isAdmin()){alert('A edição completa de contratos é exclusiva para administradores.');return;}
  const contrato=contratosRows.find(r=>String(r.id)===String(id));
  if(!contrato) return;
  _ctEdicaoId=contrato.id;
  Object.entries(CT_EDIT_FIELDS).forEach(([campo,coluna])=>{document.getElementById(campo).value=contrato[coluna]??'';});
  if(_ctEhTrimestral(contrato)) document.getElementById('ec-valor-mensal').value=contrato.valor_periodico_num??'';
  const periodoLabel=document.getElementById('ec-valor-periodico-label');
  if(periodoLabel) periodoLabel.textContent=_ctEhTrimestral(contrato)?'Valor trimestral':'Valor mensal';
  preencherSelectSecoes('ec-secao', false, contrato.secao).then(()=>aplicarSecaoTextoFormulario('ec-secao',contrato.secao||''));
  preencherSelectPessoas('ec-fiscalizacao', false, contrato.fiscalizacao).then(()=>{ const s=document.getElementById('ec-fiscalizacao'); if(s) s.value=contrato.fiscalizacao||''; });
  // combobox de fornecedor
  const _ecLabel=document.getElementById('ec-fornecedor-label');
  if(_ecLabel){_ecLabel.textContent='Selecione ou pesquise a empresa...';_ecLabel.classList.add('company-combobox-placeholder');}
  document.getElementById('ec-prestador').style.display='none';
  const _ecCnpj=document.getElementById('ec-cnpj'); if(_ecCnpj){_ecCnpj.value=contrato.cnpj||'';_ecCnpj.readOnly=!!contrato.fornecedor_id;}
  preencherSelectFornecedoresEc().then(()=>{
    const _ecSel=document.getElementById('ec-fornecedor'); if(!_ecSel) return;
    if(contrato.fornecedor_id){
      _ecSel.value=String(contrato.fornecedor_id);
      const _opt=_ecSel.options[_ecSel.selectedIndex];
      if(_opt&&_opt.value&&_ecLabel){_ecLabel.textContent=_opt.text;_ecLabel.classList.remove('company-combobox-placeholder');}
    } else if(contrato.prestador&&_ecLabel){
      _ecLabel.textContent=contrato.prestador+' ⚠ (não vinculado ao cadastro)';
      _ecLabel.classList.remove('company-combobox-placeholder');
    }
  });
  ecTipoInstrumentoChange();
  document.getElementById('ec-msg').className='fmsg';
  document.getElementById('modal-editar-contrato').classList.add('active');
}
async function salvarEdicaoContrato(){
  if(!_isAdmin()||!_ctEdicaoId) return;
  const numeroContrato=document.getElementById('ec-numero').value.trim();
  if(!numeroContrato){showMsg('ec','Informe o número do contrato/SIM (*).','err');return;}
  const prefixo=document.getElementById('ec-prefixo').value.trim().toUpperCase();
  if(prefixo&&!/^[A-Z]+$/.test(prefixo)){showMsg('ec','O prefixo deve conter somente letras.','err');return;}
  const dados={};
  Object.entries(CT_EDIT_FIELDS).forEach(([campo,coluna])=>{
    let valor=document.getElementById(campo).value;
    if(['valor_inicial','valor_atual','valor_mensal'].includes(coluna)) valor=valor===''?null:Number(valor);
    else valor=String(valor).trim()||null;
    dados[coluna]=valor;
  });
  delete dados.valor_inicial;
  delete dados.valor_atual;
  if(_ctEhTrimestral(contratosRows.find(r=>String(r.id)===String(_ctEdicaoId)))){
    dados.valor_periodico_num=dados.valor_mensal;
    dados.valor_mensal=null;
  }else if(dados.valor_mensal!=null){
    dados.valor_mensal_num=dados.valor_mensal;
    dados.valor_periodico_num=dados.valor_mensal;
  }
  dados.secao_id=_secoesOrganizacionais.find(s=>s.sigla===dados.secao)?.id||null;
  if(dados.tipo_instrumento==="ATA") dados.valor_mensal=null;
  dados.prefixo_chamado=prefixo||null;
  // fornecedor via combobox
  const _ecSel=document.getElementById('ec-fornecedor');
  if(_ecSel&&_ecSel.value==="__nova__"){
    const _ecNome=document.getElementById('ec-prestador').value.trim();
    const _ecCnpj=document.getElementById('ec-cnpj').value.trim();
    if(!_ecNome){showMsg('ec','Informe a razão social da nova empresa.','err');return;}
    try{ dados.fornecedor_id=await obterOuCriarFornecedor(_ecNome,_ecCnpj); dados.prestador=_ecNome; dados.cnpj=_ecCnpj||null; }
    catch(e){showMsg('ec','Erro ao salvar empresa: '+(e.message||e),'err');return;}
  } else if(_ecSel&&_ecSel.value){
    dados.fornecedor_id=Number(_ecSel.value)||null;
    dados.prestador=_ecSel.options[_ecSel.selectedIndex]?.text||null;
    dados.cnpj=document.getElementById('ec-cnpj').value.trim()||null;
  }
  const btn=document.getElementById('ec-salvar');btn.disabled=true;btn.textContent='Salvando...';
  const {error}=await sb.from('contratos').update(dados).eq('id',_ctEdicaoId);
  btn.disabled=false;btn.textContent='Salvar alterações';
  if(error){showMsg('ec','Erro: '+error.message,'err');return;}
  showMsg('ec','✓ Contrato atualizado.','ok');
  contratosCarregado=false;await loadContratos();
  if(atasContratos&&atasContratos.length) await loadAtas(); // mantém Atas Rp Vigentes em sincronia se estava carregada
  setTimeout(()=>document.getElementById('modal-editar-contrato').classList.remove('active'),700);
}

let _ctEmailId=null;

function ctRenderEmails(emails){
  const lista=document.getElementById('ct-emails-lista');
  if(!lista) return;
  lista.innerHTML='';
  const arr=emails.length?emails:[''];
  arr.forEach(em=>{
    const div=document.createElement('div');
    div.style='display:flex;gap:6px;margin-bottom:6px;align-items:center';
    div.innerHTML=`<input type="email" value="${_sanEsc(em)}" placeholder="contato@empresa.com" autocomplete="email" style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)"><button type="button" onclick="ctRemoverEmail(this)" style="background:var(--red-bg);color:var(--red-text);border:none;border-radius:var(--radius-sm);padding:4px 8px;cursor:pointer;font-size:13px;flex-shrink:0" title="Remover">✕</button>`;
    lista.appendChild(div);
  });
}

function ctAdicionarEmail(){
  const lista=document.getElementById('ct-emails-lista');
  if(!lista) return;
  const div=document.createElement('div');
  div.style='display:flex;gap:6px;margin-bottom:6px;align-items:center';
  div.innerHTML=`<input type="email" placeholder="contato@empresa.com" autocomplete="email" style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)"><button type="button" onclick="ctRemoverEmail(this)" style="background:var(--red-bg);color:var(--red-text);border:none;border-radius:var(--radius-sm);padding:4px 8px;cursor:pointer;font-size:13px;flex-shrink:0" title="Remover">✕</button>`;
  lista.appendChild(div);
  div.querySelector('input').focus();
}

function ctRemoverEmail(btn){
  const lista=document.getElementById('ct-emails-lista');
  const row=btn.closest('div');
  if(lista&&lista.children.length>1) row.remove();
  else if(row) row.querySelector('input').value='';
}

function ctGetEmails(){
  const lista=document.getElementById('ct-emails-lista');
  if(!lista) return [];
  return [...lista.querySelectorAll('input[type=email]')].map(i=>i.value.trim()).filter(Boolean);
}

function abrirEmailContrato(id){
  if(!podeEditar('contratos')){alert("Sem permissão para editar contratos.");return;}
  const contrato=contratosRows.find(r=>String(r.id)===String(id));
  if(!contrato){alert("Contrato não encontrado.");return;}
  _ctEmailId=contrato.id;
  document.getElementById("ct-email-info").innerHTML=`<strong>${contrato.cpl||"Contrato"}</strong> · ${contrato.prestador||"Empresa não informada"}`;
  const emails=(contrato.email_empresa||'').split(',').map(e=>e.trim()).filter(Boolean);
  ctRenderEmails(emails);
  document.getElementById("ct-prefixo-chamado").value=contrato.prefixo_chamado||"";
  const msg=document.getElementById("ct-email-msg");msg.className="fmsg";msg.textContent="";
  document.getElementById("modal-email-contrato").classList.add("active");
  setTimeout(()=>{const f=document.querySelector('#ct-emails-lista input[type=email]');if(f)f.focus();},50);
}

async function salvarEmailContrato(){
  if(!_ctEmailId||bloquearSeVisualiz('contratos')) return;
  const emails=ctGetEmails();
  const msg=document.getElementById("ct-email-msg");
  // valida cada email
  for(const em of emails){
    const tmp=document.createElement('input');tmp.type='email';tmp.value=em;
    if(!tmp.checkValidity()){msg.textContent=`E-mail inválido: ${em}`;msg.className="fmsg err";return;}
  }
  const prefixo=document.getElementById("ct-prefixo-chamado").value.trim().toUpperCase();
  if(prefixo&&!/^[A-Z]+$/.test(prefixo)){msg.textContent="O prefixo deve conter somente letras.";msg.className="fmsg err";return;}
  const emailStr=emails.join(',')||null;
  const btn=document.getElementById("ct-email-salvar");btn.disabled=true;btn.textContent="Salvando...";
  const {data,error}=await sb.from("contratos").update({email_empresa:emailStr,prefixo_chamado:prefixo||null}).eq("id",_ctEmailId).select("id,email_empresa,prefixo_chamado");
  btn.disabled=false;btn.textContent="Salvar vinculações";
  if(error){msg.textContent="Erro: "+error.message;msg.className="fmsg err";return;}
  if(!data?.length){msg.textContent="As vinculações não foram salvas. Verifique sua permissão de edição em Contratos.";msg.className="fmsg err";return;}
  const local=contratosRows.find(r=>String(r.id)===String(_ctEmailId));if(local)Object.assign(local,{email_empresa:emailStr,prefixo_chamado:prefixo||null});
  const modalCt=_contratosParaModal.find(r=>String(r.id)===String(_ctEmailId));if(modalCt)Object.assign(modalCt,{email_empresa:emailStr,prefixo_chamado:prefixo||null});
  renderTabelaContratos();
  msg.textContent="✓ Vinculações salvas.";msg.className="fmsg ok";
  setTimeout(()=>document.getElementById("modal-email-contrato").classList.remove("active"),700);
}

async function abrirDetalheContratoLegado(id){
  _ctAtual=contratosRows.find(r=>String(r.id)===String(id))||null;
  if(!_ctAtual) return;
  const el=document.getElementById("modal-contrato-detalhe");
  document.getElementById("mcd-titulo").textContent=`📋 ${_ctAtual.cpl||"Contrato"} — ${_ctAtual.prestador||""}`;
  document.getElementById("mcd-corpo").innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--text3)"><span class="spinner"></span> Carregando...</div>`;
  el.classList.add("active");
  const editor=podeEditar('contratos');
  document.getElementById("mcd-acoes").style.display=editor?"block":"none";

  const [vigRes,histRes,fiscRes,itemRes]=await Promise.all([
    sb.from("contratos_vigencias").select("*").eq("contrato_id",id).order("data_inicio",{ascending:false}),
    sb.from("contratos_historico").select("*").eq("contrato_id",id).order("created_at",{ascending:false}),
    sb.from("contratos_fiscalizadores").select("*").eq("contrato_id",id).order("data_inicio",{ascending:false}),
    sb.from("atas_itens").select("*").eq("contrato_id",id).order("item")
  ]);

  const c=_ctAtual;
  const cor=corVencimento(c.vencimento);
  const campos=[
    ["Tipo",c.tipo_instrumento||"CONTRATO"],["CPL",c.cpl],["Nº do contrato",c.numero_contrato],["Prestador",c.prestador],
    ["E-mail da empresa",c.email_empresa||"—"],["Prefixo de chamado",c.prefixo_chamado||"—"],["Objeto",c.objeto],["Seção",c.secao],
    ["Vigência atual",c.vigencia_atual||"—"],["Vencimento",`<span style="color:${cor};font-weight:600">${c.vencimento||"—"}</span>`],
    ["Status",badgeStatusContrato(c.status,(()=>{const d=diasContratoVencer(c.vencimento);return d!==null&&d<0;})())],["Valor total",(c.valor_atual??c.valor_inicial)!=null?`R$ ${Number(c.valor_atual??c.valor_inicial).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"],
    ["Fiscalização",c.fiscalizacao||"—"],["Obs",c.obs]
  ];
  if(c.tipo_instrumento!=="ATA"){
    const trimestral=_ctEhTrimestral(c);
    const valorPeriodo=trimestral?c.valor_periodico_num:c.valor_mensal;
    campos.splice(12,0,[trimestral?"Valor trimestral":"Valor mensal",valorPeriodo!=null?`R$ ${Number(valorPeriodo).toLocaleString("pt-BR",{minimumFractionDigits:2})}`:"—"]);
  }
  let html=`<div class="ficha-grid" style="margin-bottom:1.25rem">
    ${campos.map(([l,v])=>`<div class="ficha-field"><div class="ficha-field-label">${l}</div><div class="ficha-field-value">${v||`<span class="empty">—</span>`}</div></div>`).join("")}
  </div>`;

  if(c.tipo_instrumento==="ATA"){
    const itens=itemRes.data||[];
    let execucoes=[];
    if(itens.length){
      const execRes=await sb.from("atas_execucao").select("ata_item_id,qtde").in("ata_item_id",itens.map(i=>i.id));
      if(!execRes.error) execucoes=execRes.data||[];
    }
    html+=`<div style="margin-bottom:1.25rem"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:.5rem"><div class="card-title" style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Itens e saldo da ATA</div>${podeEditar('atas')?`<button class="btn-primary" onclick="abrirModalNovaAta('${c.id}')" style="font-size:12px;padding:5px 10px">+ Adicionar item</button>`:""}</div>`;
    if(!itens.length){html+=`<div style="font-size:13px;color:var(--text3)">Nenhum item cadastrado nesta ATA.</div>`;}
    else html+=`<div class="table-wrap"><table style="font-size:12px"><thead><tr><th>Item</th><th>Marca/Modelo</th><th style="text-align:right">Contratada</th><th style="text-align:right">Executada</th><th style="text-align:right">Saldo</th><th style="text-align:right">Valor unit.</th></tr></thead><tbody>${itens.map(i=>{const executada=execucoes.filter(e=>String(e.ata_item_id)===String(i.id)).reduce((s,e)=>s+Number(e.qtde||0),0);const saldo=Number(i.qtde_contratada||0)-executada;return `<tr><td>${_sanEsc(i.item||"")}</td><td>${_sanEsc(i.marca_modelo||"—")}</td><td style="text-align:right">${Number(i.qtde_contratada||0)}</td><td style="text-align:right">${executada}</td><td style="text-align:right;font-weight:600;color:${saldo<=0?'var(--red)':'var(--green)'}">${saldo}</td><td style="text-align:right">${i.valor_unit?fmtFull(Number(i.valor_unit)):"—"}</td></tr>`;}).join("")}</tbody></table></div>`;
    html+=`</div>`;
  } else {
    // Fase 13: itens de aquisição/serviço mensal do contrato + destaque "sem AF" + troca de marca/modelo
    const {data:itAq}=await sb.from('itens').select('id,descricao,qtde,marca,modelo,itens_entregas(id,af_numero,status)').eq('contrato_id',id).in('origem',['aquisicao','servico_mensal','servico_trimestral','servico_demanda']).order('created_at');
    const lista=itAq||[];
    html+=`<div style="margin-bottom:1.25rem"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:.5rem"><div class="card-title" style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Itens do contrato</div>${editor&&lista.length?`<button class="btn-secondary" onclick="abrirTrocaMarcaModelo('${c.id}')" style="font-size:12px;padding:5px 10px">🔧 Trocar marca/modelo (aditivo)</button>`:""}</div>`;
    if(!lista.length){ html+=`<div style="font-size:13px;color:var(--text3)">Nenhum item vinculado.</div>`; }
    else html+=`<div class="table-wrap"><table style="font-size:12px"><thead><tr><th>Item</th><th>Marca/Modelo</th><th style="text-align:right">Qtde</th><th>AF</th></tr></thead><tbody>${lista.map(i=>{
      const afs=(i.itens_entregas||[]).filter(e=>(e.status||'')!=='cancelada' && e.af_numero);
      const semAF=afs.length===0;
      return `<tr style="${semAF?'background:#EF9F2718':''}"><td>${_sanEsc(i.descricao||'—')}</td><td>${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' ')||'—')}</td><td style="text-align:right">${i.qtde??'—'}</td><td>${semAF?'<span class="badge" style="background:#EF9F2722;color:#EF9F27;white-space:nowrap">⚠ sem AF emitida</span>':_sanEsc(afs.map(a=>a.af_numero).join(', '))}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
  }

  const vigs=vigRes.data||[];
  html+=`<div style="margin-bottom:1.25rem"><div class="card-title" style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Vigências</div>`;
  if(!vigs.length){html+=`<div style="font-size:13px;color:var(--text3)">Nenhuma vigência registrada</div>`;}
  else{html+=`<table style="width:100%;font-size:12px;border-collapse:collapse">`+vigs.map(v=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:5px 8px">${fmtDate(v.data_inicio)}</td><td style="padding:5px 8px">→</td><td style="padding:5px 8px">${fmtDate(v.data_fim)}</td><td style="padding:5px 8px;color:var(--text3)">${v.obs||""}</td></tr>`).join("")+`</table>`;}
  html+=`</div>`;

  const fiscais=fiscRes.data||[];
  html+=`<div style="margin-bottom:1.25rem"><div class="card-title" style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Fiscalizadores</div>`;
  if(!fiscais.length){html+=`<div style="font-size:13px;color:var(--text3)">Nenhum fiscalizador registrado</div>`;}
  else{html+=fiscais.map(f=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:baseline"><span style="font-weight:500">${f.nome||"—"}</span><span style="font-size:11px;color:var(--text3)">${f.cargo||""}</span><span style="font-size:11px;color:var(--text3);margin-left:auto">desde ${fmtDate(f.data_inicio)}${f.data_fim?" até "+fmtDate(f.data_fim):""}</span></div>`).join("");}
  html+=`</div>`;

  const hist=histRes.data||[];
  html+=`<div><div class="card-title" style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Histórico de eventos</div>`;
  if(!hist.length){html+=`<div style="font-size:13px;color:var(--text3)">Nenhum evento registrado</div>`;}
  else{html+=hist.map(h=>`<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)"><span style="font-weight:500;color:var(--blue)">${h.tipo||"Evento"}</span> <span style="color:var(--text3);font-size:11px">${fmtDate((h.created_at||"").substring(0,10))}</span>${h.obs?` — <span style="color:var(--text2)">${h.obs}</span>`:""}</div>`).join("");}
  html+=`</div>`;

  document.getElementById("mcd-corpo").innerHTML=html;
}

function fecharContratoIndividual(){
  document.getElementById('modal-contrato-detalhe')?.classList.remove('active');
  if(location.hash.startsWith('#/contratos/')) history.replaceState(null,'',location.pathname+location.search);
  window._contratoGerencialId=null;
}

function ctOpenContratoTab(tab){
  document.querySelectorAll('.ct-detail-tab').forEach(btn=>{
    const active=btn.dataset.tab===tab;
    btn.classList.toggle('active',active);
    btn.style.borderBottomColor=active?'var(--blue)':'transparent';
    btn.style.color=active?'var(--blue)':'var(--text)';
  });
  document.querySelectorAll('.ct-detail-pane').forEach(pane=>pane.style.display=pane.dataset.tab===tab?'block':'none');
}

async function abrirContratoPorHash(){
  const m=location.hash.match(/^#\/contratos\/([^/]+)$/);
  if(!m) return;
  const id=decodeURIComponent(m[1]);
  if(!contratosCarregado) await loadContratos();
  await abrirDetalheContrato(id);
}

window.addEventListener('hashchange',abrirContratoPorHash);
setTimeout(abrirContratoPorHash,0);

async function abrirDetalheContrato(id){
  _ctAtual=contratosRows.find(r=>String(r.id)===String(id))||null;
  const el=document.getElementById("modal-contrato-detalhe");
  if(!el) return;
  el.classList.add("active");

  if(!_ctAtual){
    document.getElementById("mcd-titulo").textContent="Contrato não encontrado";
    document.getElementById("mcd-corpo").innerHTML=`<div style="padding:1.25rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2)">
      <div style="font-weight:700;margin-bottom:.375rem">Não foi possível localizar o contrato.</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:1rem">ID solicitado: <code>${_sanEsc(String(id))}</code></div>
      <button class="btn-secondary" onclick="fecharContratoIndividual()">Voltar para Contratos em execução</button>
    </div>`;
    const acoes=document.getElementById("mcd-acoes");if(acoes)acoes.style.display="none";
    return;
  }

  window._contratoGerencialId=id;
  document.getElementById("mcd-titulo").textContent=`Gestão do contrato ${_ctAtual.numero_contrato||_ctAtual.cpl||_ctAtual.id}`;
  document.getElementById("mcd-corpo").innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--text3)"><span class="spinner"></span> Carregando contrato...</div>`;

  const editor=podeEditar('contratos');
  const acoes=document.getElementById("mcd-acoes");
  if(acoes) acoes.style.display="none";

  const [vigRes,histRes,fiscRes,itemRes,medRes,nfRes,termoRes,docRes]=await Promise.all([
    sb.from("contratos_vigencias").select("*").eq("contrato_id",id).order("data_inicio",{ascending:false}),
    sb.from("contratos_historico").select("*").eq("contrato_id",id).order("created_at",{ascending:false}),
    sb.from("contratos_fiscalizadores").select("*").eq("contrato_id",id).order("data_inicio",{ascending:false}),
    sb.from("itens").select("id,descricao,qtde,origem,marca,modelo,valor_contratado,valor_estimado,itens_entregas(id,af_numero,qtde_recebida,status)").eq("contrato_id",id).in("origem",["aquisicao","servico_mensal","servico_trimestral","servico_demanda"]).order("created_at"),
    sb.from("contratos_medicoes").select("*,contratos_medicao_itens(*),contratos_medicao_glosas(*)").eq("contrato_id",id).order("data_medicao",{ascending:false}),
    sb.from("notas_fiscais").select("*").eq("contrato_id",id).order("created_at",{ascending:false}),
    sb.from("termos_ateste").select("*").eq("contrato_id",id).order("gerado_em",{ascending:false}),
    sb.from("contratos_documentos").select("*").eq("contrato_id",id).order("created_at",{ascending:false})
  ]);

  const c=_ctAtual;
  const hist=histRes.data||[];
  const fiscais=fiscRes.data||[];
  const itens=itemRes.data||[];
  const medicoes=medRes.error?[]:(medRes.data||[]);
  const notas=nfRes.error?[]:(nfRes.data||[]);
  const termos=termoRes.error?[]:(termoRes.data||[]);
  const documentos=docRes.error?[]:(docRes.data||[]);
  _ctMedicoesAtual=medicoes;
  _ctNotasAtual=notas;
  _ctTermosAtual=termos;
  _ctDocumentosAtual=documentos;
  _ctHistoricoAtual=hist;
  _ctItensAtual=itens;
  _ctFiscaisAtual=fiscais;
  const eventosContrato=_ctHistoricoToEvents(hist);
  const medicoesNorm=medicoes.map(m=>({
    ...m,
    grossValue:m.valor_bruto,
    glosaValue:m.valor_glosa,
    netValue:m.valor_liquido,
    items:m.contratos_medicao_itens||[]
  }));
  const notasNorm=notas.map(n=>({
    ...n,
    grossValue:n.valor_total,
    glosaValue:n.valor_glosa,
    approvedValue:n.valor_aprovado
  }));
  const contratoNorm=_ctModule().createContractRecord?_ctModule().createContractRecord(c):c;
  const financial=_ctModule().calculateContractFinancialSummary
    ? _ctModule().calculateContractFinancialSummary(contratoNorm,[],eventosContrato,medicoesNorm,notasNorm)
    : {
      initialValue:_ctValorInicial(c),
      initialAdjustedValue:_ctValorReajustado(c),
      currentValue:_ctValorAtual(c),
      executedValue:medicoes.filter(m=>!['rascunho','recusada','cancelada'].includes(String(m.status||'').toLowerCase())).reduce((s,m)=>s+_ctNum(m.valor_liquido),0),
      approvedInvoiceValue:notas.filter(n=>['aprovada','aprovada_com_glosa','encaminhada_para_pagamento'].includes(String(n.status||'').toLowerCase())).reduce((s,n)=>s+_ctNum(n.valor_aprovado??n.valor_total),0),
      contractBalance:_ctValorAtual(c)-medicoes.filter(m=>!['rascunho','recusada','cancelada'].includes(String(m.status||'').toLowerCase())).reduce((s,m)=>s+_ctNum(m.valor_liquido),0),
      additiveContractPercent:0,
      additiveLimitUsagePercent:0,
      additiveLimitUsedPercent:0,
      availableAdditiveBalance:0
    };
  const dias=diasContratoVencer(c.vencimento);
  const alertas=[];
  if(dias!==null&&dias<0) alertas.push(["Contrato vencido","var(--red-bg)","var(--red-text)"]);
  else if(dias!==null&&dias<=90) alertas.push(["Vence em até 90 dias","var(--amber-bg)","var(--amber-text)"]);
  if(!c.fiscalizacao) alertas.push(["Sem fiscal definido","var(--red-bg)","var(--red-text)"]);
  if(_ctModeloKey(c)==='nao_classificado') alertas.push(["Modelo não classificado","var(--surface2)","var(--text3)"]);
  const additiveContractPercent=financial.additiveContractPercent??(financial.additiveLimitUsedPercent?financial.additiveLimitUsedPercent/4:0);
  const additiveLimitUsagePercent=financial.additiveLimitUsagePercent??financial.additiveLimitUsedPercent??0;
  if(additiveLimitUsagePercent>=80) alertas.push(["Limite de aditivo acima de 80%","var(--red-bg)","var(--red-text)"]);
  const pendencias=[];
  const medPendentes=medicoes.filter(m=>['rascunho','registrada'].includes(String(m.status||'').toLowerCase())).length;
  const nfPendentes=notas.filter(n=>['pendente','em_conferencia'].includes(String(n.status||'').toLowerCase())).length;
  if(medPendentes) pendencias.push([`${medPendentes} medição(ões) pendente(s)`,'var(--amber-bg)','var(--amber-text)']);
  if(nfPendentes) pendencias.push([`${nfPendentes} NF(s) pendente(s)`,'var(--amber-bg)','var(--amber-text)']);

  const metric=(label,value,sub='',color='var(--text)')=>`<div class="metric"><div class="metric-label">${label}</div><div class="metric-value" style="font-size:20px;color:${color}">${value}</div><div class="metric-sub">${sub}</div></div>`;
  const actionBtn=(tab,label,fn,primary=false,color='')=>`<button class="${primary?'btn-primary':'btn-secondary'}" onclick="ctOpenContratoTab('${tab}');${fn}" style="font-size:12px;${color?`background:${color};border-color:${color};color:#fff;`:''}">${label}</button>`;
  const quickActions=editor?`
    <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;flex-wrap:wrap;border:1px solid var(--border);background:var(--surface2);border-radius:var(--radius-sm);padding:.625rem .75rem;margin-bottom:1rem">
      <div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Ações de gestão</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${actionBtn('itens','Ajustes por item (reajuste/aditivo/supressão)',"abrirModalItensEventos()")}
        ${actionBtn('prorrogacoes','Registrar prorrogação',"abrirModalContratoOp('prorrogacao')")}
        ${actionBtn('medicoes','Nova medição','abrirModalMedicaoContrato()',true)}
        ${actionBtn('notas','Vincular NF','abrirModalNotaFiscalContrato()')}
        ${actionBtn('documentos','Registrar documento','abrirModalDocumentoContrato()')}
      </div>
    </div>`:'';
  const medidoPorItem={};
  medicoes.filter(m=>!['rascunho','recusada','cancelada'].includes(String(m.status||'').toLowerCase())).forEach(m=>{
    (m.contratos_medicao_itens||[]).forEach(mi=>{
      const key=String(mi.item_id||'');
      if(!key) return;
      medidoPorItem[key]=(medidoPorItem[key]||0)+_ctNum(mi.quantidade_aceita??mi.quantidade_executada);
    });
  });
  const rowsItens=itens.map(i=>{
    const entregas=(i.itens_entregas||[]).filter(e=>(e.status||'')!=='cancelada');
    const recebido=i.origem==='servico_demanda'?(medidoPorItem[String(i.id)]||0):entregas.reduce((s,e)=>s+(Number(e.qtde_recebida)||0),0);
    const qtde=Number(i.qtde)||0;
    const qtdeInicial=_ctQuantidadeInicialItem(i,hist);
    const saldo=qtde-recebido;
    const unit=_ctNum(i.valor_contratado??i.valor_estimado);
    const valorSaldo=Math.max(saldo,0)*unit;
    const inativo=['inativo','cancelado'].includes(String(i.status||'').toLowerCase());
    return `<tr style="${inativo?'opacity:.62':''}"><td>${_sanEsc(i.descricao||'—')}<br><span style="font-size:11px;color:var(--text3)">${_sanEsc(i.status||'contratado')}</span></td><td>${_sanEsc(_ctItemTipoLabel(_ctItemTipo(i)))}</td><td>${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' ')||'—')}</td><td style="text-align:right">${qtdeInicial}</td><td style="text-align:right;font-weight:700">${qtde}</td><td style="text-align:right">${recebido}</td><td style="text-align:right">${saldo}</td><td style="text-align:right">${unit?_ctMoney(unit):'—'}</td><td style="text-align:right">${unit?_ctMoney(unit*qtde):'—'}</td><td style="text-align:right;font-weight:700;color:${saldo<=0?'var(--green)':'var(--text)'}">${_ctMoney(valorSaldo)}</td></tr>`;
  }).join('');
  const rowsVigs=(vigRes.data||[]).map(v=>`<tr><td>${fmtDate(v.data_inicio)}</td><td>${fmtDate(v.data_fim)}</td><td>${v.valor_total?fmtFull(v.valor_total):'—'}</td><td>${_sanEsc(v.obs||'')}</td></tr>`).join('');
  const rowsFiscais=fiscais.map(f=>`<tr><td>${_sanEsc(f.nome||'—')}</td><td>${_sanEsc(f.cargo||'')}</td><td>${fmtDate(f.data_inicio)}</td><td>${f.data_fim?fmtDate(f.data_fim):'Ativo'}</td></tr>`).join('');
  const relatedLabel=(type,id)=>{
    if(!type) return '—';
    if(type==='measurement'){
      const m=medicoes.find(x=>String(x.id)===String(id));
      return m?`Medição ${m.competencia||''}`:'Medição';
    }
    if(type==='invoice'){
      const n=notas.find(x=>String(x.id)===String(id));
      return n?`NF ${n.numero||''}`:'Nota fiscal';
    }
    if(type==='contractEvent') return 'Evento contratual';
    if(type==='history') return 'Histórico';
    if(type==='contract') return 'Contrato';
    return _ctRelatedTypeLabel(type);
  };
  const rowsHist=[...hist].sort((a,b)=>String(_ctHistDateValue(b)).localeCompare(String(_ctHistDateValue(a)))).map(h=>{
    const titulo=h.titulo||h.tipo||h.action_type||'Evento';
    const rel=relatedLabel(h.related_entity_type,h.related_entity_id);
    return `<tr>
      <td style="white-space:nowrap">${fmtDate((h.data_evento||h.created_at||'').substring(0,10))||'—'}<br><span style="font-size:11px;color:var(--text3)">${h.created_at?fmtDate((h.created_at||'').substring(0,10)):''}</span></td>
      <td>${_sanEsc(titulo)}<br><span style="font-size:11px;color:var(--text3)">${_sanEsc(h.action_type||h.tipo||'')}</span></td>
      <td class="td-wrap" style="max-width:420px">${_sanEsc(h.obs||'—')}</td>
      <td>${_sanEsc(h.usuario||'—')}</td>
      <td>${_sanEsc(rel)}</td>
    </tr>`;
  }).join('');
  const histPorTipo=(termos)=>hist.filter(h=>termos.some(t=>normalizar(h.tipo||'').includes(t)));
  const eventoActions=(h)=>{
    if(!editor||!h.id) return '';
    const id=_sanEsc(String(h.id));
    const aplicar=_ctEventStatus(h)==='rascunho'?`<button class="btn-primary" data-event-id="${id}" onclick="aplicarEventoContrato(this.dataset.eventId)" style="font-size:11px;padding:3px 8px">Aplicar</button> `:'';
    return `<td style="white-space:nowrap;text-align:right">${aplicar}<button class="btn-secondary" data-event-id="${id}" onclick="editarEventoContrato(this.dataset.eventId)" style="font-size:11px;padding:3px 8px">Editar</button> <button class="btn-secondary" data-event-id="${id}" onclick="excluirEventoContrato(this.dataset.eventId)" style="font-size:11px;padding:3px 8px;color:var(--red);border-color:var(--red-bg)">Excluir</button></td>`;
  };
  const rowsEvento=(termos,acoes=false)=>histPorTipo(termos).map(h=>`<tr><td>${fmtDate(h.data_evento||(h.created_at||'').substring(0,10))}</td><td>${_sanEsc(h.tipo||'Evento')}</td><td>${_ctStatusBadge(_ctEventStatus(h),{rascunho:'Rascunho',formalizado:'Formalizado',cancelado:'Cancelado'})}</td><td style="text-align:right">${h.percentual?String(h.percentual)+'%':'—'}</td><td style="text-align:right">${h.valor_impacto?_ctMoney(h.valor_impacto):(h.valor_novo?_ctMoney(h.valor_novo):'—')}</td><td>${_sanEsc(h.obs||'')}</td>${acoes?eventoActions(h):''}</tr>`).join('');
  const rowsReajustes=rowsEvento(['reajuste']);
  const rowsAditivos=rowsEvento(['aditivo'],true);
  const rowsSupressoes=rowsEvento(['supressao','supress'],true);
  const rowsProrrogacoes=histPorTipo(['prorrogacao','renovacao']).map(h=>`<tr><td>${fmtDate(h.data_evento||(h.created_at||'').substring(0,10))}</td><td>${_sanEsc(h.tipo||'Prorrogação')}</td><td>${fmtDate(h.vigencia_nova_inicio)}</td><td>${fmtDate(h.vigencia_nova_fim)}</td><td>${_sanEsc(h.obs||'')}</td></tr>`).join('');
  const medicaoLabel=(m)=>`${_sanEsc(m.competencia||'sem competência')} · ${_sanEsc(CT_MEDICAO_STATUS_LABELS[m.status]||m.status||'status')}`;
  const rowsMedicoes=medicoes.map(m=>{
    const nfCount=notas.filter(n=>String(n.medicao_id)===String(m.id)).length;
    const termo=termos.find(t=>String(t.medicao_id||'')===String(m.id));
    const termoBtn=termo?`<button class="btn-secondary" data-medicao-id="${_sanEsc(String(m.id))}" onclick="baixarTermoAtesteMedicao(this.dataset.medicaoId)" style="font-size:11px;padding:3px 8px">Baixar termo</button>`:'—';
    const glosas=m.contratos_medicao_glosas||[];
    const medItens=m.contratos_medicao_itens||[];
    const itemResumo=medItens.length?medItens.map(mi=>`${mi.descricao||'Item'}${mi.quantidade_aceita||mi.quantidade_executada?` (${mi.quantidade_aceita??mi.quantidade_executada})`:''}`).join('; '):'—';
    return `<tr>
      <td>${_sanEsc(m.competencia||'—')}<br><span style="font-size:11px;color:var(--text3)">${fmtDate(m.data_medicao)}</span></td>
      <td>${_sanEsc(_ctHumanize(m.tipo_medicao||'competencia'))}</td>
      <td class="td-wrap" style="max-width:220px">${_sanEsc(itemResumo)}</td>
      <td>${_sanEsc(m.fiscal_responsavel||'—')}</td>
      <td style="text-align:right">${_ctMoney(m.valor_bruto)}</td>
      <td style="text-align:right;color:${_ctNum(m.valor_glosa)>0?'var(--red)':'var(--text2)'}">${_ctMoney(m.valor_glosa)}</td>
      <td style="text-align:right;font-weight:700">${_ctMoney(m.valor_liquido)}</td>
      <td>${editor?_ctStatusSelectHtml(m.status,CT_MEDICAO_STATUS_LABELS,'medicao',m.id):_ctStatusBadge(m.status,CT_MEDICAO_STATUS_LABELS)}</td>
      <td>${nfCount?nfCount+' NF(s)':'—'}</td>
      <td class="td-wrap" style="max-width:220px">${m.data_execucao_preventiva?`<strong>Preventiva/calibração:</strong> ${fmtDate(m.data_execucao_preventiva)}<br>`:''}${m.relatorio_servico_referencia?`<strong>Relatório:</strong> ${_sanEsc(m.relatorio_servico_referencia)}<br>`:''}${_sanEsc(m.observacoes||glosas.map(g=>g.motivo).filter(Boolean).join('; ')||'—')}</td>
      <td>${termoBtn}</td>
    </tr>`;
  }).join('');
  const rowsNotas=notas.map(n=>{
    const med=medicoes.find(m=>String(m.id)===String(n.medicao_id));
    return `<tr>
      <td>${_sanEsc(n.numero||'—')}${n.serie?`<br><span style="font-size:11px;color:var(--text3)">Série ${_sanEsc(n.serie)}</span>`:''}</td>
      <td>${med?medicaoLabel(med):'<span style="color:var(--red)">Sem medição</span>'}</td>
      <td>${fmtDate(n.data_emissao)||'—'}<br><span style="font-size:11px;color:var(--text3)">Receb.: ${fmtDate(n.data_recebimento)||'—'}</span></td>
      <td style="text-align:right">${_ctMoney(n.valor_total)}</td>
      <td style="text-align:right;color:${_ctNum(n.valor_glosa)>0?'var(--red)':'var(--text2)'}">${_ctMoney(n.valor_glosa)}</td>
      <td style="text-align:right;font-weight:700">${_ctMoney(n.valor_aprovado??n.valor_total)}</td>
      <td>${editor?_ctStatusSelectHtml(n.status,CT_NF_STATUS_LABELS,'nota',n.id):_ctStatusBadge(n.status,CT_NF_STATUS_LABELS)}</td>
      <td class="td-wrap" style="max-width:220px">${_sanEsc(n.observacoes||'—')}</td>
    </tr>`;
  }).join('');
  const medError=medRes.error?`<div style="font-size:12px;color:var(--red);margin-bottom:.75rem">A estrutura de medições ainda não está disponível no banco: ${_sanEsc(medRes.error.message||'erro ao consultar contratos_medicoes')}.</div>`:'';
  const nfError=nfRes.error?`<div style="font-size:12px;color:var(--red);margin-bottom:.75rem">Não foi possível carregar notas fiscais: ${_sanEsc(nfRes.error.message||'erro ao consultar notas_fiscais')}.</div>`:'';
  const docError=docRes.error?`<div style="font-size:12px;color:var(--red);margin-bottom:.75rem">A estrutura de documentos ainda não está disponível no banco: ${_sanEsc(docRes.error.message||'erro ao consultar contratos_documentos')}.</div>`:'';
  const rowsDocumentos=documentos.map(d=>{
    const link=d.url_arquivo?`<a href="${_sanEsc(d.url_arquivo)}" target="_blank" rel="noopener" style="color:var(--blue)">Abrir referência</a>`:'—';
    const ref=[d.nome_arquivo,d.referencia].filter(Boolean).join(' · ');
    return `<tr>
      <td>${_sanEsc(_ctDocTypeLabel(d.tipo_documento))}</td>
      <td class="td-wrap" style="max-width:260px">${_sanEsc(d.titulo||'—')}<br><span style="font-size:11px;color:var(--text3)">${_sanEsc([d.numero_documento,fmtDate(d.data_documento)].filter(Boolean).join(' · ')||'sem número/data')}</span></td>
      <td>${_sanEsc(_ctRelatedTypeLabel(d.related_entity_type))}<br><span style="font-size:11px;color:var(--text3)">${_sanEsc(relatedLabel(d.related_entity_type,d.related_entity_id))}</span></td>
      <td class="td-wrap" style="max-width:260px">${_sanEsc(ref||'—')}<br>${link}</td>
      <td class="td-wrap" style="max-width:220px">${_sanEsc(d.observacoes||'—')}</td>
      <td>${fmtDate((d.created_at||'').substring(0,10))||'—'}</td>
    </tr>`;
  }).join('');

  document.getElementById("mcd-corpo").innerHTML=`
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap">
      <div>
        <button class="btn-secondary" onclick="fecharContratoIndividual()" style="margin-bottom:.75rem">← Voltar para Contratos em execução</button>
        <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1.15">Contrato ${_sanEsc(c.numero_contrato||c.cpl||String(c.id))}</div>
        <div style="font-size:13px;color:var(--text2);margin-top:.375rem;max-width:760px">${_sanEsc(c.objeto||'Objeto não informado')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${badgeStatusContrato(c.status,dias!==null&&dias<0)}</div>
    </div>

    <div class="ficha-grid" style="margin-bottom:1rem">
      <div class="ficha-field"><div class="ficha-field-label">Fornecedor</div><div class="ficha-field-value">${_sanEsc(c.prestador||'—')}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Vigência</div><div class="ficha-field-value">${_sanEsc(c.vigencia_atual||'—')}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Vencimento</div><div class="ficha-field-value">${_sanEsc(c.vencimento||'—')} ${dias!==null?`(${dias<0?'vencido':dias+' dias'})`:''}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Fiscal</div><div class="ficha-field-value">${_sanEsc(c.fiscalizacao||'—')}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Setor</div><div class="ficha-field-value">${_sanEsc(c.secao||'—')}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Modelo</div><div class="ficha-field-value">${_sanEsc(_ctModeloLabel(c))}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Origem</div><div class="ficha-field-value">${_sanEsc(_ctHumanize(_ctOrigemKey(c)))}</div></div>
      <div class="ficha-field"><div class="ficha-field-label">Forma</div><div class="ficha-field-value">${_sanEsc(_ctHumanize(_ctFormaKey(c)))}</div></div>
    </div>

    <div style="display:${alertas.length?'flex':'none'};gap:6px;flex-wrap:wrap;margin-bottom:1rem">
      ${alertas.map(([t,bg,color])=>`<span class="badge" style="background:${bg};color:${color};font-size:11px">${t}</span>`).join('')}
    </div>
    <div style="display:${pendencias.length?'flex':'none'};gap:6px;flex-wrap:wrap;margin-bottom:1rem">
      ${pendencias.map(([t,bg,color])=>`<span class="badge" style="background:${bg};color:${color};font-size:11px">${t}</span>`).join('')}
    </div>

    ${quickActions}

    <div class="metrics" style="margin-bottom:1rem">
      ${metric('Valor inicial',_ctMoney(financial.initialValue))}
      ${metric('Inicial reajustado',_ctMoney(financial.initialAdjustedValue))}
      ${metric('Valor atual',_ctMoney(financial.currentValue),'consolidado','var(--blue)')}
      ${metric('Executado/medido',_ctMoney(financial.executedValue),'medições válidas')}
      ${metric('NF aprovada',_ctMoney(financial.approvedInvoiceValue),'não é pagamento')}
      ${metric('Saldo a executar',_ctMoney(financial.contractBalance))}
      ${metric('% aditivo',additiveContractPercent?additiveContractPercent+'%':'—',additiveLimitUsagePercent?`${additiveLimitUsagePercent}% do limite de 25%`:'limite 25%')}
      ${metric('Saldo disponível para aditivo',financial.availableAdditiveBalance?_ctMoney(financial.availableAdditiveBalance):'—')}
      ${metric('Dias p/ vencer',dias===null?'—':(dias<0?'Vencido':dias+'d'),'',dias!==null&&dias<=90?'var(--amber)':'var(--text)')}
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:1rem">
      ${[
        ['geral','Visão geral'],['itens','Itens'],['reajustes','Reajustes'],['aditivos','Aditivos'],['supressoes','Supressões'],['prorrogacoes','Prorrogações'],['medicoes','Medições'],['notas','Notas fiscais'],['documentos','Documentos'],['historico','Histórico']
      ].map(([key,label],idx)=>`<button class="ct-detail-tab ${idx===0?'active':''}" data-tab="${key}" onclick="ctOpenContratoTab('${key}')" style="border:none;border-bottom:2px solid ${idx===0?'var(--blue)':'transparent'};background:none;color:var(--text);padding:8px 10px;cursor:pointer;font-weight:600">${label}</button>`).join('')}
    </div>

    <div class="ct-detail-pane" data-tab="geral" style="display:block">
      <div class="ficha-grid">
        <div class="ficha-field"><div class="ficha-field-label">CPL / Processo</div><div class="ficha-field-value">${_sanEsc(c.cpl||'—')}</div></div>
        <div class="ficha-field"><div class="ficha-field-label">E-mail da empresa</div><div class="ficha-field-value">${_sanEsc(c.email_empresa||'—')}</div></div>
        <div class="ficha-field"><div class="ficha-field-label">Prefixo chamado</div><div class="ficha-field-value">${_sanEsc(c.prefixo_chamado||'—')}</div></div>
        <div class="ficha-field"><div class="ficha-field-label">Observações</div><div class="ficha-field-value">${_sanEsc(c.obs||'—')}</div></div>
      </div>
      <div style="margin-top:1rem"><div class="card-title" style="font-size:11px;text-transform:uppercase;color:var(--text3);letter-spacing:.04em;margin-bottom:.5rem">Fiscalizadores</div>
        ${rowsFiscais?`<div class="table-wrap ct-fiscais-table" style="height:auto;max-height:260px"><table style="font-size:12px"><thead><tr><th>Nome</th><th>Cargo</th><th>Início</th><th>Fim</th></tr></thead><tbody>${rowsFiscais}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum fiscalizador registrado.</div>'}
      </div>
    </div>

    <div class="ct-detail-pane" data-tab="itens" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Itens do contrato usados como base para saldos, medições, aditivos e supressões.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalItemContrato()">Novo item</button>':''}
      </div>
      ${rowsItens?`<div class="table-wrap ct-itens-table" style="height:auto;max-height:380px"><table style="font-size:12px"><thead><tr><th>Item</th><th>Tipo</th><th>Marca/Modelo</th><th style="text-align:right">Qtde inicial</th><th style="text-align:right">Qtde atual</th><th style="text-align:right">Executado</th><th style="text-align:right">Saldo</th><th style="text-align:right">Valor unit.</th><th style="text-align:right">Valor total</th><th style="text-align:right">Valor do saldo</th></tr></thead><tbody>${rowsItens}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum item vinculado a este contrato.</div>'}
    </div>

    <div class="ct-detail-pane" data-tab="reajustes" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Reajustes formais aplicados por item do contrato. Reajuste não é aditivo e deve preservar o valor inicial original.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalItensEventos()">Ajustes por item</button>':''}
      </div>
      ${rowsReajustes?`<div class="table-wrap" style="height:auto;max-height:300px"><table style="font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th style="text-align:right">Percentual</th><th style="text-align:right">Valor</th><th>Obs.</th></tr></thead><tbody>${rowsReajustes}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum reajuste registrado para este contrato.</div>'}
    </div>

    <div class="ct-detail-pane" data-tab="aditivos" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Aditivos formalizados por item, que podem alterar escopo ou valor atual após aprovação.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalItensEventos()">Ajustes por item</button>':''}
      </div>
      ${rowsAditivos?`<div class="table-wrap" style="height:auto;max-height:300px"><table style="font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th style="text-align:right">Percentual</th><th style="text-align:right">Valor</th><th>Obs.</th>${editor?'<th style="text-align:right">Ações</th>':''}</tr></thead><tbody>${rowsAditivos}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum aditivo registrado para este contrato.</div>'}
    </div>

    <div class="ct-detail-pane" data-tab="supressoes" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Supressões formalizadas por item, separadas de reajustes e aditivos para manter rastreabilidade.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalItensEventos()">Ajustes por item</button>':''}
      </div>
      ${rowsSupressoes?`<div class="table-wrap" style="height:auto;max-height:300px"><table style="font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th style="text-align:right">Percentual</th><th style="text-align:right">Valor</th><th>Obs.</th>${editor?'<th style="text-align:right">Ações</th>':''}</tr></thead><tbody>${rowsSupressoes}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhuma supressão registrada para este contrato.</div>'}
    </div>

    <div class="ct-detail-pane" data-tab="prorrogacoes" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Prorrogações e vigências registradas para acompanhamento da continuidade contratual.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalContratoOp(\'prorrogacao\')">Registrar prorrogação</button>':''}
      </div>
      ${rowsProrrogacoes?`<div class="table-wrap" style="height:auto;max-height:300px"><table style="font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Nova vigência inicial</th><th>Nova vigência final</th><th>Obs.</th></tr></thead><tbody>${rowsProrrogacoes}</tbody></table></div>`:(rowsVigs?`<div class="table-wrap" style="height:auto;max-height:300px"><table style="font-size:12px"><thead><tr><th>Início</th><th>Fim</th><th>Valor</th><th>Obs.</th></tr></thead><tbody>${rowsVigs}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhuma prorrogação ou vigência registrada para este contrato.</div>')}
    </div>
    <div class="ct-detail-pane" data-tab="medicoes" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Medições vinculadas ao contrato. Rascunhos, recusadas e canceladas não compõem o valor executado.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalMedicaoContrato()">Nova medição</button>':''}
      </div>
      ${medError}
      ${rowsMedicoes?`<div class="table-wrap ct-medicoes-table" style="height:auto;max-height:360px"><table style="font-size:12px"><thead><tr><th>Competência</th><th>Tipo</th><th>Item</th><th>Fiscal</th><th style="text-align:right">Valor bruto</th><th style="text-align:right">Glosa</th><th style="text-align:right">Valor líquido</th><th>Status</th><th>NF</th><th>Obs.</th><th>Termo</th></tr></thead><tbody>${rowsMedicoes}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhuma medição registrada para este contrato.</div>'}
    </div>
    <div class="ct-detail-pane" data-tab="notas" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Notas fiscais associadas à execução contratual. O registro da NF não representa pagamento e deve estar vinculado a uma medição.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalNotaFiscalContrato()">Vincular NF</button>':''}
      </div>
      ${nfError}
      ${rowsNotas?`<div class="table-wrap" style="height:auto;max-height:360px"><table style="font-size:12px"><thead><tr><th>Número</th><th>Medição</th><th>Datas</th><th style="text-align:right">Valor bruto</th><th style="text-align:right">Glosa</th><th style="text-align:right">Valor aprovado</th><th>Status</th><th>Obs.</th></tr></thead><tbody>${rowsNotas}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhuma nota fiscal vinculada a este contrato.</div>'}
    </div>
    <div class="ct-detail-pane" data-tab="documentos" style="display:none">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap">
        <div style="font-size:13px;color:var(--text2)">Referências documentais do contrato. Esta tela cadastra metadados, links ou caminhos; não faz upload real de arquivo.</div>
        ${editor?'<button class="btn-secondary" onclick="abrirModalDocumentoContrato()">Registrar documento</button>':''}
      </div>
      ${docError}
      ${rowsDocumentos?`<div class="table-wrap" style="height:auto;max-height:360px"><table style="font-size:12px"><thead><tr><th>Tipo</th><th>Título</th><th>Vínculo</th><th>Arquivo/referência</th><th>Obs.</th><th>Criado em</th></tr></thead><tbody>${rowsDocumentos}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum documento registrado para este contrato.</div>'}
    </div>
    <div class="ct-detail-pane" data-tab="historico" style="display:none">
      <div style="font-size:13px;color:var(--text2);margin-bottom:.75rem">Linha do tempo do contrato. Registros anteriores não são apagados; correções devem entrar como novos eventos.</div>
      ${rowsHist?`<div class="table-wrap" style="height:auto;max-height:420px"><table style="font-size:12px"><thead><tr><th>Data</th><th>Evento</th><th>Descrição</th><th>Responsável</th><th>Vínculo</th></tr></thead><tbody>${rowsHist}</tbody></table></div>`:'<div style="font-size:13px;color:var(--text3)">Nenhum histórico registrado.</div>'}
    </div>
  `;
  ctOpenContratoTab('geral');
}

function abrirModalItemContrato(itemId){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const item=itemId?(_ctItensAtual||[]).find(i=>String(i.id)===String(itemId)):null;
  document.getElementById('ctitem-titulo').textContent=item?'Editar item do contrato':'Novo item do contrato';
  document.getElementById('ctitem-info').textContent=`${_ctAtual.numero_contrato||_ctAtual.cpl||_ctAtual.id} — item usado como base para execução, aditivos e supressões.`;
  document.getElementById('ctitem-id').value=item?.id||'';
  document.getElementById('ctitem-descricao').value=item?.descricao||'';
  document.getElementById('ctitem-tipo').value=item?_ctItemTipo(item):((_ctFormaKey(_ctAtual).includes('mensal')||_ctFormaKey(_ctAtual).includes('continuo'))?'mensal':'demanda');
  document.getElementById('ctitem-status').value=item?.status||'contratado';
  document.getElementById('ctitem-qtde').value=item?.qtde??'';
  document.getElementById('ctitem-valor').value=item?(_ctNum(item.valor_contratado??item.valor_estimado)||''):'';
  document.getElementById('ctitem-marca').value=item?.marca||'';
  document.getElementById('ctitem-modelo').value=item?.modelo||'';
  document.getElementById('ctitem-obs').value=item?_ctObsSemTipo(item.observacoes):'';
  const inativar=document.getElementById('ctitem-inativar');
  if(inativar) inativar.style.display=item?'inline-flex':'none';
  const msg=document.getElementById('ctitem-msg'); if(msg){msg.className='fmsg';msg.textContent='';}
  document.getElementById('modal-ct-item').classList.add('active');
}

async function salvarItemContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const msg=document.getElementById('ctitem-msg');
  const id=document.getElementById('ctitem-id').value;
  const descricao=(document.getElementById('ctitem-descricao').value||'').trim();
  const tipo=document.getElementById('ctitem-tipo').value||'demanda';
  const status=document.getElementById('ctitem-status').value||'contratado';
  const qtde=_ctNum(document.getElementById('ctitem-qtde').value);
  const valor=_ctNum(document.getElementById('ctitem-valor').value);
  const marca=(document.getElementById('ctitem-marca').value||'').trim()||null;
  const modelo=(document.getElementById('ctitem-modelo').value||'').trim()||null;
  const obs=_ctObsComTipo(document.getElementById('ctitem-obs').value||'',tipo);
  if(!descricao){if(msg){msg.textContent='Informe a descrição do item.';msg.className='fmsg err';}return;}
  if(qtde<=0){if(msg){msg.textContent='Informe a quantidade contratada.';msg.className='fmsg err';}return;}
  if(valor<0){if(msg){msg.textContent='Informe um valor unitário válido.';msg.className='fmsg err';}return;}
  const payload={
    contrato_id:_ctAtual.id,
    processo_id:_ctAtual.processo_id||null,
    fornecedor_id:_ctAtual.fornecedor_id||null,
    origem:_ctEhServicoDemandaContrato(_ctAtual)?'servico_demanda':'aquisicao',
    fonte_tipo:'contrato',
    fonte_descricao:_ctAtual.numero_contrato||_ctAtual.cpl||String(_ctAtual.id),
    descricao,
    qtde,
    valor_contratado:valor,
    marca,
    modelo,
    status,
    observacoes:obs
  };
  const btn=document.querySelector('#modal-ct-item .btn-primary'); if(btn)btn.disabled=true;
  const res=id
    ? await sb.from('itens').update(payload).eq('id',id).select('*').single()
    : await sb.from('itens').insert(payload).select('*').single();
  if(res.error){if(btn)btn.disabled=false;if(msg){msg.textContent='Erro: '+res.error.message;msg.className='fmsg err';}return;}
  await ctRegistrarHistoricoContrato({
    tipo:id?'Item editado':'Item criado',
    action_type:id?'item_editado':'item_criado',
    titulo:id?'Item editado':'Item criado',
    obs:`${descricao} (${_ctItemTipoLabel(tipo)}), quantidade ${qtde}, valor unitário ${_ctMoney(valor)}.`,
    related_entity_type:'contract',
    related_entity_id:String(_ctAtual.id)
  });
  if(btn)btn.disabled=false;
  document.getElementById('modal-ct-item').classList.remove('active');
  if(window.toast) toast(id?'Item atualizado.':'Item cadastrado.','success');
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab('itens');
}

async function inativarItemContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  const id=document.getElementById('ctitem-id').value;
  if(!id||!await uiConfirm('Inativar este item? Ele não será apagado e continuará no histórico.')) return;
  const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(id));
  const {error}=await sb.from('itens').update({status:'inativo'}).eq('id',id);
  if(error){const msg=document.getElementById('ctitem-msg'); if(msg){msg.textContent='Erro: '+error.message;msg.className='fmsg err';} return;}
  await ctRegistrarHistoricoContrato({
    tipo:'Item inativado',
    action_type:'item_inativado',
    titulo:'Item inativado',
    obs:`Item inativado: ${item?.descricao||id}.`,
    related_entity_type:'contract',
    related_entity_id:String(_ctAtual.id)
  });
  document.getElementById('modal-ct-item').classList.remove('active');
  if(window.toast) toast('Item inativado.','success');
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab('itens');
}

function ctEventoUsaMesesRestantes(){
  if(_ctEhTrimestral()) return true;
  const forma=_ctFormaKey(_ctAtual||{});
  const modelo=(_ctModule().CONTRACT_MODELS||[]).find(m=>m.key===_ctModeloKey(_ctAtual||{}));
  if(modelo?.usesRemainingMonths===true||['mensal','mensal_fixo','por_competencia','continuo','continua','contínua'].includes(forma)) return true;
  // Fallback: contrato/processo pode nunca ter sido classificado (forma/modelo "não informada"),
  // mas se os itens têm origem 'servico_mensal' (serviço mensal fixo), a execução É mensal —
  // não dá pra confiar só no campo de classificação, que fica vazio nesses casos.
  return (_ctItensAtual||[]).some(i=>i.origem==='servico_mensal');
}

function ctMesesRestantesEvento(dataInicio){
  const mod=_ctModule();
  if(_ctEhTrimestral()&&typeof mod.calculateRemainingPeriods==='function'){
    return mod.calculateRemainingPeriods(_ctAtual?.data_inicio,_ctAtual?.vencimento,dataInicio||_ctTodayISO(),3);
  }
  if(typeof mod.calculateRemainingMonths==='function') return mod.calculateRemainingMonths(_ctAtual?.vencimento,dataInicio||_ctTodayISO());
  return 0;
}

// ═══ Ajustes por item: reajuste/aditivo/supressão num único modal, uma linha por item ═══
// Aditivo e supressão alteram QUANTIDADE; o valor unitário usado é sempre o vigente do item,
// não editável nesta tela. Reajuste altera o VALOR UNITÁRIO, via percentual.
const CIE_LIMITE_ADITIVO_PCT=0.25;
function _cieItensAtivos(){
  return (_ctItensAtual||[]).filter(i=>!['inativo','cancelado'].includes(String(i.status||'').toLowerCase()));
}
function _cieAnterioresFormalizados(termo){
  return (_ctHistoricoAtual||[])
    .filter(h=>normalizar(h.tipo||'').includes(termo)&&String(h.status_evento||'').toLowerCase()==='formalizado')
    .reduce((s,h)=>s+_ctNum(h.valor_impacto),0);
}
function abrirModalItensEventos(){
  if(bloquearSeVisualiz()) return;
  const info=_ctAtual?`${_ctAtual.cpl||""} — ${_ctAtual.prestador||""}`:"";
  const infoEl=document.getElementById('cie-info'); if(infoEl) infoEl.textContent=info;
  const dt=document.getElementById('cie-data');
  if(dt){
    const mod=_ctModule();
    const proximo=_ctEhTrimestral()&&typeof mod.calculateNextPeriodStart==='function'
      ?mod.calculateNextPeriodStart(_ctAtual?.data_inicio,_ctAtual?.vencimento,_ctTodayISO(),3):'';
    dt.value=proximo||_ctTodayISO();
  }
  const mesesWrap=document.getElementById('cie-meses-wrap');
  const usaMeses=ctEventoUsaMesesRestantes();
  if(mesesWrap) mesesWrap.style.display=usaMeses?'':'none';
  const periodoLabel=document.getElementById('cie-periodos-label');
  if(periodoLabel) periodoLabel.textContent=_ctEhTrimestral()?'Fim da vigência / trimestres considerados':'Fim da vigência / meses considerados';
  const vigFim=document.getElementById('cie-vigencia-fim'); if(vigFim) vigFim.value=_ctAtual?.vencimento||'—';
  _cieRecalcularMeses();
  const obs=document.getElementById('cie-obs'); if(obs) obs.value='';
  const msg=document.getElementById('cie-msg'); if(msg){msg.className='fmsg';msg.textContent='';}
  const itens=_cieItensAtivos();
  const tbody=document.getElementById('cie-tbody');
  if(tbody){
    tbody.innerHTML=itens.length?itens.map(i=>{
      const qtde=Number(i.qtde)||0;
      const unit=_ctNum(i.valor_contratado??i.valor_estimado);
      const unitFmt=unit?_ctMoney(unit):'—';
      const roTitle='Valor unitário vigente do item. Não editável neste ajuste.';
      return `<tr style="border-top:1px solid var(--border)" data-item="${i.id}">
        <td style="padding:6px 10px;border-right:1px solid var(--border)">${_sanEsc(i.descricao||'Item')}<br><span style="font-size:11px;color:var(--text3)">qtde atual ${qtde} · valor unit. vigente ${unitFmt}</span></td>
        <td style="padding:4px 6px"><input type="number" class="cie-ad-qtde" step="any" min="0" oninput="_cieAtualizarImpactoItem('${i.id}')" style="width:80px"></td>
        <td style="padding:4px 6px"><input type="text" class="cie-ad-valor" value="${unitFmt}" readonly disabled title="${roTitle}" style="width:95px;background:var(--surface2);color:var(--text3);cursor:not-allowed"></td>
        <td style="padding:4px 6px;border-right:1px solid var(--border)"><span class="cie-ad-imp" style="font-size:12px;color:var(--green)">—</span></td>
        <td style="padding:4px 6px"><input type="number" class="cie-re-pct" step="0.01" oninput="_cieAtualizarImpactoItem('${i.id}')" style="width:70px"></td>
        <td style="padding:4px 6px;border-right:1px solid var(--border)"><span class="cie-re-novo-unit" style="font-size:11px;color:var(--text2)">—</span><br><span class="cie-re-imp" style="font-size:12px;color:var(--text2)">—</span></td>
        <td style="padding:4px 6px"><input type="number" class="cie-su-qtde" step="any" min="0" max="${qtde}" oninput="_cieAtualizarImpactoItem('${i.id}')" style="width:80px"></td>
        <td style="padding:4px 6px"><input type="text" class="cie-su-valor" value="${unitFmt}" readonly disabled title="${roTitle}" style="width:95px;background:var(--surface2);color:var(--text3);cursor:not-allowed"></td>
        <td style="padding:4px 6px"><span class="cie-su-imp" style="font-size:12px;color:var(--red)">—</span></td>
      </tr>`;
    }).join(''):`<tr><td colspan="9" style="padding:14px;color:var(--text3)">Este contrato não possui itens cadastrados.</td></tr>`;
  }
  _cieAtualizarTotais();
  document.getElementById('modal-ct-itens-eventos').classList.add('active');
}
function _cieRecalcularMeses(){
  const mesesEl=document.getElementById('cie-meses');
  if(!mesesEl) return;
  const data=document.getElementById('cie-data')?.value||_ctTodayISO();
  mesesEl.value=ctEventoUsaMesesRestantes()?ctMesesRestantesEvento(data):'';
  _cieAtualizarTotais();
}
// Impacto de UM item, comparando o cenário mensal ANTES × DEPOIS do ajuste:
//   1. reajuste atualiza o valor unitário: novoUnit = unitVigente × (1 + %/100)
//   2. aditivo/supressão mudam a quantidade: novaQtde = qtdeAtual + adQtde − suQtde
//   3. valorMensalDepois = novaQtde × novoUnit; a diferença mensal × meses restantes = impacto total.
// Aditivo/supressão são valorados pelo unitário JÁ reajustado (se houver % na mesma sessão),
// porque a quantidade nova será paga ao preço novo. Em contratos não mensais, meses = 1.
function _cieImpactosItem(item,row){
  const usaMeses=ctEventoUsaMesesRestantes();
  const meses=usaMeses?(_ctNum(document.getElementById('cie-meses')?.value)||1):1;
  const qtdeAtual=Number(item.qtde)||0;
  const unitVigente=_ctNum(item.valor_contratado??item.valor_estimado);
  const adQtde=_ctNum(row.querySelector('.cie-ad-qtde')?.value);
  const suQtde=_ctNum(row.querySelector('.cie-su-qtde')?.value);
  const rePct=_ctNum(row.querySelector('.cie-re-pct')?.value);
  const novoValorUnitario=unitVigente*(1+rePct/100);
  const novaQtde=Math.max(qtdeAtual+adQtde-suQtde,0);
  const valorMensalAntes=qtdeAtual*unitVigente;
  const impactoAditivo=(adQtde>0&&novoValorUnitario>0)?adQtde*novoValorUnitario*meses:0;
  const impactoSupressao=(suQtde>0&&novoValorUnitario>0)?suQtde*novoValorUnitario*meses:0;
  const impactoReajuste=rePct?(novoValorUnitario-unitVigente)*qtdeAtual*meses:0;
  const valorMensalDepois=novaQtde*novoValorUnitario;
  const impactoTotal=impactoAditivo+impactoReajuste-impactoSupressao;
  return {impactoAditivo,impactoReajuste,impactoSupressao,impactoTotal,novoValorUnitario,novaQtde,
          valorMensalAntes,valorMensalDepois,unitVigente,adQtde,suQtde,rePct,qtdeAtual,meses};
}
function _cieAtualizarImpactoItem(itemId){
  const row=document.querySelector(`#cie-tbody tr[data-item="${itemId}"]`);
  if(row){
    // Impede quantidades negativas já na digitação (aditivo/supressão só aceitam qtde >= 0).
    ['.cie-ad-qtde','.cie-su-qtde'].forEach(sel=>{
      const el=row.querySelector(sel);
      if(el&&_ctNum(el.value)<0) el.value='0';
    });
  }
  _cieAtualizarTotais();
}
function _cieMesesBaseContrato(base,valorMensalBase){
  if(_ctEhTrimestral()){
    const mod=_ctModule();
    if(typeof mod.buildContractPeriods==='function'){
      const periodos=mod.buildContractPeriods(_ctAtual?.data_inicio,_ctAtual?.vencimento,3).length;
      if(periodos) return periodos;
    }
    if(base>0&&valorMensalBase>0) return Math.max(base/valorMensalBase,1);
    return 1;
  }
  const txt=String(_ctAtual?.vigencia_atual||'');
  const m=txt.match(/(\d+(?:[,.]\d+)?)\s*mes/i);
  if(m) return Math.max(_ctNum(m[1]),1);
  if(ctEventoUsaMesesRestantes()&&base>0&&valorMensalBase>0) return Math.max(base/valorMensalBase,1);
  return 1;
}
function _cieBaseReajustadaSessao(base,valorMensalBase){
  const mesesBase=ctEventoUsaMesesRestantes()?_cieMesesBaseContrato(base,valorMensalBase):1;
  let impactoBaseReajuste=0;
  document.querySelectorAll('#cie-tbody tr[data-item]').forEach(row=>{
    const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(row.dataset.item)); if(!item) return;
    const qtdeAtual=Number(item.qtde)||0;
    const unitVigente=_ctNum(item.valor_contratado??item.valor_estimado);
    const rePct=_ctNum(row.querySelector('.cie-re-pct')?.value);
    if(rePct) impactoBaseReajuste+=qtdeAtual*unitVigente*(rePct/100)*mesesBase;
  });
  return {
    baseReajustada:Math.max(base+impactoBaseReajuste,0),
    impactoBaseReajuste,
    mesesBase
  };
}
function _cieAtualizarTotais(){
  let totAd=0,totRe=0,totSu=0,totMensalAntes=0,totMensalDepois=0;
  const usaMeses=ctEventoUsaMesesRestantes();
  const meses=usaMeses?(_ctNum(document.getElementById('cie-meses')?.value)||1):1;
  document.querySelectorAll('#cie-tbody tr[data-item]').forEach(row=>{
    const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(row.dataset.item)); if(!item) return;
    const {impactoAditivo,impactoReajuste,impactoSupressao,novoValorUnitario,rePct,valorMensalAntes,valorMensalDepois,unitVigente}=_cieImpactosItem(item,row);
    totAd+=impactoAditivo; totRe+=impactoReajuste; totSu+=impactoSupressao;
    totMensalAntes+=valorMensalAntes; totMensalDepois+=valorMensalDepois;
    const adImp=row.querySelector('.cie-ad-imp'); if(adImp) adImp.textContent=impactoAditivo?_ctMoney(impactoAditivo):'—';
    const reImp=row.querySelector('.cie-re-imp'); if(reImp) reImp.textContent=impactoReajuste?_ctMoney(impactoReajuste):'—';
    const reNovo=row.querySelector('.cie-re-novo-unit'); if(reNovo) reNovo.textContent=rePct?_ctMoney(novoValorUnitario):'—';
    const suImp=row.querySelector('.cie-su-imp'); if(suImp) suImp.textContent=impactoSupressao?_ctMoney(impactoSupressao):'—';
    // Valor unit. exibido nas colunas de aditivo/supressão acompanha o reajuste digitado na mesma linha.
    const adValor=row.querySelector('.cie-ad-valor'); if(adValor) adValor.value=novoValorUnitario?_ctMoney(novoValorUnitario):'—';
    const suValor=row.querySelector('.cie-su-valor'); if(suValor) suValor.value=novoValorUnitario?_ctMoney(novoValorUnitario):'—';
  });
  const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=_ctMoney(v);};
  set('cie-tot-aditivo',totAd); set('cie-tot-reajuste',totRe); set('cie-tot-supressao',totSu);
  set('cie-tot-liquido',totAd-totSu);
  set('cie-valor-final',Math.max(_ctValorAtual(_ctAtual||{})+totAd+totRe-totSu,0));
  // Painel comparativo mensal (só faz sentido em contrato mensal)
  const comp=document.getElementById('cie-comparativo');
  if(comp) comp.style.display=usaMeses?'':'none';
  if(usaMeses){
    const mesesInfo=document.getElementById('cie-meses-info');
    if(mesesInfo) mesesInfo.textContent=`📅 Este ajuste afetará ${meses} ${_ctEhTrimestral()?(meses===1?'trimestre':'trimestres'):(meses===1?'mês':'meses')} até o final do contrato${_ctAtual?.vencimento?` (${_ctAtual.vencimento})`:''}.`;
    const atualLabel=document.getElementById('cie-valor-periodico-atual-label');
    const novoLabel=document.getElementById('cie-valor-periodico-novo-label');
    const difLabel=document.getElementById('cie-diferenca-periodica-label');
    if(atualLabel) atualLabel.childNodes[0].nodeValue=`Valor ${_ctEhTrimestral()?'trimestral':'mensal'} atual: `;
    if(novoLabel) novoLabel.childNodes[0].nodeValue=`Novo valor ${_ctEhTrimestral()?'trimestral':'mensal'} após ajuste: `;
    if(difLabel) difLabel.childNodes[0].nodeValue=`Diferença ${_ctEhTrimestral()?'trimestral':'mensal'}: `;
    set('cie-mensal-antes',totMensalAntes);
    set('cie-mensal-depois',totMensalDepois);
    set('cie-dif-mensal',totMensalDepois-totMensalAntes);
    set('cie-total-sem',totMensalAntes*meses);
    set('cie-total-com',totMensalDepois*meses);
    set('cie-impacto-total',(totMensalDepois-totMensalAntes)*meses);
  }
  // Limites de 25%: aditivo e supressão são INDEPENDENTES (um não compensa o outro) e ambos
  // calculados sobre o valor INICIAL reajustado (se houver reajuste/repactuação). Como o
  // reajuste também altera o valor unitário dos itens, o impacto quantitativo acima usa
  // esse mesmo unitário reajustado; assim a margem e o consumo sobem pela mesma base.
  const baseOriginal=_ctValorReajustado(_ctAtual||{});
  const {baseReajustada}= _cieBaseReajustadaSessao(baseOriginal,totMensalAntes);
  const base=baseReajustada;
  document.getElementById('cie-lim-base').textContent=base?_ctMoney(base):'—';
  const limite=baseReajustada*CIE_LIMITE_ADITIVO_PCT;
  const aplicarLimite=(prefixo,anteriores,novo)=>{
    const saldo=limite-anteriores;
    const pctConsumido=baseReajustada?((anteriores+novo)/baseReajustada)*100:0;
    const ultrapassou=novo>saldo+0.005;
    document.getElementById(`cie-${prefixo}-lim-limite`).textContent=base?_ctMoney(limite):'—';
    document.getElementById(`cie-${prefixo}-lim-anteriores`).textContent=_ctMoney(anteriores);
    document.getElementById(`cie-${prefixo}-lim-novo`).textContent=_ctMoney(novo);
    document.getElementById(`cie-${prefixo}-lim-pct`).textContent=base?pctConsumido.toFixed(1)+'%':'—';
    document.getElementById(`cie-${prefixo}-lim-saldo`).textContent=base?_ctMoney(Math.max(saldo,0)):'—';
    const badge=document.getElementById(`cie-${prefixo}-lim-badge`);
    if(badge){
      if(ultrapassou){badge.textContent='Limite ultrapassado';badge.style.background='var(--red-bg)';badge.style.color='var(--red-text)';}
      else if(pctConsumido>=20){badge.textContent='Atenção: próximo do limite';badge.style.background='var(--amber-bg)';badge.style.color='var(--amber-text)';}
      else{badge.textContent='OK';badge.style.background='var(--green-bg)';badge.style.color='var(--green-text)';}
    }
    return ultrapassou;
  };
  const adUltrapassou=aplicarLimite('ad',_cieAnterioresFormalizados('aditivo'),totAd);
  const suUltrapassou=aplicarLimite('su',_cieAnterioresFormalizados('supress'),totSu);
  const ultrapassou=adUltrapassou||suUltrapassou;
  const btn=document.getElementById('cie-btn-salvar'); if(btn) btn.disabled=ultrapassou;
  return {totAd,totRe,totSu,ultrapassou,adUltrapassou,suUltrapassou,baseReajustada};
}
async function salvarItensEventosContrato(){
  if(bloquearSeVisualiz()) return;
  if(!_ctAtual){alert("Contrato nao selecionado.");return;}
  const msgEl=document.getElementById('cie-msg');
  const setMsg=(txt,ok)=>{if(msgEl){msgEl.className="fmsg "+(ok?"ok":"err");msgEl.textContent=txt;}};
  const id=_ctAtual.id;
  const data=document.getElementById('cie-data')?.value;
  if(!data){setMsg("Data e obrigatoria",false);return;}
  const status='formalizado';
  const obs=document.getElementById('cie-obs')?.value.trim()||'';
  const rows=[...document.querySelectorAll('#cie-tbody tr[data-item]')];
  const {adUltrapassou,suUltrapassou,baseReajustada}=_cieAtualizarTotais();
  if(adUltrapassou){setMsg("O aditivo ultrapassa o saldo disponível do limite de 25% (aditivo). Reduza a quantidade acrescida.",false);return;}
  if(suUltrapassou){setMsg("A supressão ultrapassa o saldo disponível do limite de 25% (supressão). Reduza a quantidade suprimida.",false);return;}
  for(const row of rows){
    const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(row.dataset.item)); if(!item) continue;
    const {suQtde,qtdeAtual}=_cieImpactosItem(item,row);
    if(suQtde>qtdeAtual){setMsg(`Supressão de "${item.descricao||item.id}" (${suQtde}) não pode ser maior que a quantidade atual do item (${qtdeAtual}).`,false);return;}
    if(suQtde<0||_cieImpactosItem(item,row).adQtde<0){setMsg("Quantidades não podem ser negativas.",false);return;}
  }
  window._cieBaseReajustadaParaSalvar=baseReajustada||null;
  let totalImpacto=0,eventosGerados=0;
  try{
    for(const row of rows){
      const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(row.dataset.item)); if(!item) continue;
      const {impactoAditivo,impactoReajuste,impactoSupressao,novoValorUnitario,unitVigente,adQtde,suQtde,rePct,qtdeAtual,meses}=_cieImpactosItem(item,row);
      const periodicidade=_ctPeriodicidade();
      const periodosTexto=_ctEhTrimestral()?'Trimestres considerados':'Meses considerados';
      if(impactoAditivo){
        const {error}=await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Aditivo",action_type:"aditivo",titulo:"Aditivo registrado",data_evento:data,status_evento:status,valor_impacto:impactoAditivo,related_entity_type:"contractItem",related_entity_id:String(item.id),periodicidade_calculo:periodicidade,periodos_considerados:meses,quantidade_alterada:adQtde,valor_unitario_periodo:novoValorUnitario,obs:`Item: ${item.descricao||item.id}. Qtde acrescida: ${adQtde}. Valor unitário usado: ${_ctMoney(novoValorUnitario)}${rePct?` (vigente ${_ctMoney(unitVigente)} reajustado em ${rePct}%)`:''}. ${periodosTexto}: ${meses}. Impacto ${_ctMoney(impactoAditivo)}. Status: ${status}.${obs?". "+obs:""}`});
        if(error) throw error;
        totalImpacto+=impactoAditivo; eventosGerados++;
      }
      if(impactoReajuste){
        const {error}=await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Reajuste",action_type:"reajuste",titulo:"Reajuste registrado",data_evento:data,percentual:rePct,status_evento:status,valor_impacto:impactoReajuste,related_entity_type:"contractItem",related_entity_id:String(item.id),periodicidade_calculo:periodicidade,periodos_considerados:meses,valor_unitario_periodo:novoValorUnitario,obs:`Item: ${item.descricao||item.id}. ${rePct}% sobre valor unitário vigente (${_ctMoney(unitVigente)} → ${_ctMoney(novoValorUnitario)}). Qtde atual: ${qtdeAtual}. ${periodosTexto}: ${meses}. Impacto ${_ctMoney(impactoReajuste)}. Status: ${status}.${obs?". "+obs:""}`});
        if(error) throw error;
        if(status==="formalizado"){ const {error:e2}=await sb.from("itens").update({valor_contratado:novoValorUnitario}).eq("id",item.id); if(e2) throw e2; }
        totalImpacto+=impactoReajuste; eventosGerados++;
      }
      if(impactoSupressao){
        const {error}=await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Supressao",action_type:"supressao",titulo:"Supressao registrada",data_evento:data,status_evento:status,valor_impacto:impactoSupressao,related_entity_type:"contractItem",related_entity_id:String(item.id),periodicidade_calculo:periodicidade,periodos_considerados:meses,quantidade_alterada:-suQtde,valor_unitario_periodo:novoValorUnitario,obs:`Item: ${item.descricao||item.id}. Qtde suprimida: ${suQtde}. Valor unitário usado: ${_ctMoney(novoValorUnitario)}${rePct?` (vigente ${_ctMoney(unitVigente)} reajustado em ${rePct}%)`:''}. ${periodosTexto}: ${meses}. Impacto redutor ${_ctMoney(impactoSupressao)}. Status: ${status}.${obs?". "+obs:""}`});
        if(error) throw error;
        totalImpacto-=impactoSupressao; eventosGerados++;
      }
      // Aditivo e supressão do mesmo item, no mesmo salvamento, alteram a MESMA quantidade —
      // aplicar como um único update (qtdeAtual + adQtde - suQtde), nunca dois updates separados
      // (o segundo sobrescreveria o efeito do primeiro, já que ambos partem do qtdeAtual original).
      if(status==="formalizado"&&(adQtde||suQtde)){
        const novaQtde=Math.max(qtdeAtual+adQtde-suQtde,0);
        const {error:e2}=await sb.from("itens").update({qtde:novaQtde}).eq("id",item.id);
        if(e2) throw e2;
      }
    }
    if(!eventosGerados){setMsg("Preencha ao menos um campo de aditivo, reajuste ou supressão em algum item.",false);return;}
    if(status==="formalizado"&&totalImpacto){
      const novoTotal=Math.max(_ctValorAtual(_ctAtual)+totalImpacto,0);
      await sb.from("contratos").update({valor_atual:novoTotal,valor_atual_num:novoTotal}).eq("id",id);
    }
    setMsg(`${eventosGerados} evento(s) formalizado(s).`,true);
    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(id))||_ctAtual;
    setTimeout(async()=>{document.getElementById('modal-ct-itens-eventos').classList.remove('active');await abrirDetalheContrato(id);},1200);
  }catch(e){
    setMsg("Erro: "+(e.message||e),false);
  }finally{
    window._cieBaseReajustadaParaSalvar=null;
  }
}

function ctAtualizarLiquidoMedicao(){
  const bruto=_ctNum(document.getElementById('ctmed-valor-bruto')?.value);
  const glosa=_ctNum(document.getElementById('ctmed-valor-glosa')?.value);
  const liquido=Math.max(bruto-glosa,0);
  const el=document.getElementById('ctmed-valor-liquido');
  if(el) el.value=_ctMoney(liquido);
  const status=document.getElementById('ctmed-status');
  if(status&&glosa>0&&['registrada','aprovada_pelo_fiscal'].includes(status.value)) status.value='aprovada_com_glosa';
}

function ctAtualizarValorAprovadoNF(){
  const bruto=_ctNum(document.getElementById('ctnf-valor-total')?.value);
  const glosa=_ctNum(document.getElementById('ctnf-valor-glosa')?.value);
  const aprovado=Math.max(bruto-glosa,0);
  const el=document.getElementById('ctnf-valor-aprovado');
  if(el) el.value=_ctMoney(aprovado);
  const status=document.getElementById('ctnf-status');
  if(status&&glosa>0&&status.value==='aprovada') status.value='aprovada_com_glosa';
}

function _ctEhServicoDemandaContrato(c=_ctAtual){
  if(!c) return false;
  const forma=String(_ctFormaKey(c)||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const modelo=String(_ctModeloKey(c)||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(['por_demanda','demanda','por_medicao','estimativo'].includes(forma)) return true;
  if(modelo.includes('demanda')) return true;
  return (_ctItensAtual||[]).some(i=>i.origem==='servico_demanda');
}

function _ctSaldoItemMedicao(item){
  const qtde=_ctNum(item?.qtde);
  const medido=(_ctMedicoesAtual||[])
    .filter(m=>!['rascunho','recusada','cancelada'].includes(String(m.status||'').toLowerCase()))
    .flatMap(m=>m.contratos_medicao_itens||[])
    .filter(mi=>String(mi.item_id||'')===String(item?.id||''))
    .reduce((s,mi)=>s+_ctNum(mi.quantidade_aceita??mi.quantidade_executada),0);
  return Math.max(qtde-medido,0);
}

function _ctItensMedicaoAtivos(){
  return (_ctItensAtual||[]).filter(i=>!['inativo','cancelado'].includes(String(i.status||'').toLowerCase()));
}

function _ctOptionsItensMedicao(selected=''){
  return '<option value="">Selecione o item...</option>'+_ctItensMedicaoAtivos().map(i=>`<option value="${_sanEsc(String(i.id))}"${String(selected)===String(i.id)?' selected':''}>${_sanEsc(i.descricao||'Item')} - saldo ${_ctSaldoItemMedicao(i)}</option>`).join('');
}

function ctAdicionarItemMedicao(itemId=''){
  const lista=document.getElementById('ctmed-itens-lista');
  if(!lista) return;
  const row=document.createElement('div');
  row.className='ctmed-item-row';
  row.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;background:var(--surface2);width:100%;max-width:100%;box-sizing:border-box;overflow:hidden';
  row.innerHTML=`<div><div class="form-label">Item *</div><select class="ctmi-item" onchange="ctAtualizarItemMedicao(this)">${_ctOptionsItensMedicao(itemId)}</select></div>
    <div><div class="form-label">Descrição</div><input type="text" class="ctmi-desc" readonly style="background:var(--surface2);color:var(--text2)"></div>
    <div><div class="form-label">Quantidade *</div><input type="number" class="ctmi-qtd" step="any" min="0" oninput="ctAtualizarItemMedicao(this)"></div>
    <div><div class="form-label">Valor bruto</div><input type="text" class="ctmi-total" readonly style="background:var(--surface2);color:var(--text2)"></div>
    <button type="button" class="btn-secondary" onclick="ctRemoverItemMedicao(this)" title="Remover item" style="padding:7px 0;color:var(--red)">×</button>`;
  row.querySelectorAll(':scope > div').forEach(el=>{el.style.minWidth='0';});
  row.querySelectorAll('select,input').forEach(el=>{el.style.width='100%';el.style.boxSizing='border-box';});
  const remover=row.querySelector('button');
  if(remover) remover.style.width='100%';
  lista.appendChild(row);
  ctAtualizarItemMedicao(row.querySelector('.ctmi-item'));
}

function ctRemoverItemMedicao(btn){
  btn.closest('.ctmed-item-row')?.remove();
  ctAtualizarTotaisItensMedicao();
}

function ctAtualizarItemMedicao(el){
  const row=el?.closest?.('.ctmed-item-row')||el;
  if(!row) return;
  const itemId=row.querySelector('.ctmi-item')?.value||'';
  const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(itemId));
  const desc=row.querySelector('.ctmi-desc');
  if(desc) desc.value=item?.descricao||'';
  const qtdEl=row.querySelector('.ctmi-qtd');
  if(qtdEl&&item){
    const saldo=_ctSaldoItemMedicao(item);
    qtdEl.max=String(saldo);
    qtdEl.title=`Saldo disponivel para medir: ${saldo}`;
  }else if(qtdEl){
    qtdEl.removeAttribute('max');
    qtdEl.removeAttribute('title');
  }
  const qtde=_ctNum(qtdEl?.value);
  const unit=_ctNum(item?.valor_contratado??item?.valor_estimado);
  const total=qtde>0&&unit>0?qtde*unit:0;
  const totalEl=row.querySelector('.ctmi-total');
  if(totalEl) totalEl.value=total?_ctMoney(total):'';
  row.dataset.valorTotal=String(total||0);
  row.dataset.valorUnitario=String(unit||0);
  ctAtualizarTotaisItensMedicao();
}

function ctAtualizarTotaisItensMedicao(){
  let bruto=0;
  document.querySelectorAll('#ctmed-itens-lista .ctmed-item-row').forEach(row=>{ bruto+=_ctNum(row.dataset.valorTotal); });
  const brutoEl=document.getElementById('ctmed-valor-bruto');
  if(brutoEl) brutoEl.value=bruto?bruto.toFixed(2):'';
  ctAtualizarLiquidoMedicao();
}

function _ctCiclosTrimestrais(){
  const mod=_ctModule();
  if(!_ctEhTrimestral()||typeof mod.buildContractPeriods!=='function') return [];
  return mod.buildContractPeriods(_ctAtual?.data_inicio,_ctAtual?.vencimento,3);
}

function ctAtualizarCicloTrimestralMedicao(){
  const sel=document.getElementById('ctmed-ciclo');
  const ciclo=_ctCiclosTrimestrais().find(c=>String(c.number)===String(sel?.value||''));
  const competencia=document.getElementById('ctmed-competencia');
  if(!ciclo||!competencia) return;
  competencia.value=`Ciclo ${ciclo.number} (${fmtDate(ciclo.startDate)} a ${fmtDate(ciclo.endDate)})`;
  competencia.dataset.cicloNumero=String(ciclo.number);
  competencia.dataset.cicloInicio=ciclo.startDate;
  competencia.dataset.cicloFim=ciclo.endDate;
}

function abrirModalMedicaoContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const demanda=_ctEhServicoDemandaContrato(_ctAtual);
  const trimestral=_ctEhTrimestral(_ctAtual);
  document.getElementById('ctmed-info').textContent=`${_ctAtual.numero_contrato||_ctAtual.cpl||_ctAtual.id} — ${_ctAtual.prestador||''}`;
  const competenciaEl=document.getElementById('ctmed-competencia');
  competenciaEl.type=trimestral?'text':'month';
  competenciaEl.readOnly=trimestral;
  competenciaEl.value=trimestral?'':_ctMonthISO();
  delete competenciaEl.dataset.cicloNumero;
  delete competenciaEl.dataset.cicloInicio;
  delete competenciaEl.dataset.cicloFim;
  const competenciaLabel=document.getElementById('ctmed-competencia-label');
  if(competenciaLabel) competenciaLabel.textContent=trimestral?'Competência trimestral *':'Competência *';
  document.getElementById('ctmed-data').value=_ctTodayISO();
  document.getElementById('ctmed-tipo').value=trimestral
    ?'competencia_trimestral'
    :(demanda?'demanda':((_ctModule().CONTRACT_MODELS||[]).find(m=>m.key===_ctModeloKey(_ctAtual))?.measurementMode||'competencia'));
  document.getElementById('ctmed-status').value='registrada';
  const fiscalSel=document.getElementById('ctmed-fiscal');
  if(fiscalSel){
    const nomes=[...new Set((_ctFiscaisAtual||[]).filter(f=>!f.data_fim).map(f=>f.nome).concat((_ctAtual.fiscalizacao||'').split(',')).map(s=>String(s||'').trim()).filter(Boolean))];
    fiscalSel.innerHTML='<option value="">Selecione...</option>'+nomes.map(nome=>`<option value="${_sanEsc(nome)}">${_sanEsc(nome)}</option>`).join('');
    fiscalSel.value=nomes[0]||'';
  }
  const itensWrap=document.getElementById('ctmed-itens-wrap');
  if(itensWrap) itensWrap.style.display=demanda?'block':'none';
  ['ctmed-trimestre-wrap','ctmed-execucao-preventiva-wrap','ctmed-relatorio-wrap'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display=trimestral?(id==='ctmed-relatorio-wrap'?'block':'flex'):'none';
  });
  const cicloSel=document.getElementById('ctmed-ciclo');
  if(cicloSel&&trimestral){
    const ciclos=_ctCiclosTrimestrais();
    cicloSel.innerHTML=ciclos.map(c=>{
      const existente=(_ctMedicoesAtual||[]).some(m=>Number(m.ciclo_numero)===Number(c.number)&&!['recusada','cancelada'].includes(String(m.status||'').toLowerCase()));
      return `<option value="${c.number}">${c.number}º ciclo · ${fmtDate(c.startDate)} a ${fmtDate(c.endDate)}${existente?' · já possui medição':''}</option>`;
    }).join('');
    const primeiroPendente=ciclos.find(c=>!(_ctMedicoesAtual||[]).some(m=>Number(m.ciclo_numero)===Number(c.number)&&!['recusada','cancelada'].includes(String(m.status||'').toLowerCase())));
    cicloSel.value=String(primeiroPendente?.number||ciclos[0]?.number||'');
    ctAtualizarCicloTrimestralMedicao();
  }
  const execEl=document.getElementById('ctmed-execucao-preventiva'); if(execEl) execEl.value='';
  const relEl=document.getElementById('ctmed-relatorio'); if(relEl) relEl.value='';
  const listaItens=document.getElementById('ctmed-itens-lista');
  if(listaItens) listaItens.innerHTML='';
  if(demanda) ctAdicionarItemMedicao();
  const brutoEl=document.getElementById('ctmed-valor-bruto');
  if(brutoEl){
    brutoEl.value=trimestral?String(_ctValorPeriodico(_ctAtual)||''):'';
    brutoEl.readOnly=demanda||trimestral;
    brutoEl.style.background=(demanda||trimestral)?'var(--surface2)':'';
    brutoEl.style.color=(demanda||trimestral)?'var(--text2)':'';
  }
  document.getElementById('ctmed-valor-glosa').value='0';
  document.getElementById('ctmed-glosa-motivo').value='';
  document.getElementById('ctmed-obs').value='';
  const msg=document.getElementById('ctmed-msg'); if(msg){msg.className='fmsg';msg.textContent='';}
  ctAtualizarLiquidoMedicao();
  document.getElementById('modal-ct-medicao').classList.add('active');
}

function abrirModalNotaFiscalContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  document.getElementById('ctnf-info').textContent=`${_ctAtual.numero_contrato||_ctAtual.cpl||_ctAtual.id} — NF sempre vinculada a uma medição; não há controle de pagamento.`;
  const sel=document.getElementById('ctnf-medicao');
  const statusPermitidosTrimestral=new Set(['aprovada_pelo_fiscal','aprovada_com_glosa']);
  sel.innerHTML=(_ctMedicoesAtual||[]).filter(m=>{
    const status=String(m.status||'').toLowerCase();
    if(['cancelada','recusada'].includes(status)) return false;
    return !_ctEhTrimestral()||statusPermitidosTrimestral.has(status);
  }).map(m=>{
    const label=`${m.competencia||'sem competência'} · ${CT_MEDICAO_STATUS_LABELS[m.status]||m.status||'status'} · ${_ctMoney(m.valor_liquido)}`;
    return `<option value="${m.id}">${_sanEsc(label)}</option>`;
  }).join('');
  if(!sel.innerHTML) sel.innerHTML='<option value="">Cadastre uma medição antes de vincular NF</option>';
  ['ctnf-numero','ctnf-serie','ctnf-emissao','ctnf-recebimento','ctnf-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ctnf-valor-total').value='';
  document.getElementById('ctnf-valor-glosa').value='0';
  document.getElementById('ctnf-status').value='pendente';
  const msg=document.getElementById('ctnf-msg'); if(msg){msg.className='fmsg';msg.textContent='';}
  ctAtualizarValorAprovadoNF();
  ctPreencherValoresNFPorMedicao();
  document.getElementById('modal-ct-nf').classList.add('active');
}

function ctPreencherValoresNFPorMedicao(){
  const medicaoId=document.getElementById('ctnf-medicao')?.value;
  const medicao=(_ctMedicoesAtual||[]).find(m=>String(m.id)===String(medicaoId));
  if(!medicao) return;
  const total=document.getElementById('ctnf-valor-total');
  const glosa=document.getElementById('ctnf-valor-glosa');
  if(total) total.value=String(_ctNum(medicao.valor_bruto)||'');
  if(glosa) glosa.value=String(_ctNum(medicao.valor_glosa)||0);
  ctAtualizarValorAprovadoNF();
}

async function _ctReabrirAbaContrato(tab){
  if(!_ctAtual?.id) return;
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab(tab);
}

async function alterarStatusMedicaoContrato(id,status){
  if(bloquearSeVisualiz('contratos')) return;
  if(!CT_MEDICAO_STATUS_LABELS[status]) return;
  const medicao=(_ctMedicoesAtual||[]).find(m=>String(m.id)===String(id));
  if(!medicao) return;
  const anterior=String(medicao.status||'');
  if(anterior===status) return;
  const novoLabel=CT_MEDICAO_STATUS_LABELS[status];
  if(!await uiConfirm(`Alterar o status da medição ${medicao.competencia||''} para "${novoLabel}"?`)){ await _ctReabrirAbaContrato('medicoes'); return; }
  const aprovada=['aprovada_pelo_fiscal','aprovada_com_glosa'].includes(status);
  const payload={status,updated_at:new Date().toISOString()};
  if(aprovada){ payload.validado_por=currentProfile?.nome||currentProfile?.email||medicao.fiscal_responsavel||null; payload.validado_em=new Date().toISOString(); }
  const {error}=await sb.from('contratos_medicoes').update(payload).eq('id',id).eq('contrato_id',_ctAtual.id);
  if(error){alert('Erro ao alterar o status da medição: '+error.message);await _ctReabrirAbaContrato('medicoes');return;}
  await sb.from('contratos_historico').insert({contrato_id:_ctAtual.id,cpl:_ctAtual.cpl||null,tipo:'Medição contratual',data_evento:_ctTodayISO(),obs:`Status da medição ${medicao.competencia||id} alterado de ${CT_MEDICAO_STATUS_LABELS[anterior]||anterior} para ${novoLabel}.`,usuario:currentProfile?.nome||currentProfile?.email||null});
  delete ctItensPorContrato[_ctAtual.id];
  if(window.toast) toast('Status da medição atualizado.','success');
  await _ctReabrirAbaContrato('medicoes');
}

async function alterarStatusNotaFiscalContrato(id,status){
  if(bloquearSeVisualiz('contratos')) return;
  if(!CT_NF_STATUS_LABELS[status]) return;
  const nota=(_ctNotasAtual||[]).find(n=>String(n.id)===String(id));
  if(!nota) return;
  const anterior=String(nota.status||'');
  if(anterior===status) return;
  const novoLabel=CT_NF_STATUS_LABELS[status];
  if(!await uiConfirm(`Alterar o status da NF ${nota.numero||''} para "${novoLabel}"?`)){ await _ctReabrirAbaContrato('notas'); return; }
  const validada=['aprovada','aprovada_com_glosa','encaminhada_para_pagamento'].includes(status);
  const payload={status,updated_at:new Date().toISOString()};
  if(validada){ payload.validado_por=currentProfile?.nome||currentProfile?.email||null; payload.validado_em=new Date().toISOString(); }
  if(status==='encaminhada_para_pagamento') payload.encaminhado_em=new Date().toISOString();
  const {error}=await sb.from('notas_fiscais').update(payload).eq('id',id).eq('contrato_id',_ctAtual.id);
  if(error){alert('Erro ao alterar o status da NF: '+error.message);await _ctReabrirAbaContrato('notas');return;}
  await sb.from('contratos_historico').insert({contrato_id:_ctAtual.id,cpl:_ctAtual.cpl||null,tipo:'Nota fiscal contratual',data_evento:_ctTodayISO(),obs:`Status da NF ${nota.numero||id} alterado de ${CT_NF_STATUS_LABELS[anterior]||anterior} para ${novoLabel}. Não representa pagamento.`,usuario:currentProfile?.nome||currentProfile?.email||null});
  if(window.toast) toast('Status da NF atualizado.','success');
  await _ctReabrirAbaContrato('notas');
}

async function salvarMedicaoContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const msg=document.getElementById('ctmed-msg');
  const competencia=document.getElementById('ctmed-competencia').value;
  const data=document.getElementById('ctmed-data').value||_ctTodayISO();
  const tipo=document.getElementById('ctmed-tipo').value||'competencia';
  const trimestral=_ctEhTrimestral(_ctAtual);
  const competenciaEl=document.getElementById('ctmed-competencia');
  const cicloNumero=trimestral?Number(competenciaEl?.dataset.cicloNumero||0):null;
  const cicloInicio=trimestral?(competenciaEl?.dataset.cicloInicio||null):null;
  const cicloFim=trimestral?(competenciaEl?.dataset.cicloFim||null):null;
  const dataExecucaoPreventiva=trimestral?(document.getElementById('ctmed-execucao-preventiva')?.value||null):null;
  const relatorioServico=trimestral?(document.getElementById('ctmed-relatorio')?.value||'').trim():null;
  const status=document.getElementById('ctmed-status').value||'registrada';
  const fiscal=(document.getElementById('ctmed-fiscal').value||'').trim();
  const itensMedidos=[...document.querySelectorAll('#ctmed-itens-lista .ctmed-item-row')].map(row=>{
    const itemId=row.querySelector('.ctmi-item')?.value||'';
    const item=(_ctItensAtual||[]).find(i=>String(i.id)===String(itemId));
    const quantidade=_ctNum(row.querySelector('.ctmi-qtd')?.value);
    const unit=_ctNum(row.dataset.valorUnitario||item?.valor_contratado||item?.valor_estimado);
    const total=_ctNum(row.dataset.valorTotal)||(quantidade*unit);
    const saldo=item?_ctSaldoItemMedicao(item):0;
    return {itemId,item,descricao:item?.descricao||'',quantidade,unit,total,saldo};
  }).filter(x=>x.itemId||x.quantidade||x.total);
  const valorBruto=_ctNum(document.getElementById('ctmed-valor-bruto').value);
  const valorGlosa=_ctNum(document.getElementById('ctmed-valor-glosa').value);
  const valorLiquido=Math.max(valorBruto-valorGlosa,0);
  const motivoGlosa=(document.getElementById('ctmed-glosa-motivo').value||'').trim();
  const obs=(document.getElementById('ctmed-obs').value||'').trim();
  const demanda=_ctEhServicoDemandaContrato(_ctAtual);
  if(demanda&&!itensMedidos.length){if(msg){msg.textContent='Adicione ao menos um item medido.';msg.className='fmsg err';}return;}
  if(demanda&&itensMedidos.some(x=>!x.itemId)){if(msg){msg.textContent='Selecione todos os itens medidos.';msg.className='fmsg err';}return;}
  if(demanda&&itensMedidos.some(x=>x.quantidade<=0)){if(msg){msg.textContent='Informe a quantidade medida de todos os itens.';msg.className='fmsg err';}return;}
  const itemSemSaldo=demanda?itensMedidos.find(x=>x.quantidade>x.saldo):null;
  if(itemSemSaldo){
    if(msg){
      msg.textContent=`A quantidade medida de "${itemSemSaldo.descricao||itemSemSaldo.itemId}" (${itemSemSaldo.quantidade}) nao pode ser maior que o saldo disponivel (${itemSemSaldo.saldo}).`;
      msg.className='fmsg err';
    }
    return;
  }
  const itensDuplicados=itensMedidos.map(x=>String(x.itemId)).filter((id,idx,arr)=>id&&arr.indexOf(id)!==idx);
  if(demanda&&itensDuplicados.length){if(msg){msg.textContent='Cada item deve aparecer apenas uma vez na mesma medicao.';msg.className='fmsg err';}return;}
  if(!fiscal){if(msg){msg.textContent='Selecione o fiscal responsavel.';msg.className='fmsg err';}return;}
  if(!competencia){if(msg){msg.textContent='Informe a competência.';msg.className='fmsg err';}return;}
  if(trimestral&&!cicloNumero){if(msg){msg.textContent='Selecione o ciclo trimestral do contrato.';msg.className='fmsg err';}return;}
  if(trimestral&&!dataExecucaoPreventiva){if(msg){msg.textContent='Informe a data em que a preventiva/calibração foi executada.';msg.className='fmsg err';}return;}
  if(trimestral&&!relatorioServico){if(msg){msg.textContent='Informe a referência do relatório de serviço enviado com a NF.';msg.className='fmsg err';}return;}
  if(!valorBruto&&status!=='rascunho'){if(msg){msg.textContent='Informe o valor bruto da medição.';msg.className='fmsg err';}return;}
  if(valorGlosa>valorBruto){if(msg){msg.textContent='A glosa não pode ser maior que o valor bruto.';msg.className='fmsg err';}return;}
  if(valorGlosa>0&&!motivoGlosa){if(msg){msg.textContent='Informe o motivo da glosa.';msg.className='fmsg err';}return;}
  const validada=['aprovada_pelo_fiscal','aprovada_com_glosa'].includes(status);
  const payload={
    contrato_id:_ctAtual.id,
    competencia,
    tipo_medicao:tipo,
    data_medicao:data,
    fiscal_responsavel:fiscal||currentProfile?.nome||currentProfile?.email||null,
    status,
    valor_bruto:valorBruto,
    valor_glosa:valorGlosa,
    valor_liquido:valorLiquido,
    ciclo_numero:cicloNumero,
    ciclo_inicio:cicloInicio,
    ciclo_fim:cicloFim,
    data_execucao_preventiva:dataExecucaoPreventiva,
    relatorio_servico_referencia:relatorioServico,
    observacoes:obs||null,
    validado_por:validada?(currentProfile?.nome||currentProfile?.email||fiscal||null):null,
    validado_em:validada?new Date().toISOString():null,
    updated_at:new Date().toISOString()
  };
  const btn=document.querySelector('#modal-ct-medicao .btn-primary'); if(btn)btn.disabled=true;
  const {data:med,error}=await sb.from('contratos_medicoes').insert(payload).select('*').single();
  if(error){if(btn)btn.disabled=false;if(msg){msg.textContent='Erro: '+error.message;msg.className='fmsg err';}return;}
  if(itensMedidos.length){
    const linhas=itensMedidos.map(x=>({
      medicao_id:med.id,
      contrato_id:_ctAtual.id,
      item_id:x.itemId,
      descricao:x.descricao||x.item?.descricao||null,
      unidade:x.item?.unidade||null,
      quantidade_executada:x.quantidade||null,
      quantidade_aceita:['recusada','cancelada'].includes(String(status||'').toLowerCase())?0:(x.quantidade||null),
      quantidade_recusada:String(status||'').toLowerCase()==='recusada'?(x.quantidade||0):0,
      valor_unitario:x.unit||null,
      valor_total:x.total||0,
      observacoes:obs||null
    }));
    const {error:itemErr}=await sb.from('contratos_medicao_itens').insert(linhas);
    if(itemErr){if(btn)btn.disabled=false;if(msg){msg.textContent='Medicao salva, mas erro ao vincular item: '+itemErr.message;msg.className='fmsg err';}return;}
  }
  if(valorGlosa>0){
    const {error:gErr}=await sb.from('contratos_medicao_glosas').insert({
      medicao_id:med.id,
      contrato_id:_ctAtual.id,
      motivo:motivoGlosa,
      valor_glosa:valorGlosa,
      justificativa:obs||motivoGlosa,
      status:'registrada'
    });
    if(gErr) console.warn('Falha ao registrar glosa da medição',gErr);
  }
  await sb.from('contratos_historico').insert({
    contrato_id:_ctAtual.id,
    cpl:_ctAtual.cpl||null,
    tipo:'Medição contratual',
    data_evento:data,
    valor_novo:String(valorLiquido),
    obs:`Medição ${competencia} registrada com status ${CT_MEDICAO_STATUS_LABELS[status]||status}. Valor bruto ${_ctMoney(valorBruto)}, glosa ${_ctMoney(valorGlosa)}, líquido ${_ctMoney(valorLiquido)}.${trimestral?` Preventiva/calibração executada em ${fmtDate(dataExecucaoPreventiva)}; relatório: ${relatorioServico}.`:''}`,
    usuario:currentProfile?.nome||currentProfile?.email||null
  });
  if(btn)btn.disabled=false;
  document.getElementById('modal-ct-medicao').classList.remove('active');
  delete ctItensPorContrato[_ctAtual.id];
  if(window.toast) toast('Medição registrada.','success');
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab('medicoes');
}

async function salvarNotaFiscalContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const msg=document.getElementById('ctnf-msg');
  const medicaoId=document.getElementById('ctnf-medicao').value;
  const medicao=(_ctMedicoesAtual||[]).find(m=>String(m.id)===String(medicaoId));
  const numero=(document.getElementById('ctnf-numero').value||'').trim();
  const serie=(document.getElementById('ctnf-serie').value||'').trim();
  const dataEmissao=document.getElementById('ctnf-emissao').value||null;
  const dataRecebimento=document.getElementById('ctnf-recebimento').value||null;
  const valorTotal=_ctNum(document.getElementById('ctnf-valor-total').value);
  const valorGlosa=_ctNum(document.getElementById('ctnf-valor-glosa').value);
  const valorAprovado=Math.max(valorTotal-valorGlosa,0);
  const status=document.getElementById('ctnf-status').value||'pendente';
  const obs=(document.getElementById('ctnf-obs').value||'').trim();
  if(!medicaoId||!medicao){if(msg){msg.textContent='Vincule a NF a uma medição.';msg.className='fmsg err';}return;}
  if(_ctEhTrimestral()){
    const statusMedicao=String(medicao.status||'').toLowerCase();
    if(!['aprovada_pelo_fiscal','aprovada_com_glosa'].includes(statusMedicao)){
      if(msg){msg.textContent='A medição trimestral precisa estar aprovada pelo fiscal antes da NF.';msg.className='fmsg err';}
      return;
    }
    if(!medicao.data_execucao_preventiva||!medicao.relatorio_servico_referencia){
      if(msg){msg.textContent='Registre a preventiva/calibração e o relatório de serviço na medição antes da NF.';msg.className='fmsg err';}
      return;
    }
  }
  if(!numero){if(msg){msg.textContent='Informe o número da NF.';msg.className='fmsg err';}return;}
  if(!valorTotal){if(msg){msg.textContent='Informe o valor bruto da NF.';msg.className='fmsg err';}return;}
  if(valorGlosa>valorTotal){if(msg){msg.textContent='A glosa/desconto não pode ser maior que o valor bruto.';msg.className='fmsg err';}return;}
  const numeroNorm=_ctNormalizedDoc(numero);
  const dup=(_ctNotasAtual||[]).find(n=>String(n.numero_normalizado||_ctNormalizedDoc(n.numero))===String(numeroNorm)&&String(n.status||'')!=='cancelada');
  if(dup&&!await uiConfirm('Já existe NF com este número para este contrato. Deseja registrar mesmo assim?')) return;
  const validada=['aprovada','aprovada_com_glosa','encaminhada_para_pagamento'].includes(status);
  const payload={
    numero,
    numero_normalizado:numeroNorm||null,
    serie:serie||null,
    fornecedor_id:_ctAtual.fornecedor_id||null,
    contrato_id:_ctAtual.id,
    processo_id:_ctAtual.processo_id||null,
    medicao_id:medicaoId,
    competencia:medicao.competencia||null,
    data_emissao:dataEmissao,
    data_recebimento:dataRecebimento,
    valor_total:valorTotal,
    valor_glosa:valorGlosa,
    valor_aprovado:valorAprovado,
    status,
    origem_sistema:'contratos_medicoes',
    origem_codigo:medicaoId,
    observacoes:obs||null,
    validado_por:validada?(currentProfile?.nome||currentProfile?.email||null):null,
    validado_em:validada?new Date().toISOString():null,
    encaminhado_em:status==='encaminhada_para_pagamento'?new Date().toISOString():null,
    updated_at:new Date().toISOString()
  };
  const btn=document.querySelector('#modal-ct-nf .btn-primary'); if(btn)btn.disabled=true;
  const {data:nf,error}=await sb.from('notas_fiscais').insert(payload).select('*').single();
  if(error){if(btn)btn.disabled=false;if(msg){msg.textContent='Erro: '+error.message;msg.className='fmsg err';}return;}
  if(_ctEhTrimestral()&&!(_ctTermosAtual||[]).some(t=>String(t.medicao_id||'')===String(medicaoId))){
    const {data:termo,error:termoErr}=await sb.from('termos_ateste').insert({
      contrato_id:_ctAtual.id,
      cpl_contrato:_ctAtual.cpl||null,
      medicao_id:medicaoId,
      nota_fiscal_id:nf.id,
      competencia:medicao.competencia||null,
      nf_referencia:numero,
      fiscalizado_por:medicao.fiscal_responsavel||currentProfile?.nome||currentProfile?.email||null,
      gerado_em:dataRecebimento||_ctTodayISO(),
      protocolos:[],
      valor_atestado:valorAprovado
    }).select('*').single();
    if(termoErr){
      if(btn)btn.disabled=false;
      if(msg){msg.textContent='NF salva, mas não foi possível gerar o termo de ateste: '+termoErr.message;msg.className='fmsg err';}
      return;
    }
    await sb.from('termo_contratos').insert({termo_id:termo.id,contrato_id:_ctAtual.id});
  }
  await sb.from('contratos_historico').insert({
    contrato_id:_ctAtual.id,
    cpl:_ctAtual.cpl||null,
    tipo:'Nota fiscal contratual',
    data_evento:dataRecebimento||dataEmissao||_ctTodayISO(),
    valor_novo:String(valorAprovado),
    obs:`NF ${numero} vinculada à medição ${medicao.competencia||medicaoId}. Status ${CT_NF_STATUS_LABELS[status]||status}. Valor aprovado ${_ctMoney(valorAprovado)}. Não representa pagamento.`,
    usuario:currentProfile?.nome||currentProfile?.email||null
  });
  if(btn)btn.disabled=false;
  document.getElementById('modal-ct-nf').classList.remove('active');
  if(window.toast) toast('Nota fiscal vinculada à medição.','success');
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab('notas');
}

function ctDocAtualizarEntidadesRelacionadas(){
  const type=document.getElementById('ctdoc-related-type')?.value||'contract';
  const sel=document.getElementById('ctdoc-related-id');
  if(!sel) return;
  let opts=[];
  if(type==='contract'){
    opts=[{id:String(_ctAtual?.id||''),label:'Contrato inteiro'}];
  }else if(type==='contractEvent'){
    opts=(_ctHistoricoAtual||[]).filter(h=>['Reajuste','Aditivo','Supressão','Prorrogação','Renovação','Troca de fiscal','Troca de marca/modelo'].some(t=>normalizar(h.tipo||h.action_type||'').includes(normalizar(t)))).map(h=>({
      id:String(h.id),
      label:`${fmtDate((h.data_evento||h.created_at||'').substring(0,10))||'sem data'} · ${h.titulo||h.tipo||h.action_type||'Evento'}`
    }));
  }else if(type==='measurement'){
    opts=(_ctMedicoesAtual||[]).map(m=>({id:String(m.id),label:`Medição ${m.competencia||'sem competência'} · ${_ctMoney(m.valor_liquido)}`}));
  }else if(type==='invoice'){
    opts=(_ctNotasAtual||[]).map(n=>({id:String(n.id),label:`NF ${n.numero||'sem número'} · ${_ctMoney(n.valor_aprovado??n.valor_total)}`}));
  }else if(type==='history'){
    opts=(_ctHistoricoAtual||[]).map(h=>({id:String(h.id),label:`${fmtDate((h.data_evento||h.created_at||'').substring(0,10))||'sem data'} · ${h.titulo||h.tipo||'Evento'}`}));
  }
  if(!opts.length) opts=[{id:'',label:'Sem registro específico'}];
  sel.innerHTML=opts.map(o=>`<option value="${_sanEsc(o.id)}">${_sanEsc(o.label)}</option>`).join('');
}

function abrirModalDocumentoContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  document.getElementById('ctdoc-info').textContent=`${_ctAtual.numero_contrato||_ctAtual.cpl||_ctAtual.id} — cadastre referência, link ou metadados; não há upload automático.`;
  document.getElementById('ctdoc-tipo').value='contrato_assinado';
  document.getElementById('ctdoc-data').value=_ctTodayISO();
  ['ctdoc-titulo','ctdoc-numero','ctdoc-arquivo','ctdoc-url','ctdoc-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ctdoc-related-type').value='contract';
  const msg=document.getElementById('ctdoc-msg'); if(msg){msg.className='fmsg';msg.textContent='';}
  ctDocAtualizarEntidadesRelacionadas();
  document.getElementById('modal-ct-documento').classList.add('active');
}

async function salvarDocumentoContrato(){
  if(bloquearSeVisualiz('contratos')) return;
  if(!_ctAtual) return;
  const msg=document.getElementById('ctdoc-msg');
  const tipo=document.getElementById('ctdoc-tipo').value||'outro';
  const data=document.getElementById('ctdoc-data').value||null;
  const titulo=(document.getElementById('ctdoc-titulo').value||'').trim();
  const numero=(document.getElementById('ctdoc-numero').value||'').trim();
  const arquivo=(document.getElementById('ctdoc-arquivo').value||'').trim();
  const url=(document.getElementById('ctdoc-url').value||'').trim();
  const relatedType=document.getElementById('ctdoc-related-type').value||'contract';
  const relatedId=(document.getElementById('ctdoc-related-id').value||'').trim()||null;
  const obs=(document.getElementById('ctdoc-obs').value||'').trim();
  if(!titulo){if(msg){msg.textContent='Informe o título do documento.';msg.className='fmsg err';}return;}
  if(!arquivo&&!url&&!numero){if(msg){msg.textContent='Informe ao menos número, arquivo/referência ou link.';msg.className='fmsg err';}return;}
  const payload={
    contrato_id:_ctAtual.id,
    related_entity_type:relatedType,
    related_entity_id:relatedId,
    tipo_documento:tipo,
    titulo,
    numero_documento:numero||null,
    data_documento:data,
    nome_arquivo:arquivo||null,
    url_arquivo:url||null,
    referencia:arquivo||url||numero||null,
    observacoes:obs||null,
    criado_por:currentProfile?.nome||currentProfile?.email||null,
    updated_at:new Date().toISOString()
  };
  const btn=document.querySelector('#modal-ct-documento .btn-primary'); if(btn)btn.disabled=true;
  const {data:doc,error}=await sb.from('contratos_documentos').insert(payload).select('*').single();
  if(error){if(btn)btn.disabled=false;if(msg){msg.textContent='Erro: '+error.message;msg.className='fmsg err';}return;}
  await ctRegistrarHistoricoContrato({
    tipo:'Documento registrado',
    action_type:'documento_registrado',
    titulo:'Documento registrado',
    data_evento:data||_ctTodayISO(),
    obs:`${_ctDocTypeLabel(tipo)}: ${titulo}${numero?' ('+numero+')':''}. Referência cadastrada; não representa upload automático.`,
    related_entity_type:relatedType,
    related_entity_id:relatedId,
    documento_id:doc.id
  });
  if(btn)btn.disabled=false;
  document.getElementById('modal-ct-documento').classList.remove('active');
  if(window.toast) toast('Documento registrado no contrato.','success');
  await abrirDetalheContrato(_ctAtual.id);
  ctOpenContratoTab('documentos');
}

// Fase 13: troca de marca/modelo via termo aditivo
async function abrirTrocaMarcaModelo(contratoId){
  if(bloquearSeVisualiz('contratos')) return;
  document.getElementById('tm-contrato-id').value=contratoId;
  document.getElementById('tm-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('tm-msg').textContent='';
  const lista=document.getElementById('tm-lista'); lista.innerHTML='<span class="spinner"></span> carregando itens...';
  const {data,error}=await sb.from('itens').select('id,descricao,qtde,marca,modelo').eq('contrato_id',contratoId).eq('origem','aquisicao').order('created_at');
  if(error){ lista.innerHTML='<span style="color:var(--red)">Erro: '+_sanEsc(error.message)+'</span>'; return; }
  const itens=data||[];
  if(!itens.length){ lista.innerHTML='<div style="color:var(--text3)">Nenhum item de aquisição neste contrato.</div>'; }
  else{
    const inp='font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box';
    lista.innerHTML=`<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--text2);text-align:left;font-size:11px">
      <th style="padding:4px 6px"></th><th style="padding:4px 6px">Item (marca/modelo atual)</th><th style="padding:4px 6px;width:110px">Nova marca</th><th style="padding:4px 6px;width:110px">Novo modelo</th><th style="padding:4px 6px;width:90px">Qtde afetada</th></tr></thead><tbody>${
      itens.map(i=>`<tr data-item="${i.id}" data-desc="${_sanEsc(i.descricao||'')}" data-atual="${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' '))}" style="border-top:1px solid var(--border)">
        <td style="padding:4px 6px"><input type="checkbox" class="tm-chk"></td>
        <td style="padding:4px 6px">${_sanEsc(i.descricao||'—')}<br><span style="color:var(--text3)">${_sanEsc([i.marca,i.modelo].filter(Boolean).join(' ')||'sem marca/modelo')}</span></td>
        <td style="padding:4px 6px"><input type="text" class="tm-marca" value="${_sanEsc(i.marca||'')}" style="width:100%;${inp}"></td>
        <td style="padding:4px 6px"><input type="text" class="tm-modelo" value="${_sanEsc(i.modelo||'')}" style="width:100%;${inp}"></td>
        <td style="padding:4px 6px"><input type="number" class="tm-qtde" min="0" step="any" placeholder="${i.qtde??'total'}" title="Quantidade afetada (parcial). Vazio = total do saldo." style="width:100%;${inp}"></td>
      </tr>`).join('')}</tbody></table>`;
  }
  document.getElementById('modal-troca-marca').classList.add('active');
}
async function salvarTrocaMarcaModelo(){
  if(bloquearSeVisualiz('contratos')) return;
  const contratoId=document.getElementById('tm-contrato-id').value;
  const data=document.getElementById('tm-data').value||new Date().toISOString().slice(0,10);
  const msg=document.getElementById('tm-msg'); msg.className='fmsg';
  const linhas=[];
  document.querySelectorAll('#tm-lista tr[data-item]').forEach(tr=>{
    if(!tr.querySelector('.tm-chk')?.checked) return;
    const marca=(tr.querySelector('.tm-marca').value||'').trim()||null;
    const modelo=(tr.querySelector('.tm-modelo').value||'').trim()||null;
    const qtde=(tr.querySelector('.tm-qtde').value||'').trim();
    linhas.push({id:tr.dataset.item, desc:tr.dataset.desc, atual:tr.dataset.atual, marca, modelo, qtde});
  });
  if(!linhas.length){ msg.textContent='Marque ao menos um item.'; msg.classList.add('err'); return; }
  const btn=document.getElementById('tm-salvar'); btn.disabled=true;
  try{
    for(const l of linhas){
      await sb.from('itens').update({marca:l.marca,modelo:l.modelo}).eq('id',l.id);
      const novo=[l.marca,l.modelo].filter(Boolean).join(' ')||'—';
      const escopo=l.qtde?`qtde ${l.qtde}`:'total do saldo';
      await sb.from('contratos_historico').insert({contrato_id:Number(contratoId),tipo:'Troca de marca/modelo',data_evento:data,obs:`${l.desc}: "${l.atual||'—'}" → "${novo}" (${escopo})`});
    }
  }catch(e){ btn.disabled=false; msg.textContent='Erro: '+(e.message||e); msg.classList.add('err'); return; }
  btn.disabled=false;
  if(window.toast) toast('Aditivo de marca/modelo registrado.','success');
  document.getElementById('modal-troca-marca').classList.remove('active');
  itensCarregado=false; itensEntregasCarregado=false;
  await abrirDetalheContrato(Number(contratoId));
}

function abrirModalContratoOp(op){
  if(bloquearSeVisualiz()) return;
  const infoMap={renovar:"ctr-info",prorrogacao:"ctpr-info",fiscal:"ctfi-info"};
  const modalMap={renovar:"modal-ct-renovar",prorrogacao:"modal-ct-prorrogacao",fiscal:"modal-ct-fiscal"};
  const info=_ctAtual?`${_ctAtual.cpl||""} — ${_ctAtual.prestador||""}`:"";
  const infoEl=document.getElementById(infoMap[op]);
  if(infoEl) infoEl.textContent=info;
  if(op==="renovar"){
    const mensalWrap=document.getElementById("ctr-valor-mensal-wrap");
    const ata=_ctAtual?.tipo_instrumento==="ATA";
    if(mensalWrap) mensalWrap.style.display=ata?"none":"";
    if(ata) document.getElementById("ctr-valor-mensal").value="";
    else document.getElementById("ctr-valor-mensal").value=_ctValorPeriodico(_ctAtual)||"";
    const periodoLabel=document.getElementById('ctr-valor-periodico-label');
    if(periodoLabel) periodoLabel.textContent=_ctEhTrimestral()?'Novo valor trimestral (R$)':'Novo valor mensal (R$)';
  }
  if(op==="prorrogacao"){
    const st=document.getElementById('ctpr-status'); if(st) st.value='rascunho';
  }
  if(op==="fiscal"){
    preencherSelectPessoas('ctfi-nome', true);
    const wrap=document.getElementById("ctfi-fiscais-atuais");
    if(wrap&&_ctAtual){
      sb.from("contratos_fiscalizadores").select("*").eq("contrato_id",_ctAtual.id).is("data_fim",null).order("data_inicio",{ascending:false}).then(({data})=>{
        if(!data||!data.length){wrap.innerHTML=`<div style="font-size:13px;color:var(--text3)">Sem fiscalizadores ativos</div>`;return;}
        wrap.innerHTML=`<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.375rem">Fiscalizadores ativos</div>`+data.map(f=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><span>${f.nome||"—"}</span><button onclick="removerFiscalizador(${f.id})" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--red);background:none;color:var(--red);cursor:pointer">Remover</button></div>`).join("");
      });
    }
  }
  ["ctr-msg","ctpr-msg","ctfi-msg"].forEach(id=>{const el=document.getElementById(id);if(el){el.className="fmsg";el.textContent=""}});
  document.getElementById(modalMap[op]).classList.add("active");
}

async function removerFiscalizador(fiscId){
  if(!await uiConfirm("Remover este fiscalizador?")) return;
  const hoje=new Date().toISOString().substring(0,10);
  const {error}=await sb.from("contratos_fiscalizadores").update({data_fim:hoje}).eq("id",fiscId);
  if(error){alert("Erro: "+error.message);return;}
  abrirModalContratoOp("fiscal");
}

async function salvarOperacaoContrato(op){
  if(bloquearSeVisualiz()) return;
  if(!_ctAtual){alert("Contrato nao selecionado.");return;}
  const id=_ctAtual.id;
  const msgEl=document.getElementById({renovar:"ctr-msg",prorrogacao:"ctpr-msg",fiscal:"ctfi-msg"}[op]);
  const setMsg=(txt,ok)=>{if(msgEl){msgEl.className="fmsg "+(ok?"ok":"err");msgEl.textContent=txt;}};
  const fmtBR=d=>{if(!d)return"";const[a,m,dd]=d.split("-");return`${dd}/${m}/${a}`;};

  try{
    if(op==="renovar"){
      const inicio=document.getElementById("ctr-inicio").value;
      const fim=document.getElementById("ctr-fim").value;
      if(!inicio||!fim){setMsg("Vigencia inicio e fim sao obrigatorios",false);return;}
      const valor=document.getElementById("ctr-valor").value;
      const valorMensal=_ctAtual.tipo_instrumento==="ATA"?"":document.getElementById("ctr-valor-mensal").value;
      const obs=document.getElementById("ctr-obs").value.trim();
      const vigStr=`${fmtBR(inicio)} a ${fmtBR(fim)}`;
      const upd={vigencia_atual:vigStr,vencimento:fmtBR(fim),status:"VIGENTE"};
      if(valor){ upd.valor_atual=_ctNum(valor); upd.valor_atual_num=_ctNum(valor); }
      if(valorMensal){
        if(_ctEhTrimestral()) upd.valor_periodico_num=_ctNum(valorMensal);
        else { upd.valor_mensal=_ctNum(valorMensal); upd.valor_mensal_num=_ctNum(valorMensal); upd.valor_periodico_num=_ctNum(valorMensal); }
      }
      const {error:e1}=await sb.from("contratos").update(upd).eq("id",id);
      if(e1) throw e1;
      await sb.from("contratos_vigencias").insert({contrato_id:id,data_inicio:inicio,data_fim:fim,valor_total:valor?_ctNum(valor):null,valor_mensal:(!_ctEhTrimestral()&&valorMensal)?_ctNum(valorMensal):null,periodicidade_pagamento:_ctPeriodicidade(),valor_periodico:valorMensal?_ctNum(valorMensal):null,obs});
      await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Renovacao",action_type:"renovacao",titulo:"Renovacao formalizada",data_evento:inicio,status_evento:"formalizado",vigencia_nova_inicio:inicio,vigencia_nova_fim:fim,valor_impacto:valor?_ctNum(valor):null,valor_novo:valor?String(_ctNum(valor)):null,valor_mensal_novo:(!_ctEhTrimestral()&&valorMensal)?String(_ctNum(valorMensal)):null,periodicidade_calculo:_ctPeriodicidade(),valor_unitario_periodo:valorMensal?_ctNum(valorMensal):null,obs:`Valor anterior: ${_ctAtual.valor_atual??"—"}${obs?". "+obs:""}`});
      setMsg("Contrato renovado.",true);
    } else if(op==="prorrogacao"){
      const dataFim=document.getElementById("ctpr-data-fim").value;
      if(!dataFim){setMsg("Nova data fim e obrigatoria",false);return;}
      const status=document.getElementById("ctpr-status")?.value||"rascunho";
      const obs=document.getElementById("ctpr-obs").value.trim();
      if(status==="formalizado"){
        const {error}=await sb.from("contratos").update({vencimento:fmtBR(dataFim)}).eq("id",id);
        if(error) throw error;
      }
      const res=await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Prorrogacao",action_type:"prorrogacao",titulo:"Prorrogacao registrada",data_evento:_ctTodayISO(),vigencia_nova_fim:dataFim,status_evento:status,obs:`Nova data fim: ${dataFim}. Status: ${status}${obs?". "+obs:""}`});
      if(res.error) throw res.error;
      setMsg(status==="formalizado"?"Prorrogacao formalizada.":"Prorrogacao salva como "+status+".",true);
    } else if(op==="fiscal"){
      const nome=selValorTexto('ctfi-nome');
      const inicio=document.getElementById("ctfi-inicio").value;
      if(!nome||!inicio){setMsg("Nome e data inicio sao obrigatorios",false);return;}
      if(document.getElementById("ctfi-nome").value==='__novo__' && nome){ try{ await obterOuCriarPessoa(nome); }catch(_){} }
      const cargo=document.getElementById("ctfi-cargo").value.trim();
      const {error}=await sb.from("contratos_fiscalizadores").insert({contrato_id:id,nome,data_inicio:inicio,cargo:cargo||null});
      if(error) throw error;
      await ctRegistrarHistoricoContrato({contrato_id:id,tipo:"Troca de fiscal",action_type:"alteracao_fiscal",titulo:"Fiscal adicionado",data_evento:inicio,status_evento:"formalizado",obs:`Novo fiscal: ${nome}${cargo?" ("+cargo+")":""} a partir de ${inicio}`});
      await sb.from("contratos").update({fiscalizacao:nome}).eq("id",id);
      setMsg("Fiscal adicionado.",true);
    }
    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(id))||_ctAtual;
    setTimeout(()=>{document.getElementById("modal-ct-"+op).classList.remove("active");},1200);
  }catch(e){
    setMsg("Erro: "+(e.message||e),false);
  }
}

async function salvarOperacaoContratoLegacy(op){
  if(bloquearSeVisualiz()) return;
  if(!_ctAtual){alert("Contrato não selecionado.");return;}
  const id=_ctAtual.id;
  const msgEl=document.getElementById({renovar:"ctr-msg",reajuste:"ctrea-msg",aditivo:"ctad-msg",prorrogacao:"ctpr-msg",supressao:"ctsu-msg",fiscal:"ctfi-msg"}[op]);
  const setMsg=(txt,ok)=>{if(msgEl){msgEl.className="fmsg "+(ok?"ok":"err");msgEl.textContent=txt;}};

  try{
    if(op==="renovar"){
      const inicio=document.getElementById("ctr-inicio").value;
      const fim=document.getElementById("ctr-fim").value;
      if(!inicio||!fim){setMsg("Vigência início e fim são obrigatórios","err");return;}
      const valor=document.getElementById("ctr-valor").value;
      const valorMensal=_ctAtual.tipo_instrumento==="ATA"?"":document.getElementById("ctr-valor-mensal").value;
      const obs=document.getElementById("ctr-obs").value.trim();
      // Formatar vigencia_atual e vencimento para a tabela contratos
      const fmtBR=d=>{if(!d)return"";const[a,m,dd]=d.split("-");return`${dd}/${m}/${a}`;};
      const vigStr=`${fmtBR(inicio)} a ${fmtBR(fim)}`;
      const upd={vigencia_atual:vigStr,vencimento:fmtBR(fim),status:"VIGENTE"};
      if(valor){ upd.valor_atual=valor; upd.valor_atual_num=_ctNum(valor); }
      if(valorMensal) upd.valor_mensal=valorMensal;
      const {error:e1}=await sb.from("contratos").update(upd).eq("id",id);
      if(e1) throw e1;
      await sb.from("contratos_vigencias").insert({contrato_id:id,data_inicio:inicio,data_fim:fim,valor_total:valor?parseFloat(valor):null,valor_mensal:valorMensal?parseFloat(valorMensal):null,obs});
      await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Renovação",data_evento:inicio,vigencia_nova_inicio:inicio,vigencia_nova_fim:fim,valor_novo:valor?String(parseFloat(valor)):null,valor_mensal_novo:valorMensal?String(parseFloat(valorMensal)):null,obs:`Valor anterior: ${_ctAtual.valor_atual??"—"}${obs?". "+obs:""}`});
      setMsg("✓ Contrato renovado!","ok");

    } else if(op==="reajuste"){
      const data=document.getElementById("ctrea-data").value;
      const pct=document.getElementById("ctrea-pct").value;
      if(!data||!pct){setMsg("Data e percentual são obrigatórios","err");return;}
      const obs=document.getElementById("ctrea-obs").value.trim();
      const {error}=await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Reajuste",obs:`${pct}%${obs?". "+obs:""} (${data})`});
      if(error) throw error;
      setMsg("✓ Reajuste registrado!","ok");

    } else if(op==="aditivo"){
      const data=document.getElementById("ctad-data").value;
      if(!data){setMsg("Data é obrigatória","err");return;}
      const pct=document.getElementById("ctad-pct").value;
      const valor=document.getElementById("ctad-valor").value;
      const obs=document.getElementById("ctad-obs").value.trim();
      const totalAntigo=Number(_ctAtual.valor_atual)||0;
      const novoTotal=valor?totalAntigo+parseFloat(valor):totalAntigo;
      const {error}=await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Aditivo",data_evento:data,percentual:pct||null,valor_novo:valor?String(novoTotal):null,obs:`${pct?pct+"%":""} ${valor?"R$ "+parseFloat(valor).toLocaleString("pt-BR",{minimumFractionDigits:2}):""}${obs?". "+obs:""}`.trim()});
      if(error) throw error;
      if(valor) await sb.from("contratos").update({valor_atual:novoTotal,valor_atual_num:novoTotal}).eq("id",id);
      setMsg("✓ Aditivo registrado!","ok");

    } else if(op==="prorrogacao"){
      const dataFim=document.getElementById("ctpr-data-fim").value;
      if(!dataFim){setMsg("Nova data fim é obrigatória","err");return;}
      const obs=document.getElementById("ctpr-obs").value.trim();
      const fmtBR2=d=>{if(!d)return"";const[a,m,dd]=d.split("-");return`${dd}/${m}/${a}`;};
      const {error}=await sb.from("contratos").update({vencimento:fmtBR2(dataFim)}).eq("id",id);
      if(error) throw error;
      await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Prorrogação",obs:`Nova data fim: ${dataFim}${obs?". "+obs:""}`});
      setMsg("✓ Prorrogação registrada!","ok");

    } else if(op==="supressao"){
      const data=document.getElementById("ctsu-data").value;
      if(!data){setMsg("Data é obrigatória","err");return;}
      const pct=document.getElementById("ctsu-pct").value;
      const valor=document.getElementById("ctsu-valor").value;
      const obs=document.getElementById("ctsu-obs").value.trim();
      const {error}=await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Supressão",obs:`${pct?pct+"%":""} ${valor?"R$ "+parseFloat(valor).toLocaleString("pt-BR",{minimumFractionDigits:2}):""}${obs?". "+obs:""} (${data})`.trim()});
      if(error) throw error;
      setMsg("✓ Supressão registrada!","ok");

    } else if(op==="fiscal"){
      const nome=selValorTexto('ctfi-nome');
      const inicio=document.getElementById("ctfi-inicio").value;
      if(!nome||!inicio){setMsg("Nome e data início são obrigatórios","err");return;}
      if(document.getElementById("ctfi-nome").value==='__novo__' && nome){ try{ await obterOuCriarPessoa(nome); }catch(_){} }
      const cargo=document.getElementById("ctfi-cargo").value.trim();
      const {error}=await sb.from("contratos_fiscalizadores").insert({contrato_id:id,nome,data_inicio:inicio,cargo:cargo||null});
      if(error) throw error;
      await sb.from("contratos_historico").insert({contrato_id:id,tipo:"Troca de fiscal",obs:`Novo fiscal: ${nome}${cargo?" ("+cargo+")":""} a partir de ${inicio}`});
      await sb.from("contratos").update({fiscalizacao:nome}).eq("id",id);
      setMsg("✓ Fiscal adicionado!","ok");
    }

    await loadContratos();
    _ctAtual=contratosRows.find(r=>String(r.id)===String(id))||_ctAtual;
    setTimeout(()=>{document.getElementById("modal-ct-"+op).classList.remove("active");},1200);
  } catch(e){
    setMsg("✗ Erro: "+(e.message||e),"err");
  }
}

setHeaderH();
window.addEventListener('load', setHeaderH);
