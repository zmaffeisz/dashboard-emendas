// Consulta em página inteira. As operações de domínio continuam nos handlers existentes.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = value => Number(value) || 0;
const money = value => num(value).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const date = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10).split('-').reverse().join('/') : (value || '—');
const month = value => /^\d{4}-\d{2}$/.test(value || '') ? value : (/^\d{2}\/\d{4}$/.test(value || '') ? value.slice(3)+'-'+value.slice(0,2) : '');
const approvedNF = new Set(['aprovada','aprovada_com_glosa','encaminhada_para_pagamento']);
const excludedMed = new Set(['rascunho','recusada','cancelada']);

export function filterFinanceiroRows(rows, filters) {
  return rows.filter(row => {
    if(filters.contract && String(row.contract.id) !== filters.contract) return false;
    if(filters.status && row.status !== filters.status) return false;
    // Competência desconhecida nunca entra implicitamente em um intervalo.
    const competenceStart = month((row.ciclo_inicio || row.med?.ciclo_inicio || '').slice(0,7)) || month(row.competencia);
    const competenceEnd = month((row.ciclo_fim || row.med?.ciclo_fim || '').slice(0,7)) || competenceStart;
    if((filters.start || filters.end) && !competenceStart) return false;
    if(filters.start && competenceEnd < filters.start) return false;
    if(filters.end && competenceStart > filters.end) return false;
    if(filters.start && filters.end && filters.start > filters.end) return false;
    if(filters.link === 'com' && !row.linked) return false;
    if(filters.link === 'sem' && row.linked) return false;
    if(filters.search.trim() && !normalize(row.search).includes(normalize(filters.search.trim()))) return false;
    return true;
  }).sort((a,b) => {
    const key = filters.sort === 'valor' ? num(b.net)-num(a.net) :
      filters.sort === 'antigas' ? a.sortDate.localeCompare(b.sortDate) : b.sortDate.localeCompare(a.sortDate);
    return key || String(a.id).localeCompare(String(b.id), 'pt-BR', {numeric:true});
  });
}

export function summarizeFinanceiroRows(rows, type) {
  return {
    count: rows.length,
    gross: rows.reduce((sum,row) => sum+num(row.gross),0),
    glosa: rows.reduce((sum,row) => sum+num(row.valor_glosa),0),
    valid: rows.filter(row => type === 'notas' ? approvedNF.has(row.status) : !excludedMed.has(row.status))
      .reduce((sum,row) => sum+num(row.net),0),
    unlinked: rows.filter(row => !row.linked).length
  };
}

// Paginação explícita evita apresentar totais parciais por causa do limite da API.
export async function readFinanceiroTable(client, table, select, ids) {
  const result = [];
  for(let start=0; start<ids.length; start+=100) {
    const batch = ids.slice(start,start+100);
    let offset = 0;
    while(true) {
      const {data,error} = await client.from(table).select(select).in('contrato_id',batch)
        .order('id').range(offset,offset+499);
      if(error) throw new Error(error.message || 'Falha ao consultar '+table);
      result.push(...(data || []));
      if(!data || data.length < 500) break;
      offset += 500;
    }
  }
  return result;
}

