// ═══ ABA CADASTROS (hub de dados mestre) ═══
const CADASTRO_DEFS = {
  pessoas:       {tabela:'pessoas',       titulo:'👤 Pessoas',       temAtivo:true,  ordem:'nome',         campos:[{c:'nome',l:'Nome',req:true},{c:'cargo',l:'Cargo'},{c:'orgao',l:'Órgão/Seção'},{c:'email',l:'E-mail'},{c:'telefone',l:'Telefone'}]},
  parlamentares: {tabela:'parlamentares', titulo:'🏛️ Parlamentares', temAtivo:true,  ordem:'nome',         campos:[{c:'nome',l:'Nome',req:true}]},
  secoes:        {tabela:'secoes',        titulo:'🏢 Seções',        temAtivo:true,  ordem:'sigla',        campos:[{c:'sigla',l:'Sigla',req:true},{c:'nome',l:'Nome completo'}]},
  unidades:      {tabela:'unidades',      titulo:'🏥 Unidades',      temAtivo:true,  ordem:'nome',         campos:[{c:'nome',l:'Nome',req:true},{c:'endereco',l:'Endereço'},{c:'telefone',l:'Telefone'}]},
  fornecedores:  {tabela:'fornecedores',  titulo:'🏭 Empresas',      temAtivo:false, ordem:'razao_social', campos:[{c:'razao_social',l:'Razão social',req:true},{c:'cnpj_normalizado',l:'CNPJ (só dígitos)'},{c:'nome_fantasia',l:'Nome fantasia'}]},
  status_opcoes: {tabela:'status_opcoes', titulo:'🏷️ Status',        temAtivo:true,  ordem:'ordem',        campos:[{c:'contexto',l:'Contexto (processo/item)',req:true},{c:'nome',l:'Nome',req:true},{c:'ordem',l:'Ordem',tipo:'int'}]},
};
let _cadAtual=null;
async function carregarCadastros(){
  _cadAtual=null;
  document.getElementById('cad-lista').style.display='none';
  const hub=document.getElementById('cad-hub'); hub.style.display='grid';
  const ents=Object.keys(CADASTRO_DEFS);
  const counts={};
  await Promise.all(ents.map(async e=>{ try{ const {count}=await sb.from(CADASTRO_DEFS[e].tabela).select('id',{count:'exact',head:true}); counts[e]=count??'—'; }catch(_){ counts[e]='—'; } }));
  hub.innerHTML=ents.map(e=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="font-size:14px;font-weight:600;margin-bottom:.25rem">${CADASTRO_DEFS[e].titulo}</div>
    <div style="font-size:24px;font-weight:700;color:var(--blue);margin-bottom:.5rem">${counts[e]}</div>
    <button onclick="abrirCadastroLista('${e}')" style="font-size:12px;padding:6px 12px;border-radius:var(--radius-sm);border:1px solid var(--blue);background:var(--blue-bg);color:var(--blue-text);cursor:pointer">Gerenciar</button>
  </div>`).join('');
  try{ await carregarRevisao(); }catch(e){ console.warn('revisão cadastros:',e); }
}
async function abrirCadastroLista(ent){
  const def=CADASTRO_DEFS[ent]; _cadAtual=ent;
  document.getElementById('cad-hub').style.display='none';
  const wrap=document.getElementById('cad-lista'); wrap.style.display='block';
  const th=def.campos.map(f=>`<th style="text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;color:var(--text2);border-bottom:1px solid var(--border)">${f.l}${f.req?' *':''}</th>`).join('');
  wrap.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
      <button onclick="carregarCadastros()" style="font-size:12px;padding:5px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);cursor:pointer">← Voltar</button>
      <div class="form-title" style="margin:0;padding:0;border:none">${def.titulo}</div>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${th}<th style="padding:6px 8px;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">${def.temAtivo?'Ativo':''}</th><th style="border-bottom:1px solid var(--border)"></th></tr></thead><tbody id="cad-tbody"><tr><td colspan="9" style="padding:10px;color:var(--text3)">Carregando...</td></tr></tbody></table></div>`;
  const {data,error}=await sb.from(def.tabela).select('*').order(def.ordem,{nullsFirst:false});
  const tb=document.getElementById('cad-tbody');
  if(error){ tb.innerHTML=`<tr><td colspan="9" style="padding:10px;color:var(--red)">Erro: ${_sanEsc(error.message)}</td></tr>`; return; }
  const inp=(f,v)=>`<td style="padding:4px 6px"><input data-field="${f.c}" value="${_sanEsc(v??'')}" placeholder="${f.l}" style="width:100%;min-width:90px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);box-sizing:border-box"></td>`;
  const cellAtivo=(checked)=>def.temAtivo?`<td style="text-align:center"><input type="checkbox" data-field="ativo" ${checked?'checked':''}></td>`:'<td></td>';
  const novo=`<tr data-novo="1" style="background:var(--surface2)">${def.campos.map(f=>inp(f,'')).join('')}${cellAtivo(true)}<td style="padding:4px 6px"><button onclick="cadastroSalvar('${ent}',this)" style="font-size:12px;padding:5px 10px;border-radius:4px;border:none;background:var(--green);color:#fff;cursor:pointer;white-space:nowrap">+ Adicionar</button></td></tr>`;
  const linhas=(data||[]).map(r=>`<tr data-id="${r.id}" style="border-bottom:1px solid var(--border)">${def.campos.map(f=>inp(f,r[f.c])).join('')}${cellAtivo(r.ativo!==false)}<td style="padding:4px 6px"><button onclick="cadastroSalvar('${ent}',this)" style="font-size:12px;padding:5px 10px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer">Salvar</button></td></tr>`).join('');
  tb.innerHTML=novo+linhas;
}
async function cadastroSalvar(ent, btn){
  const def=CADASTRO_DEFS[ent];
  const tr=btn.closest('tr');
  const dados={};
  for(const f of def.campos){
    const v=tr.querySelector(`[data-field="${f.c}"]`).value.trim();
    if(f.req && !v){ toast('Preencha: '+f.l,'error'); return; }
    dados[f.c]= v==='' ? null : (f.tipo==='int' ? (Number(v)||null) : v);
  }
  const atv=tr.querySelector('[data-field="ativo"]'); if(atv) dados.ativo=atv.checked;
  // hub é o admin: o que ele cadastra/edita aqui já nasce validado (não cai na fila de revisão)
  if(REV_DEFS[ent]) dados.revisado=true;
  btn.disabled=true;
  const id=tr.dataset.id;
  const res=id ? await sb.from(def.tabela).update(dados).eq('id',id) : await sb.from(def.tabela).insert(dados);
  btn.disabled=false;
  if(res.error){ toast('Erro: '+res.error.message,'error'); return; }
  toast(id?'Atualizado!':'Adicionado!','success');
  abrirCadastroLista(ent);
}

// ═══ Revisão de cadastros (fila de moderação de dados-mestre criados inline) ═══
// tipo 'fk'  → referências apontam por id (ex.: contratos.fornecedor_id)
// tipo 'txt' → referências guardam o texto do nome (ex.: emendas.parlamentar)
const REV_DEFS = {
  parlamentares: {titulo:'🏛️ Parlamentares', keyCol:'nome', label:r=>r.nome, tipo:'txt',
    refs:[['emendas','parlamentar']]},
  pessoas:       {titulo:'👤 Pessoas / Fiscais', keyCol:'nome', label:r=>r.nome, tipo:'txt',
    refs:[['contratos_fiscalizadores','nome'],['chamados','fiscalizado_por'],['chamados_controle','fiscalizado_por'],['termos_ateste','fiscalizado_por']]},
  secoes:        {titulo:'🏢 Seções', keyCol:'sigla', label:r=>(r.sigla+(r.nome?(' — '+r.nome):'')), tipo:'txt',
    refs:[['contratos','secao'],['processos','secao']]},
  fornecedores:  {titulo:'🏭 Empresas', keyCol:'razao_social', label:r=>(r.razao_social||r.nome_fantasia||('#'+r.id)), tipo:'fk',
    refs:[['contratos','fornecedor_id'],['itens','fornecedor_id'],['empenhos','fornecedor_id'],['notas_fiscais','fornecedor_id'],['fornecedor_contatos','fornecedor_id']]},
  unidades:      {titulo:'🏥 Unidades', keyCol:'nome', label:r=>r.nome, tipo:'fk',
    refs:[['emendas','unidade_id'],['emenda_itens','unidade_beneficiada_id'],['emenda_itens','unidade_entrega_id'],['chamados','unidade_id'],['inventario_ac','unidade_id'],['itens','unidade_destino_id']]},
};
let _revAprovados={}; // ent -> [registros revisados] (para sugestão de duplicado e o "mesclar em")
function _revNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function _revLeven(a,b){ a=_revNorm(a); b=_revNorm(b); const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c); }
  return d[m][n]; }
