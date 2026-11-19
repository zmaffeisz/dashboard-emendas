const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function readHistoricoDemanda(client, ids) {
  const configs=[], historicos=[];
  for(let start=0;start<ids.length;start+=100){
    const batch=ids.slice(start,start+100);
    for(const [table,select,target] of [
      ['contratos_demanda_config','*,vigencia:contratos_vigencias(*)',configs],
      ['contratos_medicoes_historicas','*,vigencia:contratos_vigencias(*),contratos_medicoes_historicas_itens(*)',historicos]
    ]){
      for(let offset=0;;offset+=500){
        const {data,error}=await client.from(table).select(select).in('contrato_id',batch).order(table==='contratos_demanda_config'?'contrato_id':'numero_medicao').range(offset,offset+499);
        if(error) throw error;
        target.push(...(data||[]));
        if(!data||data.length<500) break;
      }
    }
  }
  return {configs,historicos};
}
export function normalizeHistoricoDemanda(history=[],configs=[]) {
  const byContract=new Map(configs.map(c=>[String(c.contrato_id),c]));
  return history.map(h=>({
    ...h,historico_importado:true,status:'historico_importado',tipo_medicao:'historico_liquido',
    data_medicao:null,valor_bruto:null,valor_glosa:null,
    fora_vigencia_atual:h.vigencia_id!==byContract.get(String(h.contrato_id))?.vigencia_atual_id,
    contratos_medicao_glosas:[],
    contratos_medicao_itens:(h.contratos_medicoes_historicas_itens||[]).map(i=>({
      item_id:i.item_id,descricao:i.categoria_operacional,unidade:'EXAME',
      quantidade_executada:Number(i.quantidade),quantidade_aceita:Number(i.quantidade),
      valor_unitario:null,valor_total:null,valor_unitario_referencia:i.valor_unitario_referencia
    }))
  }));
}
export function historicoDemandaResumoHtml(history,config) {
  if(!history.length) return '';
  const groups=new Map();
  history.forEach(m=>{
    const group=groups.get(m.vigencia_id)||{vigencia:m.vigencia,count:0,liquido:0};
    group.count++;group.liquido+=Number(m.valor_liquido);groups.set(m.vigencia_id,group);
  });
  const periods=[...groups].sort((a,b)=>Number(a[1].vigencia?.numero||0)-Number(b[1].vigencia?.numero||0));
  return `<section style="padding:14px;border:1px solid var(--border);border-radius:8px;margin:12px 0"><h3 style="margin:0 0 8px">Histórico importado por vigência</h3>
    <p style="font-size:12px;color:var(--text2)">Valores líquidos informados. Bruto, retenções, glosas, datas de emissão e atestes não informados. Cada NF permanece única, inclusive quando rateada entre vigências.</p>
    <div class="table-wrap"><table style="font-size:12px"><thead><tr><th>Vigência</th><th>Medições</th><th>Líquido histórico</th><th>Valor contratado</th><th>Saldo financeiro</th></tr></thead><tbody>${periods.map(([id,g])=>`<tr><td>${esc(g.vigencia?.numero)}ª · ${esc(g.vigencia?.data_inicio)} a ${esc(g.vigencia?.data_fim)}${id===config?.vigencia_atual_id?' · atual':''}</td><td>${g.count}</td><td>${money(g.liquido)}</td><td>${money(g.vigencia?.valor_total)}</td><td><b>${money(Number(g.vigencia?.valor_total||0)-g.liquido)}</b></td></tr>`).join('')}</tbody></table></div>
    ${config?.compensar_quantidades?'<p style="font-size:12px">Saldos quantitativos negativos permitidos por tipo; o limite é financeiro e por vigência. As quantidades históricas não foram convertidas em valores brutos.</p>':''}
    <p style="font-size:12px;color:var(--text2)">${esc(config?.observacoes||'')}</p></section>`;
}

// NF única, com o líquido do período escolhido; o valor integral continua no cadastro da NF.
export function historicalInvoiceAllocations(notes,measurements,periodId='') {
  return notes.map(n=>{
    if(n.origem_sistema!=='historico_liquido') return n;
    const all=measurements.filter(m=>m.historico_importado&&m.nota_fiscal_id===n.id);
    const selected=periodId?all.filter(m=>m.vigencia_id===periodId):all;
    return {...n,historico_importado:true,historico_medicoes:selected,historico_todas_medicoes:all,
      historico_liquido_rateado:selected.reduce((s,m)=>s+Number(m.valor_liquido),0)};
  });
}
