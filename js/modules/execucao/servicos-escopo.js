const ATIVAS = new Set(['aprovada_pelo_fiscal', 'aprovada_com_glosa']);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : (value || '—');
const status = value => ({aprovada_pelo_fiscal:'Atestada pelo fiscal',aprovada_com_glosa:'Atestada com glosa',cancelada:'Cancelada'}[value] || value);
export function resumoEscopo(item, medicoes = []) {
  const ativas = medicoes.filter(m => m.escopo_item_id === item.id && ATIVAS.has(m.status));
  const total = Math.round(Number(item.qtde || 0) * Number(item.valor_contratado ?? item.valor_estimado ?? 0) * 100) / 100;
  const bruto = Math.round(ativas.reduce((s, m) => s + Number(m.valor_bruto || 0), 0) * 100) / 100;
  const liquido = Math.round(ativas.reduce((s, m) => s + Number(m.valor_liquido || 0), 0) * 100) / 100;
  return { total, bruto, liquido, saldo: Math.round((total - bruto) * 100) / 100,
    concluido: ativas.some(m => m.escopo_conclusao), medicoes: ativas };
}

export function createServicosEscopo(ctx) {
  const { sb, esc, money, today } = ctx;
  let rows = [], atual = null, medicoes = [], notas = [], empenhos = [], requestId = null, busy = false, waitingNF = false;
  document.addEventListener('nota-fiscal-cadastrada', async event => {
    if (!waitingNF || event.detail?.contrato_id !== atual?.contrato_id) return;
    waitingNF = false;
    try { await open(atual.id); } catch (error) { ctx.notify(error.message, 'error'); }
  });
  const button = (action, label, id = '') => `<button type="button" class="btn-secondary" data-escopo-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const field = (label, control) => `<label class="form-group"><span class="form-label">${label}</span>${control}</label>`;
  const input = (id, type, value = '', extra = '') => `<input id="se-${id}" type="${type}" value="${esc(value)}" ${extra}>`;
  const val = id => document.getElementById(`se-${id}`)?.value?.trim() || '';
  const msg = text => { const el = document.getElementById('se-msg'); if (el) el.textContent = text; };
  const check = result => { if (result.error) throw result.error; return result.data || []; };
  async function all(factory) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const page = check(await factory().order('id').range(offset, offset + 499));
      result.push(...page);
      if (page.length < 500) return result;
    }
  }

  async function load() {
    const items = await all(() => sb.from('itens').select('*,processos!inner(identificador,tipo_servico),contratos!inner(id,cpl,numero_contrato,prestador,fornecedor_id,status,recebimento_escopo,fiscalizacao),unidades(nome),emendas(emenda,numero,ano)')
      .eq('origem', 'servico').in('processos.tipo_servico', ['Serviço por escopo fechado', 'Serviço pontual com pagamento único']).not('contrato_id', 'is', null));
    if (!items.length) { rows = []; return rows; }
    const meds = [];
    for (let start = 0; start < items.length; start += 100) {
      meds.push(...await all(() => sb.from('contratos_medicoes').select('*').in('escopo_item_id', items.slice(start, start + 100).map(i => i.id))));
    }
    rows = items.filter(i => !['cancelado', 'inativo'].includes(String(i.status || '').toLowerCase())).map(i => {
      const resumo = resumoEscopo(i, meds), config = i.escopo_execucao || {};
      return { tipo: 'Serviço', item_id: i.id, contrato_id: i.contrato_id, processo: i.processos.identificador,
        contrato: i.contratos.numero_contrato || i.contratos.cpl, empresa: i.contratos.prestador,
        item: i.descricao, unidade: i.unidades?.nome || '', af_numero: config.ordem || '', af_dataISO: config.inicio || '',
        limiteISO: config.prazo || '', recebido: resumo.concluido, saldo_af: resumo.concluido ? 0 : 1,
        status: resumo.concluido ? 'recebido' : ctx.prazo(config.prazo, false, false), _item: i, resumo };
    });
    return rows;
  }
  function renderRow(r) {
    const tds = [ctx.selectionCheckbox?.(r) || '', '<b>Serviço por escopo</b>', esc(r.processo), esc(r.contrato), esc(r.empresa),
      `${esc(r.item)}${r._item.emendas ? `<div>Emenda ${esc(r._item.emendas.emenda || r._item.emendas.numero)} / ${esc(r._item.emendas.ano)}</div>` : ''}`,
      esc(r.unidade), esc(r.af_numero || '—'), esc(date(r.af_dataISO)), `<span title="Valor contratado">${money(r.resumo.total)}</span>`,
      `<span title="Valor bruto medido">${money(r.resumo.bruto)}</span><div>Líquido atestado: ${money(r.resumo.liquido)}</div>`,
      `${r.resumo.medicoes.length} medição(ões) / NF`, esc(date(r.limiteISO)), ctx.statusBadge?.(r) || (r.recebido ? 'Concluído' : esc(r.status)),
      `<div style="display:flex;gap:4px"><button class="btn-secondary" onclick="abrirServicoEscopo('${r.item_id}')">Execução / medições</button>${ctx.situationActions?.(r) || ''}</div>`];
    return `<tr>${tds.map(cell => `<td style="padding:8px;border-bottom:1px solid var(--border)">${cell}</td>`).join('')}</tr>`;
  }
  function modal() {
    let root = document.getElementById('modal-servico-escopo');
    if (!root) {
      root = document.createElement('div'); root.id = 'modal-servico-escopo'; root.className = 'modal-overlay';
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Execução de serviço por escopo');
      root.addEventListener('click', async event => {
        const btn = event.target.closest('[data-escopo-action]'); if (!btn || busy) return;
        const action = btn.dataset.escopoAction;
        try {
          if (action === 'close') { requestId = null; root.classList.remove('active'); return; }
          if (action === 'refresh') return await open(atual.id);
          if (action === 'nf') { waitingNF = true; root.classList.remove('active'); await ctx.openNF(atual.contrato_id); return; }
          if (action === 'empenho') { root.classList.remove('active'); await ctx.openEmpenho(atual.id); return; }
          if (action === 'termo') return await downloadTerm(btn.dataset.id);
          if (!ctx.canEdit()) throw new Error('Sem permissão de edição.');
          busy = true; btn.disabled = true; msg('Salvando...');
          if (action === 'config') {
            await rpc('configurar', { modo: val('modo'), ordem: val('ordem'), inicio: val('inicio'), prazo: val('prazo') });
          } else if (action === 'receive') {
            requestId ||= crypto.randomUUID();
            await rpc('receber', { id: requestId, nota_fiscal_id: val('nf'), empenho_id: val('empenho'), data: val('data'),
              periodo_inicio: val('periodo-inicio'), periodo_fim: val('periodo-fim'), fiscal: val('fiscal'), descricao: val('descricao'),
              glosa: val('glosa') || '0', motivo_glosa: val('motivo-glosa'),
              conclusao: document.getElementById('se-conclusao').checked, justificativa_conclusao: val('justificativa') });
            requestId = null;
          } else if (action === 'cancel') {
            const motivo = await ctx.reason(); if (!motivo) return;
            await rpc('cancelar', { id: btn.dataset.id, motivo });
          } else return;
          msg('Salvo. Atualizando...');
          // A gravação já está confirmada; falha de recarga não oferece novo lançamento.
          try { await ctx.refresh(); await open(atual.id); }
          catch (error) { root.classList.remove('active'); ctx.notify(`Salvo. Reabra a tela para atualizar: ${error.message}`, 'warning'); }
        } catch (error) { msg(error.message || String(error)); }
        finally { busy = false; btn.disabled = false; }
      });
      document.body.append(root);
    }
    return root;
  }
  async function rpc(action, data) {
    const result = await sb.rpc('servico_escopo_operar', { p_item_id: atual.id, p_acao: action, p_dados: data });
    if (result.error) throw result.error;
    return result.data;
  }
  async function open(itemId) {
    const itemResult = await sb.from('itens').select('*,contratos(*),processos(tipo_servico,identificador),emendas(emenda,numero,ano)').eq('id', itemId).single();
    if (itemResult.error) throw itemResult.error;
    const next = itemResult.data;
    if (next?.origem !== 'servico' || next?.processos?.tipo_servico !== 'Serviço por escopo fechado' || !next.contrato_id) throw new Error('Item fora do fluxo de escopo fechado.');
    if (atual?.id !== next.id) requestId = null;
    atual = next;
    const results = await Promise.all([
      all(() => sb.from('contratos_medicoes').select('*').eq('escopo_item_id', itemId).order('created_at')),
      all(() => sb.from('notas_fiscais').select('*').eq('contrato_id', atual.contrato_id)),
      all(() => sb.from('empenho_itens').select('empenho_id,empenhos(id,numero,contrato_id)').eq('item_id', itemId))
    ]);
    medicoes = results[0]; notas = results[1];
    empenhos = [...new Map(results[2].map(e => e.empenhos).filter(e => e && e.contrato_id === atual.contrato_id).map(e => [e.id, e])).values()];
    const config = atual.escopo_execucao || {}, resumo = resumoEscopo(atual, medicoes), ct = atual.contratos;
    const ativas = medicoes.some(m => m.status !== 'cancelada');
    const livres = notas.filter(n => !n.medicao_id && ['recebida', 'em_conferencia'].includes(n.status));
    const editable = ctx.canEdit(), root = modal();
    root.innerHTML = `<div class="modal-box" style="width:min(940px,96vw);max-height:92vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;gap:12px"><h3>Execução de serviço por escopo</h3>${button('close', 'Fechar')}</div>
      <p><b>${esc(atual.descricao)}</b><br>Contrato ${esc(ct.numero_contrato || ct.cpl)} · ${esc(ct.prestador)}</p>
      <p>Contratado: ${money(resumo.total)} · Medido bruto: ${money(resumo.bruto)} · Líquido atestado: ${money(resumo.liquido)} · Saldo não medido: ${money(resumo.saldo)}<br><b>${resumo.concluido ? 'Serviço concluído' : 'Escopo aberto'}</b></p>
      <fieldset ${editable ? '' : 'disabled'}><legend>Forma de recebimento e execução</legend><div class="form-grid">
      ${field('Recebimento (vale para todo o contrato) *', `<select id="se-modo" ${ativas ? 'disabled' : ''}><option value="">Selecione...</option><option value="integral" ${ct.recebimento_escopo === 'integral' ? 'selected' : ''}>Integral, ao concluir</option><option value="parcial" ${ct.recebimento_escopo === 'parcial' ? 'selected' : ''}>Parcial, por medições</option></select>`)}
      ${field('Ordem de serviço / referência (opcional)', input('ordem', 'text', config.ordem))}
      ${field('Início da execução', input('inicio', 'date', config.inicio))}${field('Prazo de conclusão', input('prazo', 'date', config.prazo))}
      </div>${button('config', 'Salvar configuração')}</fieldset>
      <div style="display:flex;gap:8px;margin:12px 0">${editable ? button('empenho', 'Vincular empenho') + button('nf', 'Cadastrar NF') : ''}${button('refresh', 'Atualizar notas e histórico')}</div>
      ${editable && !resumo.concluido ? `<fieldset><legend>Registrar medição e ateste</legend>
      <p>Cadastre a NF e atualize a lista. Cada lançamento usa uma NF inteira para este item. O valor da medição vem da NF; eventuais descontos são registrados como glosa.</p>
      <div class="form-grid">
      ${field('Nota fiscal *', `<select id="se-nf"><option value="">Selecione...</option>${livres.map(n => `<option value="${esc(n.id)}">NF ${esc(n.numero)} · ${money(n.valor_total)}</option>`).join('')}</select>`)}
      ${field('Empenho vinculado *', `<select id="se-empenho"><option value="">Selecione...</option>${empenhos.map(e => `<option value="${esc(e.id)}">${esc(e.numero)}</option>`).join('')}</select>`)}
      ${field('Período executado: início *', input('periodo-inicio', 'date'))}${field('Período executado: fim *', input('periodo-fim', 'date'))}
      ${field('Data do ateste *', input('data', 'date', today(), `max="${today()}"`))}${field('Fiscal responsável *', input('fiscal', 'text', ct.fiscalizacao))}
      ${field('Glosa (R$)', input('glosa', 'number', '0', 'min="0" step="0.01"'))}${field('Justificativa da glosa', input('motivo-glosa', 'text'))}
      </div>${field('Descrição da etapa / serviço efetivamente executado *', '<textarea id="se-descricao" rows="3"></textarea>')}
      <label style="display:flex;gap:8px;margin:12px 0"><input id="se-conclusao" type="checkbox" ${ct.recebimento_escopo === 'integral' ? 'checked disabled' : ''}> Serviço concluído (recebimento final)</label>
      ${field('Justificativa se concluir com saldo não executado', input('justificativa', 'text'))}
      <p>Ao registrar, você confirma a execução descrita e o ateste do valor líquido. Isso não registra pagamento.</p>
      ${button('receive', 'Registrar medição e ateste')}</fieldset>` : ''}
      <p id="se-msg" role="status" style="color:var(--red);white-space:pre-wrap"></p>
      <h4>Histórico de medições</h4>${medicoes.length ? medicoes.map(m => `<div style="border-top:1px solid var(--border);padding:10px 0"><b>${esc(date(m.data_medicao))} · NF ${esc(m.escopo_dados?.nota_numero)} · ${money(m.valor_bruto)}</b><div>${esc(m.observacoes)} · ${esc(status(m.status))}${m.escopo_conclusao ? ' · Recebimento final' : ''}</div>${m.status === 'cancelada' ? `<div>Motivo: ${esc(m.escopo_dados?.motivo_cancelamento)}</div>` : ''}${button('termo', 'Termo de ateste', m.id)}${editable && m.status !== 'cancelada' ? button('cancel', 'Cancelar medição', m.id) : ''}</div>`).join('') : '<p>Nenhuma medição registrada.</p>'}
      </div>`;
    root.classList.add('active');
  }
  async function downloadTerm(id) {
    const result = await sb.from('contratos_medicoes').select('*').eq('id', id).single();
    if (result.error) throw result.error;
    const m = result.data, d = m.escopo_dados;
    if (!m.escopo_item_id || !d) throw new Error('Ateste de escopo não encontrado.');
    const html = `<article style="font-family:Arial;color:#111;padding:24px"><h2>Termo de ateste — serviço por escopo</h2>
      ${m.status === 'cancelada' ? '<h2>CANCELADO — somente histórico</h2>' : ''}
      <p>Contrato: ${esc(d.contrato)} · Processo: ${esc(d.processo)}<br>Empresa: ${esc(d.empresa)}<br>Serviço: ${esc(d.item)}</p>
      <p>Período executado: ${esc(date(d.periodo_inicio))} a ${esc(date(d.periodo_fim))}<br>NF: ${esc(d.nota_numero)} · Empenho: ${esc(d.empenho_numero)}</p>
      <p>Execução atestada: ${esc(m.observacoes)}</p><p>Bruto: ${money(m.valor_bruto)} · Glosa: ${money(m.valor_glosa)} · Líquido atestado: ${money(m.valor_liquido)}</p>
      ${Number(m.valor_glosa) ? `<p>Motivo da glosa: ${esc(d.motivo_glosa)}</p>` : ''}
      <p>${m.escopo_conclusao ? 'Recebimento final: escopo concluído.' : 'Recebimento parcial: escopo permanece aberto.'}</p>
      ${d.justificativa_conclusao ? `<p>Conclusão com saldo não executado: ${esc(d.justificativa_conclusao)}</p>` : ''}
      <p>Fiscal responsável: ${esc(m.fiscal_responsavel)}<br>Data do ateste: ${esc(date(m.data_medicao))}<br>Registro: ${esc(m.id)}</p>
      <p style="margin-top:48px">________________________________________<br>Assinatura do fiscal responsável</p></article>`;
    await ctx.pdf(html, `ateste-escopo-${m.data_medicao}-${m.id.slice(0, 8)}.pdf`);
  }
  return { load, renderRow, open, downloadTerm };
}