function _revSugestoes(ent, pend){
  const alvo=REV_DEFS[ent].label(pend); const na=_revNorm(alvo);
  return (_revAprovados[ent]||[]).map(r=>{ const lab=REV_DEFS[ent].label(r); const nb=_revNorm(lab);
      let score=_revLeven(na,nb); if(nb&&na&&(nb.includes(na)||na.includes(nb))) score=Math.min(score,1);
      return {r,lab,score}; })
    .filter(x=>x.score<=Math.max(2,Math.ceil(_revNorm(alvo).length*0.34)))
    .sort((a,b)=>a.score-b.score).slice(0,4);
}
async function carregarRevisao(){
  const box=document.getElementById('cad-revisao'); if(!box) return;
  const ents=Object.keys(REV_DEFS);
  const pend={}, aprov={};
  await Promise.all(ents.map(async e=>{
    const [{data:p},{data:a}]=await Promise.all([
      sb.from(e).select('*').eq('revisado',false).order('created_at',{ascending:false}),
      sb.from(e).select('*').eq('revisado',true).order(REV_DEFS[e].keyCol)
    ]);
    pend[e]=p||[]; aprov[e]=a||[];
  }));
  _revAprovados=aprov;
  const total=ents.reduce((s,e)=>s+pend[e].length,0);
  if(!total){ box.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem;font-size:13px;color:var(--text3)">🔎 <b>Revisão de cadastros</b> — nenhum cadastro novo aguardando revisão. Tudo em dia. ✅</div>`; return; }
  const podeEd=podeEditar('cadastros')|| _isAdmin();
  let html=`<div style="background:var(--amber-bg,#EF9F2715);border:1px solid var(--amber,#EF9F27);border-radius:var(--radius);padding:1rem">
    <div style="font-size:14px;font-weight:700;margin-bottom:.25rem">🔎 Revisão de cadastros — ${total} aguardando</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:.75rem">Cadastros novos criados nas telas (gerar contrato, fiscal, emenda…). Confira se já existe: <b>Aprovar</b> (é novo) · <b>Mesclar no correto</b> (some o duplicado e tudo passa a apontar para o certo) · <b>Excluir</b>.</div>`;
  for(const e of ents){
    if(!pend[e].length) continue;
    const def=REV_DEFS[e];
    html+=`<div style="margin-top:.5rem;border-top:1px solid var(--border);padding-top:.5rem"><div style="font-size:12px;font-weight:600;margin-bottom:.35rem">${def.titulo} <span style="color:var(--text3);font-weight:400">(${pend[e].length})</span></div>`;
    for(const r of pend[e]){
      const sug=_revSugestoes(e,r);
      const opts=(_revAprovados[e]||[]).map(a=>`<option value="${a.id}"${sug[0]&&String(sug[0].r.id)===String(a.id)?' selected':''}>${_sanEsc(def.label(a))}</option>`).join('');
      const sugBtns=sug.length?('<div style="font-size:11px;color:var(--text3);margin:3px 0">parece: '+sug.map(s=>`<button onclick="document.getElementById('rev-keep-${e}-${r.id}').value='${s.r.id}'" style="font-size:11px;padding:2px 7px;margin:2px 3px 0 0;border-radius:10px;border:1px solid var(--blue);background:var(--blue-bg);color:var(--blue-text);cursor:pointer">${_sanEsc(s.lab)}</button>`).join('')+'</div>'):'<div style="font-size:11px;color:var(--text3);margin:3px 0">nenhum parecido — provavelmente é novo.</div>';
      html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
          <div style="font-size:13px;font-weight:600">${_sanEsc(def.label(r))}</div>
          <div style="font-size:11px;color:var(--text3)">criado ${r.created_at?fmtDate(String(r.created_at).slice(0,10)):'—'}</div>
        </div>
        ${sugBtns}
        ${podeEd?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:5px">
          <button onclick="revAprovar('${e}','${r.id}')" class="btn-primary btn-compact" style="background:var(--green)">✓ Aprovar (é novo)</button>
          <span style="font-size:11px;color:var(--text3)">ou mesclar em:</span>
          <select id="rev-keep-${e}-${r.id}" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);max-width:240px">${opts}</select>
          <button onclick="revMesclar('${e}','${r.id}')" class="btn-secondary btn-compact">Mesclar</button>
          <button onclick="revExcluir('${e}','${r.id}')" class="btn-danger btn-compact">Excluir</button>
        </div>`:'<div style="font-size:11px;color:var(--text3);margin-top:4px">Apenas admin pode revisar.</div>'}
      </div>`;
    }
    html+=`</div>`;
  }
  html+=`</div>`;
  box.innerHTML=html;
}
async function revAprovar(ent, id){
  if(bloquearSeVisualiz('cadastros')) return;
  const {error}=await sb.from(ent).update({revisado:true}).eq('id',id);
  if(error){ toast('Erro: '+error.message,'error'); return; }
  toast('Cadastro aprovado.','success'); carregarRevisao();
}
async function _revContarRefs(def, fromVal){
  let total=0; const detalhe=[];
  for(const [ct,cc] of def.refs){
    const {count,error}=await sb.from(ct).select('id',{count:'exact',head:true}).eq(cc,fromVal);
    if(!error && count){ total+=count; detalhe.push(`${ct}: ${count}`); }
  }
  return {total,detalhe};
}
async function revMesclar(ent, dupId){
  if(bloquearSeVisualiz('cadastros')) return;
  const def=REV_DEFS[ent];
  const keepId=document.getElementById(`rev-keep-${ent}-${dupId}`)?.value;
  if(!keepId){ toast('Escolha o cadastro correto.','error'); return; }
  if(String(keepId)===String(dupId)){ toast('Escolha um cadastro diferente do duplicado.','error'); return; }
  const dup=(_revAprovados[ent]||[]).find(r=>String(r.id)===String(dupId)) || (await sb.from(ent).select('*').eq('id',dupId).single()).data;
  const keep=(_revAprovados[ent]||[]).find(r=>String(r.id)===String(keepId));
  if(!dup||!keep){ toast('Registro não encontrado.','error'); return; }
  const fromVal=def.tipo==='fk'?dupId:dup[def.keyCol];
  const toVal=def.tipo==='fk'?keepId:keep[def.keyCol];
  const {total,detalhe}=await _revContarRefs(def,fromVal);
  const msg=`Mesclar "${def.label(dup)}" → "${def.label(keep)}".\n\n`+
    (total?`Vou reapontar ${total} referência(s) para o cadastro correto:\n• ${detalhe.join('\n• ')}\n\n`:'Nenhuma referência usa o duplicado.\n\n')+
    `Depois apago o duplicado. Continuar?`;
  if(!await uiConfirm(msg)) return;
  // 1) reaponta referências
  for(const [ct,cc] of def.refs){
    const {error}=await sb.from(ct).update({[cc]:toVal}).eq(cc,fromVal);
    if(error){ toast(`Erro ao reapontar ${ct}: ${error.message}`,'error'); return; }
  }
  // 2) apaga o duplicado
  const {error:eDel}=await sb.from(ent).delete().eq('id',dupId);
  if(eDel){ toast('Referências reapontadas, mas erro ao apagar o duplicado: '+eDel.message,'error'); carregarRevisao(); return; }
  toast(`Mesclado! ${total} referência(s) reapontada(s).`,'success');
  carregarRevisao();
}
async function revExcluir(ent, id){
  if(bloquearSeVisualiz('cadastros')) return;
  const def=REV_DEFS[ent];
  const dup=(await sb.from(ent).select('*').eq('id',id).single()).data;
  const fromVal=def.tipo==='fk'?id:(dup?dup[def.keyCol]:null);
  const {total,detalhe}= fromVal!=null ? await _revContarRefs(def,fromVal) : {total:0,detalhe:[]};
  if(total){ if(!await uiConfirm(`Atenção: ${total} referência(s) ainda usam este cadastro (${detalhe.join(', ')}). Excluir vai deixá-las órfãs/sem vínculo. Prefira "Mesclar". Excluir mesmo assim?`)) return; }
  else if(!await uiConfirm('Excluir este cadastro?')) return;
  const {error}=await sb.from(ent).delete().eq('id',id);
  if(error){ toast('Erro ao excluir: '+error.message+(def.tipo==='fk'?' (há vínculos — use Mesclar).':''),'error'); return; }
  toast('Cadastro excluído.','success'); carregarRevisao();
}

async function aprovarUsuario(userId){
  if(bloquearSeVisualiz('usuarios')) return;
  const {data,error}=await sb.from("profiles").update({aprovado:true}).eq("id",userId).select();
  if(error){alert("Erro ao aprovar: "+error.message);return;}
  if(!data || data.length===0){alert("Sem permissão para aprovar este usuário.");return;}
  carregarUsuarios();
}

async function alterarPapel(userId, email){
  if(bloquearSeVisualiz()) return;
  const novoPapel=document.getElementById("papel-"+userId).value;
  const {data, error}=await sb.from("profiles").update({papel:novoPapel}).eq("id",userId).select();
  if(error){alert("Erro ao atualizar: "+error.message);return;}
  if(!data || data.length===0){
    alert("⚠️ Sem permissão para alterar este usuário.\n\nVerifique a política RLS da tabela 'profiles' no Supabase (o admin precisa de permissão UPDATE em perfis de outros usuários).");
    return;
  }
  alert("✓ Papel de "+email+" atualizado para '"+novoPapel+"'.");
  carregarUsuarios();
}

// ═══ PLANILHAS ═══
const CHAMADOS_COLUNAS = [
  {key:"protocolo",label:"Protocolo",width:"130px"},
  {key:"carimbo",label:"Data/Hora",width:"130px"},
  {key:"unidade",label:"Unidade",width:"180px"},
  {key:"endereco",label:"Endereço",width:"180px"},
  {key:"telefone",label:"Telefone",width:"110px"},
  {key:"responsavel",label:"Responsável",width:"150px"},
  {key:"grau_urgencia",label:"Urgência",width:"120px"},
  {key:"patrimonio",label:"Patrimônio",width:"100px"},
  {key:"equipamento",label:"Equipamento",width:"180px"},
  {key:"fabricante",label:"Fabricante",width:"130px"},
  {key:"serie",label:"Série",width:"120px"},
  {key:"categoria",label:"Categoria",width:"150px"},
  {key:"servico",label:"Serviço",width:"150px"},
  {key:"problema",label:"Problema",width:"120px"},
  {key:"descricao",label:"Descrição",width:"200px"},
  {key:"rechamado",label:"Rechamado?",width:"100px"},
  {key:"observacao",label:"Observação",width:"150px"},
];

const AC_COLUNAS = [
  {key:"num",label:"Nº",width:"50px"},
  {key:"situacao",label:"Situação",width:"200px"},
  {key:"estabelecimento",label:"Estabelecimento",width:"160px"},
  {key:"endereco",label:"Endereço",width:"180px"},
  {key:"sala",label:"Sala",width:"120px"},
  {key:"patrimonio",label:"Patrimônio",width:"100px"},
  {key:"ano_fab",label:"Ano",width:"60px"},
  {key:"marca",label:"Marca",width:"100px"},
  {key:"modelo",label:"Modelo",width:"120px"},
  {key:"serie",label:"Série",width:"120px"},
  {key:"btu",label:"BTU",width:"70px"},
  {key:"quente_frio",label:"Q/F",width:"60px"},
  {key:"tipo",label:"Tipo",width:"120px"},
];

let _plAcData=[];
let _plAcFiltrado=[];
let _celulaAtual=null; // {id, key, label, valor}
let _plTipoAtual="ac";
let plHeaderFilters={ac:{},chamados:{}};
let _plHdrTipo=null,_plHdrCol=null,_plHdrPending=[];
let _plSortState={ac:{col:null,asc:true},chamados:{col:null,asc:true}};

function _plCols(tipo){return tipo==="chamados"?CHAMADOS_COLUNAS:AC_COLUNAS;}
function _plData(tipo){return tipo==="chamados"?_plChamadosData:_plAcData;}
function _plEnsureFilterState(tipo){
  if(!plHeaderFilters[tipo]) plHeaderFilters[tipo]={};
  _plCols(tipo).forEach(c=>{if(!Array.isArray(plHeaderFilters[tipo][c.key])) plHeaderFilters[tipo][c.key]=[];});
  return plHeaderFilters[tipo];
}
function _plHeaderCell(tipo,c){
  return `<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);white-space:nowrap;width:${c.width};border-bottom:1px solid var(--border)">
    <span class="th-sortable-wrap">
      <span onclick="_plSortBy('${tipo}','${c.key}')" class="th-sort-label">${_sanEsc(c.label)} <span class="sort-icon" id="pl-si-${tipo}-${c.key}"></span></span>
      <span class="hdr-filter-btn" id="pl-hf-${tipo}-${c.key}" onclick="openPlanilhaHeaderFilter(event,'${tipo}','${c.key}')" title="Filtrar">▾</span>
    </span>
  </th>`;
}
function _plUnique(tipo,col){
  return [...new Set((_plData(tipo)||[]).map(r=>r?.[col]).map(v=>v==null?'':String(v)))]
    .sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
}
function _plApplyFilters(tipo){
  _plEnsureFilterState(tipo);
  const busca=normalizar(document.getElementById("pl-busca")?.value||"");
  let rows=(_plData(tipo)||[]).filter(r=>{
    if(busca&&!_plCols(tipo).some(c=>normalizar(String(r[c.key]||"")).includes(busca))) return false;
    for(const [col,sel] of Object.entries(plHeaderFilters[tipo])){
      if(!sel.length) continue;
      const val=String(r[col]??'');
      if(!sel.includes(val)) return false;
    }
    return true;
  });
  const sort=_plSortState[tipo]||{};
  if(sort.col){
    rows=[...rows].sort((a,b)=>{
      const va=a[sort.col]??'',vb=b[sort.col]??'';
      const na=Number(String(va).replace(',','.')),nb=Number(String(vb).replace(',','.'));
      let cmp=(!Number.isNaN(na)&&!Number.isNaN(nb)&&String(va).trim()!==''&&String(vb).trim()!=='')
        ?na-nb
        :String(va).localeCompare(String(vb),'pt-BR',{numeric:true,sensitivity:'base'});
      return sort.asc?cmp:-cmp;
    });
  }
  return rows;
}
function _plUpdateHdrBtns(tipo){
  _plEnsureFilterState(tipo);
  Object.keys(plHeaderFilters[tipo]).forEach(col=>{
    const btn=document.getElementById(`pl-hf-${tipo}-${col}`);
    if(btn) btn.classList.toggle('active',(plHeaderFilters[tipo][col]||[]).length>0);
  });
}
function _plUpdateSortIcons(tipo){
  const sort=_plSortState[tipo]||{};
  _plCols(tipo).forEach(c=>{
    const el=document.getElementById(`pl-si-${tipo}-${c.key}`);
    if(el) el.textContent=sort.col===c.key?(sort.asc?' ▲':' ▼'):'';
  });
}
function _plRerender(tipo){
  if(tipo==="chamados") filtrarPlanilhaChamados();
  else filtrarPlanilhaAC();
}
function _plSortBy(tipo,col){
  const s=_plSortState[tipo]||{col:null,asc:true};
  _plSortState[tipo]={col,asc:s.col===col?!s.asc:true};
  _plRerender(tipo);
}
function _ensurePlanilhaHdrDropdown(){
  let dd=document.getElementById('pl-hdr-dropdown'); if(dd) return dd;
  dd=document.createElement('div'); dd.id='pl-hdr-dropdown';
  dd.style.cssText='display:none;position:fixed;z-index:9999;background:var(--dropdown-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:240px;padding:.625rem';
  dd.innerHTML=`<div style="display:flex;flex-direction:column;gap:1px;margin-bottom:.375rem">
      <button onclick="_plHdrSort(true)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↑ Classificar A → Z</button>
      <button onclick="_plHdrSort(false)" style="text-align:left;font-size:12px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text2);border-radius:4px">↓ Classificar Z → A</button>
    </div><hr style="border:none;border-top:1px solid var(--border);margin:.375rem 0">
    <input type="text" id="pl-hdr-search" placeholder="🔍 Buscar..." oninput="_plHdrRenderList()" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.375rem;outline:none;box-sizing:border-box;background:var(--surface);color:var(--text)">
    <div style="font-size:11px;color:var(--text3);margin-bottom:.375rem">Selecionar <a href="#" onclick="_plHdrSelectAll(true);return false" style="color:var(--blue);text-decoration:none">tudo: <span id="pl-hdr-count">0</span></a> — <a href="#" onclick="_plHdrSelectAll(false);return false" style="color:var(--blue);text-decoration:none">Limpar</a></div>
    <div id="pl-hdr-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-bottom:.5rem"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="closePlanilhaHeaderFilter()" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;color:var(--text2)">Cancelar</button>
      <button onclick="confirmPlanilhaHeaderFilter()" style="font-size:12px;padding:5px 16px;border:none;border-radius:var(--radius-sm);background:var(--green);color:#fff;cursor:pointer;font-weight:600">OK</button>
    </div>`;
  document.body.appendChild(dd); return dd;
}
function openPlanilhaHeaderFilter(e,tipo,col){
  e.stopPropagation();
  const dd=_ensurePlanilhaHdrDropdown();
  if(_plHdrTipo===tipo&&_plHdrCol===col&&dd.style.display==='block'){closePlanilhaHeaderFilter();return;}
  _plHdrTipo=tipo; _plHdrCol=col;
  const all=_plUnique(tipo,col),cur=(_plEnsureFilterState(tipo)[col]||[]);
  _plHdrPending=cur.length?[...cur]:[...all];
  document.getElementById('pl-hdr-search').value=''; _plHdrRenderList();
  const rect=e.currentTarget.getBoundingClientRect(); dd.style.display='block';
  const ddW=dd.offsetWidth||240; let left=rect.left+window.scrollX;
  if(left+ddW>window.scrollX+window.innerWidth-8) left=window.scrollX+window.innerWidth-ddW-8;
  dd.style.top=(rect.bottom+window.scrollY+4)+'px'; dd.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.getElementById('pl-hdr-search').focus(),50);
}
function _plHdrRenderList(){
  if(!_plHdrTipo||!_plHdrCol) return;
  const q=normalizar(document.getElementById('pl-hdr-search').value);
  const all=_plUnique(_plHdrTipo,_plHdrCol);
  const vis=q?all.filter(v=>normalizar(v||'(vazio)').includes(q)):all;
  document.getElementById('pl-hdr-count').textContent=all.length;
  document.getElementById('pl-hdr-list').innerHTML=vis.map(v=>{
    const checked=_plHdrPending.includes(v)?'checked':'';
    const safe=String(v).replace(/"/g,'&quot;');
    const label=v||'(vazio)';
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 9px;cursor:pointer;font-size:13px;border-radius:3px;color:var(--text)"><input type="checkbox" value="${safe}" ${checked} onchange="_plHdrToggle(this)" style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0"> ${_sanEsc(label)}</label>`;
  }).join('')||'<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">Nenhum resultado</div>';
}
function _plHdrToggle(cb){if(cb.checked){if(!_plHdrPending.includes(cb.value))_plHdrPending.push(cb.value);}else{_plHdrPending=_plHdrPending.filter(x=>x!==cb.value);}}
function _plHdrSelectAll(all){if(!_plHdrTipo||!_plHdrCol)return;_plHdrPending=all?_plUnique(_plHdrTipo,_plHdrCol):[];_plHdrRenderList();}
function _plHdrSort(asc){if(!_plHdrTipo||!_plHdrCol)return;_plSortState[_plHdrTipo]={col:_plHdrCol,asc};closePlanilhaHeaderFilter();_plRerender(_plHdrTipo);}
function confirmPlanilhaHeaderFilter(){
  if(!_plHdrTipo||!_plHdrCol) return;
  const all=_plUnique(_plHdrTipo,_plHdrCol),filters=_plEnsureFilterState(_plHdrTipo);
  filters[_plHdrCol]=(_plHdrPending.length===0||_plHdrPending.length===all.length)?[]:[..._plHdrPending];
  const tipo=_plHdrTipo; closePlanilhaHeaderFilter(); _plRerender(tipo);
}
function closePlanilhaHeaderFilter(){const dd=document.getElementById('pl-hdr-dropdown');if(dd)dd.style.display='none';_plHdrTipo=null;_plHdrCol=null;}
document.addEventListener('click',function(e){const dd=document.getElementById('pl-hdr-dropdown');if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&!(e.target.closest&&e.target.closest('.hdr-filter-btn'))){closePlanilhaHeaderFilter();}});

async function carregarPlanilhaAC(){
  _plTipoAtual="ac";
  document.getElementById("pl-loading").style.display="block";
  document.getElementById("pl-table-wrap").style.display="none";
  const {data,error}=await sb.from("inventario_ac").select("*").order("num");
  if(error){document.getElementById("pl-loading").innerHTML=`<div style="color:var(--red)">Erro: ${error.message}</div>`;return;}
  _plAcData=data;
  _plAcFiltrado=_plApplyFilters("ac");
  document.getElementById("btn-add-ac").style.display="block";
  document.getElementById("pl-busca").oninput=filtrarPlanilhaAC;
  renderPlanilhaAC(_plAcFiltrado);
  document.getElementById("pl-loading").style.display="none";
  document.getElementById("pl-table-wrap").style.display="block";
}

function filtrarPlanilhaAC(){
  _plTipoAtual="ac";
  _plAcFiltrado=_plApplyFilters("ac");
  renderPlanilhaAC(_plAcFiltrado);
}

function renderPlanilhaAC(rows){
  // Thead
  document.getElementById("pl-thead").innerHTML=`<tr style="background:var(--surface2)">
    ${AC_COLUNAS.map(c=>_plHeaderCell("ac",c)).join("")}
    <th style="padding:6px 10px;border-bottom:1px solid var(--border);width:60px"></th>
  </tr>`;
  _plUpdateHdrBtns("ac");
  _plUpdateSortIcons("ac");

  // Tbody
  document.getElementById("pl-tbody").innerHTML=rows.map(r=>`
    <tr id="row-ac-${r.id}" style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      ${AC_COLUNAS.map(c=>`
        <td style="padding:6px 10px;max-width:${c.width};white-space:normal;word-break:break-word;cursor:pointer"
            title="${(r[c.key]||"")}"
            onclick="editarCelula('${r.id}','${c.key}','${c.label}',\`${String(r[c.key]||"").replace(/`/g,"'")}\`)">
          ${r[c.key]||"<span style='color:var(--text3)'>—</span>"}
        </td>`).join("")}
      <td style="padding:6px 10px;white-space:nowrap">
        <button onclick="excluirLinhaAC('${r.id}')" style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid var(--red-bg);color:var(--red-text);background:var(--red-bg);cursor:pointer" title="Excluir esta linha">🗑️</button>
      </td>
    </tr>`).join("");

  document.getElementById("pl-count").textContent=`${rows.length} equipamentos`;
}

function editarCelula(id, key, label, valor){
  _celulaAtual={id,key,label};
  document.getElementById("mc-titulo").textContent="Editar: "+label;
  document.getElementById("mc-ctx").textContent="ID: "+id.slice(0,8)+"...";
  document.getElementById("mc-valor").value=valor==="—"?"":valor;
  document.getElementById("mc-msg2").className="fmsg";
  document.getElementById("modal-celula").classList.add("active");
  setTimeout(()=>document.getElementById("mc-valor").select(),100);
}

function fecharModalCelula(){
  document.getElementById("modal-celula").classList.remove("active");
  _celulaAtual=null;
}

async function salvarCelula(){
  if(bloquearSeVisualiz()) return;
  if(!_celulaAtual) return;
  const novoValor=document.getElementById("mc-valor").value.trim();
  const btn=document.querySelector("#modal-celula .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";

  const tabela=_celulaAtual.tabela||"inventario_ac";
  const {error}=await sb.from(tabela)
    .update({[_celulaAtual.key]:novoValor})
    .eq("id",_celulaAtual.id);

  if(error){
    showMsg("mc2","Erro: "+error.message,"err");
    btn.disabled=false;btn.textContent="Salvar";
    return;
  }

  // Atualizar local
  if(tabela==="inventario_ac"){
    const idx=_plAcData.findIndex(r=>r.id===_celulaAtual.id);
    if(idx>=0){
      _plAcData[idx][_celulaAtual.key]=novoValor;
      const acIdx=acRows.findIndex(r=>r.id===_celulaAtual.id);
      if(acIdx>=0) acRows[acIdx][_celulaAtual.key]=novoValor;
    }
    filtrarPlanilhaAC();
  } else if(tabela==="chamados"){
    const idx=_plChamadosData.findIndex(r=>r.id===_celulaAtual.id);
    if(idx>=0) _plChamadosData[idx][_celulaAtual.key]=novoValor;
    filtrarPlanilhaChamados();
  }
  showMsg("mc2","✓ Salvo!","ok");
  btn.disabled=false;btn.textContent="Salvar";
  setTimeout(()=>fecharModalCelula(),800);
}

async function excluirLinhaAC(id){
  if(bloquearSeVisualiz()) return;
  const row=_plAcData.find(r=>r.id===id);
  if(!await uiConfirm(`Excluir equipamento ${row?.estabelecimento||""} - Pat: ${row?.patrimonio||""}?`)) return;
  const {data, error}=await sb.from("inventario_ac").delete().eq("id",id).select();
  if(error){alert("Erro: "+error.message);return;}
  if(!data || data.length===0){alert("⚠️ Sem permissão para excluir. Verifique a política RLS da tabela 'inventario_ac' no Supabase.");return;}
  _plAcData=_plAcData.filter(r=>r.id!==id);
  acRows=acRows.filter(r=>r.id!==id);
  filtrarPlanilhaAC();
}

function filtrarNlEmendaAC(){
  const termo=normalizar(document.getElementById('nl-emenda-busca')?.value||'');
  const opts=document.getElementById('nl-emenda-options');
  if(!termo){opts.style.display='none';return;}
  carregarEmendaItensVeaCache().then(()=>{
    const lista=(_emendaItensVeaCache||[]).filter(ei=>normalizar(`${ei.emenda} ${ei.item} ${ei.emenda_ref?.ano||''}`).includes(termo)).slice(0,40);
    opts.innerHTML=lista.length
      ?lista.map(ei=>`<div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''" onclick="selecionarNlEmendaAC('${ei.id}','${_sanEsc(ei.emenda)}',${ei.emenda_ref?.ano||0},'${_sanEsc(ei.item.replace(/'/g,"\\'"))}')"><b>Em. ${_sanEsc(ei.emenda)}/${ei.emenda_ref?.ano||'?'}</b> <span style="color:var(--text2)">${_sanEsc(ei.item)}</span></div>`).join('')
      :'<div style="padding:8px 10px;color:var(--text3);font-size:12px">Nenhum item encontrado</div>';
    opts.style.display='block';
  });
}
function selecionarNlEmendaAC(id,emenda,ano,item){
  document.getElementById('nl-emenda-item-id').value=id;
  document.getElementById('nl-emenda-busca').value=`Em. ${emenda}/${ano} — ${item}`;
  const sel=document.getElementById('nl-emenda-sel'); sel.textContent=`✓ Em. ${emenda}/${ano} — ${item}`; sel.style.display='block';
  document.getElementById('nl-emenda-options').style.display='none';
}
function adicionarLinhaAC(){
  ["nl-num","nl-situacao","nl-estab","nl-end","nl-sala","nl-pat","nl-ano","nl-marca","nl-modelo","nl-serie","nl-btu","nl-qf","nl-tipo","nl-emenda-busca","nl-emenda-item-id"]
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  const sel=document.getElementById('nl-emenda-sel'); if(sel)sel.style.display='none';
  const opts=document.getElementById('nl-emenda-options'); if(opts)opts.style.display='none';
  document.getElementById("nl-msg").className="fmsg";
  document.getElementById("modal-nova-linha-ac").classList.add("active");
}

