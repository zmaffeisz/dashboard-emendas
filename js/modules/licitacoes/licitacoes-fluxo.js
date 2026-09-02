// Consulta somente os itens da aquisição, inclusive sem vínculo com emenda.
// A regra de rótulos é a mesma função usada pelo painel de Emendas.
async function buscarPorItens(sb, tabela, colunas, ids) {
  const resultados = [];
  for (let inicio = 0; inicio < ids.length; inicio += 200) {
    const lote = ids.slice(inicio, inicio + 200);
    for (let pagina = 0; ; pagina += 1000) {
      const { data, error } = await sb.from(tabela).select(colunas)
        .in('item_id', lote).order('id').range(pagina, pagina + 999);
      if (error) throw error;
      resultados.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return resultados;
}

const ultimaData = (...datas) => datas.filter(Boolean).map(d => String(d).slice(0, 10)).sort().pop() || null;

export function derivarSituacaoAquisicao(item, entregas, empenhos, statusDoFluxo) {
  const ativas = entregas.filter(e => String(e.status || '').toLowerCase() !== 'cancelada');
  if (!item.contrato_id && !ativas.length) return null;
  const af = { aut: 0, rec: 0, conf: 0 };
  const numerosEmpenho = new Set(empenhos.map(e => e.empenhos?.numero).filter(Boolean));
  let consumoRecebido = 0;
  ativas.forEach(e => {
    const aut = Number(e.qtde_autorizada) || 0;
    const rec = Number(e.qtde_recebida) || 0;
    af.aut += aut;
    af.rec += rec;
    if (e.tipo_material === 'CONSUMO') consumoRecebido += rec;
    else if (e.data_entrega_unidade) af.conf += rec || aut || 1;
    const empenho = e.empenhos?.numero || e.empenho;
    if (empenho) numerosEmpenho.add(empenho);
  });
  const fluxo = { af, qtde: item.qtde, temContrato: !!item.contrato_id, empenhos: numerosEmpenho };
  const esperado = Number(item.qtde) || af.aut;
  const somenteConsumo = ativas.length > 0 && ativas.every(e => e.tipo_material === 'CONSUMO');
  // Consumo termina no almoxarifado e nunca deve aguardar confirmação na unidade.
  const nome = somenteConsumo && consumoRecebido > 0
    ? (consumoRecebido >= esperado ? 'RECEBIDO NO ALMOXARIFADO - CONSUMO' : 'RECEBIDO PARCIAL NO ALMOXARIFADO - CONSUMO')
    : statusDoFluxo(fluxo);
  if (!nome) return null;
  const datasEtapa = af.conf > 0
    ? ativas.filter(e => e.tipo_material !== 'CONSUMO').map(e => e.data_entrega_unidade)
    : af.rec > 0 ? ativas.filter(e => Number(e.qtde_recebida) > 0).map(e => e.data_recebimento)
    : af.aut > 0 ? ativas.map(e => e.af_data) : [];
  return {
    nome, orgao: 'SES', auto: true, operacional: true,
    desde: ultimaData(...datasEtapa),
    atualizadoEm: ultimaData(...ativas.flatMap(e => [e.af_data, e.data_recebimento, e.tipo_material !== 'CONSUMO' && e.data_entrega_unidade]))
  };
}

export async function carregarSituacoesAquisicoes(sb, itens, processos, statusDoFluxo) {
  const aquisicoes = new Set(processos.filter(p => p.natureza === 'AQUISIÇÃO').map(p => String(p.id)));
  const alvos = itens.filter(i => aquisicoes.has(String(i.processo_id)));
  if (!alvos.length) return itens;
  const ids = alvos.map(i => i.id);
  const [entregas, empenhos] = await Promise.all([
    buscarPorItens(sb, 'itens_entregas', 'id,item_id,qtde_autorizada,qtde_recebida,status,af_data,data_recebimento,data_entrega_unidade,tipo_material,empenho,empenhos(numero)', ids),
    buscarPorItens(sb, 'empenho_itens', 'id,item_id,empenhos(numero)', ids)
  ]);
  const agrupar = rows => {
    const mapa = new Map();
    rows.forEach(r => { if (!mapa.has(r.item_id)) mapa.set(r.item_id, []); mapa.get(r.item_id).push(r); });
    return mapa;
  };
  const entregasPorItem = agrupar(entregas), empenhosPorItem = agrupar(empenhos);
  alvos.forEach(item => {
    item._situacaoFluxo = derivarSituacaoAquisicao(item, entregasPorItem.get(item.id) || [], empenhosPorItem.get(item.id) || [], statusDoFluxo);
  });
  return itens;
}
