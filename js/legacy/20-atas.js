// ═══ ATAS ═══
async function loadAtas(){
  document.getElementById("atas-loading").style.display="block";
  document.getElementById("atas-main").style.display="none";
  try{
    const [r1,r2,r3,r4]=await Promise.all([
      sb.from("atas_itens").select("*").order("created_at"),
      sb.from("atas_execucao").select("*").order("created_at",{ascending:false}),
      sb.from("contratos").select("*").eq("tipo_instrumento","ATA"),
      sb.from("fornecedores").select("id,razao_social,cnpj_normalizado")
    ]);
    if(r1.error) throw r1.error;
    if(r2.error) throw r2.error;
    if(r3.error) throw r3.error;
    if(r4.error) throw r4.error;
    const fornecedorPorId=new Map((r4.data||[]).map(f=>[String(f.id),f]));
    atasContratos=(r3.data||[])
      .map(c=>{
      const fornecedor=fornecedorPorId.get(String(c.fornecedor_id))||null;
      return {...c,
        empresa:(fornecedor?.razao_social||c.prestador||"").trim(),
        cnpj_fornecedor:fornecedor?.cnpj_normalizado||c.cnpj||""
      };
    });
    const contratoPorId=new Map(atasContratos.map(c=>[String(c.id),c]));
    atasItens=(r1.data||[]).map(r=>{
      const contrato=contratoPorId.get(String(r.contrato_id));
      if(!contrato) return null;
      // contratos.status é a fonte única da verdade; status_contrato em atas_itens é campo
      // legado nunca sincronizado (sempre 'VIGENTE'), não deve sobrepor o status real.
      const statusItem=(contrato.status||"VIGENTE").trim();
      return {
      id:r.id,
      contrato_id:r.contrato_id,
      fornecedor_id:contrato.fornecedor_id,
      cpl:(contrato.cpl||"").trim(),
      sim:(contrato.numero_contrato||"").trim(),
      item:(r.item||"").trim(),
      marca:(r.marca_modelo||"").trim(),
      qtde_contratada:Number(r.qtde_contratada)||0,
      valor_unit:Number(r.valor_unit)||0,
      vencimento:(contrato.vencimento||"").trim(),
      status:statusItem,
      empresa:contrato.empresa,
      prazo_entrega:parseInt(r.prazo_entrega)||0,
      contrato
    };}).filter(Boolean);
    const itemPorId=new Map(atasItens.map(i=>[String(i.id),i]));
    atasExec=(r2.data||[]).map(r=>{
      const ata=itemPorId.get(String(r.ata_item_id));
      if(!ata) return null;
      return {
      id:r.id,
      _sancao_id:r.id,
      ata_item_id:r.ata_item_id,
      contrato_id:ata.contrato_id,
      status:ata.status,
      cpl:ata.cpl,
      sim:ata.sim,
      item:ata.item,
      unidade:(r.unidade||"").trim(),
      qtde:Number(r.qtde)||0,
      valor:Number(r.valor)||0,
      empenho:(r.empenho||"").trim(),
      data_af:(r.data_af||"").trim(),
      prev_entrega:(r.prev_entrega||"").trim(),
      dt_entrega:(r.dt_entrega||"").trim(),
      nf:(r.nf||"").trim(),
      obs_prazo:(r.obs_prazo||"").trim(),
      origem_recurso:(r.origem_recurso||"").trim(),
      emenda_id:r.emenda_id||null,
      emenda_item_id:r.emenda_item_id||null,
      af_numero:(r.af_numero||"").trim(),
      data_entrega_unidade:r.data_entrega_unidade||null,
      termo_arquivo:r.termo_arquivo||"",
      termo_responsavel:r.termo_responsavel||"",
      termo_cargo:r.termo_cargo||"",
      confirmacao_obs:r.confirmacao_obs||"",
      possui_patrimonio:r.possui_patrimonio,
      empresa:ata.empresa||"",
      cnpj:ata.cnpj_fornecedor||ata.contrato?.cnpj||"",
      contrato:ata.contrato||null
    };}).filter(Boolean);
    popularFiltrosAtas();
    filtrarAtas();
    renderAlertas();
    document.getElementById("atas-loading").style.display="none";
    document.getElementById("atas-main").style.display="block";
  }catch(e){
    document.getElementById("atas-loading").innerHTML=`<div style="color:var(--red)">⚠️ Erro: ${e.message}</div>`;
  }
}

function _resolverAtaItemRef(cplOuId,sim,item){
  if(cplOuId&&typeof cplOuId==="object") return cplOuId;
  if(sim===undefined&&item===undefined) return atasItens.find(r=>String(r.id)===String(cplOuId))||null;
  return atasItens.find(r=>r.cpl===cplOuId&&r.sim===sim&&r.item===item)||null;
}

function getSaldo(cpl,sim,item){
  const at=_resolverAtaItemRef(cpl,sim,item);
  if(!at) return 0;
  const exec=atasExec.filter(r=>String(r.ata_item_id)===String(at.id)).reduce((a,r)=>a+r.qtde,0);
  return at.qtde_contratada-exec;
}

function getExecutado(cpl,sim,item){
  const at=_resolverAtaItemRef(cpl,sim,item);
  if(!at) return 0;
  return atasExec.filter(r=>String(r.ata_item_id)===String(at.id)).reduce((a,r)=>a+r.qtde,0);
}

function diasParaVencer(vencimento){
  if(!vencimento) return 9999;
  try{
    const partes=vencimento.split("/");
    let d;
    if(partes.length===3) d=new Date(partes[2],partes[1]-1,partes[0]);
    else d=new Date(vencimento);
    return Math.round((d-new Date())/(1000*60*60*24));
  }catch(e){return 9999;}
}

function renderAlertas(){
  const vencendo=atasItens.filter(r=>diasParaVencer(r.vencimento)<=90&&diasParaVencer(r.vencimento)>0&&!r.status?.toUpperCase().startsWith("ENCERRADO"));
  const encerrados=atasItens.filter(r=>diasParaVencer(r.vencimento)<0&&!r.status?.toUpperCase().startsWith("ENCERRADO"));
  let html="";
  if(encerrados.length){
    html+=`<div style="background:var(--red-bg);color:var(--red-text);border-radius:var(--radius-sm);padding:.75rem 1rem;margin-bottom:.5rem;font-size:13px">
      ⛔ <strong>${encerrados.length} contrato(s) VENCIDO(S):</strong> ${encerrados.map(r=>`${r.cpl} / ${r.sim} — ${r.item}`).join(" · ")}
    </div>`;
  }
  if(vencendo.length){
    html+=`<div style="background:var(--amber-bg);color:var(--amber-text);border-radius:var(--radius-sm);padding:.75rem 1rem;font-size:13px">
      ⚠️ <strong>${vencendo.length} contrato(s) vencendo em até 90 dias:</strong> ${vencendo.map(r=>`${r.cpl}/${r.sim} — ${r.item} (${diasParaVencer(r.vencimento)}d)`).join(" · ")}
    </div>`;
  }
  document.getElementById("atas-alertas").innerHTML=html;
}