async function salvarNovaLinhaAC(){
  if(bloquearSeVisualiz()) return;
  const btn=document.querySelector("#modal-nova-linha-ac .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const emendaItemId=document.getElementById("nl-emenda-item-id").value.trim()||null;
  const item={
    num:document.getElementById("nl-num").value.trim(),
    situacao:document.getElementById("nl-situacao").value.trim(),
    estabelecimento:document.getElementById("nl-estab").value.trim(),
    endereco:document.getElementById("nl-end").value.trim(),
    sala:document.getElementById("nl-sala").value.trim(),
    patrimonio:document.getElementById("nl-pat").value.trim(),
    ano_fab:document.getElementById("nl-ano").value.trim(),
    marca:document.getElementById("nl-marca").value.trim(),
    modelo:document.getElementById("nl-modelo").value.trim(),
    serie:document.getElementById("nl-serie").value.trim(),
    btu:document.getElementById("nl-btu").value.trim(),
    quente_frio:document.getElementById("nl-qf").value.trim(),
    tipo:document.getElementById("nl-tipo").value.trim(),
    emenda_item_id:emendaItemId,
  };
  const {data,error}=await sb.from("inventario_ac").insert(item).select().single();
  if(error){showMsg("nl","Erro: "+error.message,"err");btn.disabled=false;btn.textContent="Salvar";return;}
  _plAcData.push(data);
  const emendaLabel=document.getElementById('nl-emenda-sel').textContent.replace('✓ ','');
  acRows.push({...item,id:data.id,qf:item.quente_frio,emenda_item_id:emendaItemId,emenda_label:emendaItemId?emendaLabel:null});
  filtrarPlanilhaAC();
  showMsg("nl","✓ Equipamento adicionado!","ok");
  btn.disabled=false;btn.textContent="Salvar";
  setTimeout(()=>document.getElementById("modal-nova-linha-ac").classList.remove("active"),1200);
}

function mudarPlanilha(tipo){
  // Atualizar botões
  document.querySelectorAll('[id^="pl-btn-"]').forEach(b=>{
    b.style.background="var(--surface)";b.style.color="var(--text2)";b.style.border="1px solid var(--border)";
  });
  const btn=document.getElementById("pl-btn-"+tipo);
  if(btn){btn.style.background="var(--blue)";btn.style.color="#fff";btn.style.border="none";}

  if(tipo==="ac") carregarPlanilhaAC();
  if(tipo==="chamados") carregarPlanilhaChamados();
}

// ═══ CHAMADOS NOVOS (SUPABASE) ═══
let chamadosNovosRows = [];
let chamadosNovosCarregado = false;
let _cnAtual = null;

async function loadChamadosNovos(){
  document.getElementById("cn-loading").style.display="block";
  document.getElementById("cn-main").style.display="none";
  const {data,error}=await sb.from("chamados").select("*").order("created_at",{ascending:false});
  if(error){document.getElementById("cn-loading").innerHTML=`<div style="color:var(--red)">Erro: ${error.message}</div>`;return;}

  // Carregar controle separadamente
  const {data:controleData}=await sb.from("chamados_controle").select("*");
  const controleMap={};
  if(controleData) controleData.forEach(c=>controleMap[c.protocolo]=c);

  // Carregar anexos de fotos
  const {data:anexosData}=await sb.from("chamados_anexos").select("*");
  const anexosMap={};
  if(anexosData) anexosData.forEach(a=>{
    if(!anexosMap[a.chamado_id]) anexosMap[a.chamado_id]=[];
    anexosMap[a.chamado_id].push(a);
  });

  chamadosNovosRows=data.map(r=>({...r, _controle: controleMap[r.protocolo]||null, _anexos: anexosMap[r.id]||[]}));
  chamadosNovosCarregado=true;
  popularFiltrosCN();
  filtrarChamadosNovos();
  atualizarBadgeCN();
  document.getElementById("cn-loading").style.display="none";
  document.getElementById("cn-main").style.display="block";
  setTimeout(_setTableOffset,50);
}

function getControleCN(row){
  if(row._controle) return row._controle;
  return {status:"Aguardando abertura",data_atendimento:"",empresa:"",os:"",feito:"",obs:""};
}

function atualizarBadgeCN(){
  const aguardando=chamadosNovosRows.filter(r=>{
    const s=getControleCN(r).status;
    return !s||s==="Aguardando abertura";
  }).length;
  const badge=document.getElementById("badge-chamados-novos");
  if(badge){
    if(aguardando>0){badge.textContent=aguardando;badge.style.display="inline";}
    else badge.style.display="none";
  }
}

function popularFiltrosCN(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Todas</option>'+vals.map(v=>`<option value="${v}">${v}</option>`).join("")};
  sel("cn-unidade",[...new Set(chamadosNovosRows.map(r=>r.unidade).filter(Boolean))].sort());
  sel("cn-categoria",[...new Set(chamadosNovosRows.map(r=>r.categoria).filter(Boolean))].sort());
  sel("cn-servico",[...new Set(chamadosNovosRows.map(r=>r.servico).filter(Boolean))].sort());
}

function clearAllChamadosNovos(){
  ["cn-unidade","cn-categoria","cn-status","cn-urgencia","cn-servico","cn-busca"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""});
  filtrarChamadosNovos();
}

