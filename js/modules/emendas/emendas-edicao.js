const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moeda = v => Number(v || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

export function prepararAlteracoes(originais, editados) {
  const porId = new Map(originais.map(i => [String(i.id), i]));
  const vistos = new Set(), alteracoes = [];
  for (const editado of editados) {
    const original = porId.get(String(editado.id));
    if (!original || vistos.has(String(editado.id))) throw new Error('Item inválido ou repetido. Reabra a emenda.');
    vistos.add(String(editado.id));
    const item = String(editado.item ?? '').trim();
    const qtde = Number(editado.qtde), valor = Number(editado.valor);
    const mudou = editado.excluir || item !== String(original.item ?? '').trim() || qtde !== Number(original.qtde) || valor !== Number(original.valor);
    if (!mudou) continue;
    if (original.bloqueio) throw new Error(`O item “${original.item}” está vinculado: ${original.bloqueio}.`);
    if (!editado.excluir && (!item || !Number.isFinite(qtde) || qtde <= 0 || !Number.isFinite(valor) || valor <= 0 || !Number.isFinite(qtde * valor))) {
      throw new Error(`Confira descrição, quantidade e valor unitário do item “${original.item}”: os números devem ser maiores que zero.`);
    }
    alteracoes.push({id:original.id, versao:original.versao, excluir:!!editado.excluir, item, qtde, valor});
  }
  return alteracoes;
}

export function montarEditorItens(container, itens) {
  container.innerHTML = itens.length ? itens.map((i, indice) => `
    <fieldset data-indice="${indice}" style="margin:8px 0;padding:10px;border:1px solid var(--border);border-radius:8px;min-width:0" ${i.bloqueio?'disabled':''}>
      <legend style="font-size:12px;color:var(--text2)">${esc(i.unidade || 'Unidade não informada')}</legend>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
        <label class="form-group" style="flex:3;min-width:200px;margin:0"><span class="form-label" style="display:block">Item / descrição</span><input data-campo="item" aria-label="Descrição do item ${indice+1}" value="${esc(i.item)}"></label>
        <label class="form-group" style="flex:1;min-width:85px;margin:0"><span class="form-label" style="display:block">Quantidade</span><input type="number" step="any" min="0" data-campo="qtde" aria-label="Quantidade do item ${indice+1}" value="${esc(i.qtde)}"></label>
        <label class="form-group" style="flex:1;min-width:130px;margin:0"><span class="form-label" style="display:block">Valor unit. planejado</span><input type="number" step="any" min="0" data-campo="valor" aria-label="Valor do item ${indice+1}" value="${esc(i.valor)}"></label>
        <button type="button" class="btn-secondary" data-excluir style="color:var(--red)">Excluir item</button>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px"><span data-situacao>${i.bloqueio?'🔒 '+esc(i.bloqueio):'Sem vínculo — edição permitida'}</span><strong data-total></strong></div>
    </fieldset>`).join('') : '<p>Nenhum item cadastrado nesta emenda.</p>';
  const rows = [...container.querySelectorAll('fieldset')];
  const coletar = () => rows.map((row, indice) => ({
    id:itens[indice].id, excluir:row.dataset.excluido === 'true',
    ...Object.fromEntries([...row.querySelectorAll('[data-campo]')].map(el => [el.dataset.campo, el.value]))
  }));
  const atualizar = () => {
    let total = 0, excluidos = 0;
    coletar().forEach((i, n) => {
      const valor = Number(i.qtde) * Number(i.valor);
      rows[n].querySelector('[data-total]').textContent = i.excluir ? 'Exclusão ao salvar' : moeda(Number.isFinite(valor) ? valor : 0);
      if (i.excluir) excluidos++; else if (Number.isFinite(valor)) total += valor;
    });
    const resumo = container.parentElement.querySelector('[data-resumo-itens]');
    if (resumo) resumo.textContent = `Total planejado: ${moeda(total)}${excluidos ? ` · ${excluidos} item(ns) marcado(s) para exclusão` : ''}`;
  };
  rows.forEach((row, indice) => {
    row.addEventListener('input', atualizar);
    row.querySelector('[data-excluir]').addEventListener('click', () => {
      if (itens[indice].bloqueio) return;
      const excluir = row.dataset.excluido !== 'true';
      row.dataset.excluido = String(excluir);
      row.querySelectorAll('input').forEach(el => el.disabled = excluir);
      row.querySelector('[data-excluir]').textContent = excluir ? 'Desfazer exclusão' : 'Excluir item';
      row.querySelector('[data-situacao]').textContent = excluir ? 'Será excluído ao salvar. Cancelar preserva o item.' : 'Sem vínculo — edição permitida';
      atualizar();
    });
  });
  atualizar();
  return {alteracoes:() => prepararAlteracoes(itens, coletar())};
}