export function createFinanceiroWorkspace(adapter) {
  const root = document.getElementById('ct-financeiro-view');
  let active = false, type = 'notas', loading = false, busy = false, generation = 0;
  let data = {notas:[], medicoes:[], termos:[]}, contracts = [], rows = [], page = 1;
  let filters = {contract:'',search:'',status:'',start:'',end:'',link:'',sort:'recentes'};
  const pageSize = 25;
  if(!root || !adapter) return null;

  function shell() {
    root.innerHTML = `<header class="ct-fin-heading"><div><h2>Notas fiscais e medições</h2><p>Consulte a execução, confira vínculos e acompanhe as aprovações dos contratos.</p></div>
      <div class="ct-fin-actions"><button type="button" data-action="refresh" class="btn-secondary">Atualizar</button><button type="button" data-action="export" class="btn-secondary">Exportar CSV</button></div></header>
      <div class="ct-fin-filters">
        <label class="ct-fin-contract">Processo / contrato<select data-filter="contract"><option value="">Selecione um contrato...</option></select></label>
        <label class="ct-fin-search">Buscar<input type="search" data-filter="search" placeholder="NF, processo, fornecedor, fiscal, item, observação..."></label>
        <label>Status<select data-filter="status"></select></label>
        <label>Competência de<input type="month" data-filter="start"></label>
        <label>Até<input type="month" data-filter="end"></label>
        <label>Vínculo<select data-filter="link"></select></label>
        <label>Ordenação<select data-filter="sort"><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option><option value="valor">Maior valor</option></select></label>
        <button type="button" class="btn-secondary" data-action="clear">Limpar filtros</button>
      </div>
      <div id="ct-fin-context" class="ct-fin-context"></div>
      <div class="ct-fin-switch" aria-label="Tipo de registro"><button type="button" data-action="notas">Notas fiscais</button><button type="button" data-action="medicoes">Medições</button><div class="ct-fin-actions" id="ct-fin-create"></div></div>
      <div id="ct-fin-message" role="status" aria-live="polite"></div>
      <div id="ct-fin-metrics" class="ct-fin-metrics"></div>
      <p id="ct-fin-help" class="ct-fin-help"></p>
      <div id="ct-fin-results"></div>
      <div class="ct-fin-pagination"><span id="ct-fin-count" aria-live="polite"></span><div><button type="button" class="btn-secondary" data-action="prev">Anterior</button><span id="ct-fin-page"></span><button type="button" class="btn-secondary" data-action="next">Próxima</button></div></div>`;
    syncControls();
  }
  function syncControls() {
    const contractSelect = root.querySelector('[data-filter="contract"]');
    contractSelect.innerHTML = '<option value="">Selecione um contrato...</option>'+contracts.map(c=>`<option value="${esc(c.id)}">Processo ${esc(c.cpl || 'não informado')} · Contrato ${esc(c.numero_contrato || c.id)} · ${esc(c.prestador || 'Fornecedor não informado')} · ${esc(c.status || '')}</option>`).join('');
    const statuses = {...adapter.labels(type)};
    data[type].forEach(row=>{ if(!statuses[row.status]) statuses[row.status] = adapter.statusLabel(row.status); });
    root.querySelector('[data-filter="status"]').innerHTML = '<option value="">Todos</option>'+Object.entries(statuses).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');
    root.querySelector('[data-filter="link"]').innerHTML = `<option value="">Todos</option><option value="com">${type==='notas'?'Com medição':'Com NF'}</option><option value="sem">${type==='notas'?'Sem medição':'Sem NF'}</option>`;
    for(const [key,value] of Object.entries(filters)) root.querySelector(`[data-filter="${key}"]`).value = value;
    root.querySelectorAll('[data-action="notas"],[data-action="medicoes"]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.action===type);
      btn.setAttribute('aria-pressed',String(btn.dataset.action===type));
    });
  }
  function message(text, error=false) {
    const el=root.querySelector('#ct-fin-message');
    el.textContent=text; el.className=error?'ct-fin-error':'ct-fin-message';
  }
  async function refresh(nextType) {
    if(nextType && nextType!==type) { type=nextType; filters.status=''; filters.link=''; page=1; }
    const ticket=++generation;
    loading=true; shell(); render(); message('Carregando notas fiscais e medições...');
    try {
      if(!adapter.canView()) throw new Error('Você não tem permissão para consultar contratos.');
      await adapter.ensureContracts();
      const current=adapter.contracts().filter(c=>c.tipo_instrumento!=='ATA');
      const ids=current.map(c=>c.id);
      const [notas,medicoes,termos]=await Promise.all([
        readFinanceiroTable(adapter.client(),'notas_fiscais','*',ids),
        readFinanceiroTable(adapter.client(),'contratos_medicoes','*,contratos_medicao_itens(*),contratos_medicao_glosas(*)',ids),
        readFinanceiroTable(adapter.client(),'termos_ateste','*',ids)
      ]);
      if(ticket!==generation) return;
      contracts=current; data={notas,medicoes,termos};
      if(filters.contract && !contracts.some(c=>String(c.id)===filters.contract)) filters.contract='';
      loading=false; syncControls(); render(); message('');
    } catch(error) {
      if(ticket!==generation) return;
      loading=false; data={notas:[],medicoes:[],termos:[]}; render();
      message('Não foi possível carregar a consulta. '+error.message+' Use Atualizar para tentar novamente.',true);
    }
  }
  function buildRows() {
    const byContract=new Map(contracts.map(c=>[String(c.id),c]));
    const byMed=new Map(data.medicoes.map(m=>[String(m.id),m]));
    const byMedNF=new Map();
    data.notas.forEach(n=>{ const key=String(n.medicao_id); if(n.medicao_id) byMedNF.set(key,[...(byMedNF.get(key)||[]),n]); });
    return data[type].flatMap(row=>{
      const contract=byContract.get(String(row.contrato_id));
      if(!contract) return [];
      const med=type==='notas'?byMed.get(String(row.medicao_id)):row;
      const notes=type==='medicoes'?(byMedNF.get(String(row.id))||[]):[];
      const competencia=row.competencia || med?.competencia || '';
      const items=row.contratos_medicao_itens || [];
      return [{...row, contract, med, notes, competencia,
        linked:type==='notas'?!!row.medicao_id:notes.length>0,
        gross:type==='notas'?row.valor_total:row.valor_bruto,
        net:type==='notas'?(row.valor_aprovado??row.valor_total):row.valor_liquido,
        sortDate:month((row.ciclo_inicio || med?.ciclo_inicio || '').slice(0,7)) || month(competencia) || row.data_medicao || row.data_emissao || row.created_at || '',
        search:[row.numero, row.serie, competencia, contract.numero_contrato, contract.cpl, contract.prestador, contract.objeto, contract.fiscalizacao, row.fiscal_responsavel, med?.fiscal_responsavel, row.observacoes, row.relatorio_servico_referencia, ...notes.map(n=>n.numero), ...items.map(i=>i.descricao)].filter(Boolean).join(' ')
      }];
    });
  }
  function render() {
    const searching=Boolean(filters.contract || filters.search.trim());
    rows=searching?filterFinanceiroRows(buildRows(),filters):[];
    const summary=summarizeFinanceiroRows(rows,type);
    const selected=contracts.find(c=>String(c.id)===filters.contract);
    root.querySelector('#ct-fin-context').innerHTML=selected
      ? `<div><strong>Contrato ${esc(selected.numero_contrato || selected.cpl || selected.id)}</strong><span>${esc(selected.prestador || '—')} · Processo ${esc(selected.cpl || '—')} · ${esc(selected.secao || '—')}</span><p>${esc(selected.objeto || '')}</p></div><button type="button" data-action="contract" data-contract="${esc(selected.id)}" class="btn-secondary">Abrir gestão do contrato</button>`
      : '<span>Selecione um contrato ou digite na busca para consultar notas fiscais e medições. A busca também inclui contratos encerrados e concluídos.</span>';
    const nfClosed=selected && !adapter.canRegisterNF(selected);
    root.querySelector('#ct-fin-create').innerHTML=adapter.canEdit()?`<button type="button" data-action="new-nf" class="btn-secondary" ${!selected||loading||busy||nfClosed?'disabled':''} ${nfClosed?'title="O cadastro de NF requer contrato não encerrado"':''}>Cadastrar NF</button><button type="button" data-action="new-med" class="btn-primary" ${!selected||loading||busy?'disabled':''}>Nova medição</button>`:'';
    const metric=(title,value,sub='')=>`<div><span>${title}</span><strong>${value}</strong><small>${sub}</small></div>`;
    root.querySelector('#ct-fin-metrics').hidden=!searching || loading;
    root.querySelector('#ct-fin-help').hidden=!searching || loading;
    root.querySelector('.ct-fin-pagination').hidden=!searching || loading;
    root.querySelector('#ct-fin-metrics').innerHTML=loading || !searching?'':[
      metric('Registros filtrados',summary.count), metric('Valor bruto',money(summary.gross)), metric('Glosas',money(summary.glosa)),
      metric(type==='notas'?'NF aprovada':'Executado / medido',money(summary.valid),type==='notas'?'Aprovação não representa pagamento':'Exclui rascunhos, recusadas e canceladas'),
      metric(type==='notas'?'Sem medição':'Sem NF',summary.unlinked)
    ].join('');
    root.querySelector('#ct-fin-help').textContent=type==='notas'
      ? 'Totais referentes aos filtros acima. Cada NF é somada uma única vez. Use Detalhes para ver observações e recebimento. NFs sem medição ficam disponíveis no cadastro de uma nova medição.'
      : 'Totais referentes aos filtros acima. Ciclos trimestrais entram no filtro quando cruzam o intervalo de competências. Use Detalhes para consultar itens, fiscal e glosas. O termo de ateste segue as regras do modelo de contrato.';
    const pages=Math.max(1,Math.ceil(rows.length/pageSize)); page=Math.min(page,pages);
    const visible=rows.slice((page-1)*pageSize,page*pageSize);
    const cols=type==='notas'?['NF / competência','Contrato / fornecedor','Medição','Emissão','Valor bruto','Glosa','Valor aprovado','Status','Ações']:['Competência / tipo','Contrato / fornecedor','NF vinculada','Data da medição','Valor bruto','Glosa','Valor líquido','Status','Ações'];
    root.querySelector('#ct-fin-results').innerHTML=!searching?'<div class="ct-fin-empty">Selecione um contrato ou comece a digitar no campo Buscar para exibir os registros.</div>':loading?'<div class="ct-fin-empty"><span class="spinner"></span> Carregando registros...</div>':!rows.length?`<div class="ct-fin-empty">${filters.start&&filters.end&&filters.start>filters.end?'A competência inicial deve ser anterior ou igual à final.':'Nenhum registro encontrado. Ajuste os filtros ou cadastre um registro no contrato selecionado.'}</div>`:
      `<div class="ct-fin-table-wrap"><table class="ct-fin-table"><caption class="sr-only">${type==='notas'?'Notas fiscais':'Medições'} dos contratos, com filtros aplicados</caption><thead><tr>${cols.map((c,i)=>`<th scope="col" ${i>=4&&i<=6?'class="ct-fin-money"':''}>${c}</th>`).join('')}</tr></thead><tbody>${visible.map(rowHtml).join('')}</tbody></table></div>`;
    root.querySelector('#ct-fin-count').textContent=loading?'':`${rows.length} registro(s) · Exibindo ${rows.length?(page-1)*pageSize+1:0}–${Math.min(page*pageSize,rows.length)}`;
    root.querySelector('#ct-fin-page').textContent=`${page} / ${pages}`;
    root.querySelector('[data-action="prev"]').disabled=loading||page<=1;
    root.querySelector('[data-action="next"]').disabled=loading||page>=pages;
    root.querySelector('[data-action="export"]').disabled=loading||!rows.length;
  }
  function rowHtml(row) {
    const id=esc(row.id), cid=esc(row.contract.id);
    const linked=type==='notas'
      ? (row.med?`${esc(row.med.competencia || 'Sem competência')}<small>${esc(adapter.labels('medicoes')[row.med.status] || adapter.statusLabel(row.med.status))}</small>`:row.medicao_id?'Medição indisponível':'<span class="ct-fin-pending">Sem medição</span>')
      : (row.notes.length?row.notes.map(n=>`NF ${esc(n.numero || '—')}`).join(', '):'<span class="ct-fin-pending">Sem NF</span>');
    const status=adapter.canEdit()?adapter.statusSelect(row.status,type,row.id):adapter.statusBadge(row.status,type);
    const identity=type==='notas'?`<strong>${esc(row.numero || '—')}</strong><small>${esc(row.competencia || 'Sem competência')}${row.serie?' · Série '+esc(row.serie):''}</small>`:`<strong>${esc(row.competencia || 'Sem competência')}</strong><small>${esc(adapter.statusLabel(row.tipo_medicao || 'competencia'))}</small>`;
    const details=detailHtml(row);
    const term=type==='medicoes'&&(data.termos.some(t=>String(t.medicao_id)===String(row.id))||adapter.canGenerateTerm(row.contract));
    return `<tr><td>${identity}</td><td><button type="button" class="ct-fin-link" data-action="contract" data-contract="${cid}">${esc(row.contract.numero_contrato || row.contract.cpl || row.contract.id)}</button><small>${esc(row.contract.prestador || '—')}</small></td>
      <td>${linked}</td><td>${date(type==='notas'?row.data_emissao:row.data_medicao)}</td><td class="ct-fin-money">${money(row.gross)}</td><td class="ct-fin-money">${money(row.valor_glosa)}</td><td class="ct-fin-money"><strong>${money(row.net)}</strong></td><td data-status-contract="${cid}">${status}</td>
      <td><button type="button" class="btn-secondary" data-action="details" data-id="${id}" aria-expanded="false">Detalhes</button>${term?`<button type="button" class="btn-secondary" data-action="term" data-id="${id}" data-contract="${cid}">Baixar termo</button>`:''}${type==='notas'&&row.arquivo_url?`<button type="button" class="btn-secondary" data-action="attachment" data-path="${esc(row.arquivo_url)}">Baixar NF</button>`:''}</td></tr>
      <tr class="ct-fin-detail" data-detail="${id}" hidden><td colspan="9">${details}</td></tr>`;
  }
  function detailHtml(row) {
    const field=(label,value)=>`<div><b>${label}</b><span>${esc(value || '—')}</span></div>`;
    const items=row.contratos_medicao_itens || [], glosas=row.contratos_medicao_glosas || [];
    return `<div class="ct-fin-detail-grid">${field('Observações',row.observacoes)}${field('Fiscal responsável',row.fiscal_responsavel || row.med?.fiscal_responsavel || row.contract.fiscalizacao)}
      ${field('Validação', [row.validado_por,row.validado_em?date(row.validado_em):''].filter(Boolean).join(' · '))}
      ${type==='notas'?field('Recebimento',date(row.data_recebimento)):field('Execução preventiva / relatório',[row.data_execucao_preventiva?date(row.data_execucao_preventiva):'',row.relatorio_servico_referencia].filter(Boolean).join(' · '))}
      ${items.length?field('Itens medidos',items.map(i=>`${i.descricao || 'Item'} · Executada: ${i.quantidade_executada ?? '—'} · Aceita: ${i.quantidade_aceita ?? '—'}`).join('\n')):''}
      ${glosas.length?field('Motivos das glosas',glosas.map(g=>g.motivo).filter(Boolean).join('\n')):''}</div>`;
  }
  function exportCSV() {
    const records=[['Tipo','Contrato','Processo','Fornecedor','NF','Competência','Data','Vínculo','Valor bruto','Glosa',type==='notas'?'Valor aprovado':'Valor líquido','Status','Observações'], ...rows.map(r=>[
      type==='notas'?'Nota fiscal':'Medição',r.contract.numero_contrato,r.contract.cpl,r.contract.prestador,r.numero||'',r.competencia,type==='notas'?r.data_emissao:r.data_medicao,
      type==='notas'?(r.med?.competencia || (r.medicao_id?'Medição indisponível':'Sem medição')):r.notes.map(n=>n.numero).join(', '),
      num(r.gross).toFixed(2).replace('.',','),num(r.valor_glosa).toFixed(2).replace('.',','),num(r.net).toFixed(2).replace('.',','),adapter.labels(type)[r.status]||adapter.statusLabel(r.status),r.observacoes
    ])];
    // Neutraliza fórmulas ao abrir a exportação em planilhas.
    const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const url=URL.createObjectURL(new Blob(['\ufeff'+records.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`contratos-${type}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  root.addEventListener('input',event=>{
    if(event.target.dataset.filter!=='search') return;
    filters.search=event.target.value;page=1;render();
  });
  root.addEventListener('change',async event=>{
    const key=event.target.dataset.filter;
    if(key==='search') return; // a busca já é aplicada no input; preservar o clique seguinte
    if(key){filters[key]=event.target.value;page=1;render();return;}
    const select=event.target.closest('[data-entity-id]');
    if(!select) return;
    const contract=select.closest('[data-status-contract]').dataset.statusContract;
    const status=select.value, id=select.dataset.entityId;
    await action(()=>adapter.changeStatus(contract,type,id,status));
  });
  async function action(callback) {
    if(busy||loading) return;
    busy=true; root.inert=true;
    try { await callback(); }
    catch(error){message(error.message || 'Não foi possível concluir a ação.',true);}
    finally {busy=false;root.inert=false;render();}
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button || busy) return;
    const name=button.dataset.action;
    if(name==='details'){
      const detail=[...root.querySelectorAll('[data-detail]')].find(el=>el.dataset.detail===button.dataset.id);
      detail.hidden=!detail.hidden;button.setAttribute('aria-expanded',String(!detail.hidden));return;
    }
    if(name==='notas'||name==='medicoes'){type=name;filters.status='';filters.link='';page=1;syncControls();render();return;}
    if(name==='clear'){filters={contract:'',search:'',status:'',start:'',end:'',link:'',sort:'recentes'};page=1;syncControls();render();return;}
    if(name==='prev'||name==='next'){page+=name==='prev'?-1:1;render();return;}
    if(name==='export'){exportCSV();return;}
    if(name==='refresh'){await refresh();return;}
    if(name==='contract'){adapter.openContract(button.dataset.contract);return;}
    if(name==='new-nf'||name==='new-med') await action(()=>adapter.create(filters.contract,name));
    if(name==='term') await action(()=>adapter.downloadTerm(button.dataset.contract,button.dataset.id));
    if(name==='attachment') await action(()=>adapter.downloadAttachment(button.dataset.path));
  });
  return {
    isActive:()=>active && root.closest('.panel')?.classList.contains('active') !== false,
    async open(contractId,nextType) {
      active=true;
      filters={contract:contractId!=null?String(contractId):'',search:'',status:'',start:'',end:'',link:'',sort:'recentes'};
      page=1;
      await refresh(nextType);
    },
    close() {active=false;generation++;loading=false;},
    refresh
  };
}