function filtrarChamadosNovos(){
  const un=document.getElementById("cn-unidade")?.value||"";
  const cat=document.getElementById("cn-categoria")?.value||"";
  const st=document.getElementById("cn-status")?.value||"";
  const busca=document.getElementById("cn-busca")?.value||"";

  const urg=document.getElementById("cn-urgencia")?.value||"";
  const serv=document.getElementById("cn-servico")?.value||"";
  let rows=chamadosNovosRows.filter(r=>{
    if(un&&r.unidade!==un) return false;
    if(cat&&r.categoria!==cat) return false;
    if(urg&&r.grau_urgencia!==urg) return false;
    if(serv&&r.servico!==serv) return false;
    const ctrl=getControleCN(r);
    const stAtual=ctrl.status||"Aguardando abertura";
    if(st&&stAtual!==st) return false;
    if(busca&&!matchBusca([r.equipamento,r.patrimonio,r.protocolo,r.unidade,r.descricao,r.responsavel,r.fabricante,r.serie].join(" "),busca)) return false;
    return true;
  });

  const abertos=rows.filter(r=>{const s=getControleCN(r).status;return !s||s==="Aguardando abertura";}).length;
  const andamento=rows.filter(r=>getControleCN(r).status==="Aberto").length;
  const concluidos=rows.filter(r=>getControleCN(r).status==="Concluído").length;
  document.getElementById("cnm-total").textContent=rows.length;
  document.getElementById("cnm-abertos").textContent=abertos;
  document.getElementById("cnm-andamento").textContent=andamento;
  document.getElementById("cnm-concluidos").textContent=concluidos;
  document.getElementById("cn-count").textContent=`${rows.length} chamados`;

  document.getElementById("cn-body").innerHTML=rows.map(r=>{
    const ctrl=getControleCN(r);
    const aberto=ctrl.status==="Aberto";
    const data=r.carimbo||new Date(r.created_at).toLocaleString("pt-BR");
    const aguardando=!ctrl.status||ctrl.status==="Aguardando abertura";
    const pendente=ctrl.status==="Pendente";
    const rowBg=aguardando?'background:var(--amber-bg)':pendente?'background:color-mix(in srgb,var(--amber-bg) 60%,transparent)':'';
    return`<tr style="${rowBg}">
      <td><div style="display:flex;align-items:center;gap:6px">
        ${podeEditar('chamados-novos')?`<button onclick="abrirModalCN('${r.id}')" class="btn-secondary btn-compact" title="Atualizar">✏️ Atualizar</button>`:""}
        ${kebabMenuHtml([
          {label:'📄 Gerar PDF',onclick:`gerarPDFChamadoNovo('${r.id}')`},
          {label:'📧 Enviar por e-mail',onclick:`enviarEmailChamadoNovo('${r.id}')`}
        ])}
      </div></td>
      <td style="white-space:nowrap">${(r._anexos&&r._anexos.length>0)?r._anexos.map((a,i)=>a.apagado_em?`<span style="font-size:10px;color:var(--text3)">Removida</span>`:`<button onclick="verFotoChamado('${a.storage_path}')" style="font-size:11px;padding:3px 7px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer;margin:1px" title="${_sanEsc(a.nome_original||'')}">📷 Foto ${i+1}</button>`).join(''):'<span style="font-size:10px;color:var(--text3)">—</span>'}</td>
      <td>${statusBadgeChamado(ctrl.status||"Aguardando abertura")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.protocolo||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(data)}</td>
      <td style="font-size:12px;white-space:nowrap">${_sanEsc(r.unidade||"—")}</td>
      <td class="td-trunc" title="${_sanEsc(r.equipamento||'')}">${_sanEsc(r.equipamento||"—")}</td>
      <td class="td-trunc" style="max-width:200px" title="${_sanEsc(r.descricao||'')}">${_sanEsc(r.descricao||"—")}</td>
      <td style="font-size:11px" class="td-trunc">${_sanEsc(r.endereco||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.telefone||"—")}</td>
      <td style="font-size:11px" class="td-trunc">${_sanEsc(r.responsavel||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.email_retorno||"—")}</td>
      <td style="font-size:11px;white-space:nowrap">${_sanEsc(r.grau_urgencia||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.patrimonio||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.fabricante||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.serie||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.categoria||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.servico||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.problema||"—")}</td>
      <td style="font-size:11px">${_sanEsc(r.rechamado||"—")}</td>
    </tr>`;
  }).join("")||`<tr><td colspan="20"><div class="table-empty"><svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>Nenhum chamado encontrado</div></td></tr>`;
}