// Filtros estilo Google Sheets para ATAs / Execuções
const ATA_FILTER_COLS = {
  cpl:{get:r=>r.cpl||'',disp:v=>v||'(vazio)'},
  sim:{get:r=>r.sim||'',disp:v=>v||'(vazio)'},
  item:{get:r=>r.item||'',disp:v=>v||'(vazio)'},
  marca:{get:r=>r.marca||'',disp:v=>v||'(vazio)'},
  qtde_contratada:{get:r=>r.qtde_contratada??'',disp:v=>v!==''?v:'(vazio)'},
  exec:{get:r=>getExecutado(r.cpl,r.sim,r.item),disp:v=>v!==''?v:'(vazio)'},
  saldo:{get:r=>getSaldo(r.cpl,r.sim,r.item),disp:v=>v!==''?v:'(vazio)'},
  valor_unit:{get:r=>r.valor_unit||'',disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  vencimento:{get:r=>r.vencimento||'',disp:v=>v||'(vazio)'},
  status:{get:r=>r.status||'',disp:v=>v||'(vazio)'},
  empresa:{get:r=>r.empresa||'',disp:v=>v||'(vazio)'},
};
const EXEC_FILTER_COLS = {
  cpl:{get:r=>r.cpl||'',disp:v=>v||'(vazio)'},
  sim:{get:r=>r.sim||'',disp:v=>v||'(vazio)'},
  item:{get:r=>r.item||'',disp:v=>v||'(vazio)'},
  unidade:{get:r=>r.unidade||'',disp:v=>v||'(vazio)'},
  qtde:{get:r=>r.qtde??'',disp:v=>v!==''?v:'(vazio)'},
  valor:{get:r=>r.valor||'',disp:v=>(Number(v)||Number(v)===0)?fmtFull(Number(v)):'(vazio)'},
  empenho:{get:r=>r.empenho||'',disp:v=>v||'(vazio)'},
  data_af:{get:r=>r.data_af||'',disp:v=>v||'(vazio)'},
  prev_entrega:{get:r=>r.prev_entrega||'',disp:v=>v||'(vazio)'},
  dt_entrega:{get:r=>r.dt_entrega||'',disp:v=>v||'(vazio)'},
  dias_prazo:{get:r=>calcDiasPrazo(r)??'',disp:v=>v!==''?`${v}d`:'(vazio)'},
  nf:{get:r=>r.nf||'',disp:v=>v||'(vazio)'},
};
let ataHeaderFilters=Object.fromEntries(Object.keys(ATA_FILTER_COLS).map(k=>[k,[]]));
let execHeaderFilters=Object.fromEntries(Object.keys(EXEC_FILTER_COLS).map(k=>[k,[]]));
let _sheetFilterKind=null,_sheetFilterCol=null,_sheetFilterPending=[];
let _atasTableVisible={itens:false,execs:false};

function toggleTabelaAtas(tipo){
  const wrap=document.getElementById(tipo==='itens'?'atas-itens-wrap':'atas-execs-wrap');
  const btn=document.getElementById(tipo==='itens'?'btn-toggle-atas-itens':'btn-toggle-atas-execs');
  if(!wrap||!btn) return;
  _atasTableVisible[tipo]=!_atasTableVisible[tipo];
  wrap.style.display=_atasTableVisible[tipo]?'block':'none';
  btn.textContent=_atasTableVisible[tipo]?'Ocultar':'Mostrar';
  btn.classList.toggle('active',_atasTableVisible[tipo]);
  setTimeout(_setTableOffset,0);
}
function _sheetCfg(kind){return kind==='ata'?ATA_FILTER_COLS:EXEC_FILTER_COLS;}
function _sheetRows(kind){return kind==='ata'?atasItens:atasExec;}
function _sheetFilters(kind){return kind==='ata'?ataHeaderFilters:execHeaderFilters;}
function _sheetPrefix(kind){return kind==='ata'?'hfa':'hfe';}
function _sheetUnique(kind,col){
  const cfg=_sheetCfg(kind)[col];
  return [...new Set(_sheetRows(kind).map(cfg.get).map(v=>v==null?'':String(v)))]
    .sort((a,b)=>cfg.disp(a).localeCompare(cfg.disp(b),'pt-BR',{numeric:true}));
}
function _ensureSheetDropdown(){
  let dd=document.getElementById('sheet-hdr-dropdown'); if(dd) return dd;
  dd=document.createElement('div'); dd.id='sheet-hdr-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`<div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_sheetHdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_sheetHdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div><hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="sheet-hdr-search" placeholder="🔍 Buscar..." oninput="_sheetHdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_sheetHdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="sheet-hdr-count">0</span></a> — <a href="#" onclick="_sheetHdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="sheet-hdr-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closeSheetFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmSheetFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd); return dd;
}
function _openSheetFilter(e,kind,col){
  e.stopPropagation(); const dd=_ensureSheetDropdown();
  if(_sheetFilterKind===kind&&_sheetFilterCol===col&&dd.style.display==='block'){closeSheetFilter();return;}
  _sheetFilterKind=kind; _sheetFilterCol=col;
  const all=_sheetUnique(kind,col), cur=_sheetFilters(kind)[col]||[];
  _sheetFilterPending=cur.length?[...cur]:[...all];
  document.getElementById('sheet-hdr-search').value=''; _sheetHdrRenderList();
  const rect=e.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const ddW=dd.offsetWidth||240; let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px'; dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('sheet-hdr-search').focus(),50);
}
function openAtaFilter(e,col){_openSheetFilter(e,'ata',col);}
function openExecFilter(e,col){_openSheetFilter(e,'exec',col);}
function _sheetHdrRenderList(){
  const kind=_sheetFilterKind,col=_sheetFilterCol; if(!kind||!col) return;
  const q=normalizar(document.getElementById('sheet-hdr-search').value);
  const all=_sheetUnique(kind,col), disp=_sheetCfg(kind)[col].disp;
  const vis=q?all.filter(v=>normalizar(disp(v)).includes(q)):all;
  document.getElementById('sheet-hdr-count').textContent=all.length;
  document.getElementById('sheet-hdr-list').innerHTML=vis.map(v=>{
    const checked=_sheetFilterPending.includes(v)?'checked':''; const safe=String(v).replace(/"/g,'&quot;');
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px;color:var(--text)"><input type="checkbox" value="${safe}" ${checked} onchange="_sheetHdrToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${disp(v)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _sheetHdrToggle(cb){if(cb.checked){if(!_sheetFilterPending.includes(cb.value))_sheetFilterPending.push(cb.value);}else{_sheetFilterPending=_sheetFilterPending.filter(x=>x!==cb.value);}}
function _sheetHdrSelectAll(all){if(!_sheetFilterKind||!_sheetFilterCol)return;_sheetFilterPending=all?_sheetUnique(_sheetFilterKind,_sheetFilterCol):[];_sheetHdrRenderList();}
function _sheetHdrSort(asc){
  const kind=_sheetFilterKind,col=_sheetFilterCol;
  if(!kind||!col) return;
  if(kind==='ata'){
    _sortAtasCol=col; _sortAtasAsc=asc;
    document.querySelectorAll('[id^="sort-atas-"]').forEach(el=>el.textContent="");
    const el=document.getElementById("sort-atas-"+col);
    if(el) el.textContent=asc?" ↑":" ↓";
    closeSheetFilter(); filtrarAtas();
    return;
  }
  _sortExecCol=col; _sortExecAsc=asc;
  document.querySelectorAll('[id^="sort-exec-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-exec-"+col);
  if(el) el.textContent=asc?" ↑":" ↓";
  closeSheetFilter(); filtrarExecs();
}
function confirmSheetFilter(){
  const kind=_sheetFilterKind,col=_sheetFilterCol; if(!kind||!col)return;
  const all=_sheetUnique(kind,col), filters=_sheetFilters(kind);
  filters[col]=(_sheetFilterPending.length===0||_sheetFilterPending.length===all.length)?[]:[..._sheetFilterPending];
  closeSheetFilter(); _sheetUpdateHdrBtns(); filtrarAtas();
}
function closeSheetFilter(){const dd=document.getElementById('sheet-hdr-dropdown');if(dd)dd.style.display='none';_sheetFilterKind=null;_sheetFilterCol=null;}
function _sheetUpdateHdrBtns(){
  Object.keys(ATA_FILTER_COLS).forEach(col=>{const btn=document.getElementById('hfa-'+col);if(btn)btn.classList.toggle('active',(ataHeaderFilters[col]||[]).length>0);});
  Object.keys(EXEC_FILTER_COLS).forEach(col=>{const btn=document.getElementById('hfe-'+col);if(btn)btn.classList.toggle('active',(execHeaderFilters[col]||[]).length>0);});
}
document.addEventListener('click',function(e){const dd=document.getElementById('sheet-hdr-dropdown');if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!(e.target.closest&&e.target.closest('.hdr-filter-btn'))){closeSheetFilter();}});

function popularFiltrosAtas(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${v}"${v===cur?" selected":""}>${v}</option>`).join("")};
  sel("fat-cpl",[...new Set(atasItens.map(r=>r.cpl).filter(Boolean))].sort());
  sel("fat-sim",[...new Set(atasItens.map(r=>r.sim).filter(Boolean))].sort());
  sel("fat-empresa",[...new Set(atasItens.map(r=>r.empresa).filter(Boolean))].sort());
  // Agrupar encerrados num único filtro
  const statusUnicos=[...new Set(atasItens.map(r=>{
    if(r.status&&r.status.toUpperCase().startsWith("ENCERRADO")) return "ENCERRADO";
    return r.status;
  }).filter(Boolean))].sort();
  sel("fat-status",statusUnicos);
  if(!_atasStatusInit){
    _atasStatusInit=true;
    const elSt=document.getElementById("fat-status");
    if(elSt&&!elSt.value&&statusUnicos.includes("VIGENTE")) elSt.value="VIGENTE";
  }
  _sheetUpdateHdrBtns();
}
let _atasStatusInit=false;

function clearAllAtas(){
  ["fat-cpl","fat-sim","fat-empresa","fat-busca"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  const elSt=document.getElementById("fat-status");
  if(elSt) elSt.value=[...elSt.options].some(o=>o.value==="VIGENTE")?"VIGENTE":"";
  Object.keys(ataHeaderFilters).forEach(k=>ataHeaderFilters[k]=[]);
  Object.keys(execHeaderFilters).forEach(k=>execHeaderFilters[k]=[]);
  _sheetUpdateHdrBtns();
  filtrarAtas();
}

function filtrarAtas(){
  const cpl=document.getElementById("fat-cpl")?.value||"";
  const sim=document.getElementById("fat-sim")?.value||"";
  const emp=document.getElementById("fat-empresa")?.value||"";
  const st=document.getElementById("fat-status")?.value||"";
  const busca=document.getElementById("fat-busca")?.value||"";

  let rows=atasItens.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    if(emp&&r.empresa!==emp) return false;
    for(const [col,sel] of Object.entries(ataHeaderFilters)){
      if(!sel.length) continue;
      const cfg=ATA_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // "Todos" (st vazio) mostra vigentes e encerrados; "ENCERRADO" mostra só encerrados; outro valor filtra exato
    if(st==="ENCERRADO"&&!(r.status&&r.status.toUpperCase().startsWith("ENCERRADO"))) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(busca&&!matchBusca(r.item+" "+r.marca+" "+r.cpl+" "+r.sim,busca)) return false;
    return true;
  });
  // Ordenação
  if(_sortAtasCol){
    rows.sort((a,b)=>{
      let va,vb;
      if(_sortAtasCol==="exec"){va=getExecutado(a.cpl,a.sim,a.item);vb=getExecutado(b.cpl,b.sim,b.item);}
      else if(_sortAtasCol==="saldo"){va=getSaldo(a.cpl,a.sim,a.item);vb=getSaldo(b.cpl,b.sim,b.item);}
      else{va=a[_sortAtasCol]||"";vb=b[_sortAtasCol]||"";}
      if(typeof va==="number"&&typeof vb==="number") return _sortAtasAsc?va-vb:vb-va;
      // Ordenação de datas no formato DD/MM/YYYY
      if(_sortAtasCol==="vencimento"){
        const da=parseDataBR(va),db=parseDataBR(vb);
        if(da&&db) return _sortAtasAsc?da-db:db-da;
      }
      return _sortAtasAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }

  const totalSaldo=rows.reduce((a,r)=>a+getSaldo(r.cpl,r.sim,r.item),0);
  const totalExec=rows.reduce((a,r)=>a+getExecutado(r.cpl,r.sim,r.item),0);
  const vencendo90=rows.filter(r=>diasParaVencer(r.vencimento)<=90&&r.status!=="ENCERRADO").length;

  document.getElementById("at-total").textContent=rows.length;
  document.getElementById("at-saldo").textContent=totalSaldo;
  document.getElementById("at-exec").textContent=totalExec;
  document.getElementById("at-vence").textContent=vencendo90;
  document.getElementById("atas-count").textContent=`${rows.length} itens`;

  const dias90=new Date();dias90.setDate(dias90.getDate()+90);

  document.getElementById("atas-body").innerHTML=rows.map(r=>{
    const exec=getExecutado(r.cpl,r.sim,r.item);
    const saldo=r.qtde_contratada-exec;
    const dias=diasParaVencer(r.vencimento);
    const vcor=dias<=0?"var(--red)":dias<=90?"var(--amber)":"var(--green)";
    const pct=r.qtde_contratada?Math.round(exec/r.qtde_contratada*100):0;
    const stColor=r.status==="VIGENTE"?"var(--green)":r.status==="ENCERRADO"?"var(--red)":"var(--amber)";
    return`<tr>
      <td style="font-size:11px;white-space:nowrap">${r.cpl}</td>
      <td style="font-size:11px;white-space:nowrap">${r.sim}</td>
      <td class="td-trunc" title="${r.item}" style="max-width:220px">${r.item}</td>
      <td style="font-size:11px">${r.marca||"—"}</td>
      <td style="text-align:right">${r.qtde_contratada}</td>
      <td style="text-align:right">
        ${exec}
        <div style="height:4px;background:var(--surface2);border-radius:2px;margin-top:3px;width:60px">
          <div style="height:4px;background:${pct>=90?'var(--red)':pct>=70?'var(--amber)':'var(--green)'};border-radius:2px;width:${Math.min(pct,100)}%"></div>
        </div>
      </td>
      <td style="text-align:right;font-weight:500;color:${saldo<=0?'var(--red)':saldo<=5?'var(--amber)':'var(--text)'}">${saldo}</td>
      <td style="text-align:right;font-size:11px">${r.valor_unit?fmtFull(r.valor_unit):"—"}</td>
      <td style="font-size:11px;color:${vcor};font-weight:500">${r.vencimento||"—"}${dias<=90&&dias>0?` (${dias}d)`:''}${dias<=0?' ⛔':''}</td>
      <td><span class="badge" style="background:${stColor}22;color:${stColor}">${r.status}</span></td>
      <td style="font-size:11px">${r.empresa||"—"}</td>
      <td>
        ${r.status&&r.status.toUpperCase().startsWith("ENCERRADO")?`
        <button onclick="verExecsItem('${r.id}')" class="btn-secondary btn-compact" title="Ver solicitações deste item">📋 Solicitações</button>
        `:`
        <div style="display:flex;align-items:center;gap:6px">
        <button onclick="abrirModalEditAta('${r.id}')" class="btn-secondary btn-compact" title="Adicionar solicitação">✏️ Solicitação</button>
        ${kebabMenuHtml([
          {label:'🔄 Prorrogar',onclick:`renovarAta('${r.id}')`,title:'Prorrogar vigência do contrato'},
          {label:'📋 Solicitações',onclick:`verExecsItem('${r.id}')`,title:'Ver solicitações deste item'},
          _isAdmin()?{label:'✏️ Editar',onclick:`_ataAbrirEditarContrato('${r.contrato_id}')`,title:'Editar dados do contrato (fiscalização, seção, empresa, objeto...)'}:null,
          podeEditar('contratos')?{label:'🔗 Vinculações',onclick:`_ataAbrirEmailContrato('${r.contrato_id}')`,title:'Configurar e-mail e prefixo de chamado'}:null,
          {label:'⛔ Encerrar',onclick:`encerrarContrato('${r.contrato_id}')`,title:'Encerrar contrato',danger:true,divider:true}
        ])}
        </div>
        `}
      </td>
    </tr>`;
  }).join("")||`<tr><td colspan="12"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum item de ata encontrado</div></td></tr>`;

  // Tabela de execuções filtradas
  let execRows=atasExec.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    for(const [col,sel] of Object.entries(execHeaderFilters)){
      if(!sel.length) continue;
      const cfg=EXEC_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // Segue o mesmo filtro de status do contrato/ata: "Todos" mostra vigentes e encerrados
    const rEncerrado=r.status&&r.status.toUpperCase().startsWith("ENCERRADO");
    if(st==="ENCERRADO"&&!rEncerrado) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(busca&&!matchBusca(r.item+" "+r.cpl+" "+r.sim+" "+r.unidade,busca)) return false;
    return true;
  });
  // Ordenação execuções (padrão: data_af mais recente no topo)
  execRows.sort((a,b)=>{
    let va=a[_sortExecCol]||"",vb=b[_sortExecCol]||"";
    if(_sortExecCol==="dias_prazo"){va=calcDiasPrazo(a)??9999;vb=calcDiasPrazo(b)??9999;return _sortExecAsc?va-vb:vb-va;}
    if(typeof va==="number"&&typeof vb==="number") return _sortExecAsc?va-vb:vb-va;
    // Ordenação de datas
    if(["data_af","prev_entrega","dt_entrega"].includes(_sortExecCol)){
      const da=parseDataBR(va),db=parseDataBR(vb);
      if(da&&db) return _sortExecAsc?da-db:db-da;
      if(da) return _sortExecAsc?-1:1;
      if(db) return _sortExecAsc?1:-1;
    }
    return _sortExecAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  _renderExecRows(execRows);
  // Sincronizar busca de execuções
  const buscaExec=document.getElementById('exec-busca')?.value||'';
  if(buscaExec) filtrarExecs();
}

function parseDataBR(s){
  if(!s) return null;
  try{
    s=s.trim();
    if(s.includes("/")){
      const p=s.split("/");
      let ano=parseInt(p[2]);
      // Corrigir ano com 2 dígitos: 25 → 2025, 26 → 2026
      if(ano<100) ano+=2000;
      return new Date(ano,parseInt(p[1])-1,parseInt(p[0]));
    }
    if(s.includes("-")){
      const p=s.split("-");
      let ano=parseInt(p[0]);
      if(ano<100) ano+=2000;
      return new Date(ano,parseInt(p[1])-1,parseInt(p[2]));
    }
    return null;
  }catch(e){return null;}
}

function filtrarExecs(){
  const busca=document.getElementById("exec-busca")?.value||"";
  const cpl=document.getElementById("fat-cpl")?.value||"";
  const sim=document.getElementById("fat-sim")?.value||"";
  const st=document.getElementById("fat-status")?.value||"";
  let execRows=atasExec.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    for(const [col,sel] of Object.entries(execHeaderFilters)){
      if(!sel.length) continue;
      const cfg=EXEC_FILTER_COLS[col];
      const val=String(cfg.get(r)??'');
      if(!sel.includes(val)) return false;
    }
    // Segue o mesmo filtro de status do contrato/ata: "Todos" mostra vigentes e encerrados
    const rEncerrado=r.status&&r.status.toUpperCase().startsWith("ENCERRADO");
    if(st==="ENCERRADO"&&!rEncerrado) return false;
    if(st&&st!=="ENCERRADO"&&r.status!==st) return false;
    if(_filtroPendentes&&r.dt_entrega) return false;
    if(busca&&!matchBusca([r.item,r.cpl,r.sim,r.unidade,r.empenho,r.nf,r.data_af,r.dt_entrega,r.prev_entrega].join(" "),busca)) return false;
    return true;
  });
  // Ordenação
  execRows.sort((a,b)=>{
    if(_sortExecCol==="dias_prazo"){
      const va=calcDiasPrazo(a)??9999,vb=calcDiasPrazo(b)??9999;
      return _sortExecAsc?va-vb:vb-va;
    }
    let va=a[_sortExecCol]||"",vb=b[_sortExecCol]||"";
    if(typeof va==="number"&&typeof vb==="number") return _sortExecAsc?va-vb:vb-va;
    if(["data_af","prev_entrega","dt_entrega"].includes(_sortExecCol)){
      const da=parseDataBR(va),db=parseDataBR(vb);
      if(da&&db) return _sortExecAsc?da-db:db-da;
      if(da) return _sortExecAsc?-1:1;
      if(db) return _sortExecAsc?1:-1;
    }
    return _sortExecAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
  });
  _renderExecRows(execRows);
}

const _atasExecExpandidas=new Set();
const _atasExecDetalhes=new Map();

function _renderExecRows(execRows){
  document.getElementById("exec-count").textContent=`${execRows.length} solicitações`;
  document.getElementById("exec-body").innerHTML=execRows.map(r=>{
    const dias=calcDiasPrazo(r);
    let prazoCel;
    if(r.dt_entrega) prazoCel='<td style="font-size:11px;color:var(--green)">✓ Entregue</td>';
    else if(dias===null) prazoCel='<td style="font-size:11px;color:var(--text3)">—</td>';
    else if(dias<0) prazoCel=`<td style="font-size:11px;color:var(--red);font-weight:500">⛔ ${Math.abs(dias)}d atraso</td>`;
    else if(dias<=7) prazoCel=`<td style="font-size:11px;color:var(--red);font-weight:500">⚠️ ${dias}d</td>`;
    else if(dias<=15) prazoCel=`<td style="font-size:11px;color:var(--amber);font-weight:500">⏰ ${dias}d</td>`;
    else prazoCel=`<td style="font-size:11px;color:var(--text2)">${dias}d</td>`;
    const aberta=_atasExecExpandidas.has(String(r.id));
    const detalhe=aberta?_renderDetalheExecAta(r):'';
    const excluirBtn=_execAtaPodeExcluir(r)?`<button onclick="event.stopPropagation();excluirExec('${_sanEsc(r.id)}')" style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid var(--red-bg);color:var(--red-text);background:var(--red-bg);cursor:pointer" title="Excluir solicitação ainda sem AF">🗑️ Excluir</button>`:'';
    return `<tr class="ata-exec-row${aberta?' ata-exec-row-open':''}" data-exec-id="${_sanEsc(r.id)}" onclick="toggleDetalheExecAta('${_sanEsc(r.id)}',event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDetalheExecAta('${_sanEsc(r.id)}',event)}" role="button" tabindex="0" aria-expanded="${aberta?'true':'false'}" title="Clique para ${aberta?'recolher':'ver todos os detalhes'}">
    ${_renderSancaoExecCheckbox(r)}
    <td style="font-size:11px">${_sanEsc(r.cpl)}</td>
    <td style="font-size:11px">${_sanEsc(r.sim)}</td>
    <td class="td-trunc" style="max-width:180px" title="${_sanEsc(r.item)}">${_sanEsc(r.item)}</td>
    <td style="font-size:12px">${_sanEsc(r.unidade)}</td>
    <td style="text-align:right">${r.qtde}</td>
    <td style="text-align:right;font-size:11px">${r.valor?fmtFull(r.valor):"—"}</td>
    <td style="font-size:11px">${_sanEsc(r.empenho||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.data_af||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.prev_entrega||"—")}</td>
    <td style="font-size:11px;white-space:nowrap">${r.dt_entrega?_sanEsc(r.dt_entrega):'<span style="color:var(--red);font-size:10px;font-weight:500">⚠️ AGUARD.</span>'}</td>
    ${prazoCel}
    <td style="font-size:11px">${_sanEsc(r.nf||"—")}</td>
    <td style="white-space:nowrap">${excluirBtn}</td>
  </tr>${detalhe}`;
  }).join("");
  window._execRowsFiltered=execRows;
}

async function toggleDetalheExecAta(execId,event){
  if(event?.target?.closest?.('button,a,input,select,textarea,label')) return;
  const key=String(execId);
  if(_atasExecExpandidas.has(key)){
    _atasExecExpandidas.delete(key);
    _renderExecRows(window._execRowsFiltered||[]);
    return;
  }
  _atasExecExpandidas.add(key);
  _renderExecRows(window._execRowsFiltered||[]);
  if(!_atasExecDetalhes.has(key)){
    try{
      const detalhe=await _carregarDetalheExecAta(key);
      _atasExecDetalhes.set(key,detalhe);
    }catch(e){
      _atasExecDetalhes.set(key,{erro:e.message||String(e),unidades:[],notas:new Map(),emenda:null,empenhos:[]});
    }
    if(_atasExecExpandidas.has(key)) _renderExecRows(window._execRowsFiltered||[]);
  }
}

async function _carregarDetalheExecAta(execId){
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec) throw new Error('Execução não encontrada.');
  const vazio=()=>Promise.resolve({data:null,error:null});
  const [rUnidades,rEmpExec,rEmenda,rEmpEmenda]=await Promise.all([
    sb.from('atas_execucao_unidades').select('*').eq('exec_id',execId).order('unidade_seq',{ascending:true}),
    sb.from('empenho_itens').select('*,empenhos(id,numero,ano,valor_empenhado,data_emissao,observacoes)').eq('exec_id',execId),
    exec.emenda_item_id?sb.from('emenda_itens').select('*,emendas(tipo,emenda,numero,parlamentar,ano,objeto)').eq('id',exec.emenda_item_id).maybeSingle():vazio(),
    exec.emenda_item_id?sb.from('empenho_itens').select('*,empenhos(id,numero,ano,valor_empenhado,data_emissao,observacoes)').eq('emenda_item_id',exec.emenda_item_id):vazio()
  ]);
  for(const resposta of [rUnidades,rEmpExec,rEmenda,rEmpEmenda]) if(resposta.error) throw resposta.error;
  const unidades=rUnidades.data||[];
  const nfIds=[...new Set(unidades.map(u=>u.nota_fiscal_id).filter(Boolean))];
  const notas=new Map();
  if(nfIds.length){
    const {data,error}=await sb.from('notas_fiscais').select('*').in('id',nfIds);
    if(error) throw error;
    (data||[]).forEach(n=>notas.set(String(n.id),n));
  }
  const emenda=rEmenda.data||null;
  const empenhos=[...(rEmpExec.data||[]),...(rEmpEmenda.data||[])].filter((v,i,a)=>a.findIndex(x=>String(x.id)===String(v.id))===i);
  return {unidades,notas,emenda,empenhos};
}

function _ataDetalheCampo(label,valor){
  if(valor==null||String(valor).trim()==='') return '';
  return `<div class="ata-exec-detail-field"><span>${_sanEsc(label)}</span><strong>${_sanEsc(String(valor))}</strong></div>`;
}

function _renderDetalheExecAta(exec){
  const detalhe=_atasExecDetalhes.get(String(exec.id));
  if(!detalhe) return `<tr class="ata-exec-detail-row"><td colspan="14"><div class="ata-exec-detail-loading"><span class="spinner"></span> Carregando patrimônios e informações completas...</div></td></tr>`;
  if(detalhe.erro) return `<tr class="ata-exec-detail-row"><td colspan="14"><div style="padding:12px;color:var(--red)">Erro ao carregar detalhes: ${_sanEsc(detalhe.erro)}</div></td></tr>`;
  const em=detalhe.emenda||{};
  const emendaCab=em.emendas||{};
  const empenhos=[...new Set([exec.empenho,...detalhe.empenhos.map(v=>v.empenhos?.numero+(v.empenhos?.ano?'/'+v.empenhos.ano:''))].filter(Boolean))].join('; ');
  const resumo=[
    ['Origem do recurso',exec.origem_recurso==='emenda'?'Emenda parlamentar':'Recurso próprio'],
    ['Empresa',exec.empresa],['CNPJ',exec.cnpj],['Contrato / ATA',exec.sim],['Processo / CPL',exec.cpl],
    ['Item',exec.item],['Unidade',exec.unidade],['Quantidade',exec.qtde],['Valor total',exec.valor?fmtFull(exec.valor):''],
    ['Empenho(s)',empenhos],['AF',exec.af_numero],['Data da AF',exec.data_af],['Previsão de entrega',exec.prev_entrega],
    ['Recebimento',exec.dt_entrega],['Nota fiscal',exec.nf],['Possui patrimônio',exec.possui_patrimonio===true?'Sim':exec.possui_patrimonio===false?'Não':'Não informado'],
    ['Entrega na unidade',exec.data_entrega_unidade],['Responsável na unidade',exec.termo_responsavel],['Cargo',exec.termo_cargo],
    ['Emenda',emendaCab.emenda?`${emendaCab.emenda}${emendaCab.ano?'/'+emendaCab.ano:''}`:''],['Parlamentar',emendaCab.parlamentar],
    ['Observações',exec.confirmacao_obs||exec.obs_prazo]
  ];
  const linhas=detalhe.unidades.map((u,i)=>{
    const nf=detalhe.notas.get(String(u.nota_fiscal_id))||{};
    return `<tr>
      <td>${u.unidade_seq||i+1}</td><td><strong>${_sanEsc(u.patrimonio||'—')}</strong></td><td>${_sanEsc(u.numero_serie||'—')}</td>
      <td>${_sanEsc(nf.numero||exec.nf||'—')}</td><td>${u.recebido_em?fmtDate(u.recebido_em):'—'}</td><td>${_sanEsc(u.recebido_por||'—')}</td>
      <td><button type="button" class="btn-secondary" onclick="event.stopPropagation();verTudoUnidadeExecAta('${_sanEsc(exec.id)}','${_sanEsc(u.id)}')" style="font-size:11px;padding:3px 9px">🔎 Ver tudo</button></td>
    </tr>`;
  }).join('');
  const unidadesHtml=detalhe.unidades.length?`<div class="ata-exec-units-wrap"><table class="ata-exec-units-table"><thead><tr><th>#</th><th>Patrimônio</th><th>Nº de série</th><th>NF</th><th>Recebido em</th><th>Recebido por</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>`:`<div class="ata-exec-consolidated">${exec.possui_patrimonio===false?'Item sem patrimônio: quantidade mantida consolidada.':'Nenhuma unidade física/patrimônio registrado nesta execução.'}</div>`;
  return `<tr class="ata-exec-detail-row"><td colspan="14"><div class="ata-exec-detail-panel">
    <div class="ata-exec-detail-title"><span>Detalhes completos da execução</span><span>${detalhe.unidades.length} unidade(s) física(s)</span></div>
    <div class="ata-exec-detail-grid">${resumo.map(([l,v])=>_ataDetalheCampo(l,v)).join('')}</div>
    <div class="ata-exec-units-title">Patrimônios e unidades recebidas</div>${unidadesHtml}
  </div></td></tr>`;
}

function verTudoUnidadeExecAta(execId,unidadeId){
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  const detalhe=_atasExecDetalhes.get(String(execId));
  const u=detalhe?.unidades?.find(x=>String(x.id)===String(unidadeId));
  if(!exec||!u) return;
  const nf=detalhe.notas.get(String(u.nota_fiscal_id))||{};
  const em=detalhe.emenda||{}, ec=em.emendas||{};
  const campos=[
    ['Item',exec.item],['Patrimônio',u.patrimonio],['Número de série',u.numero_serie],['Sequência da unidade',u.unidade_seq],
    ['Unidade de destino',exec.unidade],['Empresa / Fornecedor',exec.empresa],['CNPJ',exec.cnpj],['Processo / CPL',exec.cpl],
    ['Contrato / ATA',exec.sim],['Quantidade da execução',exec.qtde],['Valor total',exec.valor?fmtFull(exec.valor):''],
    ['Origem do recurso',exec.origem_recurso==='emenda'?'Emenda parlamentar':'Recurso próprio'],['Empenho',exec.empenho],
    ['AF',exec.af_numero],['Data da AF',exec.data_af],['Previsão de entrega',exec.prev_entrega],['Data do recebimento',u.recebido_em||exec.dt_entrega],
    ['Recebido por',u.recebido_por],['Nota fiscal',nf.numero||exec.nf],['Data da NF',nf.data_emissao],['Valor da NF',nf.valor_total?_fmtBRL(nf.valor_total):''],
    ['Emenda',ec.emenda?`${ec.emenda}${ec.ano?'/'+ec.ano:''}`:''],['Parlamentar',ec.parlamentar],['Item da Emenda',em.item],
    ['Data de entrega na unidade',exec.data_entrega_unidade],['Responsável na unidade',exec.termo_responsavel],['Cargo',exec.termo_cargo],['Observações',u.obs||exec.confirmacao_obs]
  ].filter(([,v])=>v!=null&&String(v).trim()!=='');
  const modal=document.getElementById('modal-inv-detalhe');
  document.body.appendChild(modal);
  document.getElementById('inv-detalhe-content').innerHTML=`<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">${_sanEsc(exec.item||'Item')} · Patrimônio ${_sanEsc(u.patrimonio||'—')}</div><div>${campos.map(([l,v])=>_invField(_sanEsc(l),_sanEsc(String(v)))).join('')}</div>`;
  modal.classList.add('active');
}

window.toggleDetalheExecAta=toggleDetalheExecAta;
window.verTudoUnidadeExecAta=verTudoUnidadeExecAta;

function _execAtaPodeExcluir(r){
  if(!r) return false;
  return ![
    r.af_numero,r.data_af,r.prev_entrega,r.nf,r.dt_entrega,r.data_entrega_unidade,
    r.termo_arquivo,r.termo_responsavel,r.termo_cargo,r.confirmacao_obs,r.obs_prazo
  ].some(v=>v!=null&&String(v).trim()!=='') && r.possui_patrimonio==null;
}

function calcDiasPrazo(r){
  if(r.dt_entrega) return null; // já entregue, não calcular
  // Se tem prev_entrega definida, usa ela como prazo
  if(r.prev_entrega){
    const dPrev=parseDataBR(r.prev_entrega);
    if(dPrev) return Math.round((dPrev-new Date())/(1000*60*60*24));
  }
  // Senão usa data_af + prazo_entrega do item
  const at=atasItens.find(x=>x.cpl===r.cpl&&x.sim===r.sim&&x.item===r.item);
  const prazo=at?.prazo_entrega||0;
  if(!prazo||!r.data_af) return null;
  const dAF=parseDataBR(r.data_af);
  if(!dAF) return null;
  dAF.setDate(dAF.getDate()+prazo);
  return Math.round((dAF-new Date())/(1000*60*60*24));
}

// Sanções são geradas exclusivamente a partir de Atas Rp Vigentes > Execuções / Solicitações.
let sancaoEmpresaTravada = "";

function _sancaoAtaDoExec(r){
  return atasItens.find(a=>String(a.id)===String(r.ata_item_id))||null;
}
function _sancaoExecKey(r){
  return String(r?._sancao_id||[r?.cpl,r?.sim,r?.item,r?.unidade,r?.empenho,r?.data_af].join("|"));
}
function _sancaoExecPendente(r){ return !!r&&!r.dt_entrega; }
function _sancaoExecDisabled(r){
  if(!podeEditar('atas')||!_sancaoExecPendente(r)) return true;
  const ata=_sancaoAtaDoExec(r), empresa=ata?.empresa||"";
  if(!empresa) return true;
  return !!sancaoCplTravado&&(r.cpl!==sancaoCplTravado||empresa!==sancaoEmpresaTravada)&&!sancaoSelecionados.has(_sancaoExecKey(r));
}
function _sancaoExecTitulo(r){
  if(!podeEditar('atas')) return "Sem permissão para editar Atas Rp Vigentes";
  if(r?.dt_entrega) return "Item já entregue";
  const empresa=_sancaoAtaDoExec(r)?.empresa||"";
  if(!empresa) return "Empresa não informada no item da ATA";
  if(sancaoCplTravado&&(r.cpl!==sancaoCplTravado||empresa!==sancaoEmpresaTravada)) return `Seleção limitada a ${sancaoCplTravado} · ${sancaoEmpresaTravada}`;
  return "Selecionar esta solicitação pendente";
}
function _renderSancaoExecCheckbox(r){
  const aberta=typeof _atasExecExpandidas!=='undefined'&&_atasExecExpandidas.has(String(r.id));
  return `<td style="text-align:center;color:var(--text3);font-size:16px"><span class="ata-exec-chevron${aberta?' open':''}">›</span></td>`;
}
function _execsSancaoSelecionadas(){
  return atasExec.filter(r=>sancaoSelecionados.has(_sancaoExecKey(r)));
}
function alternarItemSancaoExec(key,cb){
  const r=atasExec.find(x=>_sancaoExecKey(x)===key); if(!r) return;
  if(cb.checked){
    if(_sancaoExecDisabled(r)){cb.checked=false;alert(_sancaoExecTitulo(r));return;}
    const empresa=_sancaoAtaDoExec(r)?.empresa||"";
    if(!sancaoCplTravado){sancaoCplTravado=r.cpl;sancaoEmpresaTravada=empresa;}
    sancaoSelecionados.add(key);
  }else{
    sancaoSelecionados.delete(key);
    if(!sancaoSelecionados.size){sancaoCplTravado="";sancaoEmpresaTravada="";sancaoContrato=null;}
  }
  atualizarSelecaoSancaoAta(); filtrarExecs();
}
function atualizarSelecaoSancaoAta(){
  const n=sancaoSelecionados.size, resumo=document.getElementById("sancao-selecao-resumo"), btn=document.getElementById("btn-gerar-sancao");
  if(!resumo||!btn) return;
  if(!n){resumo.style.display="none";btn.style.display="none";resumo.textContent="";return;}
  resumo.textContent=`${n} item(ns) · ${sancaoCplTravado} · ${sancaoEmpresaTravada}`;
  resumo.style.display="inline";btn.style.display=podeEditar('atas')?"inline-flex":"none";
}
function _diasAtrasoExecs(itens){
  const atrasos=itens.map(calcDiasPrazo).filter(d=>typeof d==="number"&&d<0).map(d=>Math.abs(d));
  return atrasos.length?Math.max(...atrasos):null;
}
async function abrirModalSolicitacaoSancaoAta(){
  if(!sancaoSelecionados.size||bloquearSeVisualiz('atas')) return;
  _sancaoAquisicaoRow=null; _sancaoAquisicaoContrato=null; _ceAdvAtivo=false; // garante que o dispatcher use o gerador de ATA
  const itens=_execsSancaoSelecionadas(); if(!itens.length) return;
  sancaoContrato=await _resolverContratoSancao(sancaoCplTravado,itens[0]?.contrato_id);
  const c=sancaoContrato||{}, primeiro=itens[0], numero=c.numero_contrato||primeiro.sim||"—";
  const modal=document.getElementById("modal-solicitar-sancao"); document.body.appendChild(modal);
  document.getElementById("sancao-contrato-info").innerHTML=`<strong>Processo/CPL:</strong> ${_sanEsc(sancaoCplTravado)} &nbsp;·&nbsp; <strong>Contrato/SIM:</strong> ${_sanEsc(numero)}<br><strong>Empresa:</strong> ${_sanEsc(sancaoEmpresaTravada)} &nbsp;·&nbsp; <strong>CNPJ:</strong> ${_sanEsc(c.cnpj||"—")}<br><strong>Objeto:</strong> ${_sanEsc(c.objeto||[...new Set(itens.map(i=>i.item))].join(", "))}`;
  document.querySelectorAll('input[name="sancao-tipo"]').forEach(el=>el.checked=false);
  document.querySelector('input[name="sancao-motivo"][value="Atraso na entrega"]').checked=true;
  ["sancao-motivo-livre","sancao-clausula","sancao-artigo","sancao-percentual"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("sancao-dias").value=_diasAtrasoExecs(itens)??"";
  document.getElementById("sancao-itens-modal").innerHTML=itens.map(i=>{
    const ata=_sancaoAtaDoExec(i), unit=ata?.valor_unit||0;
    return `<div style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px"><strong>${_sanEsc(i.item)}</strong> · ${_sanEsc(i.unidade||"—")}<br><span style="color:var(--text3)">Qtde: ${i.qtde||"—"} · Unitário: ${unit?fmtFull(unit):"—"} · Total: ${i.valor?fmtFull(i.valor):"—"} · Empenho: ${_sanEsc(i.empenho||"—")} · Previsão: ${_sanEsc(i.prev_entrega||"—")}</span></div>`;
  }).join("");
  const msg=document.getElementById("sancao-doc-msg");msg.className="fmsg";msg.textContent="";atualizarCamposSancao();modal.classList.add("active");
}
async function gerarSolicitacaoSancaoAta(){
  if(bloquearSeVisualiz('atas')) return;
  const itens=_execsSancaoSelecionadas(), tipo=document.querySelector('input[name="sancao-tipo"]:checked')?.value||"", motivo=document.querySelector('input[name="sancao-motivo"]:checked')?.value||"";
  const motivoLivre=document.getElementById("sancao-motivo-livre").value.trim(), clausula=document.getElementById("sancao-clausula").value.trim(), artigo=document.getElementById("sancao-artigo").value.trim();
  const percentualRaw=document.getElementById("sancao-percentual").value, diasRaw=document.getElementById("sancao-dias").value, msg=document.getElementById("sancao-doc-msg"), c=sancaoContrato||{}, primeiro=itens[0]||{};
  if(!itens.length){msg.textContent="Selecione ao menos uma solicitação.";msg.className="fmsg err";return;}
  if(!tipo||!motivo){msg.textContent="Escolha o tipo e o motivo da sanção.";msg.className="fmsg err";return;}
  if(motivo==="Outro motivo"&&!motivoLivre){msg.textContent="Descreva o outro motivo.";msg.className="fmsg err";return;}
  if(!sancaoEmpresaTravada){msg.textContent="Empresa não localizada na ATA.";msg.className="fmsg err";return;}
  const janela=window.open("","_blank");if(!janela){msg.textContent="Permita pop-ups e tente novamente.";msg.className="fmsg err";return;}
  janela.document.write('<!doctype html><meta charset="utf-8"><title>Gerando documento...</title><p style="font-family:Arial;padding:24px">Registrando solicitação...</p>');
  const btn=document.getElementById("btn-confirmar-sancao");btn.disabled=true;btn.textContent="Registrando...";
  const snapshot={artigo_adicional:artigo||null,itens:itens.map(i=>{const a=_sancaoAtaDoExec(i);return{id:_sancaoExecKey(i),cpl:i.cpl,sim:i.sim,item:i.item,unidade:i.unidade,qtde:i.qtde,vl_unitario:a?.valor_unit||null,vl_total:i.valor,empenho:i.empenho,data_af:i.data_af,prev_entrega:i.prev_entrega,dt_entrega:i.dt_entrega};})};
  const registro={cpl_contrato:sancaoCplTravado,contrato_id:c.id||null,empresa:sancaoEmpresaTravada,tipo_sancao:tipo,motivo,motivo_livre:motivo==="Outro motivo"?motivoLivre:null,clausula_contratual:clausula||null,percentual_multa:tipo==="Multa"&&percentualRaw!==""?Number(percentualRaw):null,dias_atraso:diasRaw!==""?Number(diasRaw):null,itens_ids:JSON.stringify(itens.map(_sancaoExecKey)),itens_json:JSON.stringify(snapshot),solicitado_por:currentProfile?.nome||currentProfile?.email||"Usuário do sistema",gerado_em:new Date().toISOString().slice(0,10)};
  const {data:_san,error}=await sb.from("sancoes_solicitadas").insert(registro).select().single();btn.disabled=false;btn.textContent="Gerar documento";
  if(error){janela.close();msg.textContent="Erro ao registrar: "+error.message;msg.className="fmsg err";return;}
  if(_san) await sb.from("sancao_itens").insert(snapshot.itens.map(it=>({sancao_id:_san.id,ref_origem:it.id,descricao:it.item,cpl:it.cpl,sim:it.sim,unidade:it.unidade,qtde:it.qtde,vl_unitario:it.vl_unitario,vl_total:it.vl_total,empenho:it.empenho,data_af:it.data_af,prev_entrega:it.prev_entrega,dt_entrega:it.dt_entrega})));
  const incisos={"Advertência":"I","Multa":"II","Impedimento de licitar e contratar":"III","Declaração de inidoneidade":"IV"}, total=itens.reduce((s,i)=>s+(Number(i.valor)||0),0), hoje=new Date().toLocaleDateString("pt-BR"), numero=c.numero_contrato||primeiro.sim||"—";
  const fundamento=motivo==="Atraso na entrega"?"ao ensejar o retardamento da entrega do objeto contratual sem motivo justificado":_sanEsc(motivoLivre);
  const linhas=itens.map((i,idx)=>{const a=_sancaoAtaDoExec(i),d=calcDiasPrazo(i);return `<tr><td>${idx+1}</td><td><strong>${_sanEsc(i.cpl)}</strong><br>${_sanEsc(sancaoEmpresaTravada)}</td><td>${_sanEsc(i.item)}</td><td>${_sanEsc(i.unidade||"—")}</td><td>${i.qtde||"—"}</td><td>${a?.valor_unit?fmtFull(a.valor_unit):"—"}</td><td>${i.valor?fmtFull(i.valor):"—"}</td><td>${_sanEsc(i.empenho||"—")}</td><td>${d<0?Math.abs(d)+" dias de atraso":"Aguardando entrega"}</td></tr>`;}).join("");
  janela.document.open();janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Sanção - ${_sanEsc(sancaoCplTravado)}</title><link rel="stylesheet" href="css/print-sancao.css"></head><body><header><strong>SECRETARIA MUNICIPAL DA SAÚDE · SOROCABA</strong><p>Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde — SUEQ</p><h1>SOLICITAÇÃO DE APLICAÇÃO DE SANÇÃO ADMINISTRATIVA</h1><p>Gerado em ${hoje}</p></header><div class="ident"><div>Processo/CPL: <strong>${_sanEsc(sancaoCplTravado)}</strong></div><div>Contrato/SIM nº: <strong>${_sanEsc(numero)}</strong></div><div>Empresa contratada: <strong>${_sanEsc(sancaoEmpresaTravada)}</strong></div><div>CNPJ: ${_sanEsc(c.cnpj||"—")}</div><div>Objeto: ${_sanEsc(c.objeto||[...new Set(itens.map(i=>i.item))].join(", "))}</div></div><h2>Fundamentação legal</h2><p class="corpo">A contratada incorreu na infração prevista no art. 155, inciso VII, da Lei nº 14.133/2021, ${fundamento}, sujeitando-se às sanções previstas no art. 156, inciso ${incisos[tipo]} da mesma Lei. ${clausula?`Ademais, a conduta viola a ${_sanEsc(clausula)} do instrumento contratual.`:""} ${artigo?_sanEsc(artigo)+".":""}</p><h2>Execuções / Solicitações relacionadas</h2><table><thead><tr><th>#</th><th>Processo / Empresa</th><th>Item</th><th>Unidade</th><th>Qtde</th><th>Valor unit.</th><th>Valor total</th><th>Empenho</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table><div class="total">TOTAL: ${fmtFull(total)}</div><h2>Solicitação</h2><p class="corpo">Diante do exposto, esta Seção de Aquisição e Manutenção de Equipamentos e Mobiliários da Saúde solicita à Secretaria de Administração a instauração de processo administrativo sancionador e aplicação de <strong>${_sanEsc(tipo.toUpperCase())}</strong> à empresa <strong>${_sanEsc(sancaoEmpresaTravada)}</strong>, inscrita no CNPJ ${_sanEsc(c.cnpj||"—")}, referente ao(s) item(ns) discriminado(s) acima, garantidos o contraditório e a ampla defesa, nos termos do art. 157 da Lei nº 14.133/2021.</p>${tipo==="Multa"&&percentualRaw!==""?`<p class="corpo">A multa sugerida é de <strong>${_sanEsc(percentualRaw)}% ao dia de atraso</strong> sobre o valor do(s) item(ns) em atraso, conforme previsto no instrumento contratual.</p>`:""}<div class="assinatura"><strong>${_sanEsc(registro.solicitado_por)}</strong><br>Secretaria da Saúde - Seção de Aquisição de Equipamentos e Mobiliários da Saúde<br>${hoje}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script><\/body><\/html>`);janela.document.close();
  document.getElementById("modal-solicitar-sancao").classList.remove("active");sancaoSelecionados.clear();sancaoCplTravado="";sancaoEmpresaTravada="";sancaoContrato=null;atualizarSelecaoSancaoAta();filtrarExecs();
}


function toggleNovoValor(){
  const alterar=document.getElementById("rv-valor-alterar").checked;
  document.getElementById("rv-novo-valor-wrap").style.display=alterar?"block":"none";
  if(alterar) document.getElementById("rv-novo-valor").focus();
}

let _renovarItemId=null;
function renovarAta(itemId){
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  _renovarItemId=at.id;
  const vencAtual=at.vencimento||"";
  document.getElementById("rv-info").textContent=`${at.cpl} · ${at.sim} · ${at.item}`;
  document.getElementById("rv-atual").value=vencAtual;

  // Popular saldo info
  const exec=getExecutado(at);
  const saldo=getSaldo(at);
  const qtde=at?.qtde_contratada||0;
  document.getElementById("rv-qtde-contratada").textContent=qtde;
  document.getElementById("rv-executado").textContent=exec;
  document.getElementById("rv-saldo-atual").textContent=saldo;
  document.getElementById("rv-qtde-label").textContent=qtde;
  document.getElementById("rv-saldo-label").textContent=saldo;
  document.getElementById("rv-manter").checked=true;

  // Sugerir +1 ano automaticamente
  let novaData="";
  try{
    const partes=vencAtual.split("/");
    if(partes.length===3){
      let ano=parseInt(partes[2]);
      if(ano<100) ano+=2000;
      const d=new Date(ano+1,parseInt(partes[1])-1,parseInt(partes[0]));
      novaData=d.toISOString().split("T")[0];
    }
  }catch(e){}
  document.getElementById("rv-nova").value=novaData;
  document.getElementById("rv-status").value="VIGENTE";
  document.getElementById("rv-valor-atual-label").textContent=at?.valor_unit?at.valor_unit.toFixed(2):"—";
  document.getElementById("rv-valor-manter").checked=true;
  document.getElementById("rv-novo-valor-wrap").style.display="none";
  document.getElementById("rv-novo-valor").value="";
  document.getElementById("rv-msg").className="fmsg";
  document.getElementById("modal-renovar").classList.add("active");
}

async function salvarRenovacao(){
  if(bloquearSeVisualiz()) return;
  const at=_resolverAtaItemRef(_renovarItemId);
  if(!at) return;
  const novaData=document.getElementById("rv-nova").value;
  const novoStatus=document.getElementById("rv-status").value||"VIGENTE";
  if(!novaData){showMsg("rv","Informe a nova data (*)","err");return}
  // Formatar para DD/MM/YYYY
  const [y,m,d]=novaData.split("-");
  const novaFormatada=`${d}/${m}/${y}`;
  const btn=document.querySelector("#modal-renovar .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const reiniciarSaldo=document.getElementById("rv-reiniciar").checked;
  const alterarValor=document.getElementById("rv-valor-alterar").checked;
  const novoValor=alterarValor?parseFloat(document.getElementById("rv-novo-valor").value)||0:0;
  if(alterarValor&&!novoValor){showMsg("rv","Informe o novo valor unitário","err");btn.disabled=false;btn.textContent="Salvar renovação";return;}
  try{
    const {error:errContrato}=await sb.from("contratos")
      .update({vencimento:novaFormatada,status:novoStatus})
      .eq("id",at.contrato_id);
    if(errContrato) throw errContrato;
    if(alterarValor){
      const {error:errItem}=await sb.from("atas_itens").update({valor_unit:novoValor}).eq("id",at.id);
      if(errItem) throw errItem;
    }
    if(reiniciarSaldo){
      const termosRemovidos=(atasExec||[])
        .filter(exec=>String(exec.ata_item_id)===String(at.id))
        .map(exec=>exec.termo_arquivo)
        .filter(Boolean);
      const {error:errExec}=await sb.from("atas_execucao").delete().eq("ata_item_id",at.id);
      if(errExec) throw errExec;
      if(termosRemovidos.length&&typeof removerTermosEntrega==='function'){
        try{ await removerTermosEntrega(termosRemovidos); }
        catch(cleanupError){ console.warn('Execuções removidas, mas termos antigos permaneceram no Storage',cleanupError); }
      }
    }
    const {error:errHist}=await sb.from("contratos_historico").insert({
      contrato_id:at.contrato_id,
      tipo:"Prorrogação de ATA",
      data_evento:novaData,
      obs:`Nova data fim: ${novaFormatada}; saldo ${reiniciarSaldo?"reiniciado":"mantido"}${alterarValor?`; valor unitário: ${novoValor}`:""}`
    });
    if(errHist) throw errHist;
    await Promise.all([loadAtas(),contratosCarregado?loadContratos():Promise.resolve()]);
    showMsg("rv","✓ Vigência atualizada no contrato.","ok");
    setTimeout(()=>document.getElementById("modal-renovar").classList.remove("active"),1200);
  }catch(e){
    showMsg("rv","Erro: "+(e.message||e),"err");
  }finally{
    btn.disabled=false;btn.textContent="Salvar";
  }
}

// ═══ ORDENAÇÃO ATAS ═══
let _sortAtasCol=null,_sortAtasAsc=true;
function sortAtas(col){
  if(_sortAtasCol===col)_sortAtasAsc=!_sortAtasAsc;else{_sortAtasCol=col;_sortAtasAsc=true;}
  document.querySelectorAll('[id^="sort-atas-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-atas-"+col);
  if(el) el.textContent=_sortAtasAsc?" ↑":" ↓";
  filtrarAtas();
}

// ═══ ORDENAÇÃO EXECUÇÕES ═══
let _sortExecCol='data_af',_sortExecAsc=false; // padrão: mais recentes no topo
function sortExecs(col){
  if(_sortExecCol===col)_sortExecAsc=!_sortExecAsc;else{_sortExecCol=col;_sortExecAsc=false;}
  document.querySelectorAll('[id^="sort-exec-"]').forEach(el=>el.textContent="");
  const el=document.getElementById("sort-exec-"+col);
  if(el) el.textContent=_sortExecAsc?" ↑":" ↓";
  filtrarExecs();
}

// ═══ FILTRO PENDENTES ═══
let _filtroPendentes=false;
function togglePendentes(){
  _filtroPendentes=!_filtroPendentes;
  const btn=document.getElementById("btn-pendentes");
  if(_filtroPendentes){
    btn.style.background="var(--red)";btn.style.color="#fff";btn.style.borderColor="var(--red)";
  } else {
    btn.style.background="var(--surface)";btn.style.color="var(--red)";btn.style.borderColor="var(--red)";
  }
  filtrarExecs();
}

// ═══ EXPORTAR EXCEL ═══
async function exportarAtas(){
  await ensureLib('xlsx');
  const colunas=["CPL","SIM","ITEM","MARCA_MODELO","QTDE_CONTRATADA","VALOR_UNIT","VENCIMENTO","STATUS_CONTRATO","EMPRESA","PRAZO_ENTREGA","EXECUTADO","SALDO"];
  const cpl=document.getElementById("fat-cpl")?.value||"";
  const sim=document.getElementById("fat-sim")?.value||"";
  const busca=document.getElementById("fat-busca")?.value||"";
  const rows=atasItens.filter(r=>{
    if(cpl&&r.cpl!==cpl) return false;
    if(sim&&r.sim!==sim) return false;
    if(busca&&!matchBusca(r.item+" "+r.marca+" "+r.cpl+" "+r.sim,busca)) return false;
    if(!document.getElementById("fat-status")?.value||(document.getElementById("fat-status")?.value===r.status)) return true;
    return !document.getElementById("fat-status")?.value;
  });
  const dados=rows.map(r=>[r.cpl,r.sim,r.item,r.marca,r.qtde_contratada,r.valor_unit,r.vencimento,r.status,r.empresa,r.prazo_entrega||"",getExecutado(r.cpl,r.sim,r.item),getSaldo(r.cpl,r.sim,r.item)]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  const wb={SheetNames:["ATAs"],Sheets:{ATAs:ws}};
  XLSX.writeFile(wb,"atas_"+new Date().toLocaleDateString("pt-BR").replace(/\//g,"-")+".xlsx");
}

async function exportarExecs(){
  await ensureLib('xlsx');
  const colunas=["CPL","SIM","ITEM","UNIDADE","QTDE","VALOR","EMPENHO","DATA_AF","PREV_ENTREGA","DT_ENTREGA","NF"];
  const rows=window._execRowsFiltered||atasExec;
  const dados=rows.map(r=>[r.cpl,r.sim,r.item,r.unidade,r.qtde,r.valor,r.empenho,r.data_af,r.prev_entrega,r.dt_entrega,r.nf]);
  const ws=XLSX.utils.aoa_to_sheet([colunas,...dados]);
  const wb={SheetNames:["Execucoes"],Sheets:{Execucoes:ws}};
  XLSX.writeFile(wb,"execucoes_"+new Date().toLocaleDateString("pt-BR").replace(/\//g,"-")+".xlsx");
}

// ═══ ENCERRAR CONTRATO (CONTRATOS SUPABASE) ═══
let _encerrarCtId=null;
function abrirEncerrarCt(id){
  if(bloquearSeVisualiz()) return;
  const r=contratosRows.find(x=>String(x.id)===String(id));
  if(!r) return;
  _encerrarCtId=id;
  // Preencher info
  document.getElementById("ect-info").innerHTML=`
    <div><strong>${r.prestador||"—"}</strong></div>
    <div style="color:var(--text3);margin-top:2px">${r.objeto||"—"}</div>
    <div style="margin-top:4px;display:flex;gap:1rem">
      <span>📋 ${r.cpl||"—"}</span>
      <span>📅 Venc: ${r.vencimento||"—"}</span>
      <span>💰 ${r.valor_atual||r.valor_inicial||"—"}</span>
    </div>`;
  // Data padrão = hoje
  document.getElementById("ect-data").value=new Date().toISOString().split("T")[0];
  document.getElementById("ect-motivo").value="";
  document.getElementById("ect-cpl-sub").value="";
  document.getElementById("ect-obs").value="";
  const msg=document.getElementById("ect-msg");
  msg.className="fmsg";msg.textContent="";
  document.getElementById("modal-encerrar-ct").classList.add("active");
}
async function confirmarEncerramentoCt(){
  if(bloquearSeVisualiz()) return;
  if(!_encerrarCtId) return;
  const motivo=document.getElementById("ect-motivo").value;
  const data=document.getElementById("ect-data").value;
  const cplSub=document.getElementById("ect-cpl-sub").value.trim();
  const obs=document.getElementById("ect-obs").value.trim();
  if(!motivo){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Selecione o motivo.";return;
  }
  if(!data){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Informe a data de encerramento.";return;
  }
  const btn=document.querySelector("#modal-encerrar-ct .btn-primary");
  btn.disabled=true;btn.textContent="Encerrando...";
  try{
    // 1. Atualizar status na tabela contratos
    const {error:errCt}=await sb.from("contratos").update({status:"ENCERRADO"}).eq("id",_encerrarCtId);
    if(errCt) throw errCt;
    // 2. Registrar no histórico
    const obsHist=[motivo, cplSub?"CPL substituto: "+cplSub:"", obs].filter(Boolean).join(" | ");
    await sb.from("contratos_historico").insert({
      contrato_id:_encerrarCtId,
      tipo:"Encerramento",
      data_evento:data,
      obs:obsHist
    });
    // 3. Atualizar local
    const local=contratosRows.find(r=>String(r.id)===String(_encerrarCtId));
    if(local) local.status="ENCERRADO";
    filtrarContratos();
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg ok";msg.textContent="✓ Contrato encerrado!";
    setTimeout(()=>document.getElementById("modal-encerrar-ct").classList.remove("active"),1500);
  }catch(e){
    const msg=document.getElementById("ect-msg");
    msg.className="fmsg err";msg.textContent="Erro: "+(e.message||e);
  }finally{
    btn.disabled=false;btn.textContent="⛔ Encerrar contrato";
  }
}

// Abrem os modais de "Editar contrato" / "Vinculações" (originalmente da aba Contratos) a
// partir de Atas Rp Vigentes. Garantem que contratosRows esteja carregado, já que o usuário
// pode acessar Atas sem nunca ter visitado a aba Contratos.
async function _ataAbrirEditarContrato(contratoId){
  if(!contratosCarregado) await loadContratos();
  abrirEditarContrato(contratoId);
}
async function _ataAbrirEmailContrato(contratoId){
  if(!contratosCarregado) await loadContratos();
  abrirEmailContrato(contratoId);
}

// ═══ ENCERRAR CONTRATO ═══
let _encerrarAtaContratoId=null;
function encerrarContrato(contratoId){
  const contrato=atasContratos.find(c=>String(c.id)===String(contratoId));
  if(!contrato) return;
  _encerrarAtaContratoId=contrato.id;
  document.getElementById("enc-info").textContent=`${contrato.cpl||""} · ${contrato.numero_contrato||""} · ${contrato.empresa||""}`;
  document.getElementById("enc-motivo").value="";
  document.getElementById("enc-msg").className="fmsg";
  document.getElementById("modal-encerrar").classList.add("active");
}
async function confirmarEncerramento(){
  if(bloquearSeVisualiz()) return;
  if(!_encerrarAtaContratoId) return;
  const btn=document.querySelector("#modal-encerrar .btn-primary");
  btn.disabled=true;btn.textContent="Encerrando...";
  const motivo=document.getElementById("enc-motivo").value.trim();
  try{
    const {error}=await sb.from("contratos").update({status:"ENCERRADO"}).eq("id",_encerrarAtaContratoId);
    if(error) throw error;
    const {error:histError}=await sb.from("contratos_historico").insert({
      contrato_id:_encerrarAtaContratoId,
      tipo:"Encerramento",
      data_evento:new Date().toISOString().slice(0,10),
      obs:motivo||"Encerrado pela aba de ATAs"
    });
    if(histError) throw histError;
    await Promise.all([loadAtas(),contratosCarregado?loadContratos():Promise.resolve()]);
    showMsg("enc","✓ Contrato encerrado!","ok");
    setTimeout(()=>document.getElementById("modal-encerrar").classList.remove("active"),1200);
  }catch(e){
    showMsg("enc","Erro: "+(e.message||e),"err");
  }finally{
    btn.disabled=false;btn.textContent="⛔ Encerrar";
  }
}

// ═══ EXCLUIR EXECUÇÃO ═══
async function excluirExec(execId){
  if(bloquearSeVisualiz()) return;
  const exec=atasExec.find(r=>String(r.id)===String(execId));
  if(!exec) return;
  const {data:atual,error:erroConsulta}=await sb.from('atas_execucao').select('*').eq('id',exec.id).maybeSingle();
  if(erroConsulta){ alert('Não foi possível conferir a solicitação: '+erroConsulta.message); return; }
  if(!atual){ alert('Esta solicitação não existe mais.'); await loadAtas(); return; }
  const {count:unidades,error:erroUnidades}=await sb.from('atas_execucao_unidades').select('id',{count:'exact',head:true}).eq('exec_id',exec.id);
  if(erroUnidades){ alert('Não foi possível validar as unidades vinculadas antes da exclusão.'); return; }
  if(!_execAtaPodeExcluir(atual)||(Number(unidades)||0)>0){
    if(window.toast) toast('Exclusão bloqueada: esta solicitação já possui AF ou etapa posterior.','error');
    await loadAtas();
    return;
  }
  if(!await uiConfirm(`Excluir esta solicitação?\n${exec.item} · ${exec.unidade}\n\nEsta ação não pode ser desfeita.`)) return;
  const {data,error}=await sb.rpc('excluir_execucao_ata_pre_af',{p_exec_id:exec.id});
  if(error){alert("Erro ao excluir solicitação: "+error.message);return;}
  if(!data){alert("A solicitação não foi excluída. Verifique sua permissão na aba ATAs.");return;}
  atasExec=atasExec.filter(r=>String(r.id)!==String(exec.id));
  _atasExecExpandidas.delete(String(exec.id));
  _atasExecDetalhes.delete(String(exec.id));
  filtrarAtas();
}

// ═══ PRORROGAR PRAZO DE ENTREGA ═══
let _prorrogarExecId=null, _prorrogarEntregaId=null;
function abrirModalProrrogarPrazo(execId){
  const r=(atasExec||[]).find(x=>String(x.id)===String(execId))
    || entregasRows.find(x=>String(x.exec_id)===String(execId));
  if(!r) return;
  _prorrogarExecId=r.id||r.exec_id; _prorrogarEntregaId=null;
  document.getElementById("pp-info").textContent=`${r.item} · ${r.unidade}`;
  document.getElementById("pp-data").value=r?.prev_entrega||r?.limiteISO||"";
  document.getElementById("pp-obs").value="";
  document.getElementById("pp-msg").className="fmsg";
  document.getElementById("modal-prorrogar-prazo").classList.add("active");
}
function abrirModalProrrogarPrazoAquisicao(entregaId){
  const r=entregasRows.find(x=>String(x.entrega_id)===String(entregaId));
  if(!r) return;
  _prorrogarEntregaId=r.entrega_id; _prorrogarExecId=null;
  document.getElementById("pp-info").textContent=`${r.item} · ${r.unidade}`;
  document.getElementById("pp-data").value=r.limiteISO||"";
  document.getElementById("pp-obs").value="";
  document.getElementById("pp-msg").className="fmsg";
  document.getElementById("modal-prorrogar-prazo").classList.add("active");
}
async function salvarProrrogarPrazo(){
  if(bloquearSeVisualiz()) return;
  const data=document.getElementById("pp-data").value;
  const obs=document.getElementById("pp-obs").value.trim();
  if(!data){showMsg("pp","Informe a nova data (*)","err");return}
  const btn=document.querySelector("#modal-prorrogar-prazo .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const obsPrazo=obs?"Prorrogado: "+obs:"";
  if(_prorrogarEntregaId){
    const r=entregasRows.find(x=>String(x.entrega_id)===String(_prorrogarEntregaId));
    if(!r){btn.disabled=false;btn.textContent="Salvar";return;}
    const {data:salvo,error}=await sb.from("itens_entregas").update({data_limite_entrega:data}).eq("id",r.entrega_id).select("id,data_limite_entrega");
    btn.disabled=false;btn.textContent="Salvar";
    if(error){showMsg("pp","Erro: "+error.message,"err");return;}
    if(!salvo?.length){showMsg("pp","O prazo não foi salvo. Verifique sua permissão.","err");return;}
    Object.assign(r,{limiteISO:data,status:_prazoStatus(data,r.recebido,r.cancelado)});
    renderItensEntregas();
  }else{
    const r=(atasExec||[]).find(x=>String(x.id)===String(_prorrogarExecId))
      || entregasRows.find(x=>String(x.exec_id)===String(_prorrogarExecId));
    if(!r){btn.disabled=false;btn.textContent="Salvar";return;}
    const execId=r.id||r.exec_id;
    const {data:salvo,error}=await sb.from("atas_execucao").update({prev_entrega:data,obs_prazo:obsPrazo||null}).eq("id",execId).select("id,prev_entrega,obs_prazo");
    btn.disabled=false;btn.textContent="Salvar";
    if(error){showMsg("pp","Erro: "+error.message,"err");return;}
    if(!salvo?.length){showMsg("pp","O prazo não foi salvo. Verifique sua permissão.","err");return;}
    Object.assign(r,{prev_entrega:data,limiteISO:data,obs_prazo:obsPrazo,status:_prazoStatus(data,r.recebido,false)});
    const ataRow=entregasRows.find(x=>String(x.exec_id)===String(execId));
    if(ataRow&&ataRow!==r) Object.assign(ataRow,{limiteISO:data,obs_prazo:obsPrazo,status:_prazoStatus(data,ataRow.recebido,false)});
    const execRow=(atasExec||[]).find(x=>String(x.id)===String(execId));
    if(execRow&&execRow!==r) Object.assign(execRow,{prev_entrega:data,obs_prazo:obsPrazo});
    if(typeof filtrarExecs==="function") filtrarExecs();
    renderItensEntregas();
  }
  showMsg("pp","✓ Prazo prorrogado!","ok");
  setTimeout(()=>document.getElementById("modal-prorrogar-prazo").classList.remove("active"),1000);
}

// ═══ AUTO PREENCHER CPL/SIM AO SELECIONAR ITEM ═══
function autoPreencherCplSim(){
  const itemId=document.getElementById("ne2-item").value;
  const at=_resolverAtaItemRef(itemId);
  if(at){
    document.getElementById("ne2-cpl").value=at.cpl||"";
    document.getElementById("ne2-sim").value=at.sim||"";
    // Calcular valor auto quando digitar qtde
    document.getElementById("ne2-qtde").oninput=()=>calcValorExec();
  }
}

function verExecsItem(itemId){
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  document.getElementById("fat-cpl").value=at.cpl;
  document.getElementById("fat-sim").value=at.sim;
  document.getElementById("fat-busca").value=at.item;
  filtrarAtas();
  document.getElementById("exec-body").scrollIntoView({behavior:"smooth"});
}

async function abrirModalNovaAta(contratoId=null){
  if(!podeEditar('atas')){alert("Sem permissão para cadastrar itens de ATA.");return;}
  if(!atasContratos.length){
    const [ctRes,forRes]=await Promise.all([
      sb.from("contratos").select("*").eq("tipo_instrumento","ATA").order("cpl"),
      sb.from("fornecedores").select("id,razao_social,cnpj_normalizado")
    ]);
    if(ctRes.error||forRes.error){alert("Erro ao carregar contratos de ATA: "+(ctRes.error?.message||forRes.error?.message));return;}
    const fornecedores=new Map((forRes.data||[]).map(f=>[String(f.id),f]));
    atasContratos=(ctRes.data||[]).map(c=>({...c,empresa:fornecedores.get(String(c.fornecedor_id))?.razao_social||c.prestador||""}));
  }
  ["na-item","na-marca","na-qtde","na-valor","na-prazo"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  const sel=document.getElementById("na-contrato");
  sel.innerHTML='<option value="">Selecione a ATA...</option>'+atasContratos
    .slice().sort((a,b)=>(a.cpl||"").localeCompare(b.cpl||"",'pt-BR',{numeric:true}))
    .map(c=>`<option value="${c.id}">${_sanEsc(c.cpl||"Sem CPL")} · ${_sanEsc(c.numero_contrato||"Sem número")} · ${_sanEsc(c.empresa||"")}</option>`).join("");
  sel.value=contratoId?String(contratoId):"";
  naContratoChange();
  document.getElementById("na-msg").className="fmsg";
  document.getElementById("modal-nova-ata").classList.add("active");
}

function naContratoChange(){
  const id=document.getElementById("na-contrato")?.value;
  const c=atasContratos.find(x=>String(x.id)===String(id));
  const resumo=document.getElementById("na-contrato-resumo");
  if(!c){resumo.style.display="none";resumo.textContent="";return;}
  resumo.style.display="block";
  resumo.innerHTML=`<strong>${_sanEsc(c.empresa||"")}</strong><br>${_sanEsc(c.cpl||"")} · ${_sanEsc(c.numero_contrato||"")} · ${_sanEsc(c.status||"")} · vence em ${_sanEsc(c.vencimento||"—")}`;
}

function popularItensExec(){
  const cpl=document.getElementById("ne2-cpl").value;
  const sim=document.getElementById("ne2-sim").value;
  const itens=atasItens.filter(r=>(!cpl||r.cpl===cpl)&&(!sim||r.sim===sim));
  const el=document.getElementById("ne2-item");
  el.innerHTML='<option value="">Selecione...</option>'+itens.map(i=>`<option value="${i.id}">${_sanEsc(i.item)}</option>`).join("");
}

function calcValorExec(){
  const atItem=_resolverAtaItemRef(document.getElementById("ne2-item").value)||{};
  const qtde=parseFloat(document.getElementById("ne2-qtde").value)||0;
  if(atItem&&atItem.valor_unit&&qtde) document.getElementById("ne2-valor").value=(atItem.valor_unit*qtde).toFixed(2);
}

async function abrirModalNovaExec(){
  const itensUnicos=atasItens.filter(r=>!String(r.status||"").toUpperCase().startsWith("ENCERRADO")).sort((a,b)=>a.item.localeCompare(b.item,'pt-BR'));
  const itemSel=document.getElementById("ne2-item");
  itemSel.innerHTML='<option value="">Selecione o item...</option>'+itensUnicos.map(r=>`<option value="${r.id}">${_sanEsc(r.item)} (${_sanEsc(r.cpl)} / ${_sanEsc(r.sim)})</option>`).join("");
  document.getElementById("ne2-cpl").value="";
  document.getElementById("ne2-sim").value="";
  ["ne2-unidade","ne2-qtde","ne2-valor","ne2-data-af","ne2-dt-entrega"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  // Fase 12: popular emendas e voltar à origem padrão (emenda)
  if(!_neEmendasCache.length){ const {data}=await sb.from('emendas').select('id,emenda,ano,parlamentar,unidade,unidade_id').order('ano',{ascending:false}); _neEmendasCache=data||[]; }
  document.getElementById("ne2-emenda").innerHTML='<option value="">Selecione a emenda...</option>'+_neEmendasCache.map(e=>`<option value="${e.id}">${_sanEsc(e.emenda||'?')}${e.ano?('/'+e.ano):''}${e.parlamentar?(' · '+_sanEsc(e.parlamentar)):''}</option>`).join("");
  document.getElementById("ne2-emenda-item").innerHTML='<option value="">Selecione...</option>';
  const rb=document.querySelector('input[name="ne2-origem"][value="emenda"]'); if(rb) rb.checked=true;
  neOrigemChange();
  document.getElementById("ne2-msg").className="fmsg";
  document.getElementById("modal-nova-exec").classList.add("active");
}
let _neEmendasCache=[];
function _neOrigem(){ return document.querySelector('input[name="ne2-origem"]:checked')?.value||'emenda'; }
function neOrigemChange(){
  const emenda=_neOrigem()==='emenda';
  document.getElementById("ne2-emenda-wrap").style.display=emenda?'':'none';
  document.getElementById("ne2-emenda-item-wrap").style.display=emenda?'':'none';
  const uni=document.getElementById("ne2-unidade");
  uni.readOnly=emenda; uni.style.background=emenda?'var(--surface2)':'';
  document.getElementById("ne2-unidade-auto").style.display=emenda?'block':'none';
  if(!emenda){ uni.value=''; }
}
async function _neEmendaItensJaUsados(ids){
  const set=new Set();
  const clean=(ids||[]).filter(Boolean);
  if(!clean.length) return set;
  const [itRes, ataRes]=await Promise.all([
    sb.from('itens').select('emenda_item_id').in('emenda_item_id',clean),
    sb.from('atas_execucao').select('emenda_item_id').in('emenda_item_id',clean)
  ]);
  (itRes.data||[]).forEach(r=>{ if(r.emenda_item_id) set.add(String(r.emenda_item_id)); });
  (ataRes.data||[]).forEach(r=>{ if(r.emenda_item_id) set.add(String(r.emenda_item_id)); });
  return set;
}
function _isUnidadeVarias(v){
  const s=(v||'').toString().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return s==='VARIAS';
}
function _preferUnidadeExec(unidadeBeneficiada, unidadeEntrega, fallback=''){
  const entrega=(unidadeEntrega||'').toString().trim();
  const beneficiada=(unidadeBeneficiada||'').toString().trim();
  if(entrega&&!_isUnidadeVarias(entrega)) return entrega;
  if(beneficiada) return beneficiada;
  return entrega||fallback||'';
}
async function neEmendaChange(){
  const eid=document.getElementById("ne2-emenda").value;
  const sel=document.getElementById("ne2-emenda-item");
  sel.innerHTML='<option value="">Selecione...</option>';
  document.getElementById("ne2-unidade").value='';
  if(!eid) return;
  const {data}=await sb.from('emenda_itens').select('id,item,qtde,unidade_beneficiada,unidade_entrega').eq('emenda_id',eid).order('item');
  const usados=await _neEmendaItensJaUsados((data||[]).map(i=>i.id));
  sel.innerHTML='<option value="">Selecione...</option>'+(data||[]).map(i=>{
    const locked=usados.has(String(i.id));
    const unidade=_preferUnidadeExec(i.unidade_beneficiada,i.unidade_entrega,'sem unidade')||'sem unidade';
    const txt=`${i.item||'item'}${i.qtde?(' · qtde '+i.qtde):''} · ${unidade}${locked?' · já vinculado':''}`;
    return `<option value="${i.id}" ${locked?'disabled':''} data-locked="${locked?'1':'0'}">${_sanEsc(txt)}</option>`;
  }).join("");
}
async function neEmendaItemChange(){
  const eid=document.getElementById("ne2-emenda").value;
  const iid=document.getElementById("ne2-emenda-item").value;
  const uni=document.getElementById("ne2-unidade");
  const em=_neEmendasCache.find(e=>String(e.id)===String(eid));
  let unidade=em?.unidade||'';
  if(iid){ const {data}=await sb.from('emenda_itens').select('unidade_beneficiada,unidade_entrega').eq('id',iid).single(); unidade=_preferUnidadeExec(data?.unidade_beneficiada,data?.unidade_entrega,unidade); }
  uni.value=unidade||'';
}

let _editExecId=null;
async function abrirModalEditExec(execId){
  const entregaAta=entregasRows.find(r=>String(r.exec_id)===String(execId)&&r.tipo==='ATA');
  if(entregaAta) return abrirRecebimentoAta(execId);
  let r=atasExec.find(x=>String(x.id)===String(execId));
  if(!r){
    // aberto a partir da aba "Controle de Entregas", onde atasExec não está carregado:
    // busca a execução direto do banco e a injeta para que salvarEditExec a encontre.
    const {data}=await sb.from("atas_execucao").select("*").eq("id",execId).single();
    if(data){ r=data; atasExec.push(r); }
  }
  if(!r) return;
  _editExecId=r.id;
  document.getElementById("ee-info").textContent=`${r.cpl} · ${r.sim} · ${r.item} · ${r.unidade}`;
  document.getElementById("ee-empenho").value=r.empenho||"";
  document.getElementById("ee-data-af").value=r.data_af||"";
  document.getElementById("ee-prev").value=r.prev_entrega||"";
  document.getElementById("ee-dt-entrega").value=r.dt_entrega||"";
  document.getElementById("ee-nf").value=r.nf||"";
  document.getElementById("ee-msg").className="fmsg";
  const _eem=document.getElementById("modal-edit-exec");
  if(_eem.parentElement!==document.body) document.body.appendChild(_eem); // sai de dentro de #panel-atas p/ aparecer em qualquer aba
  _eem.classList.add("active");
}

function abrirModalEditAta(itemId){
  const at=_resolverAtaItemRef(itemId);
  if(!at) return;
  abrirModalNovaExec();
  setTimeout(()=>{
    document.getElementById("ne2-item").value=at.id;
    autoPreencherCplSim();
  },50);
}

async function salvarNovaAta(){
  if(bloquearSeVisualiz('atas')) return;
  const contratoId=Number(document.getElementById("na-contrato").value)||null;
  const item=document.getElementById("na-item").value.trim();
  const qtde=parseFloat(document.getElementById("na-qtde").value)||0;
  if(!contratoId||!item||!qtde){showMsg("na","Selecione a ATA e preencha Item e Quantidade (*)","err");return}
  const btn=document.querySelector("#modal-nova-ata .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={contrato_id:contratoId,item,
    marca_modelo:document.getElementById("na-marca").value.trim(),
    qtde_contratada:qtde,
    valor_unit:parseFloat(document.getElementById("na-valor").value)||0,
    prazo_entrega:parseInt(document.getElementById("na-prazo").value)||null
  };
  const {data,error}=await sb.from("atas_itens").insert(dados).select("id").single();
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("na","Erro: "+error.message,"err");return;}
  if(!data?.id){showMsg("na","O item não foi salvo. Verifique sua permissão.","err");return;}
  await loadAtas();
  showMsg("na","✓ Item vinculado à ATA!","ok");
  if(_ctAtual&&String(_ctAtual.id)===String(contratoId)) await abrirDetalheContrato(contratoId);
  setTimeout(()=>document.getElementById("modal-nova-ata").classList.remove("active"),1000);
}

async function salvarNovaExec(){
  if(bloquearSeVisualiz('atas')) return;
  const at=_resolverAtaItemRef(document.getElementById("ne2-item").value);
  const unidade=document.getElementById("ne2-unidade").value.trim();
  const qtde=parseFloat(document.getElementById("ne2-qtde").value)||0;
  const origem=_neOrigem();
  const emendaId=document.getElementById("ne2-emenda").value||null;
  const emendaItemId=document.getElementById("ne2-emenda-item").value||null;
  if(!at||!unidade||!qtde){showMsg("ne2","Selecione o item da ATA e preencha Unidade e Quantidade (*)","err");return}
  if(origem==='emenda' && (!emendaId||!emendaItemId)){showMsg("ne2","Selecione a emenda e o item da emenda (*)","err");return}
  if(origem==='emenda' && emendaItemId){
    const usados=await _neEmendaItensJaUsados([emendaItemId]);
    if(usados.has(String(emendaItemId))){
      showMsg("ne2","Este item da emenda já está vinculado a outro processo/solicitação. Escolha outro item.","err");
      return;
    }
  }
  const saldo=getSaldo(at);
  if(qtde>saldo){showMsg("ne2",`Quantidade maior que o saldo disponível (${saldo}).`,"err");return;}
  const btn=document.querySelector("#modal-nova-exec .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={ata_item_id:at.id,unidade,qtde,
    valor:parseFloat(document.getElementById("ne2-valor").value)||0,
    origem_recurso:origem,
    emenda_id:origem==='emenda'?emendaId:null,
    emenda_item_id:origem==='emenda'?emendaItemId:null,
    data_af:document.getElementById("ne2-data-af").value||null,
    dt_entrega:document.getElementById("ne2-dt-entrega").value||null
  };
  const {data,error}=await sb.rpc("criar_solicitacao_ata_execucao",{
    p_ata_item_id:dados.ata_item_id,
    p_unidade:dados.unidade,
    p_qtde:dados.qtde,
    p_valor:dados.valor,
    p_origem_recurso:dados.origem_recurso,
    p_emenda_id:dados.emenda_id,
    p_emenda_item_id:dados.emenda_item_id,
    p_data_af:dados.data_af,
    p_dt_entrega:dados.dt_entrega
  });
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("ne2","Erro: "+error.message,"err");return;}
  const salvo=Array.isArray(data)?data[0]:data;
  if(!salvo?.exec_id){showMsg("ne2","A solicitação não foi salva. Verifique sua permissão.","err");return;}
  await loadAtas();
  if(origem==='emenda'){
    if(typeof loadData==='function'){ try{ await loadData(); }catch(e){ console.error('loadData apos solicitacao ATA:',e); } }
  }
  // ═══ Atualização in-loco em entregasRows
  const execId=salvo.exec_id;
  const emendaItemVinculado=origem==='emenda'?(salvo.emenda_item_id||emendaItemId):null;
  const rowATA={tipo:'ATA',exec_id:execId,ata_item_id:at.id,emenda_id:origem==='emenda'?emendaId:null,emenda_item_id:emendaItemVinculado,
    processo:at.cpl||'',contrato:at.sim||'',
    empresa:at.empresa||'',item:at.item||'',
    unidade,af_numero:'',af_dataISO:_toISODate(dados.data_af),
    qtde,limiteISO:'',recebido:false,cancelado:false,prazo_entrega_dias:at.prazo_entrega||at.prazo_entrega_dias||null,
    _ataPendenteAF:true,status:'aguardando AF',_novaExec:true};
  entregasRows.unshift(rowATA);
  itensEntregasCarregado=false;
  if(window._activeTab==='itens'){
    try{ renderItensEntregas(); }catch(e){}
    try{ await loadItensEntregas(); }catch(e){ console.error('bg atas->entregas:',e); }
  }
  showMsg("ne2","✓ Solicitação salva!"+(salvo.parcial?" Saldo restante mantido na emenda.":""),"ok");
  setTimeout(()=>document.getElementById("modal-nova-exec").classList.remove("active"),1000);
}

async function salvarEditExec(){
  if(bloquearSeVisualiz('atas')) return;
  const exec=atasExec.find(r=>String(r.id)===String(_editExecId));
  if(!exec) return;
  const btn=document.querySelector("#modal-edit-exec .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const dados={
    empenho:document.getElementById("ee-empenho").value.trim(),
    data_af:document.getElementById("ee-data-af").value,
    prev_entrega:document.getElementById("ee-prev").value,
    dt_entrega:document.getElementById("ee-dt-entrega").value,
    nf:document.getElementById("ee-nf").value.trim()
  };
  const {data,error}=await sb.from("atas_execucao").update(dados).eq("id",exec.id).select("id");
  btn.disabled=false;btn.textContent="Salvar";
  if(error){showMsg("ee","Erro: "+error.message,"err");return;}
  if(!data?.length){showMsg("ee","A execução não foi atualizada. Verifique sua permissão.","err");return;}
  Object.assign(exec,dados);
  filtrarAtas();
  // se o modal foi aberto pela aba "Controle de Entregas", recarrega aquela lista
  itensEntregasCarregado=false;
  if(window._activeTab==='itens' && typeof loadItensEntregas==='function') loadItensEntregas();
  showMsg("ee","✓ Salvo!","ok");
  setTimeout(()=>document.getElementById("modal-edit-exec").classList.remove("active"),900);
}

// ── Emitir AF para item de ATA (gera nº de AF, igual ao fluxo da aquisição) ──
async function abrirModalAtaAF(execId){
  if(!podeEditar('itens')&&!podeEditar('atas')){ alert("⛔ Você não tem permissão para emitir AF."); return; }
  let r=atasExec.find(x=>String(x.id)===String(execId));
  if(!r){
    const {data}=await sb.from("atas_execucao").select("*").eq("id",execId).single();
    if(data){ r=data; atasExec.push(r); }
  }
  if(!r){ if(window.toast)toast('Execução não encontrada','error'); return; }
  document.getElementById('ataaf-exec-id').value=r.id;
  document.getElementById('ataaf-info').innerHTML=`<b>${_sanEsc(r.item||'—')}</b><br>${_sanEsc(r.cpl||'—')} · ${_sanEsc(r.sim||'—')} · ${_sanEsc(r.unidade||'—')}`;
  document.getElementById('ataaf-numero').value=r.af_numero||'';
  document.getElementById('ataaf-data').value=r.data_af||new Date().toISOString().slice(0,10);
  document.getElementById('ataaf-prev').value=r.prev_entrega||'';
  document.getElementById('ataaf-empenho').value=r.empenho||'';
  const msg=document.getElementById('ataaf-msg'); msg.textContent=''; msg.className='fmsg';
  document.getElementById('modal-ata-af').classList.add('active');
}
async function salvarAtaAF(){
  if(!podeEditar('itens')&&!podeEditar('atas')){ alert("⛔ Você não tem permissão para emitir AF."); return; }
  const execId=document.getElementById('ataaf-exec-id').value;
  const numero=document.getElementById('ataaf-numero').value.trim();
  const afData=document.getElementById('ataaf-data').value;
  const prev=document.getElementById('ataaf-prev').value;
  const empenho=document.getElementById('ataaf-empenho').value.trim();
  const msg=document.getElementById('ataaf-msg');
  if(!numero){ msg.textContent='Informe o número da AF.'; msg.style.color='var(--red)'; return; }
  if(!afData){ msg.textContent='Informe a data da AF.'; msg.style.color='var(--red)'; return; }
  if(!prev){ msg.textContent='Informe a previsão de entrega.'; msg.style.color='var(--red)'; return; }
  const btn=document.getElementById('ataaf-salvar'); btn.disabled=true; btn.textContent='Salvando...';
  const dados={af_numero:numero, data_af:afData, prev_entrega:prev, empenho:empenho};
  const {data,error}=await sb.from('atas_execucao').update(dados).eq('id',execId).select('id');
  btn.disabled=false; btn.textContent='Emitir AF';
  if(error){ msg.textContent='Erro: '+error.message; msg.style.color='var(--red)'; return; }
  if(!data?.length){ msg.textContent='Não foi possível emitir a AF. Verifique sua permissão.'; msg.style.color='var(--red)'; return; }
  const exec=atasExec.find(x=>String(x.id)===String(execId)); if(exec) Object.assign(exec,dados);
  msg.style.color='var(--green)'; msg.textContent='✓ AF emitida!';
  if(typeof filtrarAtas==='function') filtrarAtas();
  if(window._activeTab==='itens' && typeof loadItensEntregas==='function'){ itensEntregasCarregado=false; try{ await loadItensEntregas(); }catch(e){ console.error(e); } }
  // Atualiza a aba Emendas se o item tiver vínculo com emenda
  const execAtual=atasExec.find(x=>String(x.id)===String(execId));
  if(execAtual?.emenda_item_id){
    sb.from("emenda_itens").update({cpl:execAtual.cpl||'', status:'AF EMITIDA - AGUARDANDO ENTREGA/CONFIRMACAO'}).eq("id",execAtual.emenda_item_id).then(r=>{if(r.error)console.error(r.error);});
    if(typeof loadData==='function') loadData().catch(e=>console.error('bg loadData:',e));
  }
  setTimeout(()=>document.getElementById('modal-ata-af').classList.remove('active'),800);
}
