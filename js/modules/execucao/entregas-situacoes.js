export function deliveryReference(row) {
  if (row.entrega_id) return { item_entrega_id: row.entrega_id };
  if (row.exec_id) return { ata_execucao_id: row.exec_id };
  return row.item_id ? { item_id: row.item_id } : null;
}
export function deliveryKey(row) {
  return row.entrega_id ? 'a' + row.entrega_id : row.exec_id ? 't' + row.exec_id : 'i' + row.item_id;
}
export function canTrackDelivery(row) {
  if (!row || !deliveryReference(row) || row.cancelado || row.status === 'cancelado') return false;
  if (!row.recebido) return true;
  return row.tipo === 'Aquisição' && Number(row.saldo_af) > 0;
}
export function applyDeliveryTracking(rows, events) {
  const latest = new Map();
  for (const event of events) {
    const key = event.item_entrega_id ? 'a' + event.item_entrega_id : event.ata_execucao_id ? 't' + event.ata_execucao_id : 'i' + event.item_id;
    const previous = latest.get(key);
    if (!previous || String(event.registrado_em).localeCompare(String(previous.registrado_em)) > 0 ||
      (event.registrado_em === previous.registrado_em && String(event.id).localeCompare(String(previous.id)) > 0)) latest.set(key, event);
  }
  return rows.map(row => {
    const automatic = row.statusAutomatico || row.status;
    const tracking = latest.get(deliveryKey(row));
    const status = canTrackDelivery(row) && tracking?.situacao !== 'automatico'
      ? ({ pendente: 'pendente', sem_prazo: 'sem prazo' }[tracking?.situacao] || automatic) : automatic;
    return { ...row, statusAutomatico: automatic, acompanhamento: tracking || null, status };
  });
}

export function createDeliveryTracking(ctx) {
  let keys = [], busy = false, request = null;
  const el = id => document.getElementById('ces-' + id);
  const message = text => { el('msg').textContent = text; };
  async function read() {
    const events = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await ctx.sb.from('entregas_situacoes').select('id,item_id,item_entrega_id,ata_execucao_id,situacao,descricao,registrado_em,registrado_por')
        .order('registrado_em', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
      if (error) throw error;
      events.push(...(data || []));
      if (!data || data.length < 500) return events;
    }
  }
  function formChanged() {
    const pending = el('situacao').value === 'pendente';
    el('descricao').required = pending;
    el('descricao-label').textContent = pending ? 'O que está pendente? *' : 'Observação (opcional)';
  }
  function open(selectedKeys, situation) {
    if (!ctx.canEdit() || busy) return;
    const rows = ctx.rows().filter(row => selectedKeys.includes(deliveryKey(row)));
    if (!rows.length || rows.length !== selectedKeys.length || rows.some(row => !canTrackDelivery(row))) {
      ctx.notify('Selecione somente entregas em aberto. Recebimentos parciais com saldo também podem ser marcados.', 'warning'); return;
    }
    keys = [...selectedKeys]; request = null;
    el('info').textContent = rows.length === 1 ? `${rows[0].item || 'Item'} · ${rows[0].unidade || '—'}` : `${rows.length} registros selecionados. A mesma situação e descrição serão aplicadas a todos.`;
    el('situacao').value = situation || (rows.length === 1 ? rows[0].acompanhamento?.situacao : '') || 'pendente';
    el('descricao').value = rows.length === 1 ? rows[0].acompanhamento?.descricao || '' : '';
    message(''); formChanged();
    document.getElementById('modal-situacao-entrega').classList.add('active');
    el('descricao').focus();
  }
  function close() {
    if (busy) return;
    document.getElementById('modal-situacao-entrega').classList.remove('active');
    keys = []; request = null;
  }
  async function save() {
    if (busy || !ctx.canEdit() || !keys.length) return;
    const situation = el('situacao').value;
    const description = el('descricao').value.trim();
    if (!['pendente', 'sem_prazo', 'automatico'].includes(situation)) return message('Selecione uma situação válida.');
    if (situation === 'pendente' && !description) return message('Descreva o que está pendente.');
    if (description.length > 4000) return message('Use até 4000 caracteres.');
    const rows = ctx.rows().filter(row => keys.includes(deliveryKey(row)));
    if (rows.length !== keys.length || rows.some(row => !canTrackDelivery(row))) return message('A seleção mudou. Feche e reabra a situação.');
    const signature = JSON.stringify([keys, situation, description]);
    if (!request || request.signature !== signature) request = { signature, id: crypto.randomUUID() };
    busy = true; el('salvar').disabled = true; message('');
    let saved = false;
    try {
      const { error } = await ctx.sb.rpc('registrar_situacao_entregas', {
        p_alvos: rows.map(deliveryReference), p_situacao: situation, p_descricao: description, p_requisicao: request.id
      });
      if (error) throw error;
      saved = true;
      await ctx.reload();
      document.getElementById('modal-situacao-entrega').classList.remove('active');
      keys = []; request = null;
      ctx.notify('Situação atualizada.', 'success');
    } catch (error) {
      message((saved ? 'Situação salva, mas não foi possível atualizar a lista. Tente novamente: ' : 'Não foi possível salvar: ') + error.message);
    } finally {
      busy = false; el('salvar').disabled = false;
    }
  }
  return { read, open, close, save, formChanged };
}