async function verFotoChamado(path){
  const {data,error}=await sb.storage.from('chamados-fotos').createSignedUrl(path,3600);
  if(error||!data?.signedUrl){alert('Não foi possível gerar o link da foto. Tente novamente.');return;}
  window.open(data.signedUrl,'_blank');
}

async function enviarEmailChamadoNovo(id){
  const r=chamadosNovosRows.find(x=>x.id===id);
  if(!r){alert("Chamado não encontrado.");return;}
  const ctrl=getControleCN(r);
  const cpl=ctrl.cpl_contrato||ctrl.cpl||ctrl.contrato||"";
  const contratoId=ctrl.contrato_id||null;
  if(!contratoId&&!cpl){
    alert("Este chamado ainda não possui uma CPL vinculada. Atualize o chamado para o status Aberto e selecione o contrato.");
    return;
  }
  let emailEmpresa="";
  if(contratoId||cpl){
    const local=(contratosRows||[]).find(c=>(contratoId&&String(c.id)===String(contratoId))||c.cpl===cpl||c.numero_contrato===cpl);
    emailEmpresa=local?.email_empresa||"";
    if(!emailEmpresa){
      let q=sb.from("contratos").select("email_empresa").limit(1);
      q=contratoId?q.eq("id",contratoId):q.eq("cpl",cpl);
      const {data}=await q;
      emailEmpresa=data?.[0]?.email_empresa||"";
    }
  }
  emailEmpresa=String(emailEmpresa||"").trim();
  if(!emailEmpresa){
    alert(`A empresa do contrato ${cpl||contratoId} ainda não possui e-mail cadastrado. Acesse Contratos e clique no botão "Vinculações" desse contrato.`);
    return;
  }
  const assunto=[r.protocolo,r.unidade,r.equipamento].map(v=>String(v||"").trim()).filter(Boolean).join(" - ");
  const corpo=`Segue chamado de manutenção:\n\nProtocolo: ${r.protocolo||'—'}\nData de abertura: ${r.carimbo||new Date(r.created_at).toLocaleString("pt-BR")||'—'}\nEquipamento: ${r.equipamento||'—'}\nPatrimônio: ${r.patrimonio||'—'}\nUnidade: ${r.unidade||'—'}\nEndereço: ${r.endereco||'—'}\nResponsável: ${r.responsavel||'—'}\nTelefone: ${r.telefone||'—'}\nProblema relatado: ${r.descricao||r.problema||'—'}\nUrgência: ${r.grau_urgencia||'—'}\n\nAtenciosamente,`;
  const emailsList=emailEmpresa.split(',').map(e=>e.trim()).filter(Boolean).join(',');
  const url=`mailto:${emailsList}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.location.href=url;
}

// carrega contratos no select do modal de chamados novos
let _contratosParaModal = [];
async function _ensureContratosModal(){
  if(_contratosParaModal.length&&_contratosParaModal.every(c=>Object.prototype.hasOwnProperty.call(c,'valor_mensal'))) return;
  const {data}=await sb.from("contratos").select("id,cpl,numero_contrato,objeto,prestador,status,secao,email_empresa,fornecedor_id,processo_id,valor_mensal")
    .eq("status","VIGENTE")
    .ilike("secao","SUEQ%")
    .order("cpl");
  _contratosParaModal=(data||[]);
  const sel=document.getElementById("mcn-cpl");
  const busca=document.getElementById("mcn-cpl-busca");
  if(busca) busca.value='';
  if(sel){
    sel.innerHTML='<option value="">Selecione o contrato...</option>'+
      _contratosParaModal.map(c=>`<option value="${c.cpl}" data-id="${c.id}" data-prestador="${(c.prestador||'').replace(/"/g,'&quot;')}">${c.cpl} — ${c.objeto||''} — ${c.prestador||''}</option>`).join('');
  }
}

