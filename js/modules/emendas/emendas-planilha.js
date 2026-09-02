export const COLUNAS_EMENDA = ['ITEM', 'VALOR UNITÁRIO', 'STATUS INICIAL', 'UNIDADE', 'QUANTIDADE'];

const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

function numeroPositivo(valor) {
  let texto = String(valor ?? '').trim().replace(/^R\$\s*/i, '').replace(/[\s\u00a0]/g, '');
  // Aceita números do Excel e notação brasileira; não descarta letras ou símbolos inválidos.
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d+)?$/.test(texto)) texto = texto.replace(',', '.');
  else if (!/^\d+\.\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

export function prepararItensEmenda(tabela, unidades, statusDisponiveis) {
  const grupos = new Map(), erros = [];
  let linhas = 0;
  tabela.forEach((original, indice) => {
    const valores = original.map(v => String(v ?? '').trim());
    if (valores.every(v => !v)) return;
    const cabecalho = valores.slice(0, 5).map(normalizar);
    if (indice === 0 && ['ITEM', 'DESCRICAO', 'ITEM / DESCRICAO'].includes(cabecalho[0]) &&
      /^VALOR UNITARIO(?: \(R\$\))?$/.test(cabecalho[1]) && cabecalho[2] === 'STATUS INICIAL' &&
      cabecalho[3] === 'UNIDADE' && cabecalho[4] === 'QUANTIDADE') return;
    const linha = indice + 1;
    if (valores.length < 5 || valores.slice(5).some(Boolean)) {
      erros.push(`Linha ${linha}: copie as cinco colunas na ordem do modelo.`); return;
    }
    const [descricao, valor, statusTexto, unidadeTexto, quantidade] = valores;
    const valorUnitario = numeroPositivo(valor), qtde = numeroPositivo(quantidade);
    const candidatas = unidades.filter(u => normalizar(u.nome) === normalizar(unidadeTexto));
    const status = statusDisponiveis.filter(s => normalizar(s) === normalizar(statusTexto));
    const errosLinha = [];
    if (!descricao) errosLinha.push('item sem descrição');
    if (valorUnitario === null) errosLinha.push('valor unitário inválido (use um número maior que zero)');
    if (qtde === null) errosLinha.push('quantidade inválida (use um número maior que zero)');
    if (candidatas.length !== 1) errosLinha.push(`unidade ${candidatas.length ? 'ambígua' : 'não encontrada'}: “${unidadeTexto}”`);
    if (statusTexto && status.length !== 1) errosLinha.push(`status inicial não reconhecido: “${statusTexto}”`);
    if (errosLinha.length) { erros.push(`Linha ${linha}: ${errosLinha.join('; ')}.`); return; }
    const chave = JSON.stringify([normalizar(descricao), valorUnitario, status[0] || '']);
    if (!grupos.has(chave)) grupos.set(chave, { descricao, valorUnitario, status: status[0] || '', unidades: [] });
    const grupo = grupos.get(chave), unidade = candidatas[0];
    const existente = grupo.unidades.find(u => String(u.id) === String(unidade.id));
    if (existente) existente.qtde += qtde;
    else grupo.unidades.push({ id: unidade.id, nome: unidade.nome, qtde });
    linhas++;
  });
  if (!linhas && !erros.length) erros.push('Não há linhas preenchidas para importar.');
  // Validação integral: nunca aplica somente parte de uma colagem com erro.
  return { itens: erros.length ? [] : [...grupos.values()], erros, linhas };
}

export function preencherItensEmenda(itens, { alvo, adicionarItem, adicionarUnidade, recalcular }) {
  const vazio = card => [...card.querySelectorAll('input,select')].every(el => !el.value.trim());
  const cardAlvo = alvo.closest('.ne-item');
  itens.forEach((item, indice) => {
    const card = indice === 0 && cardAlvo && vazio(cardAlvo) ? cardAlvo : adicionarItem({ adiarAtualizacao: true });
    card.querySelector('.ne-it-desc').value = item.descricao;
    card.querySelector('.ne-it-vlunit').value = item.valorUnitario;
    card.querySelector('.ne-it-status').value = item.status;
    const existentes = [...card.querySelectorAll('.ne-u-row')];
    item.unidades.forEach((unidade, i) => {
      const row = existentes[i] || adicionarUnidade(card, { adiarAtualizacao: true });
      row.querySelector('.ne-u-sel').value = unidade.id;
      row.querySelector('.ne-u-qtde').value = unidade.qtde;
    });
  });
  recalcular();
}