function _filtrarCplModal(){
  const q=(document.getElementById('mcn-cpl-busca').value||'').toLowerCase().trim();
  const sel=document.getElementById('mcn-cpl'); if(!sel) return;
  const list=_contratosParaModal.filter(c=>!q||[c.cpl,c.objeto,c.prestador].filter(Boolean).join(' ').toLowerCase().includes(q));
  const cur=sel.value;
  sel.innerHTML='<option value="">Selecione o contrato...</option>'+
    list.map(c=>`<option value="${c.cpl}" data-id="${c.id}" data-prestador="${(c.prestador||'').replace(/"/g,'&quot;')}">${c.cpl} — ${c.objeto||''} — ${c.prestador||''}</option>`).join('');
  if(cur) sel.value=cur; // restaura seleção se ainda na lista
}

function _mcnOnStatusChange(){
  const v=document.getElementById("mcn-status").value;
  document.getElementById("mcn-invalido-wrap").style.display=v==="Inválido"?"block":"none";
  document.getElementById("mcn-pendente-wrap").style.display=v==="Pendente"?"block":"none";
  document.getElementById("mcn-cpl-wrap").style.display=(v==="Inválido"||v==="Pendente")?"none":"block";
  if(v==="Aberto") _ensureContratosModal();
}

function abrirModalCN(id){
  const r=chamadosNovosRows.find(x=>x.id===id);
  if(!r) return;
  _cnAtual=id;
  const ctrl=getControleCN(r);
  document.getElementById("mcn-info").textContent=`${r.protocolo} · ${r.equipamento} · ${r.unidade}`;
  const _st=ctrl.status||"Aguardando abertura";
  document.getElementById("mcn-status").value=_st;
  document.getElementById("mcn-invalido-wrap").style.display=_st==="Inválido"?"block":"none";
  document.getElementById("mcn-pendente-wrap").style.display=_st==="Pendente"?"block":"none";
  document.getElementById("mcn-cpl-wrap").style.display=(_st==="Inválido"||_st==="Pendente")?"none":"block";
  document.getElementById("mcn-motivo-invalido").value=(_st==="Inválido"?ctrl.motivo_invalido:"")||"";
  document.getElementById("mcn-motivo-pendente").value=(_st==="Pendente"?ctrl.motivo_invalido:"")||"";

  document.getElementById("mcn-msg").className="fmsg";
  // Carrega contratos e define o selecionado
  _ensureContratosModal().then(()=>{
    const sel=document.getElementById("mcn-cpl");
    if(sel && ctrl.cpl_contrato) sel.value=ctrl.cpl_contrato;
  });
  document.getElementById("modal-cn").classList.add("active");
}

async function salvarChamadoNovo(){
  if(!podeEditar('chamados-novos')){alert("Sem permissão.");return;}
  if(!_cnAtual) return;
  const btn=document.querySelector("#modal-cn .btn-primary");
  btn.disabled=true;btn.textContent="Salvando...";
  const _status=document.getElementById("mcn-status").value;

  // Validação: CPL obrigatório se Aberto
  const cplSel=document.getElementById("mcn-cpl");
  const cplVal=cplSel?.value||"";
  if(_status==="Aberto" && !cplVal){
    showMsg("mcn","Selecione o contrato (CPL) para salvar como Aberto.","err");
    btn.disabled=false;btn.textContent="Salvar";return;
  }
  // Validação: motivo obrigatório se Pendente
  const motivoPendente=document.getElementById("mcn-motivo-pendente").value.trim();
  if(_status==="Pendente" && !motivoPendente){
    showMsg("mcn","Informe o motivo para salvar como Pendente.","err");
    btn.disabled=false;btn.textContent="Salvar";return;
  }
  const cplOpt=cplSel?.options[cplSel.selectedIndex];
  const contratoId=cplOpt?.dataset?.id?parseInt(cplOpt.dataset.id):null;
  const empresaAuto=cplOpt?.dataset?.prestador||null;

  const dados={
    protocolo: chamadosNovosRows.find(r=>r.id===_cnAtual)?.protocolo,
    status:_status,
    motivo_invalido:_status==="Inválido"?document.getElementById("mcn-motivo-invalido").value||null:(_status==="Pendente"?motivoPendente:null),
    cpl_contrato: (_status!=="Inválido"&&_status!=="Pendente")?cplVal||null:null,
    contrato_id: (_status!=="Inválido"&&_status!=="Pendente")?contratoId:null,
    empresa: (_status!=="Inválido"&&_status!=="Pendente")?empresaAuto:null,
  };
  const {error}=await sb.from("chamados_controle").upsert({...dados},{onConflict:"protocolo"});
  if(error){showMsg("mcn","Erro: "+error.message,"err");btn.disabled=false;btn.textContent="Salvar";return;}
  const r=chamadosNovosRows.find(x=>x.id===_cnAtual);
  if(r){ r._controle=dados; }
  filtrarChamadosNovos();
  atualizarBadgeCN();
  // atualiza badge da fiscalização
  atualizarBadgeFisc();
  // força reload da fiscalização se já foi carregada
  if(fiscalizacaoCarregado){ fiscalizacaoCarregado=false; }
  showMsg("mcn","✓ Salvo!","ok");
  btn.disabled=false;btn.textContent="Salvar";
  setTimeout(()=>document.getElementById("modal-cn").classList.remove("active"),1200);
}

async function gerarPDFChamadoNovo(id){
  const r=chamadosNovosRows.find(x=>x.id===id);
  if(!r) return;
  // Reutilizar gerarPDFChamado adaptando o objeto
  const chamadoAdaptado={
    protocolo:r.protocolo,
    carimbo:r.carimbo,
    data_solicitacao:r.data_solicitacao,
    unidade:r.unidade,
    endereco:r.endereco||"",
    telefone:r.telefone||"",
    responsavel:r.responsavel||"",
    grau_urgencia:r.grau_urgencia||"",
    patrimonio:r.patrimonio||"",
    equipamento:r.equipamento||"",
    fabricante:r.fabricante||"",
    serie:r.serie||"",
    categoria:r.categoria||"",
    servico:r.servico||"",
    problema:r.problema||"",
    descricao:r.descricao||"",
    rechamado:r.rechamado||"",
    data_rechamado:r.data_rechamado||"",
    email_retorno:r.email_retorno||"",
  };
  // Adicionar temporariamente ao chamadosRows e chamar PDF
  const tempIdx=chamadosRows.findIndex(x=>x.protocolo===r.protocolo);
  if(tempIdx<0) chamadosRows.push(chamadoAdaptado);
  await gerarPDFChamado(r.protocolo,getControleCN(r));
  if(tempIdx<0) chamadosRows.pop();
}

let _plChamadosData = [];
let _plChamadosFiltrado = [];

async function carregarPlanilhaChamados(){
  _plTipoAtual="chamados";
  document.getElementById("pl-loading").style.display="block";
  document.getElementById("pl-table-wrap").style.display="none";
  document.getElementById("btn-add-ac").style.display="none"; // ocultar botão add AC
  const {data,error}=await sb.from("chamados").select("*").order("created_at",{ascending:false});
  if(error){document.getElementById("pl-loading").innerHTML=`<div style="color:var(--red)">Erro: ${error.message}</div>`;return;}
  _plChamadosData=data;
  _plChamadosFiltrado=_plApplyFilters("chamados");
  renderPlanilhaChamados(_plChamadosFiltrado);
  document.getElementById("pl-loading").style.display="none";
  document.getElementById("pl-table-wrap").style.display="block";
  // Atualizar busca para chamados
  document.getElementById("pl-busca").oninput=filtrarPlanilhaChamados;
  document.getElementById("pl-count").textContent=`${data.length} chamados`;
}

function filtrarPlanilhaChamados(){
  _plTipoAtual="chamados";
  _plChamadosFiltrado=_plApplyFilters("chamados");
  renderPlanilhaChamados(_plChamadosFiltrado);
}

function renderPlanilhaChamados(rows){
  document.getElementById("pl-thead").innerHTML=`<tr style="background:var(--surface2)">
    ${CHAMADOS_COLUNAS.map(c=>_plHeaderCell("chamados",c)).join("")}
    <th style="padding:6px 10px;border-bottom:1px solid var(--border);width:60px"></th>
  </tr>`;
  _plUpdateHdrBtns("chamados");
  _plUpdateSortIcons("chamados");

  document.getElementById("pl-tbody").innerHTML=rows.map(r=>`
    <tr id="row-ch-${r.id}" style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      ${CHAMADOS_COLUNAS.map(c=>`
        <td style="padding:6px 10px;max-width:${c.width};white-space:normal;word-break:break-word;cursor:pointer"
            title="${String(r[c.key]||"")}"
            onclick="editarCelulaChamado('${r.id}','${c.key}','${c.label}',\`${String(r[c.key]||"").replace(/\`/g,"'")}\`)">
          ${r[c.key]||"<span style='color:var(--text3)'>—</span>"}
        </td>`).join("")}
      <td style="padding:6px 10px;white-space:nowrap">
        <button onclick="excluirLinhaChamado('${r.id}')" style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid var(--red-bg);color:var(--red-text);background:var(--red-bg);cursor:pointer" title="Excluir">🗑️</button>
      </td>
    </tr>`).join("");

  document.getElementById("pl-count").textContent=`${rows.length} chamados`;
}

function editarCelulaChamado(id, key, label, valor){
  _celulaAtual={id, key, label, tabela:"chamados"};
  document.getElementById("mc-titulo").textContent="Editar: "+label;
  document.getElementById("mc-ctx").textContent="Chamado ID: "+id.slice(0,8)+"...";
  document.getElementById("mc-valor").value=valor==="—"?"":valor;
  document.getElementById("mc-msg2").className="fmsg";
  document.getElementById("modal-celula").classList.add("active");
  setTimeout(()=>document.getElementById("mc-valor").select(),100);
}

async function excluirLinhaChamado(id){
  if(bloquearSeVisualiz()) return;
  const row=_plChamadosData.find(r=>r.id===id);
  if(!await uiConfirm(`Excluir chamado ${row?.protocolo||""}?`)) return;
  const {data, error}=await sb.from("chamados").delete().eq("id",id).select();
  if(error){alert("Erro: "+error.message);return;}
  if(!data || data.length===0){alert("⚠️ Sem permissão para excluir. Verifique a política RLS da tabela 'chamados' no Supabase.");return;}
  const protocolo=row?.protocolo;
  if(protocolo) await sb.from("chamados_controle").delete().eq("protocolo",protocolo);
  _plChamadosData=_plChamadosData.filter(r=>r.id!==id);
  filtrarPlanilhaChamados();
}

function podeEditar(tabKey){
  if(_isAdmin()) return true;
  return userCanEdit(tabKey || window._activeTab || 'dashboard');
}

function bloquearSeVisualiz(tabKey){
  if(!podeEditar(typeof tabKey==='string'?tabKey:undefined)){
    alert("⛔ Você não tem permissão para editar nesta aba.");
    return true;
  }
  return false;
}

// ── Carrega o estado do fluxo (licitação/contrato/AF/recebimento) por emenda_item_id ──
const _flowAddUnique=(map,key,val)=>{
  if(!key||!val) return;
  const s=map[key]=map[key]||new Set();
  String(val).split(/[;,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>s.add(x));
};
const _flowLatestDate=(a,b)=>{
  const da=_toISODate(a), db=_toISODate(b);
  if(!da) return db||"";
  if(!db) return da;
  return db>da?db:da;
};
// Busca itens contratados/estimados vinculados às emenda_itens e, em seguida
// (dependente do resultado anterior), o detalhamento de entregas/empenhos/NF por item.
// Os chunks de 200 ids são disparados em paralelo (antes eram sequenciais).
async function _fetchItensFlowData(eiIds){
  const [itemChunks,{data:statusLicRows}]=await Promise.all([
    Promise.all(_chunkArray(eiIds,200).map(slice=>
      sb.from("itens")
        .select("id,emenda_item_id,qtde,valor_contratado,valor_estimado,processo_id,contrato_id,status_lic_id,processos(identificador),contratos(cpl,numero_contrato),fornecedores(razao_social),unidades(nome)")
        .in("emenda_item_id",slice)
    )),
    sb.from("status_opcoes").select("id,nome,ordem,orgao,automatico").eq("contexto","licitacao")
  ]);
  const itensFlow=itemChunks.flatMap(r=>r.data||[]);
  const statusLicById={};
  (statusLicRows||[]).forEach(s=>{ statusLicById[String(s.id)]=s; });
  const itemIds=itensFlow.map(x=>x.id);
  const afByItem={}, empByItem={}, nfByItem={}, unidadeByItem={};
  const chunkResults=await Promise.all(_chunkArray(itemIds,200).map(slice=>Promise.all([
    sb.from("itens_entregas")
      .select("item_id,qtde_autorizada,qtde_recebida,status,af_numero,af_data,data_recebimento,data_entrega_unidade,empenho,nota_fiscal,patrimonio,numero_serie,empenhos(numero),notas_fiscais(numero)")
      .in("item_id",slice),
    sb.from("empenho_itens").select("item_id,empenhos(numero)").in("item_id",slice),
    sb.from("nota_fiscal_itens").select("item_id,notas_fiscais(numero)").in("item_id",slice),
    sb.from("itens_entregas_unidades").select("id,item_id,patrimonio,numero_serie,unidade_seq,recebido_em,notas_fiscais(numero)").in("item_id",slice)
  ])));
  chunkResults.forEach(([{data:afs},{data:emps},{data:nfs},{data:uns}])=>{
    (afs||[]).forEach(a=>{
      if((a.status||"").toLowerCase()==="cancelada") return;
      const m=afByItem[a.item_id]=afByItem[a.item_id]||{aut:0,rec:0,conf:0,afNumero:"",afData:"",dataRecebimento:"",dataEntregaUnidade:"",patrimonios:new Set(),series:new Set(),unidades:[]};
      const aut=Number(a.qtde_autorizada)||0;
      const rec=Number(a.qtde_recebida)||0;
      m.aut+=aut;
      m.rec+=rec;
      if(a.data_entrega_unidade) m.conf+=(rec||aut||1);
      if(!m.afNumero&&a.af_numero) m.afNumero=a.af_numero;
      m.afData=_flowLatestDate(m.afData,a.af_data);
      m.dataRecebimento=_flowLatestDate(m.dataRecebimento,a.data_recebimento);
      m.dataEntregaUnidade=_flowLatestDate(m.dataEntregaUnidade,a.data_entrega_unidade);
      if(a.patrimonio) m.patrimonios.add(a.patrimonio);
      if(a.numero_serie) m.series.add(a.numero_serie);
      _flowAddUnique(empByItem,a.item_id,a.empenhos?.numero||a.empenho);
      _flowAddUnique(nfByItem,a.item_id,a.notas_fiscais?.numero||a.nota_fiscal);
    });
    (emps||[]).forEach(e=>_flowAddUnique(empByItem,e.item_id,e.empenhos?.numero));
    (nfs||[]).forEach(n=>_flowAddUnique(nfByItem,n.item_id,n.notas_fiscais?.numero));
    (uns||[]).forEach(u=>{
      const m=afByItem[u.item_id]=afByItem[u.item_id]||{aut:0,rec:0,conf:0,afNumero:"",afData:"",dataRecebimento:"",dataEntregaUnidade:"",patrimonios:new Set(),series:new Set(),unidades:[]};
      if(u.patrimonio) m.patrimonios.add(u.patrimonio);
      if(u.numero_serie) m.series.add(u.numero_serie);
      if(_unidadeFisicaTemId(u)) m.unidades.push({id:u.id,origem:'aquisicao',patrimonio:u.patrimonio||'',numero_serie:u.numero_serie||'',nota_fiscal:u.notas_fiscais?.numero||'',data_recebimento:_toISODate(u.recebido_em),seq:u.unidade_seq||null});
      _flowAddUnique(nfByItem,u.item_id,u.notas_fiscais?.numero);
      unidadeByItem[u.item_id]=(unidadeByItem[u.item_id]||0)+1;
    });
  });
  return {itensFlow,afByItem,empByItem,nfByItem,unidadeByItem,statusLicById};
}
// Integração ATA RP: atas_execucao → fluxo da Emenda (independente da busca de itens acima).
async function _fetchAtaFlowData(eiIds){
  const _ataExecByEiid={}, _ataItemPlaceholder={};
  const execChunks=await Promise.all(_chunkArray(eiIds,200).map(slice=>
    sb.from("atas_execucao").select("id,ata_item_id,emenda_item_id,qtde,valor,unidade,af_numero,data_af,prev_entrega,dt_entrega,data_entrega_unidade,empenho,nf").in("emenda_item_id",slice)
  ));
  execChunks.forEach(({data:aex})=>{
    if(aex) aex.forEach(r=>{
      const eid=r.emenda_item_id; if(!eid) return;
      (_ataExecByEiid[eid]=_ataExecByEiid[eid]||[]).push(r);
      if(r.ata_item_id) _ataItemPlaceholder[r.ata_item_id]=null;
    });
  });
  const _ataIds=Object.keys(_ataItemPlaceholder);
  const _ataExecIds=Object.values(_ataExecByEiid).flat().map(r=>r.id).filter(Boolean);
  // atas_itens e atas_execucao_unidades dependem só do que foi apurado acima entre si,
  // não uma da outra: buscar as duas em paralelo.
  const [_ataItemChunks,_ataUnidadesChunks]=await Promise.all([
    Promise.all(_chunkArray(_ataIds,200).map(slice=>
      sb.from("atas_itens").select("id,cpl,sim,item,contrato_id,contratos(cpl,numero_contrato)").in("id",slice)
    )),
    Promise.all(_chunkArray(_ataExecIds,200).map(ids=>
      sb.from("atas_execucao_unidades")
        .select("id,exec_id,patrimonio,numero_serie,unidade_seq,recebido_em,notas_fiscais(numero)")
        .in("exec_id",ids)
        .order("unidade_seq",{ascending:true})
    ))
  ]);
  const _ataItemInf={};
  _ataItemChunks.forEach(({data:ait})=>{
    (ait||[]).forEach(i=>{ _ataItemInf[i.id]={cpl:i.cpl||i.contratos?.cpl||'',sim:i.sim||i.contratos?.numero_contrato||'',item:i.item||''}; });
  });
  const _ataUnidadesByExec={};
  _ataUnidadesChunks.forEach(({data:unsAta})=>{
    (unsAta||[]).forEach(u=>{ (_ataUnidadesByExec[String(u.exec_id)]=_ataUnidadesByExec[String(u.exec_id)]||[]).push(u); });
  });
  return {_ataExecByEiid,_ataItemInf,_ataUnidadesByExec};
}
async function _carregarFluxoEmendaItens(eiIds){
  const flow={};
  if(!eiIds||!eiIds.length) return flow;
  // As duas trilhas (itens→entregas/empenhos/NF e atas_execucao→atas_itens/unidades) são
  // independentes entre si: buscar em paralelo em vez de encadeadas em série.
  console.time('fluxo:itens+atas (paralelo)');
  const [itensData,ataData]=await Promise.all([
    _fetchItensFlowData(eiIds),
    _fetchAtaFlowData(eiIds).catch(e=>{ console.error('_carregarFluxoEmendaItens ATA:', e); return null; })
  ]);
  console.timeEnd('fluxo:itens+atas (paralelo)');
  const {itensFlow,afByItem,empByItem,nfByItem,unidadeByItem,statusLicById}=itensData;
  if(ataData){
  const {_ataExecByEiid,_ataItemInf,_ataUnidadesByExec}=ataData;
  Object.entries(_ataExecByEiid).forEach(([eid,execs])=>{
    const f=flow[eid]=flow[eid]||{cpl:"",sim:"",fornecedor:"",unidade:"",valor:0,valorComprometido:0,valorLicitacao:0,valorContratado:0,qtde:0,qtdeLicitacao:0,qtdeContratado:0,valorUnit:null,af:{aut:0,rec:0,conf:0,afNumero:"",afData:"",dataRecebimento:"",dataEntregaUnidade:""},empenhos:new Set(),notas:new Set(),patrimonios:new Set(),series:new Set(),statusLicitacao:new Map(),unidadesFisicas:0,unidades:[],temContrato:false,temProcesso:false};
    let qAta=0, vAta=0;
    execs.forEach(r=>{
      const ai=_ataItemInf[r.ata_item_id]||{};
      if(!f.cpl&&ai.cpl) f.cpl=ai.cpl;
      if(!f.sim&&ai.sim) f.sim=ai.sim;
      if(!f.unidade&&r.unidade) f.unidade=r.unidade;
      if(!f.fornecedor) f.fornecedor="";
      const q=Number(r.qtde)||0; qAta+=q;
      const vl=Number(r.valor)||0; vAta+=vl;
      if(r.af_numero||r.data_af){
        f.af.aut+=q;
        if(!f.af.afNumero&&r.af_numero) f.af.afNumero=r.af_numero;
        f.af.afData=_flowLatestDate(f.af.afData,r.data_af);
      }
      if(r.dt_entrega) f.af.rec+=q;
      if(r.data_entrega_unidade) f.af.conf+=q;
      f.af.dataRecebimento=_flowLatestDate(f.af.dataRecebimento,r.dt_entrega);
      f.af.dataEntregaUnidade=_flowLatestDate(f.af.dataEntregaUnidade,r.data_entrega_unidade);
      if(r.empenho) f.empenhos.add(r.empenho);
      if(r.nf) f.notas.add(r.nf);
      (_ataUnidadesByExec[String(r.id)]||[]).forEach(u=>{
        if(!_unidadeFisicaTemId(u)) return;
        const unidade={id:u.id,origem:'ata',patrimonio:u.patrimonio||'',numero_serie:u.numero_serie||'',nota_fiscal:u.notas_fiscais?.numero||r.nf||'',data_recebimento:_toISODate(u.recebido_em)||_toISODate(r.dt_entrega),seq:u.unidade_seq||null};
        f.unidades.push(unidade);
        if(unidade.patrimonio) f.patrimonios.add(unidade.patrimonio);
        if(unidade.numero_serie) f.series.add(unidade.numero_serie);
      });
    });
    if(qAta>0) f.qtde+=qAta;
    if(vAta>0){ f.valor+=vAta; f.valorComprometido+=vAta; f.valorContratado+=vAta; f.qtdeContratado+=qAta; }
    if(vAta>0 && qAta>0 && f.valorUnit===null){
      f.valorUnit=Number((vAta/qAta).toFixed(2));
      f._qtdeRef=qAta;
    }
    f.temContrato=true;
    f._ataSolicitada=true;
  });
  }
  itensFlow.forEach(it=>{
    const eid=it.emenda_item_id; if(!eid) return;
    const f=flow[eid]=flow[eid]||{cpl:"",sim:"",fornecedor:"",unidade:"",valor:0,valorComprometido:0,valorLicitacao:0,valorContratado:0,qtde:0,qtdeLicitacao:0,qtdeContratado:0,valorUnit:null,af:{aut:0,rec:0,conf:0,afNumero:"",afData:"",dataRecebimento:"",dataEntregaUnidade:""},empenhos:new Set(),notas:new Set(),patrimonios:new Set(),series:new Set(),statusLicitacao:new Map(),unidadesFisicas:0,unidades:[],temContrato:false,temProcesso:false};
    const statusLic=statusLicById[String(it.status_lic_id||"")];
    if(statusLic&&statusLic.nome) f.statusLicitacao.set(String(statusLic.id),statusLic);
    if(!f.cpl) f.cpl=it.contratos?.cpl||it.processos?.identificador||"";
    if(!f.sim && it.contratos?.numero_contrato) f.sim=it.contratos.numero_contrato;
    if(!f.fornecedor && it.fornecedores?.razao_social) f.fornecedor=it.fornecedores.razao_social;
    if(!f.unidade && it.unidades?.nome) f.unidade=it.unidades.nome;
    const itQtde=Number(it.qtde)||0;
    const temContratado=it.valor_contratado!==null&&it.valor_contratado!==undefined;
    const itVlUnit=temContratado?Number(it.valor_contratado)||0:Number(it.valor_estimado)||0;
    f.qtde += itQtde;
    if(temContratado){ f.valor += itVlUnit * itQtde; f.valorComprometido += itVlUnit * itQtde; f.valorContratado += itVlUnit * itQtde; f.qtdeContratado += itQtde; }
    else { f.valorComprometido += itVlUnit * itQtde; f.valorLicitacao += itVlUnit * itQtde; f.qtdeLicitacao += itQtde; }
    // Armazena o valor unitário do item contratado para derivar vl_unitario na aba Emendas
    // Se houver apenas um item no fluxo, o unitário é direto; caso contrário, usamos o do maior qtde
    if(temContratado && itVlUnit>0){
      if(f.valorUnit===null || itQtde>(f._qtdeRef||0)){
        f.valorUnit=itVlUnit;
        f._qtdeRef=itQtde;
      }
    }
    if(it.contrato_id) f.temContrato=true;
    if(it.processo_id) f.temProcesso=true;
    const a=afByItem[it.id];
    if(a){
      f.af.aut+=a.aut; f.af.rec+=a.rec; f.af.conf+=a.conf;
      if(!f.af.afNumero&&a.afNumero) f.af.afNumero=a.afNumero;
      f.af.afData=_flowLatestDate(f.af.afData,a.afData);
      f.af.dataRecebimento=_flowLatestDate(f.af.dataRecebimento,a.dataRecebimento);
      f.af.dataEntregaUnidade=_flowLatestDate(f.af.dataEntregaUnidade,a.dataEntregaUnidade);
      (a.patrimonios||new Set()).forEach(v=>f.patrimonios.add(v));
      (a.series||new Set()).forEach(v=>f.series.add(v));
      (a.unidades||[]).forEach(u=>f.unidades.push(u));
    }
    (empByItem[it.id]||new Set()).forEach(v=>f.empenhos.add(v));
    (nfByItem[it.id]||new Set()).forEach(v=>f.notas.add(v));
    f.unidadesFisicas += Number(unidadeByItem[it.id])||0;
  });
  return flow;
}
function _flowStatusLicitacaoFromFlow(f){
  if(!f||!(f.statusLicitacao instanceof Map)) return "";
  const detalhes=Array.from(f.statusLicitacao.values())
    .filter(s=>s&&s.nome)
    .sort((a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
  const nomes=[...new Set(detalhes.map(s=>String(s.nome).trim()).filter(Boolean))];
  if(!nomes.length) return "";
  return nomes.length===1?nomes[0]:`VÁRIOS: ${nomes.join(" / ")}`;
}
// Deriva um texto de status a partir do estágio do fluxo (catStatus categoriza depois)
function _flowStatusFromFlow(f){
  if(!f) return "";
  const aut=Number(f.af.aut)||0, rec=Number(f.af.rec)||0, conf=Number(f.af.conf)||0, qtde=Number(f.qtde)||0;
  const totalEsperado=aut||qtde||0;
  if(conf>0 && (!totalEsperado || conf>=totalEsperado)) return "ADQUIRIDO/ENTREGUE NA UNIDADE";
  if(conf>0) return "ENTREGA PARCIAL CONFIRMADA NA UNIDADE";
  if(rec>0 && (!aut || rec>=aut)) return "RECEBIDO - AGUARDANDO CONFIRMACAO NA UNIDADE";
  if(rec>0) return "RECEBIDO PARCIAL - AGUARDANDO CONFIRMACAO NA UNIDADE";
  if(aut>0) return "AF EMITIDA - AGUARDANDO ENTREGA/CONFIRMACAO";
  if(f._ataSolicitada) return "AGUARDANDO AF";
  if(f.temContrato) return f.empenhos&&f.empenhos.size?"AGUARDANDO AF":"CONTRATADO - AGUARDANDO EMPENHO/AF";
  if(f.temProcesso) return _flowStatusLicitacaoFromFlow(f)||"EM LICITAÇÃO";
  return "";
}
function _expandirLinhaEmendaPorUnidades(base, unidades){
  const fisicas=(unidades||[]).filter(_unidadeFisicaTemId);
  if(!fisicas.length) return [base];
  const vlUnit=Number(base.vl_unitario)||0;
  const vlUnitCad=Number(base.vl_unitario_cadastrado)||0;
  return fisicas.map((u,idx)=>({
    ...base,
    id:base.id,
    _unidade_row_id:`${base.id}::uf::${u.id||idx+1}`,
    _unidade_id:u.id||null,
    _base_id:base.id,
    _unidadeFisica:true,
    _origem_unidade:u.origem||'',
    _unidade_seq:u.seq||idx+1,
    qtde:'1',
    qtde_cadastrada:base.qtde_cadastrada?'1':base.qtde_cadastrada,
    vl_total:vlUnit||base.vl_total,
    vl_total_cadastrado:vlUnitCad||base.vl_total_cadastrado,
    patrimonio:_unidadeFisicaLabel(u),
    nota_fiscal:u.nota_fiscal||base.nota_fiscal,
    data_entrega:u.data_entrega||u.data_recebimento||base.data_entrega,
    data_atualizacao:u.data_recebimento||base.data_atualizacao
  }));
}
